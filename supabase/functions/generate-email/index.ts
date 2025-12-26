import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PROMPT_VERSION = 'v7.0-hook-packs';
const MODEL_NAME = 'google/gemini-2.5-flash';
const RESEARCH_MODEL_NAME = 'google/gemini-2.5-flash';

// ============= SUPER PROMPT (Updated for V2 Hook Packs) =============
const SUPER_PROMPT = `You are an expert writing coach who crafts short, vivid, highly personalized cold emails.
Your job is to use the sender's inputs AND any researched information about the recipient to write a warm, confident, memorable email that a busy person will actually read and respond to.

The email must be readable in under 20 seconds (roughly 120–150 words).

NON-NEGOTIABLE REQUIREMENTS:
- The email body MUST contain the exact phrase "Like you," (capital L, comma) exactly once.
- Do NOT use "As a fellow…" style openers.
- Do not use any banned cliché phrases.
- End with exactly "Best," and nothing after.
- No bracket placeholders like [Name] or [Company].
- No em-dashes (—).

CONNECTION HIERARCHY for "Like you," bridge (in priority order):
1) Shared craft or lived experience (built/shipped/led/wrote/scaled something similar)
2) Shared problem space (payments, hiring, healthcare ops, enterprise sales, etc.)
3) Shared constraint (regulated environment, emerging markets, resource constraints)
4) Shared institution (school, company, program) — use ONLY as last resort

HOW TO WRITE THE "Like you," LINE:
- Must start with "Like you," (capital L, comma after)
- The phrase connects sender's story to a hook fact OR recipient's role/company if no facts available
- Keep it concrete and non-obvious
- The sentence containing "Like you," must NOT include generic phrases like "passionate about", "think a lot about", "reaching out", "aligned with", "resonates", "inspired", "keen to", or "deeply appreciate"
- The "Like you," sentence should appear in the first or second paragraph

RESEARCH USAGE RULES:
- If Hook Packs with "Like you" bridges are provided, use the suggested bridge line as inspiration
- Use facts as anchors for a parallel or question, not as praise or résumé summary
- Do NOT summarize the recipient's career or list accomplishments
- If facts are empty or no real research was found, do NOT imply you did research
- If no researched facts exist, still create a "Like you," bridge using role/company context and the sender's story

BANNED CLICHÉ PHRASES (never use these):
- "i'm reaching out because" or "reaching out because"
- "passionate about"
- "would love to connect"
- "keen interest"
- "impact at scale"
- "innovative solutions"
- "extensive experience"
- "impressed by"
- "exceptional track record"
- "exploring career paths"

STYLE RULES:
- Vivid, concrete language
- Simple, human tone
- No em-dashes (—), no semicolons, no ellipses (... or …)
- No MBA or corporate clichés
- No generic praise or flattery
- No bracket placeholders
- End with "Best," and nothing after

STRUCTURE:
- Subject line: short, specific, intriguing
- Greeting with recipient's first name (e.g., "Hi John," or "John,")
- 1–2 short paragraphs establishing the hook (include the "Like you," line early)
- One small, specific ask
- Sign-off: "Best," with nothing after

DO NOT EVER:
- Invent private or sensitive information
- Imply research you did not do
- Stack multiple personalization angles
- Use "Like you," more than once
- Include a name after the sign-off`;

// ============= TYPES =============

type AskType = "chat" | "feedback" | "referral" | "job" | "other";
type BridgeAngle = 'domain' | 'value' | 'tradeoff' | 'artifact' | 'inflection' | 'shared-affiliation';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  likeYouCount: number;
  wordCount: number;
  clicheCount: number;
}

type EvidenceType = 'quote' | 'named_initiative' | 'described_decision' | 'named_artifact';

interface HookPack {
  hook_fact: {
    claim: string;
    source_url: string;
    evidence: string;
    evidence_type?: EvidenceType;
  };
  bridge: {
    like_you_line: string;
    bridge_angle: BridgeAngle;
    why_relevant: string;
  };
  scores: {
    identity_conf: number;
    non_generic: number;
    bridgeability: number;
    overall: number;
  };
}

interface IdentityFingerprint {
  canonical_name: string;
  company: string;
  role_keywords: string[];
  disambiguators: string[];
  confounders: { name: string; negative_keywords: string[] }[];
}

interface BridgeHypothesis {
  type: 'domain' | 'value' | 'tradeoff';
  keywords: string[];
  query_templates: string[];
  proof_target: string;
}

interface ExaResult {
  url: string;
  title: string;
  snippet: string;
  text?: string;
  score?: number;
}

interface CandidateUrl {
  url: string;
  title: string;
  text: string;
  passed_niche_gate: boolean;
  reasons: string[];
  identity_locked: boolean;
}

interface EnforcementResults {
  did_retry: boolean;
  failures_first_pass: string[];
  failures_retry: string[];
}

// ============= VALIDATION CONSTANTS =============

const BANNED_CLICHES = [
  "i'm reaching out because",
  "reaching out because",
  "passionate about",
  "would love to connect",
  "keen interest",
  "impact at scale",
  "innovative solutions",
  "extensive experience",
  "impressed by",
  "exceptional track record",
  "exploring career paths",
];

const GENERIC_LIKE_YOU_PATTERNS = [
  "passionate about",
  "think a lot about",
  "reaching out",
  "aligned with",
  "resonates",
  "inspired",
  "keen to",
  "deeply appreciate",
];

// ============= STAGE 1: IDENTITY FINGERPRINT =============

async function extractIdentityFingerprint(
  recipientName: string,
  recipientCompany: string,
  recipientRole: string,
  identityResults: ExaResult[],
  LOVABLE_API_KEY: string
): Promise<{ fingerprint: IdentityFingerprint; confidence: number }> {
  console.log('=== Stage 1B: Extract Identity Fingerprint via LLM ===');
  
  if (identityResults.length === 0) {
    return {
      fingerprint: {
        canonical_name: recipientName,
        company: recipientCompany,
        role_keywords: recipientRole.toLowerCase().split(/\s+/).filter(w => w.length > 2),
        disambiguators: [],
        confounders: [],
      },
      confidence: 0.3,
    };
  }
  
  const sourcesContext = identityResults.slice(0, 3).map((r, i) => `
SOURCE ${i + 1}: ${r.url}
Title: ${r.title}
Content: ${(r.text || r.snippet || '').substring(0, 1500)}
`).join('\n---\n');

  const extractionPrompt = `Analyze these search results about "${recipientName}" at "${recipientCompany}" (${recipientRole}).

${sourcesContext}

Extract an IDENTITY FINGERPRINT to help disambiguate this person from others with similar names.

Return JSON:
{
  "canonical_name": "The full name as it appears most often (e.g., 'Christopher Young' vs 'Chris Young')",
  "company": "${recipientCompany}",
  "role_keywords": ["key", "role", "terms"],
  "disambiguators": ["unique identifiers: product areas, prior companies, business units, geography, initiatives they're known for"],
  "confounders": [
    {
      "name": "Name of any OTHER person with same name found in results",
      "negative_keywords": ["keywords", "that", "identify", "wrong", "person"]
    }
  ],
  "identity_confidence": 0.0
}

The "disambiguators" should be 3-8 terms that UNIQUELY identify this person (not generic terms).
The "confounders" should capture any OTHER people with the same name that appeared in results.
"identity_confidence" should be 0.0-1.0 based on how confident you are this is the right person.

Return ONLY valid JSON.`;

  try {
    const response = await callLLM(
      LOVABLE_API_KEY,
      'You extract identity information to disambiguate people with common names.',
      extractionPrompt,
      RESEARCH_MODEL_NAME
    );
    
    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    
    return {
      fingerprint: {
        canonical_name: parsed.canonical_name || recipientName,
        company: parsed.company || recipientCompany,
        role_keywords: parsed.role_keywords || [],
        disambiguators: parsed.disambiguators || [],
        confounders: parsed.confounders || [],
      },
      confidence: parsed.identity_confidence || 0.5,
    };
  } catch (e) {
    console.error('Failed to extract identity fingerprint:', e);
    return {
      fingerprint: {
        canonical_name: recipientName,
        company: recipientCompany,
        role_keywords: recipientRole.toLowerCase().split(/\s+/).filter(w => w.length > 2),
        disambiguators: [],
        confounders: [],
      },
      confidence: 0.3,
    };
  }
}

// ============= STAGE 2: BRIDGE HYPOTHESES =============

async function generateBridgeHypotheses(
  reachingOutBecause: string,
  credibilityStory: string,
  recipientRole: string,
  recipientCompany: string,
  LOVABLE_API_KEY: string
): Promise<BridgeHypothesis[]> {
  console.log('=== Stage 2: Generate Bridge Hypotheses ===');
  
  const prompt = `Generate 3 "bridge hypotheses" for a cold email connection.

SENDER CONTEXT:
- Why reaching out: "${reachingOutBecause}"
- Credibility story: "${credibilityStory}"

RECIPIENT:
- Role: ${recipientRole} at ${recipientCompany}

A "bridge hypothesis" is a theory about what shared ground might connect sender to recipient.

Generate exactly 3 hypotheses:
1. DOMAIN bridge: shared work/problem space
2. VALUE bridge: shared motivation (inclusion, craftsmanship, resilience, etc.)
3. TRADEOFF bridge: shared tension (scaling quality vs speed, adoption vs trust, etc.)

For each hypothesis, provide:
- type: "domain", "value", or "tradeoff"
- keywords: 5-10 search keywords that would find evidence of this bridge
- query_templates: 2-3 Exa search query templates (use {name} and {company} as placeholders)
- proof_target: what would count as proof this bridge exists

Return JSON:
{
  "hypotheses": [
    {
      "type": "domain",
      "keywords": ["keyword1", "keyword2", ...],
      "query_templates": [
        "\"{name}\" {company} interview keyword1 keyword2",
        "\"{name}\" {company} podcast keyword1"
      ],
      "proof_target": "Recipient has spoken about X or built Y"
    },
    ...
  ]
}

Return ONLY valid JSON.`;

  try {
    const response = await callLLM(
      LOVABLE_API_KEY,
      'You generate strategic hypotheses for cold email personalization.',
      prompt,
      RESEARCH_MODEL_NAME
    );
    
    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    
    return (parsed.hypotheses || []).slice(0, 3);
  } catch (e) {
    console.error('Failed to generate bridge hypotheses:', e);
    
    // Fallback: simple keyword-based hypotheses
    const domainKeywords = extractSimpleKeywords(reachingOutBecause);
    const valueKeywords = extractSimpleKeywords(credibilityStory);
    
    return [
      {
        type: 'domain',
        keywords: domainKeywords.slice(0, 5),
        query_templates: [`"{name}" {company} interview ${domainKeywords[0] || ''}`],
        proof_target: 'Recipient has discussed similar domain topics',
      },
      {
        type: 'value',
        keywords: valueKeywords.slice(0, 5),
        query_templates: [`"{name}" {company} talk ${valueKeywords[0] || ''}`],
        proof_target: 'Recipient shares similar values or motivations',
      },
      {
        type: 'tradeoff',
        keywords: ['decision', 'tradeoff', 'challenge', 'pivot'],
        query_templates: [`"{name}" {company} decision challenge`],
        proof_target: 'Recipient has faced similar tradeoffs',
      },
    ];
  }
}

function extractSimpleKeywords(text: string): string[] {
  const stopwords = new Set(['i', 'me', 'my', 'we', 'our', 'you', 'your', 'the', 'a', 'an', 'and', 'or', 'but', 'to', 'for', 'of', 'in', 'on', 'at', 'by', 'with', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'this', 'that', 'these', 'those', 'it', 'its']);
  
  return text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopwords.has(w))
    .slice(0, 10);
}

// ============= STAGE 3: CANDIDATE DISCOVERY =============

async function discoverCandidates(
  recipientName: string,
  fingerprint: IdentityFingerprint,
  hypotheses: BridgeHypothesis[],
  exaApiKey: string
): Promise<{ candidates: ExaResult[]; queriesUsed: string[] }> {
  console.log('=== Stage 3: Candidate Discovery ===');
  
  const queriesUsed: string[] = [];
  const allResults: ExaResult[] = [];
  const seenUrls = new Set<string>();
  
  // Build confounder negation string
  const negations = fingerprint.confounders
    .flatMap(c => c.negative_keywords.slice(0, 2))
    .map(k => `-${k}`)
    .join(' ');
  
  // Run max 2 queries per hypothesis, cap at 6 total
  let queryCount = 0;
  const MAX_QUERIES = 6;
  
  for (const hypothesis of hypotheses) {
    if (queryCount >= MAX_QUERIES) break;
    
    for (const template of hypothesis.query_templates.slice(0, 2)) {
      if (queryCount >= MAX_QUERIES) break;
      
      // Fill in template
      let query = template
        .replace('{name}', recipientName)
        .replace('{company}', fingerprint.company);
      
      // Add negations if we have confounders
      if (negations) {
        query = `${query} ${negations}`;
      }
      
      queriesUsed.push(query);
      queryCount++;
      
      const results = await exaSearchWithContent(query, exaApiKey, 10);
      
      for (const r of results) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          allResults.push(r);
        }
      }
    }
  }
  
  console.log(`Discovered ${allResults.length} candidate URLs from ${queriesUsed.length} queries`);
  return { candidates: allResults, queriesUsed };
}

// ============= STAGE 4: NICHE GATE =============

function applyNicheGate(url: string, title: string, snippet: string): { passed: boolean; reasons: string[] } {
  const lowerUrl = url.toLowerCase();
  const lowerTitle = (title || '').toLowerCase();
  const lowerSnippet = (snippet || '').toLowerCase();
  const combined = `${lowerTitle} ${lowerSnippet}`;
  
  const reasons: string[] = [];
  
  // REJECT patterns (hard no)
  const rejectPatterns = [
    { pattern: 'linkedin.com', reason: 'LinkedIn profile' },
    { pattern: 'wikipedia.org', reason: 'Wikipedia (generic bio)' },
    { pattern: '/about', reason: 'About page (generic bio)' },
    { pattern: '/leadership', reason: 'Leadership page (directory)' },
    { pattern: '/team', reason: 'Team page (directory)' },
    { pattern: '/board', reason: 'Board page (directory)' },
    { pattern: '/executive', reason: 'Executive page (generic bio)' },
  ];
  
  for (const { pattern, reason } of rejectPatterns) {
    if (lowerUrl.includes(pattern)) {
      return { passed: false, reasons: [`REJECT: ${reason}`] };
    }
  }
  
  // ELIGIBLE patterns (must match at least one)
  const eligiblePatterns = [
    { patterns: ['interview', 'podcast', 'transcript', 'fireside', 'conversation'], type: 'artifact' },
    { patterns: ['talk', 'keynote', 'panel', 'conference', 'summit'], type: 'artifact' },
    { patterns: ['essay', 'op-ed', 'wrote', 'writes', 'blog', 'newsletter', 'substack'], type: 'artifact' },
    { patterns: ['joined', 'left', 'pivot', 'acquired', 'founded', 'launched'], type: 'inflection' },
    { patterns: ['initiative', 'program', 'announced', 'leading', 'spearheading'], type: 'initiative' },
    { patterns: ['i think', 'i believe', 'we learned', 'lesson', 'mistake', 'surprised', 'realized'], type: 'stance' },
  ];
  
  for (const { patterns, type } of eligiblePatterns) {
    for (const p of patterns) {
      if (lowerUrl.includes(p) || combined.includes(p)) {
        reasons.push(`ELIGIBLE: ${type} (found "${p}")`);
        return { passed: true, reasons };
      }
    }
  }
  
  // Publication domain boost (can pass even without explicit pattern)
  const pubDomains = ['medium.com', 'substack.com', 'forbes.com', 'techcrunch.com', 'wired.com', 'hbr.org', 'firstround.com', 'a16z.com', 'nfx.com', 'fastcompany.com', 'axios.com', 'youtube.com/watch'];
  for (const domain of pubDomains) {
    if (lowerUrl.includes(domain)) {
      reasons.push(`ELIGIBLE: publication domain (${domain})`);
      return { passed: true, reasons };
    }
  }
  
  return { passed: false, reasons: ['REJECT: no eligible pattern found'] };
}

// ============= STAGE 5: IDENTITY LOCK ON CONTENT =============

function checkIdentityLock(
  text: string,
  recipientName: string,
  fingerprint: IdentityFingerprint
): { locked: boolean; reasons: string[] } {
  const lowerText = text.toLowerCase();
  const reasons: string[] = [];
  
  // Check for recipient name (or canonical variant)
  const nameParts = recipientName.toLowerCase().split(/\s+/);
  const canonicalParts = fingerprint.canonical_name.toLowerCase().split(/\s+/);
  const allNameVariants = [...new Set([...nameParts, ...canonicalParts])];
  
  const hasName = allNameVariants.some(part => part.length > 2 && lowerText.includes(part));
  if (!hasName) {
    return { locked: false, reasons: ['Identity lock failed: name not found in content'] };
  }
  reasons.push('Name found in content');
  
  // Check for company OR disambiguator
  const hasCompany = lowerText.includes(fingerprint.company.toLowerCase());
  const hasDisambiguator = fingerprint.disambiguators.some(d => 
    d.length > 3 && lowerText.includes(d.toLowerCase())
  );
  
  if (!hasCompany && !hasDisambiguator) {
    return { locked: false, reasons: ['Identity lock failed: company/disambiguator not found'] };
  }
  
  if (hasCompany) reasons.push('Company found in content');
  if (hasDisambiguator) reasons.push('Disambiguator found in content');
  
  // Check for confounder keywords (negative signal)
  for (const confounder of fingerprint.confounders) {
    for (const negKeyword of confounder.negative_keywords) {
      if (negKeyword.length > 3 && lowerText.includes(negKeyword.toLowerCase())) {
        return { locked: false, reasons: [`Identity lock failed: confounder keyword "${negKeyword}" found (may be ${confounder.name})`] };
      }
    }
  }
  
  return { locked: true, reasons };
}

// ============= STAGE 6: HOOK PACK EXTRACTION =============

async function extractHookPacks(
  recipientName: string,
  recipientRole: string,
  recipientCompany: string,
  eligibleCandidates: CandidateUrl[],
  hypotheses: BridgeHypothesis[],
  credibilityStory: string,
  LOVABLE_API_KEY: string
): Promise<HookPack[]> {
  console.log('=== Stage 6: Hook Pack Extraction ===');
  
  if (eligibleCandidates.length === 0) {
    console.log('No eligible candidates for hook pack extraction');
    return [];
  }
  
  const sourcesContext = eligibleCandidates.slice(0, 6).map((c, i) => `
SOURCE ${i + 1}: ${c.url}
Title: ${c.title}
Content: ${(c.text || '').substring(0, 2000)}
`).join('\n---\n');

  const hypothesesContext = hypotheses.map((h, i) => `
${i + 1}. ${h.type.toUpperCase()} bridge: Looking for evidence that ${h.proof_target}
   Keywords: ${h.keywords.join(', ')}
`).join('');

  const extractionPrompt = `Extract Hook Packs for a cold email to ${recipientName}, ${recipientRole} at ${recipientCompany}.

SENDER'S CREDIBILITY STORY:
"${credibilityStory}"

BRIDGE HYPOTHESES (what we're looking for):
${hypothesesContext}

SOURCES TO ANALYZE:
${sourcesContext}

For each source, try to extract a Hook Pack. A Hook Pack contains:
1. A POINTABLE CLAIM - a fact that can be quoted, named, or directly referenced
2. A concrete "Like you," bridge line that connects sender to this claim
3. Scores for quality

═══════════════════════════════════════════════════════════════════
CRITICAL: EVIDENCE MUST BE POINTABLE
═══════════════════════════════════════════════════════════════════

A claim is ONLY valid if it includes at least one of:
✓ DIRECT QUOTE - Exact words the recipient said (in quotes)
✓ NAMED INITIATIVE/PROGRAM - A specific named project, product, or program they created/led
✓ DESCRIBED DECISION/TRADEOFF - A specific choice they made with concrete context
✓ NAMED ARTIFACT - A specific article, podcast, talk, paper, or interview by name/title

AUTOMATICALLY REJECT claims that are merely:
✗ "interest in..." / "interested in..."
✗ "focus on..." / "focused on..."
✗ "known for..."
✗ "has been involved in..."
✗ "passionate about..."
✗ "believes in..."
✗ "works on..."
✗ "is leading..."
✗ Any vague attribution without a specific named thing or direct quote

EXAMPLES:

INVALID (reject these):
- "Chris has a focus on AI and future of work" → No named artifact or quote
- "She's known for her work in sustainability" → No specific evidence
- "He's been involved in major acquisitions" → Which ones?
- "She's interested in inclusive design" → Vague sentiment

VALID (accept these):
- "In his EY podcast 'The Empathy Effect', Chris said: 'AI will fundamentally change how we think about empathy in the workplace'" → Named artifact + quote
- "She led the acquisition of Mandiant in 2022, Microsoft's largest cybersecurity deal" → Named initiative with specifics
- "He chose to sunset the legacy product despite $50M in revenue, prioritizing long-term platform health" → Described decision with context
- "In her TED talk 'Designing for the Margins', she argued that inclusive design drives innovation" → Named artifact + paraphrase

═══════════════════════════════════════════════════════════════════

INVALID "Like you," lines (DO NOT generate):
- "Like you, I went to Stanford" (just identity mirroring)
- "Like you, I'm passionate about X" (too generic)
- "Like you, I work in tech" (too broad)

VALID "Like you," lines:
- "Like you, I've had to convince skeptical enterprise buyers that AI can be trustworthy"
- "Like you, I spent years building pipelines before realizing the real bottleneck was mentorship"
- "Like you, I've wrestled with the tension between moving fast and maintaining quality"

Return JSON:
{
  "hook_packs": [
    {
      "hook_fact": {
        "claim": "Non-obvious claim about recipient",
        "source_url": "https://...",
        "evidence": "8-25 word quote OR named artifact/initiative/decision from source",
        "evidence_type": "quote|named_initiative|described_decision|named_artifact"
      },
      "bridge": {
        "like_you_line": "Like you, I...",
        "bridge_angle": "domain|value|tradeoff|artifact|inflection|shared-affiliation",
        "why_relevant": "Brief explanation of why this bridge works"
      },
      "scores": {
        "identity_conf": 0.0-1.0,
        "non_generic": 0.0-1.0,
        "bridgeability": 0.0-1.0,
        "overall": 0.0-1.0
      }
    }
  ]
}

SCORING RUBRIC:
- identity_conf: Is this clearly about the right person? (0.0 = uncertain, 1.0 = definitely them)
- non_generic: Would this be unknown from their title alone? (0.0 = obvious, 1.0 = surprising)
- bridgeability: Can we write a specific "Like you," line? (0.0 = generic, 1.0 = concrete parallel)
- overall: Weighted average = 0.45*identity_conf + 0.30*bridgeability + 0.25*non_generic

Only include Hook Packs with overall score >= 0.5
Return maximum 2 Hook Packs, prioritize quality over quantity.

IF NO CLAIMS MEET THE "POINTABLE" REQUIREMENT, RETURN AN EMPTY ARRAY.
Better to return 0 Hook Packs than to return vague, unprovable claims.

Return ONLY valid JSON.`;

  try {
    const response = await callLLM(
      LOVABLE_API_KEY,
      'You extract high-quality personalization hooks for cold emails. Be rigorous about what counts as "bridgeable".',
      extractionPrompt,
      RESEARCH_MODEL_NAME
    );
    
    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    
    // Filter by overall score and limit to 2
    const hookPacks: HookPack[] = (parsed.hook_packs || [])
      .filter((hp: HookPack) => hp.scores?.overall >= 0.5)
      .slice(0, 2);
    
    console.log(`Extracted ${hookPacks.length} Hook Packs`);
    return hookPacks;
  } catch (e) {
    console.error('Failed to extract hook packs:', e);
    return [];
  }
}

// ============= HELPER FUNCTIONS =============

async function callLLM(
  LOVABLE_API_KEY: string,
  systemPrompt: string,
  userPrompt: string,
  modelName: string = MODEL_NAME
): Promise<string> {
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Lovable AI error:', response.status, errorText);
    throw { status: response.status, message: errorText };
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function exaSearchWithContent(query: string, exaApiKey: string, numResults: number = 8): Promise<ExaResult[]> {
  console.log('Exa search query:', query);
  
  const response = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${exaApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      numResults,
      type: 'neural',
      useAutoprompt: true,
      contents: {
        text: { maxCharacters: 3000 },
        highlights: { numSentences: 5 },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Exa search error:', response.status, errorText);
    return [];
  }

  const data = await response.json();
  console.log('Exa search returned', data.results?.length || 0, 'results');
  
  return (data.results || []).map((r: any) => ({
    url: r.url || '',
    title: r.title || '',
    snippet: r.highlights?.join(' ') || '',
    text: r.text || '',
  }));
}

// ============= FIRECRAWL ENRICHMENT =============

function isContentAbstract(text: string): boolean {
  // Content is "abstract" if it's short or lacks concrete indicators
  const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  
  // Too short - definitely needs enrichment
  if (wordCount < 200) return true;
  
  // Check for concrete evidence indicators
  const concreteIndicators = [
    // Direct quotes
    /[""][^""]{20,}[""]/, // Quoted text of 20+ chars
    /'[^']{20,}'/, // Single-quoted text
    // Named artifacts
    /\b(podcast|interview|talk|keynote|essay|article|book|paper)\b.*["'][^"']+["']/i,
    // Specific numbers/dates
    /\b(in \d{4}|january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}/i,
    /\$[\d.,]+\s*(million|billion|M|B)/i,
    // First person statements
    /\b(I think|I believe|we decided|I realized|we learned|I said|I wrote)\b/i,
  ];
  
  const hasConcreteEvidence = concreteIndicators.some(pattern => pattern.test(text));
  
  // If medium-length but no concrete evidence, still abstract
  if (wordCount < 500 && !hasConcreteEvidence) return true;
  
  return false;
}

async function enrichWithFirecrawl(url: string): Promise<string | null> {
  const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
  
  if (!firecrawlApiKey) {
    console.log('FIRECRAWL_API_KEY not configured, skipping enrichment');
    return null;
  }
  
  console.log('Firecrawl: fetching full content for', url);
  
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 2000,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Firecrawl error:', response.status, errorText);
      return null;
    }
    
    const data = await response.json();
    const markdown = data.data?.markdown || data.markdown;
    
    if (markdown) {
      console.log('Firecrawl: got', markdown.length, 'chars for', url);
      return markdown;
    }
    
    return null;
  } catch (e) {
    console.error('Firecrawl fetch error:', e);
    return null;
  }
}

async function enrichAbstractCandidates(
  eligibleCandidates: CandidateUrl[],
  maxEnrichments: number = 3
): Promise<CandidateUrl[]> {
  console.log('=== Stage 5.5: Firecrawl Enrichment ===');
  
  const enrichedCandidates: CandidateUrl[] = [];
  let enrichmentCount = 0;
  
  for (const candidate of eligibleCandidates) {
    // Check if content is abstract and needs enrichment
    if (isContentAbstract(candidate.text) && enrichmentCount < maxEnrichments) {
      console.log(`Content abstract for ${candidate.url}, attempting Firecrawl enrichment`);
      
      const enrichedContent = await enrichWithFirecrawl(candidate.url);
      
      if (enrichedContent && enrichedContent.length > candidate.text.length) {
        enrichedCandidates.push({
          ...candidate,
          text: enrichedContent.substring(0, 8000), // Cap at 8k chars
          reasons: [...candidate.reasons, 'ENRICHED: Firecrawl fetched full content'],
        });
        enrichmentCount++;
        console.log(`Enriched ${candidate.url}: ${candidate.text.length} -> ${enrichedContent.length} chars`);
      } else {
        // Keep original if enrichment failed
        enrichedCandidates.push(candidate);
      }
    } else {
      // Content is concrete enough, keep as-is
      enrichedCandidates.push(candidate);
    }
  }
  
  console.log(`Enriched ${enrichmentCount} of ${eligibleCandidates.length} candidates`);
  return enrichedCandidates;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

function hasEmDash(text: string): boolean {
  return text.includes('—');
}

function countLikeYouCapitalized(text: string): number {
  const matches = text.match(/Like you,/g);
  return matches ? matches.length : 0;
}

function countLikeYouAny(text: string): number {
  const lowerText = text.toLowerCase();
  const matches = lowerText.match(/like you/g);
  return matches ? matches.length : 0;
}

function extractSentenceWithLikeYou(body: string): string | null {
  const sentences = body.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    if (sentence.toLowerCase().includes('like you')) {
      return sentence;
    }
  }
  return null;
}

function countCliches(text: string): number {
  const lowerText = text.toLowerCase();
  let count = 0;
  for (const cliche of BANNED_CLICHES) {
    if (lowerText.includes(cliche)) count++;
  }
  return count;
}

function hasBracketPlaceholders(text: string): boolean {
  return /\[[A-Za-z]+\]/.test(text);
}

function validateEmail(rawText: string, recipientFirstName: string): ValidationResult {
  const errors: string[] = [];
  
  let parsed: { subject?: string; body?: string };
  try {
    const cleaned = rawText.replace(/```json\n?|\n?```/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    errors.push('Output was not valid JSON');
    return { valid: false, errors, likeYouCount: 0, wordCount: 0, clicheCount: 0 };
  }

  if (!parsed.subject || typeof parsed.subject !== 'string') {
    errors.push('Missing or invalid "subject" field');
  }
  if (!parsed.body || typeof parsed.body !== 'string') {
    errors.push('Missing or invalid "body" field');
  }

  if (errors.length > 0) {
    return { valid: false, errors, likeYouCount: 0, wordCount: 0, clicheCount: 0 };
  }

  const subject = parsed.subject!;
  const body = parsed.body!;
  const combinedText = `${subject} ${body}`;

  const likeYouCapCount = countLikeYouCapitalized(body);
  const likeYouAnyCount = countLikeYouAny(body);
  
  if (likeYouCapCount === 0) {
    if (likeYouAnyCount > 0) {
      errors.push('Body contains "like you" but not in correct format. Must be "Like you," (capital L, comma)');
    } else {
      errors.push('Body must contain the exact phrase "Like you," (capital L, comma)');
    }
  } else if (likeYouCapCount > 1) {
    errors.push(`Body contains "Like you," ${likeYouCapCount} times (must be exactly once)`);
  }

  if (likeYouAnyCount >= 1) {
    const likeYouSentence = extractSentenceWithLikeYou(body);
    if (likeYouSentence) {
      const lowerSentence = likeYouSentence.toLowerCase();
      for (const pattern of GENERIC_LIKE_YOU_PATTERNS) {
        if (lowerSentence.includes(pattern)) {
          errors.push(`The "Like you," sentence contains generic phrase "${pattern}"`);
          break;
        }
      }
    }
  }

  let clicheCount = 0;
  for (const cliche of BANNED_CLICHES) {
    if (combinedText.toLowerCase().includes(cliche)) {
      errors.push(`Contains banned cliché: "${cliche}"`);
      clicheCount++;
    }
  }

  if (hasBracketPlaceholders(combinedText)) {
    errors.push('Contains bracket placeholders like [Name]');
  }

  const bodyLines = body.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (bodyLines.length > 0) {
    const firstLine = bodyLines[0];
    const validGreeting1 = `Hi ${recipientFirstName},`;
    const validGreeting2 = `${recipientFirstName},`;
    if (!firstLine.startsWith(validGreeting1) && !firstLine.startsWith(validGreeting2)) {
      errors.push(`Greeting must start with "Hi ${recipientFirstName}," or "${recipientFirstName},"`);
    }
  }

  const trimmedBody = body.trimEnd();
  if (!trimmedBody.endsWith('Best,')) {
    errors.push('Body must end with exactly "Best," and nothing after');
  }

  if (hasEmDash(body)) {
    errors.push('Body contains em-dash (—) which is banned');
  }
  if (hasEmDash(subject)) {
    errors.push('Subject contains em-dash (—) which is banned');
  }

  if (body.includes('...') || body.includes('…')) {
    errors.push('Body contains ellipsis (... or …) which is banned');
  }

  const wordCount = countWords(body);
  if (wordCount < 90) {
    errors.push(`Body has ${wordCount} words (minimum 90 required)`);
  }
  if (wordCount > 170) {
    errors.push(`Body has ${wordCount} words (maximum 170 allowed)`);
  }

  return {
    valid: errors.length === 0,
    errors,
    likeYouCount: likeYouCapCount,
    wordCount,
    clicheCount,
  };
}

function buildRetryInstruction(errors: string[]): string {
  const errorList = errors.map(e => `- ${e}`).join('\n');
  return `

REWRITE REQUIRED — your previous output violated these rules:
${errorList}

Rewrite the email to satisfy ALL rules.

Critical fixes needed:
- The body MUST include the exact phrase "Like you," (capital L, comma after) exactly once.
- The sentence containing "Like you," must be specific and NOT include any banned generic phrases.
- Do not use any banned clichés.
- End with exactly "Best," and nothing after.
- Word count must be between 90 and 170 words.
- No bracket placeholders like [Name].
- No em-dashes (—).

Return ONLY valid JSON with keys "subject" and "body".`;
}

function getAskTypeLabel(askType: string): string {
  const labels: Record<string, string> = {
    'chat': 'a short introductory chat',
    'feedback': 'feedback on something',
    'referral': 'a referral or introduction',
    'job': 'job or recruiting related discussion',
    'other': 'other',
  };
  return labels[askType] || askType;
}

function getAffiliationTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    'school': 'same school/university',
    'business_school': 'same business school/MBA program',
    'company': 'same previous company',
    'accelerator': 'same accelerator/fellowship/program',
    'personal_characteristics': 'shared personal characteristics (race, ethnicity, nationality)',
    'other': 'other shared background',
  };
  return labels[type] || type;
}

// ============= V2 RESEARCH PIPELINE =============

interface V2ResearchResult {
  hookPacks: HookPack[];
  identityFingerprint: IdentityFingerprint | null;
  bridgeHypotheses: BridgeHypothesis[];
  candidateUrls: CandidateUrl[];
  queriesUsed: string[];
  exaResults: ExaResult[];
  selectedSources: string[];
  notes?: string;
}

async function performV2Research(
  recipientName: string,
  recipientCompany: string,
  recipientRole: string,
  reachingOutBecause: string,
  credibilityStory: string,
  exaApiKey: string,
  LOVABLE_API_KEY: string
): Promise<V2ResearchResult> {
  console.log('=== V2 Research Pipeline ===');
  
  const queriesUsed: string[] = [];
  let allExaResults: ExaResult[] = [];
  
  // ============= STAGE 1A: High-precision identity search =============
  console.log('=== Stage 1A: Identity Search ===');
  
  const identityQueries = [
    `"${recipientName}" "${recipientCompany}" bio`,
    `"${recipientName}" "${recipientCompany}" "${recipientRole}"`,
  ];
  
  let identityResults: ExaResult[] = [];
  for (const q of identityQueries) {
    queriesUsed.push(q);
    const results = await exaSearchWithContent(q, exaApiKey, 5);
    identityResults = [...identityResults, ...results];
    allExaResults = [...allExaResults, ...results];
  }
  
  // Dedupe by URL
  const seenUrls = new Set<string>();
  identityResults = identityResults.filter(r => {
    if (seenUrls.has(r.url)) return false;
    seenUrls.add(r.url);
    return true;
  });
  
  console.log(`Identity search found ${identityResults.length} unique results`);
  
  // ============= STAGE 1B: Extract identity fingerprint =============
  const { fingerprint, confidence } = await extractIdentityFingerprint(
    recipientName,
    recipientCompany,
    recipientRole,
    identityResults,
    LOVABLE_API_KEY
  );
  
  console.log('Identity fingerprint:', fingerprint);
  console.log('Identity confidence:', confidence);
  
  // Exit if identity confidence too low
  if (confidence < 0.4) {
    console.log('STOPPING: Identity confidence too low');
    return {
      hookPacks: [],
      identityFingerprint: fingerprint,
      bridgeHypotheses: [],
      candidateUrls: [],
      queriesUsed,
      exaResults: allExaResults,
      selectedSources: [],
      notes: 'Research stopped: could not confidently identify recipient. Name may be ambiguous.',
    };
  }
  
  // ============= STAGE 2: Generate bridge hypotheses =============
  const hypotheses = await generateBridgeHypotheses(
    reachingOutBecause,
    credibilityStory,
    recipientRole,
    recipientCompany,
    LOVABLE_API_KEY
  );
  
  console.log('Bridge hypotheses:', hypotheses.map(h => ({ type: h.type, keywords: h.keywords.slice(0, 3) })));
  
  // ============= STAGE 3: Candidate discovery =============
  const { candidates, queriesUsed: discoveryQueries } = await discoverCandidates(
    recipientName,
    fingerprint,
    hypotheses,
    exaApiKey
  );
  
  queriesUsed.push(...discoveryQueries);
  allExaResults = [...allExaResults, ...candidates];
  
  // ============= STAGE 4 & 5: Niche gate + Identity lock =============
  console.log('=== Stage 4 & 5: Niche Gate + Identity Lock ===');
  
  const candidateUrls: CandidateUrl[] = [];
  const eligibleCandidates: CandidateUrl[] = [];
  
  for (const c of candidates) {
    // Stage 4: Niche gate
    const nicheResult = applyNicheGate(c.url, c.title, c.snippet);
    
    if (!nicheResult.passed) {
      candidateUrls.push({
        url: c.url,
        title: c.title,
        text: c.text || '',
        passed_niche_gate: false,
        reasons: nicheResult.reasons,
        identity_locked: false,
      });
      continue;
    }
    
    // Stage 5: Identity lock
    const identityResult = checkIdentityLock(c.text || c.snippet || '', recipientName, fingerprint);
    
    const candidate: CandidateUrl = {
      url: c.url,
      title: c.title,
      text: c.text || '',
      passed_niche_gate: true,
      reasons: [...nicheResult.reasons, ...identityResult.reasons],
      identity_locked: identityResult.locked,
    };
    
    candidateUrls.push(candidate);
    
    if (identityResult.locked) {
      eligibleCandidates.push(candidate);
    }
  }
  
  console.log(`${eligibleCandidates.length} candidates passed niche gate + identity lock`);
  
  // Early stop if we have enough
  if (eligibleCandidates.length >= 2) {
    console.log('Early stop: enough eligible candidates');
  }
  
  // ============= STAGE 5.5: Firecrawl Enrichment =============
  // For candidates that passed but have abstract/short content, fetch full content via Firecrawl
  const enrichedCandidates = await enrichAbstractCandidates(
    eligibleCandidates.slice(0, 6), // Cap at 6 for enrichment
    3 // Max 3 Firecrawl calls to limit latency/cost
  );
  
  // ============= STAGE 6: Hook Pack extraction =============
  const hookPacks = await extractHookPacks(
    recipientName,
    recipientRole,
    recipientCompany,
    enrichedCandidates, // Use enriched candidates
    hypotheses,
    credibilityStory,
    LOVABLE_API_KEY
  );
  
  return {
    hookPacks,
    identityFingerprint: fingerprint,
    bridgeHypotheses: hypotheses,
    candidateUrls,
    queriesUsed,
    exaResults: allExaResults.slice(0, 10),
    selectedSources: eligibleCandidates.map(c => c.url),
  };
}

// ============= MAIN HANDLER =============

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const body = await req.json();
    
    const recipientName = body.recipientName || '';
    const recipientCompany = body.recipientCompany || '';
    const recipientRole = body.recipientRole || '';
    const askType = (body.askType || 'chat') as AskType;
    const reachingOutBecause = body.reachingOutBecause || '';
    const credibilityStory = body.credibilityStory || '';
    const sharedAffiliation = body.sharedAffiliation || null;
    
    const source = body.source || 'app';
    const scenarioName = body.scenario_name || body.scenarioName || null;
    const sessionId = body.sessionId || null;
    const includeDebug = body.includeDebug || source === 'test_harness';

    // Input validation
    if (!recipientName || recipientName.length < 2 || recipientName.length > 100) {
      return new Response(
        JSON.stringify({ error: 'Invalid recipient name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!recipientCompany || recipientCompany.length < 1 || recipientCompany.length > 100) {
      return new Response(
        JSON.stringify({ error: 'Invalid company name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!recipientRole || recipientRole.length < 1 || recipientRole.length > 100) {
      return new Response(
        JSON.stringify({ error: 'Invalid role/title' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!credibilityStory || credibilityStory.length < 10 || credibilityStory.length > 1000) {
      return new Response(
        JSON.stringify({ error: 'Credibility story must be between 10 and 1000 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!reachingOutBecause || reachingOutBecause.length < 5 || reachingOutBecause.length > 500) {
      return new Response(
        JSON.stringify({ error: 'Please explain why you are reaching out (5-500 characters)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const recipientFirstName = recipientName.split(' ')[0];

    const inputJson = {
      recipientName,
      recipientCompany,
      recipientRole,
      askType,
      reachingOutBecause,
      credibilityStory,
      sharedAffiliation,
    };

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const EXA_API_KEY = Deno.env.get('EXA_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'Failed to generate email. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============= V2 RESEARCH PIPELINE =============
    let researchResult: V2ResearchResult | null = null;
    
    if (EXA_API_KEY) {
      console.log('Starting V2 research pipeline...');
      
      try {
        researchResult = await performV2Research(
          recipientName,
          recipientCompany,
          recipientRole,
          reachingOutBecause,
          credibilityStory,
          EXA_API_KEY,
          LOVABLE_API_KEY
        );
        
        console.log(`V2 Research complete: ${researchResult.hookPacks.length} Hook Packs extracted`);
      } catch (e) {
        console.error('V2 Research pipeline failed:', e);
      }
    } else {
      console.log('EXA_API_KEY not configured, skipping research');
    }

    // ============= GENERATE EMAIL =============
    console.log('=== Generate Email ===');
    
    // Build shared affiliation section if provided
    let sharedAffiliationSection = '';
    if (sharedAffiliation && sharedAffiliation.name) {
      const affiliationTypes = (sharedAffiliation.types || [])
        .map((t: string) => getAffiliationTypeLabel(t))
        .join(', ');
      
      sharedAffiliationSection = `
SHARED AFFILIATION (user-declared, use ONLY as last resort for "Like you," connection):
- Connection type: ${affiliationTypes}
- Shared institution or organization: ${sharedAffiliation.name}${sharedAffiliation.detail ? `
- Sender's connection: ${sharedAffiliation.detail}` : ''}

IMPORTANT: Only use this shared affiliation if no stronger craft/problem/constraint parallel exists.`;
    }

    // Build Hook Packs section (V2)
    let hookPacksSection = '';
    if (researchResult && researchResult.hookPacks.length > 0) {
      hookPacksSection = `
RESEARCHED HOOK PACKS (use one to create the "Like you," bridge):
${researchResult.hookPacks.map((hp, i) => `
${i + 1}. CLAIM: ${hp.hook_fact.claim}
   Source: ${hp.hook_fact.source_url}
   Evidence: "${hp.hook_fact.evidence}"
   
   SUGGESTED "Like you," LINE: "${hp.bridge.like_you_line}"
   Bridge angle: ${hp.bridge.bridge_angle}
   Why relevant: ${hp.bridge.why_relevant}
   
   Quality scores: identity=${hp.scores.identity_conf.toFixed(2)}, non_generic=${hp.scores.non_generic.toFixed(2)}, bridgeability=${hp.scores.bridgeability.toFixed(2)}, overall=${hp.scores.overall.toFixed(2)}
`).join('')}

Use the suggested "Like you," line as inspiration or adapt it. Do not copy it verbatim if it doesn't flow naturally.`;
    } else {
      hookPacksSection = `
NO RESEARCHED HOOK PACKS AVAILABLE.
Create the "Like you," bridge using ONLY:
- The sender's credibility story
- The recipient's role and company context
Do NOT imply you did specific research on the recipient.`;
    }

    const userPrompt = `Generate a cold email with these details:

RECIPIENT:
- Name: ${recipientName}
- Role: ${recipientRole} at ${recipientCompany}
${hookPacksSection}
${sharedAffiliationSection}

SENDER'S CONTEXT:
- Asking for: ${getAskTypeLabel(askType)}
- Reason for reaching out: ${reachingOutBecause}
- Credibility story: ${credibilityStory}

CRITICAL INSTRUCTIONS:
- The email MUST include the exact phrase "Like you," (capital L, comma after) exactly once in the body
- The "Like you," sentence should appear in the first or second paragraph
- Priority for "Like you," bridge: craft/experience > problem space > constraints > shared institution
- Make a specific ask related to "${getAskTypeLabel(askType)}"
- Keep the body between 90-170 words
- Greeting must be "Hi ${recipientFirstName}," or "${recipientFirstName},"
- End with exactly "Best," and nothing after
- No bracket placeholders, no em-dashes

Return your response in this exact JSON format:
{
  "subject": "Your subject line here",
  "body": "Your full email body here with proper line breaks"
}

Only return the JSON, no other text.`;

    // Generate email with validation and retry logic
    let rawResponse: string;
    let validation: ValidationResult;
    const enforcementResults: EnforcementResults = {
      did_retry: false,
      failures_first_pass: [],
      failures_retry: [],
    };

    try {
      console.log('Generating email (attempt 1)...');
      rawResponse = await callLLM(LOVABLE_API_KEY, SUPER_PROMPT, userPrompt);
      console.log('AI response:', rawResponse);
      
      validation = validateEmail(rawResponse, recipientFirstName);
      enforcementResults.failures_first_pass = validation.errors;
      
      if (!validation.valid) {
        console.log('Validation failed (attempt 1):', validation.errors);
        
        enforcementResults.did_retry = true;
        const retryPrompt = userPrompt + buildRetryInstruction(validation.errors);
        
        console.log('Generating email (attempt 2 - retry)...');
        rawResponse = await callLLM(LOVABLE_API_KEY, SUPER_PROMPT, retryPrompt);
        console.log('AI response (retry):', rawResponse);
        
        validation = validateEmail(rawResponse, recipientFirstName);
        enforcementResults.failures_retry = validation.errors;
        
        if (!validation.valid) {
          console.log('Validation still failed after retry:', validation.errors);
        } else {
          console.log('Retry succeeded, validation passed');
        }
      } else {
        console.log('Validation passed on first attempt');
      }
    } catch (error: any) {
      if (error.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (error.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.error('Generation error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to generate email. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse the final response
    let emailData: { subject: string; body: string };
    try {
      const cleanedContent = rawResponse.replace(/```json\n?|\n?```/g, '').trim();
      emailData = JSON.parse(cleanedContent);
    } catch {
      console.error('Failed to parse final response as JSON');
      return new Response(
        JSON.stringify({ error: 'Failed to generate valid email. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const latencyMs = Date.now() - startTime;
    const wordCount = countWords(emailData.body);
    const clicheCount = countCliches(emailData.subject + ' ' + emailData.body);
    const likeYouCount = countLikeYouCapitalized(emailData.body);

    // Log analytics
    console.log('=== GENERATION ANALYTICS ===');
    console.log(`hook_packs: ${researchResult?.hookPacks.length || 0}`);
    console.log(`exa_queries: ${researchResult?.queriesUsed.length || 0}`);
    console.log(`selected_sources: ${researchResult?.selectedSources.length || 0}`);
    console.log(`did_retry: ${enforcementResults.did_retry}`);
    console.log(`like_you_count: ${likeYouCount}`);
    console.log(`word_count: ${wordCount}`);
    console.log(`validator_passed: ${validation.valid}`);
    console.log(`latency_ms: ${latencyMs}`);
    console.log('============================');

    // Log to email_generations table
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      
      if (supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        const { error: insertError } = await supabase
          .from('email_generations')
          .insert({
            session_id: sessionId,
            source,
            scenario_name: scenarioName,
            input_json: inputJson,
            prompt_version: PROMPT_VERSION,
            model_name: MODEL_NAME,
            research_model_name: RESEARCH_MODEL_NAME,
            subject: emailData.subject,
            body: emailData.body,
            word_count: wordCount,
            cliche_count: clicheCount,
            like_you_count: likeYouCount,
            has_em_dash: hasEmDash(emailData.body),
            validator_passed: validation.valid,
            validator_errors: validation.errors.length > 0 ? validation.errors : null,
            enforcement_results: enforcementResults,
            exa_queries: researchResult?.queriesUsed || [],
            exa_results: researchResult?.exaResults.map(r => ({ url: r.url, title: r.title })) || [],
            selected_sources: researchResult?.selectedSources || [],
            researched_facts: researchResult?.hookPacks.map(hp => hp.hook_fact.claim) || [],
            latency_ms: latencyMs,
          });
        
        if (insertError) {
          console.error('Failed to log generation:', insertError);
        }
      }
    } catch (logError) {
      console.error('Logging error:', logError);
    }

    // Build response
    const responsePayload: any = {
      subject: emailData.subject,
      body: emailData.body,
      hookPacks: researchResult?.hookPacks || [],
      exaQueries: researchResult?.queriesUsed || [],
      exaResults: researchResult?.exaResults.map(r => ({ url: r.url, title: r.title, snippet: r.snippet })) || [],
      selectedSources: researchResult?.selectedSources || [],
      enforcementResults,
      validatorPassed: validation.valid,
      validatorErrors: validation.errors.length > 0 ? validation.errors : null,
      likeYouCount,
      wordCount,
      clicheCount,
      retryUsed: enforcementResults.did_retry,
    };

    // Include debug info for test harness
    if (includeDebug && researchResult) {
      responsePayload.debug = {
        identityFingerprint: researchResult.identityFingerprint,
        bridgeHypotheses: researchResult.bridgeHypotheses,
        candidateUrls: researchResult.candidateUrls,
        queriesUsed: researchResult.queriesUsed,
        notes: researchResult.notes,
      };
    }

    return new Response(
      JSON.stringify(responsePayload),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
