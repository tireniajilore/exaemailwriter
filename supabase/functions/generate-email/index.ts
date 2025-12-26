import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PROMPT_VERSION = 'v9.0-voice-first';
const MODEL_NAME = 'google/gemini-2.5-flash';
const RESEARCH_MODEL_NAME = 'google/gemini-2.5-flash';

// ============= SUPER PROMPT (Voice-First v9) =============
const SUPER_PROMPT = `You write cold emails that sound like a smart friend texting a respected colleague—warm, specific, human.

YOUR PERSONA:
You're not an AI writing an email. You're a real person with a real story reaching out to someone you genuinely respect.
Write like you'd message someone you admire but don't know yet.

THE ONE RULE THAT MATTERS:
The email MUST contain exactly one "Like you," line (capital L, comma after). This is non-negotiable.
The "Like you," line should feel like the most natural sentence in the email—not the most formal one.

VOICE CALIBRATION:

Target voice: warm, specific, slightly informal, confident without being pushy
- Sound like a real person with a real story
- Reference specifics (names, dates, projects, quotes) not abstractions
- Use short sentences sometimes. Then a longer one. Rhythm matters.

GOOD "Like you," examples (study these):
- "Like you, I've spent years trying to get capital to founders who don't look like the typical pitch deck."
- "Like you, I think the hard part isn't the tech—it's getting ops teams to actually use it."
- "Like you, I've run programs for people who didn't have a network handed to them."
- "Like you, I learned that the messy middle of a 2-year deal is where it's really won."

BAD "Like you," examples (NEVER write these):
- "Like you, we share a commitment to fostering inclusive leadership opportunities." (too abstract, corporate)
- "Like you, I'm passionate about driving impact in the technology space." (generic, buzzwordy)
- "Like you, I believe in the importance of diverse perspectives." (platitude, says nothing specific)
- "Like you, I've dedicated my career to innovation and growth." (resume-speak, hollow)

SHOW, DON'T TELL:
- BAD: "Your experience leading partnerships demonstrated incredible vision"
- GOOD: "The Activision deal took two years—that kind of patience is rare."

- BAD: "Your thought leadership on inclusion deeply resonated with me"
- GOOD: "Your Afrotech piece hit home, especially the stat about device access."

- BAD: "I was impressed by your extensive experience in the industry"
- GOOD: "I read about the McAfee spin-out—navigating Intel politics while running a company sounds brutal."

HOW TO USE "Like you" INGREDIENTS:
When given hook packs with "like_you_ingredients," use them as raw material—NOT a template to fill in.
- shared_axis: the world you both care about
- shared_action: what you both DO (not just believe)
- shared_stakes: why it matters

Blend these naturally. You might only use two of three. The goal is a sentence that sounds like YOU said it, not like you assembled it from parts.

TEXTURE TIPS:
- Reference something specific from research ("In that podcast with X...")
- Ask a real question, not a rhetorical one
- One-line paragraphs are fine. Use them for punch.
- Don't explain who the recipient is to them. They know.

LENGTH:
Readable in under 20 seconds. Shorter is better. Do not pad.

STRUCTURE:
- Subject: short, specific, intriguing (no clickbait)
- Greeting: "Hi [FirstName]," or "[FirstName],"
- Para 1: The hook. Include "Like you," early. Reference something specific.
- Para 2 (optional): Your brief credibility. One sentence.
- Para 3: One specific ask. Easy to answer.
- Sign-off: "Best," (nothing after, no name)

HARD RULES (will cause rejection if violated):
- "Like you," appears exactly once (capital L, comma after)
- No em-dashes (—)
- No bracket placeholders like [Name]
- End with exactly "Best," and nothing after
- No clichés: "passionate about", "would love to connect", "reaching out because", "impressive track record", "keen interest", "impact at scale"
- No "As a fellow..." openers

DO NOT:
- Summarize their career/resume
- Stack multiple personalization angles
- Use formal/corporate voice
- Invent information
- Imply research you didn't do
- Write anything you wouldn't text to a smart friend`;

// ============= TYPES =============

type AskType = "chat" | "feedback" | "referral" | "job" | "other";
type BridgeAngle = 'domain' | 'value' | 'tradeoff' | 'artifact' | 'inflection' | 'shared-affiliation';
type EvidenceType = 'quote' | 'named_initiative' | 'described_decision' | 'named_artifact' | 'public_stance';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  likeYouCount: number;
  wordCount: number;
  clicheCount: number;
}

// NEW: LikeYouIngredients replaces like_you_line
interface LikeYouIngredients {
  shared_axis: string;      // "building an inclusive leadership pipeline"
  shared_action: string;    // "convening leaders / running programs / investing"
  shared_stakes: string;    // "who gets opportunity next"
  optional_phrases?: string[]; // tiny set, optional
}

// UPDATED: HookPack with like_you_ingredients and intent_fit
interface HookPack {
  hook_fact: {
    claim: string;
    source_url: string;
    evidence: string;
    evidence_type: EvidenceType;
  };
  bridge: {
    bridge_angle: BridgeAngle;
    why_relevant: string;
    like_you_ingredients: LikeYouIngredients;
    intent_theme: string; // which sender theme it supports
  };
  scores: {
    identity_conf: number;
    non_generic: number;
    intent_fit: number;      // NEW - critical
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

// UPDATED: BridgeHypothesis without query_templates
interface BridgeHypothesis {
  type: 'domain' | 'value' | 'tradeoff';
  theme: string;            // ties back to intent theme
  keywords: string[];       // 6–12
  proof_target: string;     // what counts as proof
  evidence_types: EvidenceType[]; // preferred evidence types
}

// NEW: SenderIntentProfile - the missing primitive
interface SenderIntentProfile {
  primary_theme: string;          // e.g. "inclusion / Black leadership pipeline"
  secondary_themes: string[];     // optional
  must_include_terms: string[];   // 6–12 terms
  avoid_terms: string[];          // 4–10 terms (optional)
  preferred_evidence_types: EvidenceType[]; // ranked
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
  intent_fit_score?: number; // NEW
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
  "thought leadership",
  "fostering",
  "driving impact",
  "deeply resonated",
  "your incredible",
  "your remarkable",
  "your impressive",
  "dedicated my career",
  "share a commitment",
  "believe in the importance",
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
  "share a commitment",
  "believe in",
  "dedicated to",
  "driving",
  "fostering",
  "cultivating",
  "championing",
];

// Corporate padding detection patterns
const CORPORATE_PADDING_PHRASES = [
  "in the space",
  "thought leader",
  "synergy",
  "leverage",
  "ecosystem",
  "holistic",
  "paradigm",
  "stakeholder",
  "best practices",
  "core competencies",
  "value proposition",
  "move the needle",
  "circle back",
  "take this offline",
];

// Robotic/generic voice detection patterns
const ROBOTIC_VOICE_PATTERNS = [
  "i came across",
  "i stumbled upon",
  "i noticed that you",
  "i was particularly struck",
  "i was impressed",
  "i was drawn to",
  "i wanted to reach out",
  "i hope this email finds you",
  "i would love to",
  "i'd love to connect",
  "i believe we could",
  "i think there's an opportunity",
  "excited to explore",
  "keen to discuss",
  "eager to learn",
  "looking forward to the opportunity",
  "would be thrilled",
  "would be honored",
  "greatly appreciate",
  "truly appreciate",
  "deeply appreciate",
  "resonate deeply",
  "resonated with me",
  "speaks to my",
  "aligns perfectly",
  "perfectly aligned",
  "really stood out",
  "caught my attention",
  "piqued my interest",
];

// ============= QUERY TEMPLATE LIBRARY (STABLE) =============

const TEMPLATE_LIBRARY = {
  identity: [
    `"{name}" "{company}" bio`,
    `"{name}" "{company}" "{role}"`,
  ],
  interview: [
    `"{name}" {company} interview {keyword}`,
    `"{name}" {company} podcast {keyword}`,
  ],
  speech: [
    `"{name}" {company} speech {keyword}`,
    `"{name}" {company} keynote {keyword}`,
    `"{name}" {company} talk {keyword}`,
  ],
  written: [
    `"{name}" {company} essay {keyword}`,
    `"{name}" {company} wrote {keyword}`,
    `"{name}" {company} article {keyword}`,
  ],
  initiative: [
    `"{name}" {company} initiative {keyword}`,
    `"{name}" {company} program {keyword}`,
    `"{name}" {company} launched {keyword}`,
  ],
  general: [
    `"{name}" {company} "{keyword}"`,
    `"{name}" {company} {keyword}`,
  ],
};

// ============= STAGE 0: SENDER INTENT PROFILE EXTRACTION =============

async function extractSenderIntentProfile(
  reachingOutBecause: string,
  credibilityStory: string,
  askType: AskType,
  LOVABLE_API_KEY: string
): Promise<SenderIntentProfile> {
  console.log('=== Stage 0: Extract Sender Intent Profile ===');
  
  const prompt = `Analyze the sender's intent and extract a profile for research targeting.

SENDER CONTEXT:
- Why reaching out: "${reachingOutBecause}"
- Credibility story: "${credibilityStory}"
- Ask type: ${askType}

TASK:
Extract a Sender Intent Profile that captures what the sender ACTUALLY cares about.
This profile will be used to:
1. Generate targeted search queries
2. Score research results for relevance
3. Ensure the "Like you," bridge aligns with the sender's real purpose

RULES:
- The primary_theme should be the core topic/domain the sender cares about (e.g., "inclusion / Black leadership pipeline", "AI safety", "enterprise sales transformation")
- must_include_terms should be 6-12 specific terms likely to appear in relevant content about that theme
- avoid_terms should be 4-10 terms that indicate content is NOT relevant to the sender's intent
- Think about what would make a source MEANINGFUL for this sender, not just "about" the recipient

EXAMPLES:

If sender is inviting a speaker for Black leadership:
{
  "primary_theme": "inclusion / Black leadership pipeline",
  "secondary_themes": ["talent development", "corporate diversity"],
  "must_include_terms": ["inclusion", "diversity", "pipeline", "mentorship", "sponsorship", "talent", "underrepresented", "equity", "belonging", "access", "Black", "leadership"],
  "avoid_terms": ["M&A", "acquisition", "revenue", "earnings", "stock", "quarterly"],
  "preferred_evidence_types": ["quote", "named_initiative", "public_stance"]
}

If sender is a founder seeking feedback on AI product:
{
  "primary_theme": "AI product development / applied ML",
  "secondary_themes": ["product-market fit", "technical architecture"],
  "must_include_terms": ["AI", "machine learning", "product", "build", "ship", "launch", "iterate", "users", "feedback", "prototype"],
  "avoid_terms": ["policy", "regulation", "lobbying", "political", "fundraising"],
  "preferred_evidence_types": ["described_decision", "named_artifact", "quote"]
}

OUTPUT JSON ONLY:
{
  "primary_theme": "...",
  "secondary_themes": ["...", "..."],
  "must_include_terms": ["...", "...", ...],
  "avoid_terms": ["...", ...],
  "preferred_evidence_types": ["quote", "named_initiative", ...]
}`;

  try {
    const response = await callLLM(
      LOVABLE_API_KEY,
      'You extract sender intent profiles to guide cold email research. Be specific about themes and terms.',
      prompt,
      RESEARCH_MODEL_NAME
    );
    
    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    
    return {
      primary_theme: parsed.primary_theme || '',
      secondary_themes: parsed.secondary_themes || [],
      must_include_terms: parsed.must_include_terms || [],
      avoid_terms: parsed.avoid_terms || [],
      preferred_evidence_types: parsed.preferred_evidence_types || ['quote', 'named_initiative', 'described_decision'],
    };
  } catch (e) {
    console.error('Failed to extract sender intent profile:', e);
    
    // Fallback: extract simple keywords from sender context
    const combinedText = `${reachingOutBecause} ${credibilityStory}`.toLowerCase();
    const simpleTerms = extractSimpleKeywords(combinedText);
    
    return {
      primary_theme: reachingOutBecause.substring(0, 50),
      secondary_themes: [],
      must_include_terms: simpleTerms.slice(0, 8),
      avoid_terms: [],
      preferred_evidence_types: ['quote', 'named_initiative', 'described_decision'],
    };
  }
}

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

// ============= STAGE 2: BRIDGE HYPOTHESES (UPDATED) =============

async function generateBridgeHypotheses(
  reachingOutBecause: string,
  credibilityStory: string,
  recipientRole: string,
  recipientCompany: string,
  intentProfile: SenderIntentProfile,
  LOVABLE_API_KEY: string
): Promise<BridgeHypothesis[]> {
  console.log('=== Stage 2: Generate Bridge Hypotheses ===');
  
  const prompt = `You are designing search hypotheses for finding public, verifiable "hook facts" about a specific person.
The goal is to support a cold email that MUST include a meaningful "Like you," bridge aligned with the sender's intent.

INPUTS:
- sender intent: ${reachingOutBecause}
- sender credibility: ${credibilityStory}
- sender's primary theme: ${intentProfile.primary_theme}
- sender's must-include terms: ${intentProfile.must_include_terms.join(', ')}
- recipient: ${recipientRole} at ${recipientCompany}

TASK:
Return exactly 3 hypotheses: domain, value, tradeoff.

RULES:
- Each hypothesis MUST be anchored to the sender's intent (not generic career bio).
- Provide 6–12 keywords that are likely to appear in interviews, talks, essays, podcasts, initiatives, or quotes.
- Provide a "proof_target" describing what would count as strong evidence.
- Provide preferred evidence types (ranked): quote, named_initiative, named_artifact, described_decision, public_stance.
- Avoid generic keywords like "career", "role", "executive", "strategy" unless the sender intent is explicitly about those topics.
- The "theme" should tie back to the sender's intent profile.

OUTPUT JSON ONLY:
{
  "hypotheses": [
    { "type": "domain", "theme": "...", "keywords": [...], "proof_target": "...", "evidence_types": [...] },
    { "type": "value",  "theme": "...", "keywords": [...], "proof_target": "...", "evidence_types": [...] },
    { "type": "tradeoff", "theme": "...", "keywords": [...], "proof_target": "...", "evidence_types": [...] }
  ]
}`;

  try {
    const response = await callLLM(
      LOVABLE_API_KEY,
      'You generate strategic hypotheses for cold email personalization. Be rigorous about aligning with sender intent.',
      prompt,
      RESEARCH_MODEL_NAME
    );
    
    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    
    return (parsed.hypotheses || []).slice(0, 3).map((h: any) => ({
      type: h.type,
      theme: h.theme || '',
      keywords: h.keywords || [],
      proof_target: h.proof_target || '',
      evidence_types: h.evidence_types || ['quote', 'named_initiative'],
    }));
  } catch (e) {
    console.error('Failed to generate bridge hypotheses:', e);
    
    // Fallback: use intent profile terms directly
    return [
      {
        type: 'domain',
        theme: intentProfile.primary_theme,
        keywords: intentProfile.must_include_terms.slice(0, 6),
        proof_target: 'Recipient has discussed or led something related to sender intent',
        evidence_types: ['quote', 'named_initiative', 'described_decision'],
      },
      {
        type: 'value',
        theme: intentProfile.secondary_themes[0] || intentProfile.primary_theme,
        keywords: intentProfile.must_include_terms.slice(3, 9),
        proof_target: 'Recipient shares values aligned with sender theme',
        evidence_types: ['quote', 'public_stance', 'named_initiative'],
      },
      {
        type: 'tradeoff',
        theme: 'challenges in ' + intentProfile.primary_theme,
        keywords: ['decision', 'challenge', 'tradeoff', 'chose', ...intentProfile.must_include_terms.slice(0, 3)],
        proof_target: 'Recipient has faced similar tensions or tradeoffs',
        evidence_types: ['described_decision', 'quote'],
      },
    ];
  }
}

function extractSimpleKeywords(text: string): string[] {
  const stopwords = new Set(['i', 'me', 'my', 'we', 'our', 'you', 'your', 'the', 'a', 'an', 'and', 'or', 'but', 'to', 'for', 'of', 'in', 'on', 'at', 'by', 'with', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'this', 'that', 'these', 'those', 'it', 'its', 'about', 'who', 'what', 'where', 'when', 'why', 'how']);
  
  return text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopwords.has(w))
    .slice(0, 12);
}

// ============= STAGE 3: ITERATIVE CANDIDATE DISCOVERY (V2) =============

function buildQueriesFromTemplates(
  name: string,
  company: string,
  keywords: string[],
  templateType: keyof typeof TEMPLATE_LIBRARY,
  maxQueries: number = 2
): string[] {
  const templates = TEMPLATE_LIBRARY[templateType];
  const queries: string[] = [];
  
  for (let i = 0; i < Math.min(templates.length, maxQueries); i++) {
    const keyword = keywords[i % keywords.length] || '';
    const query = templates[i]
      .replace('{name}', name)
      .replace('{company}', company)
      .replace('{keyword}', keyword)
      .replace('"{keyword}"', `"${keyword}"`);
    queries.push(query);
  }
  
  return queries;
}

function scoreSnippetForIntent(
  text: string,
  title: string,
  url: string,
  intentProfile: SenderIntentProfile
): number {
  const combined = `${title} ${text} ${url}`.toLowerCase();
  let score = 0.0;
  
  // Points for must_include_terms (max 0.5)
  const mustIncludeHits = intentProfile.must_include_terms.filter(term => 
    combined.includes(term.toLowerCase())
  ).length;
  score += Math.min(0.5, mustIncludeHits * 0.08);
  
  // Points for evidence markers (max 0.25)
  const evidenceMarkers = ['interview', 'podcast', 'keynote', 'essay', 'op-ed', 'initiative', 'program', 'speech', 'talk', 'wrote', 'said'];
  const evidenceHits = evidenceMarkers.filter(marker => combined.includes(marker)).length;
  score += Math.min(0.25, evidenceHits * 0.05);
  
  // Negative points for generic bio signals (max -0.25)
  const genericBioSignals = ['joined', 'previously', 'tenure', 'career', 'role', 'executive', 'appointed', 'named', 'promoted'];
  const genericHits = genericBioSignals.filter(signal => combined.includes(signal)).length;
  score -= Math.min(0.25, genericHits * 0.05);
  
  // Negative points for avoid_terms (max -0.3)
  const avoidHits = intentProfile.avoid_terms.filter(term => 
    combined.includes(term.toLowerCase())
  ).length;
  score -= Math.min(0.3, avoidHits * 0.1);
  
  return Math.max(0, Math.min(1, score + 0.3)); // baseline 0.3, clamp to 0-1
}

async function discoverCandidatesV2(
  recipientName: string,
  fingerprint: IdentityFingerprint,
  hypotheses: BridgeHypothesis[],
  intentProfile: SenderIntentProfile,
  exaApiKey: string
): Promise<{ candidates: ExaResult[]; queriesUsed: string[]; scoredCandidates: { url: string; intent_fit: number; identity_match: boolean }[] }> {
  console.log('=== Stage 3: Iterative Candidate Discovery V2 ===');
  
  const MAX_QUERIES = 12;
  const BATCH_SIZE = 4;
  const MIN_HIGH_INTENT_CANDIDATES = 4;
  
  const queriesUsed: string[] = [];
  const allResults: ExaResult[] = [];
  const seenUrls = new Set<string>();
  
  // Build confounder negation string
  const negations = fingerprint.confounders
    .flatMap(c => c.negative_keywords.slice(0, 2))
    .map(k => `-${k}`)
    .join(' ');
  
  // Collect all keywords from hypotheses + intent profile
  const primaryKeywords = intentProfile.must_include_terms.slice(0, 6);
  const hypothesisKeywords = hypotheses.flatMap(h => h.keywords.slice(0, 4));
  const allKeywords = [...new Set([...primaryKeywords, ...hypothesisKeywords])];
  
  // ============= LANE A: Identity queries (2 queries) =============
  console.log('Lane A: Identity queries');
  for (const template of TEMPLATE_LIBRARY.identity) {
    if (queriesUsed.length >= 2) break;
    let query = template
      .replace('{name}', recipientName)
      .replace('{company}', fingerprint.company)
      .replace('{role}', fingerprint.role_keywords[0] || '');
    if (negations) query = `${query} ${negations}`;
    
    queriesUsed.push(query);
    const results = await exaSearchWithContent(query, exaApiKey, 5);
    for (const r of results) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url);
        allResults.push(r);
      }
    }
  }
  
  // ============= LANE B: Primary intent theme queries (4-6 queries) =============
  console.log('Lane B: Primary intent theme queries');
  const laneB_templates = ['interview', 'speech', 'initiative'] as const;
  let laneBCount = 0;
  
  for (const templateType of laneB_templates) {
    if (queriesUsed.length >= 8 || laneBCount >= 4) break;
    
    const keywordsForType = primaryKeywords.slice(laneBCount, laneBCount + 2);
    const queries = buildQueriesFromTemplates(recipientName, fingerprint.company, keywordsForType, templateType, 2);
    
    for (const query of queries) {
      if (queriesUsed.length >= 8) break;
      let finalQuery = negations ? `${query} ${negations}` : query;
      queriesUsed.push(finalQuery);
      laneBCount++;
      
      const results = await exaSearchWithContent(finalQuery, exaApiKey, 8);
      for (const r of results) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          allResults.push(r);
        }
      }
    }
  }
  
  // Score candidates for early stopping
  const scoredCandidates = allResults.map(r => ({
    url: r.url,
    intent_fit: scoreSnippetForIntent(r.text || r.snippet || '', r.title, r.url, intentProfile),
    identity_match: checkQuickIdentityMatch(r.text || r.snippet || '', recipientName, fingerprint),
  }));
  
  const highIntentCount = scoredCandidates.filter(c => c.intent_fit >= 0.6 && c.identity_match).length;
  console.log(`After Lane A+B: ${highIntentCount} high-intent candidates`);
  
  // Early stop if we have enough
  if (highIntentCount >= MIN_HIGH_INTENT_CANDIDATES) {
    console.log('Early stop: enough high-intent candidates');
    return { candidates: allResults, queriesUsed, scoredCandidates };
  }
  
  // ============= LANE C: Secondary/hypothesis queries (2-4 more) =============
  console.log('Lane C: Secondary theme queries');
  const laneC_templates = ['written', 'general'] as const;
  
  for (const templateType of laneC_templates) {
    if (queriesUsed.length >= MAX_QUERIES) break;
    
    const queries = buildQueriesFromTemplates(recipientName, fingerprint.company, hypothesisKeywords.slice(0, 3), templateType, 2);
    
    for (const query of queries) {
      if (queriesUsed.length >= MAX_QUERIES) break;
      let finalQuery = negations ? `${query} ${negations}` : query;
      queriesUsed.push(finalQuery);
      
      const results = await exaSearchWithContent(finalQuery, exaApiKey, 6);
      for (const r of results) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          allResults.push(r);
        }
      }
    }
  }
  
  // Rescore all candidates
  const finalScoredCandidates = allResults.map(r => ({
    url: r.url,
    intent_fit: scoreSnippetForIntent(r.text || r.snippet || '', r.title, r.url, intentProfile),
    identity_match: checkQuickIdentityMatch(r.text || r.snippet || '', recipientName, fingerprint),
  }));
  
  console.log(`Discovered ${allResults.length} candidate URLs from ${queriesUsed.length} queries`);
  return { candidates: allResults, queriesUsed, scoredCandidates: finalScoredCandidates };
}

function checkQuickIdentityMatch(text: string, recipientName: string, fingerprint: IdentityFingerprint): boolean {
  const lowerText = text.toLowerCase();
  const nameParts = recipientName.toLowerCase().split(/\s+/);
  const hasName = nameParts.some(part => part.length > 2 && lowerText.includes(part));
  const hasCompany = lowerText.includes(fingerprint.company.toLowerCase());
  return hasName && hasCompany;
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

// ============= STAGE 6: HOOK PACK EXTRACTION (UPDATED) =============

async function extractHookPacks(
  recipientName: string,
  recipientRole: string,
  recipientCompany: string,
  eligibleCandidates: CandidateUrl[],
  hypotheses: BridgeHypothesis[],
  intentProfile: SenderIntentProfile,
  credibilityStory: string,
  LOVABLE_API_KEY: string
): Promise<HookPack[]> {
  console.log('=== Stage 6: Hook Pack Extraction (Intent-Conditioned) ===');
  
  if (eligibleCandidates.length === 0) {
    console.log('No eligible candidates for hook pack extraction');
    return [];
  }
  
  const sourcesContext = eligibleCandidates.slice(0, 6).map((c, i) => `
SOURCE ${i + 1}: ${c.url}
Title: ${c.title}
Intent Fit Score: ${(c.intent_fit_score || 0).toFixed(2)}
Content: ${(c.text || '').substring(0, 2000)}
`).join('\n---\n');

  const hypothesesContext = hypotheses.map((h, i) => `
${i + 1}. ${h.type.toUpperCase()} bridge (theme: ${h.theme}): Looking for evidence that ${h.proof_target}
   Keywords: ${h.keywords.join(', ')}
   Preferred evidence: ${h.evidence_types.join(', ')}
`).join('');

  const extractionPrompt = `Extract Hook Packs for a cold email to ${recipientName}, ${recipientRole} at ${recipientCompany}.

SENDER'S INTENT PROFILE:
- Primary theme: ${intentProfile.primary_theme}
- Must-include terms: ${intentProfile.must_include_terms.join(', ')}
- Avoid terms: ${intentProfile.avoid_terms.join(', ')}

SENDER'S CREDIBILITY STORY:
"${credibilityStory}"

BRIDGE HYPOTHESES (aligned with sender intent):
${hypothesesContext}

SOURCES TO ANALYZE:
${sourcesContext}

For each source, try to extract a Hook Pack. A Hook Pack contains:
1. A POINTABLE CLAIM - a fact that can be quoted, named, or directly referenced
2. "Like you" INGREDIENTS (NOT a pre-written sentence!) for crafting the bridge
3. Scores for quality including INTENT_FIT

═══════════════════════════════════════════════════════════════════
CRITICAL: EVIDENCE MUST BE POINTABLE
═══════════════════════════════════════════════════════════════════

A claim is ONLY valid if it includes at least one of:
✓ QUOTE - Exact words the recipient said (in quotes)
✓ NAMED_INITIATIVE - A specific named project, product, or program they created/led
✓ DESCRIBED_DECISION - A specific choice they made with concrete context
✓ NAMED_ARTIFACT - A specific article, podcast, talk, paper, or interview by name/title
✓ PUBLIC_STANCE - A clearly stated position on an issue

AUTOMATICALLY REJECT claims that are merely:
✗ "interest in..." / "focus on..." / "known for..."
✗ "has been involved in..." / "passionate about..." / "believes in..."
✗ Any vague attribution without a specific named thing or direct quote

═══════════════════════════════════════════════════════════════════
CRITICAL: LIKE_YOU_INGREDIENTS (NOT like_you_line!)
═══════════════════════════════════════════════════════════════════

Instead of writing a complete "Like you," sentence, provide INGREDIENTS:
- shared_axis: The domain/theme both sender and recipient care about (e.g., "building inclusive leadership pipelines")
- shared_action: What they both DO in that space (e.g., "convening leaders", "running mentorship programs")
- shared_stakes: Why it matters to both (e.g., "who gets opportunity next")
- optional_phrases: 0-2 specific phrases that might work well (optional)

The email writer will combine these ingredients into a natural "Like you," sentence.

═══════════════════════════════════════════════════════════════════
CRITICAL: INTENT_FIT SCORING
═══════════════════════════════════════════════════════════════════

intent_fit measures how well the hook aligns with the SENDER's intent:
- 1.0: Hook directly supports the sender's primary_theme (e.g., speaker invite about inclusion → found inclusion initiative)
- 0.7: Hook tangentially relates to sender theme
- 0.3: Hook is interesting but unrelated to sender intent (e.g., M&A news when sender cares about inclusion)
- 0.0: Hook actively contradicts sender intent

HARD RULE: If the sender's primary theme is about inclusion/diversity/pipeline AND you find a hook about M&A/acquisitions, that hook's intent_fit should be LOW (0.2-0.4) even if it's non-generic.

Return JSON:
{
  "hook_packs": [
    {
      "hook_fact": {
        "claim": "Non-obvious claim about recipient",
        "source_url": "https://...",
        "evidence": "8-25 word quote OR named artifact/initiative/decision from source",
        "evidence_type": "quote|named_initiative|described_decision|named_artifact|public_stance"
      },
      "bridge": {
        "bridge_angle": "domain|value|tradeoff|artifact|inflection|shared-affiliation",
        "why_relevant": "Brief explanation of why this bridge works for the sender's intent",
        "like_you_ingredients": {
          "shared_axis": "the domain/theme you both care about",
          "shared_action": "what you both DO",
          "shared_stakes": "why it matters",
          "optional_phrases": ["optional", "phrases"]
        },
        "intent_theme": "Which sender theme this supports (e.g., 'inclusion/pipeline')"
      },
      "scores": {
        "identity_conf": 0.0-1.0,
        "non_generic": 0.0-1.0,
        "intent_fit": 0.0-1.0,
        "bridgeability": 0.0-1.0,
        "overall": 0.0-1.0
      }
    }
  ]
}

SCORING RUBRIC:
- identity_conf: Is this clearly about the right person? (0.0 = uncertain, 1.0 = definitely them)
- non_generic: Would this be unknown from their title alone? (0.0 = obvious, 1.0 = surprising)
- intent_fit: Does this align with the sender's primary theme? (0.0 = irrelevant, 1.0 = perfect fit)
- bridgeability: Can we write a specific "Like you," line? (0.0 = generic, 1.0 = concrete parallel)
- overall: Weighted = 0.40*intent_fit + 0.25*identity_conf + 0.20*non_generic + 0.15*bridgeability

Only include Hook Packs with overall score >= 0.5
Return maximum 3 Hook Packs.
PRIORITIZE INTENT_FIT: If any candidate has intent_fit >= 0.75, at least one Hook Pack MUST come from high-intent sources.

IF NO CLAIMS MEET THE "POINTABLE" REQUIREMENT, RETURN AN EMPTY ARRAY.
Better to return 0 Hook Packs than to return vague, unprovable claims.

Return ONLY valid JSON.`;

  try {
    const response = await callLLM(
      LOVABLE_API_KEY,
      'You extract high-quality, intent-aligned personalization hooks for cold emails. Prioritize hooks that align with the sender\'s actual purpose.',
      extractionPrompt,
      RESEARCH_MODEL_NAME
    );
    
    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    
    // Filter and sort by overall score
    let hookPacks: HookPack[] = (parsed.hook_packs || [])
      .filter((hp: HookPack) => hp.scores?.overall >= 0.5)
      .sort((a: HookPack, b: HookPack) => (b.scores?.overall || 0) - (a.scores?.overall || 0))
      .slice(0, 3);
    
    // HARD RULE: Ensure at least one high intent_fit hook if available
    const highIntentHooks = hookPacks.filter(hp => hp.scores?.intent_fit >= 0.75);
    if (highIntentHooks.length === 0) {
      // Check if there are any high-intent hooks we missed
      const allHighIntent = (parsed.hook_packs || [])
        .filter((hp: HookPack) => hp.scores?.intent_fit >= 0.75 && hp.scores?.identity_conf >= 0.5);
      if (allHighIntent.length > 0) {
        // Replace lowest overall hook with highest intent_fit hook
        hookPacks = hookPacks.slice(0, 2);
        hookPacks.push(allHighIntent[0]);
        hookPacks.sort((a: HookPack, b: HookPack) => (b.scores?.overall || 0) - (a.scores?.overall || 0));
      }
    }
    
    console.log(`Extracted ${hookPacks.length} Hook Packs (${highIntentHooks.length} high-intent)`);
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

// ============= FIRECRAWL ENRICHMENT (Intent-Aware) =============

// Research sufficiency thresholds
const SUFFICIENCY_THRESHOLDS = {
  MIN_USABLE_HOOKPACKS: 2,
  MIN_INTENT_FIT: 0.70,
  MIN_PROMISING_CANDIDATES: 3,
  PROMISING_CANDIDATE_THRESHOLD: 0.50,
};

// Evidence types that count as "pointable"
const POINTABLE_EVIDENCE_TYPES: EvidenceType[] = ['quote', 'named_artifact', 'named_initiative', 'described_decision'];

interface ResearchSufficiency {
  isEnough: boolean;
  usableHookPacks: number;
  top2IntentFit: number;
  hasPointableEvidence: boolean;
  reasons: string[];
}

function checkResearchSufficiency(hookPacks: HookPack[]): ResearchSufficiency {
  const reasons: string[] = [];
  
  // Filter for usable hook packs (overall score >= 0.6)
  const usableHookPacks = hookPacks.filter(hp => hp.scores.overall >= 0.6);
  const usableCount = usableHookPacks.length;
  
  // Get top 2 intent_fit scores
  const intentFits = hookPacks.map(hp => hp.scores.intent_fit).sort((a, b) => b - a);
  const top2IntentFit = intentFits.length >= 2 
    ? (intentFits[0] + intentFits[1]) / 2 
    : intentFits[0] || 0;
  
  // Check for pointable evidence
  const hasPointableEvidence = hookPacks.some(hp => 
    POINTABLE_EVIDENCE_TYPES.includes(hp.hook_fact.evidence_type) &&
    hp.hook_fact.evidence.length > 20
  );
  
  // Evaluate sufficiency
  const hasEnoughHookPacks = usableCount >= SUFFICIENCY_THRESHOLDS.MIN_USABLE_HOOKPACKS;
  const hasGoodIntent = top2IntentFit >= SUFFICIENCY_THRESHOLDS.MIN_INTENT_FIT;
  
  if (!hasEnoughHookPacks) reasons.push(`Only ${usableCount} usable hook packs (need ${SUFFICIENCY_THRESHOLDS.MIN_USABLE_HOOKPACKS})`);
  if (!hasGoodIntent) reasons.push(`Top intent_fit ${top2IntentFit.toFixed(2)} < ${SUFFICIENCY_THRESHOLDS.MIN_INTENT_FIT}`);
  if (!hasPointableEvidence) reasons.push('No pointable evidence found');
  
  const isEnough = hasEnoughHookPacks && hasGoodIntent && hasPointableEvidence;
  
  return {
    isEnough,
    usableHookPacks: usableCount,
    top2IntentFit,
    hasPointableEvidence,
    reasons,
  };
}

function countPromisingCandidates(candidates: CandidateUrl[]): number {
  return candidates.filter(c => 
    (c.intent_fit_score || 0) >= SUFFICIENCY_THRESHOLDS.PROMISING_CANDIDATE_THRESHOLD
  ).length;
}

function isContentAbstract(text: string): boolean {
  const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  
  if (wordCount < 200) return true;
  
  const concreteIndicators = [
    /[""][^""]{20,}[""]/,
    /'[^']{20,}'/,
    /\b(podcast|interview|talk|keynote|essay|article|book|paper)\b.*["'][^"']+["']/i,
    /\b(in \d{4}|january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}/i,
    /\$[\d.,]+\s*(million|billion|M|B)/i,
    /\b(I think|I believe|we decided|I realized|we learned|I said|I wrote)\b/i,
  ];
  
  const hasConcreteEvidence = concreteIndicators.some(pattern => pattern.test(text));
  
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

// NEW: Enrich only top-K candidates by intent score (not "anything abstract")
async function enrichTopCandidatesByIntent(
  candidates: CandidateUrl[],
  maxEnrichments: number = 2
): Promise<CandidateUrl[]> {
  console.log('=== Conditional Firecrawl Enrichment (Intent-Prioritized) ===');
  
  // Sort by intent_fit_score descending
  const sortedByIntent = [...candidates].sort((a, b) => 
    (b.intent_fit_score || 0) - (a.intent_fit_score || 0)
  );
  
  // Only consider top candidates that are also abstract
  const enrichmentTargets = sortedByIntent
    .filter(c => (c.intent_fit_score || 0) >= SUFFICIENCY_THRESHOLDS.PROMISING_CANDIDATE_THRESHOLD)
    .filter(c => isContentAbstract(c.text))
    .slice(0, maxEnrichments);
  
  if (enrichmentTargets.length === 0) {
    console.log('No candidates worth enriching (no high-intent abstract content)');
    return candidates;
  }
  
  console.log(`Enriching ${enrichmentTargets.length} high-intent abstract candidates`);
  
  const enrichedUrls = new Set<string>();
  const enrichedCandidates: CandidateUrl[] = [];
  
  for (const target of enrichmentTargets) {
    const enrichedContent = await enrichWithFirecrawl(target.url);
    
    if (enrichedContent && enrichedContent.length > target.text.length) {
      enrichedUrls.add(target.url);
      console.log(`Enriched ${target.url}: ${target.text.length} -> ${enrichedContent.length} chars (intent_fit: ${(target.intent_fit_score || 0).toFixed(2)})`);
    }
    
    enrichedCandidates.push({
      ...target,
      text: enrichedContent && enrichedContent.length > target.text.length 
        ? enrichedContent.substring(0, 8000) 
        : target.text,
      reasons: enrichedContent && enrichedContent.length > target.text.length
        ? [...target.reasons, `ENRICHED: Firecrawl (intent_fit: ${(target.intent_fit_score || 0).toFixed(2)})`]
        : target.reasons,
    });
  }
  
  // Add non-enriched candidates back
  for (const c of candidates) {
    if (!enrichmentTargets.some(t => t.url === c.url)) {
      enrichedCandidates.push(c);
    }
  }
  
  console.log(`Enriched ${enrichedUrls.size} of ${enrichmentTargets.length} targeted candidates`);
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

  if (bodyLines.length > 0) {
    const lastLine = bodyLines[bodyLines.length - 1];
    if (lastLine !== 'Best,') {
      errors.push('Body must end with exactly "Best," and nothing after');
    }
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
  if (wordCount < 60) {
    errors.push(`Body has ${wordCount} words (minimum 60 required)`);
  }
  if (wordCount > 150) {
    errors.push(`Body has ${wordCount} words (maximum 150 allowed—shorter is better)`);
  }

  // Check for corporate padding phrases
  for (const phrase of CORPORATE_PADDING_PHRASES) {
    if (combinedText.toLowerCase().includes(phrase)) {
      errors.push(`Contains corporate padding phrase: "${phrase}"`);
    }
  }

  // Check for robotic/generic voice patterns
  const roboticMatches: string[] = [];
  for (const pattern of ROBOTIC_VOICE_PATTERNS) {
    if (combinedText.toLowerCase().includes(pattern)) {
      roboticMatches.push(pattern);
    }
  }
  if (roboticMatches.length > 0) {
    errors.push(`Sounds robotic/generic. Remove: "${roboticMatches[0]}". Write like you'd text a friend.`);
  }
  
  // Check for overly long sentences (sign of padding)
  const sentences = body.split(/[.!?]+/).filter(s => s.trim().length > 0);
  for (const sentence of sentences) {
    const sentenceWords = countWords(sentence);
    if (sentenceWords > 35) {
      errors.push(`Contains a ${sentenceWords}-word sentence (max 35). Break it up.`);
      break; // Only flag once
    }
  }

  // Check for lack of concrete nouns (abstract padding detection)
  const likeYouSentenceForAbstraction = extractSentenceWithLikeYou(body);
  if (likeYouSentenceForAbstraction) {
    // Flag if Like you sentence is too long (sign of corporate speak)
    const likeYouWords = countWords(likeYouSentenceForAbstraction);
    if (likeYouWords > 30) {
      errors.push(`"Like you," sentence is ${likeYouWords} words (aim for under 25)`);
    }
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
  
  // Extract specific robotic phrase from error message
  const roboticError = errors.find(e => e.includes('Sounds robotic/generic'));
  let roboticGuidance = '';
  
  if (roboticError) {
    // Extract the phrase from: 'Sounds robotic/generic. Remove: "caught my attention". Write like...'
    const phraseMatch = roboticError.match(/Remove: "([^"]+)"/);
    const badPhrase = phraseMatch ? phraseMatch[1] : null;
    
    roboticGuidance = `
CRITICAL - ROBOTIC VOICE FIX:
${badPhrase ? `DO NOT USE THIS PHRASE: "${badPhrase}"` : 'Remove the robotic phrase.'}

Instead:
- Reference specific content: "Your Afrotech piece on device access" (not "I came across your work")
- Make direct statements: "I organize the Stanford Black Business Conference" (not "I wanted to reach out")
- Be casual: "Wanted to ask" (not "I would love to discuss")
${badPhrase ? `\nTHE PHRASE "${badPhrase}" MUST NOT APPEAR IN YOUR OUTPUT.` : ''}
`;
  }

  return `

REWRITE REQUIRED — your previous output had issues:
${errorList}
${roboticGuidance}
VOICE REMINDER (most important):
- Write like you're texting a smart friend, not drafting a memo
- The "Like you," line should be the most NATURAL sentence, not the most formal
- Shorter is better. If it can be said in fewer words, do it.
- Reference specific things (names, projects, numbers) not abstractions

HARD FIXES:
- "Like you," must appear exactly once (capital L, comma after)
- "Like you," sentence must be under 25 words and feel natural
- Readable in under 20 seconds. Shorter is better. Do not pad.
- End with just "Best," 
- No em-dashes, no brackets, no corporate buzzwords

Return ONLY valid JSON with "subject" and "body".`;
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

// ============= V2 RESEARCH PIPELINE (INTENT-DRIVEN) =============

interface V2ResearchResult {
  hookPacks: HookPack[];
  senderIntentProfile: SenderIntentProfile | null;
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
  askType: AskType,
  exaApiKey: string,
  LOVABLE_API_KEY: string
): Promise<V2ResearchResult> {
  console.log('=== V2 Intent-Driven Research Pipeline ===');
  
  const queriesUsed: string[] = [];
  let allExaResults: ExaResult[] = [];
  
  // ============= STAGE 0: Extract Sender Intent Profile =============
  const intentProfile = await extractSenderIntentProfile(
    reachingOutBecause,
    credibilityStory,
    askType,
    LOVABLE_API_KEY
  );
  
  console.log('Sender Intent Profile:', {
    primary_theme: intentProfile.primary_theme,
    must_include_terms: intentProfile.must_include_terms.slice(0, 5),
  });
  
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
      senderIntentProfile: intentProfile,
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
    intentProfile,
    LOVABLE_API_KEY
  );
  
  console.log('Bridge hypotheses:', hypotheses.map(h => ({ type: h.type, theme: h.theme, keywords: h.keywords.slice(0, 3) })));
  
  // ============= STAGE 3: Iterative Candidate Discovery =============
  const { candidates, queriesUsed: discoveryQueries, scoredCandidates } = await discoverCandidatesV2(
    recipientName,
    fingerprint,
    hypotheses,
    intentProfile,
    exaApiKey
  );
  
  queriesUsed.push(...discoveryQueries);
  allExaResults = [...allExaResults, ...candidates];
  
  // ============= STAGE 4 & 5: Niche gate + Identity lock =============
  console.log('=== Stage 4 & 5: Niche Gate + Identity Lock ===');
  
  const candidateUrls: CandidateUrl[] = [];
  const eligibleCandidates: CandidateUrl[] = [];
  
  // Create a map of intent_fit scores from discovery
  const intentFitMap = new Map(scoredCandidates.map(s => [s.url, s.intent_fit]));
  
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
        intent_fit_score: intentFitMap.get(c.url) || 0,
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
      intent_fit_score: intentFitMap.get(c.url) || 0,
    };
    
    candidateUrls.push(candidate);
    
    if (identityResult.locked) {
      eligibleCandidates.push(candidate);
    }
  }
  
  console.log(`${eligibleCandidates.length} candidates passed niche gate + identity lock`);
  
  // Sort eligible candidates by intent_fit_score (prioritize high-intent sources)
  eligibleCandidates.sort((a, b) => (b.intent_fit_score || 0) - (a.intent_fit_score || 0));
  
  // ============= STAGE 6A: FIRST PASS - Extract Hook Packs WITHOUT Firecrawl =============
  console.log('=== Stage 6A: First-Pass Hook Pack Extraction (Exa content only) ===');
  
  let hookPacks = await extractHookPacks(
    recipientName,
    recipientRole,
    recipientCompany,
    eligibleCandidates.slice(0, 6),
    hypotheses,
    intentProfile,
    credibilityStory,
    LOVABLE_API_KEY
  );
  
  console.log(`First-pass extraction: ${hookPacks.length} Hook Packs`);
  
  // ============= STAGE 6B: CHECK RESEARCH SUFFICIENCY =============
  const sufficiency = checkResearchSufficiency(hookPacks);
  
  console.log('=== Research Sufficiency Check ===');
  console.log(`  Usable Hook Packs: ${sufficiency.usableHookPacks}`);
  console.log(`  Top 2 Intent Fit: ${sufficiency.top2IntentFit.toFixed(2)}`);
  console.log(`  Has Pointable Evidence: ${sufficiency.hasPointableEvidence}`);
  console.log(`  Is Sufficient: ${sufficiency.isEnough}`);
  if (!sufficiency.isEnough) {
    console.log(`  Reasons: ${sufficiency.reasons.join('; ')}`);
  }
  
  // ============= STAGE 6C: CONDITIONAL FIRECRAWL ENRICHMENT =============
  // Only enrich if: research insufficient AND we have promising candidates worth enriching
  
  if (!sufficiency.isEnough) {
    const promisingCount = countPromisingCandidates(eligibleCandidates);
    console.log(`Promising candidates (intent >= ${SUFFICIENCY_THRESHOLDS.PROMISING_CANDIDATE_THRESHOLD}): ${promisingCount}`);
    
    if (promisingCount >= SUFFICIENCY_THRESHOLDS.MIN_PROMISING_CANDIDATES) {
      console.log('=== Stage 6C: Conditional Firecrawl Enrichment ===');
      console.log(`Enriching because: research insufficient AND ${promisingCount} promising candidates available`);
      
      // Enrich top candidates by intent score (not "anything abstract")
      const enrichedCandidates = await enrichTopCandidatesByIntent(
        eligibleCandidates.slice(0, 6),
        2  // Only enrich top 2
      );
      
      // ============= STAGE 6D: RE-EXTRACT Hook Packs with enriched content =============
      console.log('=== Stage 6D: Re-Extracting Hook Packs (with enriched content) ===');
      
      hookPacks = await extractHookPacks(
        recipientName,
        recipientRole,
        recipientCompany,
        enrichedCandidates,
        hypotheses,
        intentProfile,
        credibilityStory,
        LOVABLE_API_KEY
      );
      
      console.log(`Post-enrichment extraction: ${hookPacks.length} Hook Packs`);
      
      // Log improvement
      const newSufficiency = checkResearchSufficiency(hookPacks);
      console.log(`Post-enrichment sufficiency: usable=${newSufficiency.usableHookPacks}, intent=${newSufficiency.top2IntentFit.toFixed(2)}, pointable=${newSufficiency.hasPointableEvidence}`);
    } else {
      console.log(`Skipping Firecrawl: only ${promisingCount} promising candidates (need ${SUFFICIENCY_THRESHOLDS.MIN_PROMISING_CANDIDATES})`);
    }
  } else {
    console.log('Skipping Firecrawl: research is already sufficient');
  }
  
  return {
    hookPacks,
    senderIntentProfile: intentProfile,
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

    // ============= V2 INTENT-DRIVEN RESEARCH PIPELINE =============
    let researchResult: V2ResearchResult | null = null;
    
    if (EXA_API_KEY) {
      console.log('Starting V2 intent-driven research pipeline...');
      
      try {
        researchResult = await performV2Research(
          recipientName,
          recipientCompany,
          recipientRole,
          reachingOutBecause,
          credibilityStory,
          askType,
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

    // Build Hook Packs section with improved voice guidance
    let hookPacksSection = '';
    if (researchResult && researchResult.hookPacks.length > 0) {
      // Sort by intent_fit and pick top 2 (primary + backup)
      const topHookPacks = [...researchResult.hookPacks]
        .sort((a, b) => b.scores.intent_fit - a.scores.intent_fit)
        .slice(0, 2);
      
      const labels = ['PRIMARY', 'BACKUP'];
      hookPacksSection = `
RESEARCH FOUND (use to craft your "Like you," line):
${topHookPacks.map((hp, i) => `
[${labels[i]}] SPECIFIC FACT: ${hp.hook_fact.claim}
   Evidence: "${hp.hook_fact.evidence}"
   Source: ${hp.hook_fact.source_url}
   
   RAW INGREDIENTS FOR "Like you,":
   - What you both do: ${hp.bridge.like_you_ingredients.shared_action}
   - The world you share: ${hp.bridge.like_you_ingredients.shared_axis}
   - Why it matters: ${hp.bridge.like_you_ingredients.shared_stakes}
   
   DRAFT (rewrite in your own voice, keep under 25 words):
   "Like you, I [${hp.bridge.like_you_ingredients.shared_action}] because [${hp.bridge.like_you_ingredients.shared_stakes}]."
   
   Intent fit: ${(hp.scores.intent_fit * 100).toFixed(0)}%
`).join('')}

INSTRUCTIONS:
- Use the PRIMARY hook pack. It has the highest intent fit.
- Only use BACKUP if the primary truly doesn't connect your story to theirs.
- Rewrite the draft "Like you," line to sound natural—like you'd text it
- Reference the specific fact somewhere in the email (show you did homework)
- Don't use all ingredients if it sounds forced. Less is more.`;
    } else {
      hookPacksSection = `
NO RESEARCH AVAILABLE.
Create the "Like you," bridge from:
- The sender's own story (below)
- What someone in ${recipientRole} at ${recipientCompany} likely cares about
Keep it real—don't pretend you found something you didn't.`;
    }

    const userPrompt = `Write a cold email. Sound human.

TO: ${recipientFirstName} (${recipientRole} at ${recipientCompany})
${hookPacksSection}
${sharedAffiliationSection}

FROM (the sender):
- Wants: ${getAskTypeLabel(askType)}
- Why reaching out: ${reachingOutBecause}
- Their credibility: ${credibilityStory}
${researchResult?.senderIntentProfile ? `- Theme: ${researchResult.senderIntentProfile.primary_theme}` : ''}

REMEMBER:
- Include "Like you," exactly once (capital L, comma)
- Put the "Like you," line in paragraph 1 or 2
- Readable in under 20 seconds. Shorter is better. Do not pad.
- One clear ask at the end
- End with just "Best," (no name after)
- No em-dashes, no brackets, no corporate speak

Return JSON only:
{
  "subject": "...",
  "body": "..."
}`;

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
    console.log(`intent_profile: ${researchResult?.senderIntentProfile?.primary_theme || 'none'}`);
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
        senderIntentProfile: researchResult.senderIntentProfile,
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
