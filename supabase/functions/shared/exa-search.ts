// Exa Search + Contents API implementation for phased research
import { discoverContentWithAutoprompt } from './discovery-autoprompt.ts';

export interface IdentityResult {
  identityDecision: 'PASS' | 'FAIL';
  confidence: number;
  results: Array<{ url: string; title: string; snippet?: string }>;
}

export interface ContentDiscoveryResult {
  urls: Array<{ id: string; url: string; title: string; score: number }>;
  foundCount: number;
  hypotheses?: string[];
}

export type SourceType = 'person_specific' | 'company_specific' | 'industry_generic';

export interface FetchedDocument {
  url: string;
  title: string;
  text: string;
  highlights?: string[];
  sourceType?: SourceType;
}

export interface ContentFetchResult {
  docs: FetchedDocument[];
  fetchedCount: number;
  filteredCount?: number; // How many docs were filtered out
}

export interface HookPack {
  id: string;
  title: string;
  hook: string;
  whyItWorks: string;
  confidence: number;
  strength?: 'tier1' | 'tier2' | 'tier3';
  weaknessNote?: string;
  sources: Array<{ label: string; url: string }>;
  evidenceQuotes?: Array<{ label: string; quote: string }>;
}

export interface HookExtractionResult {
  hooks: HookPack[];
  fallback_mode: 'hooks_found' | 'no_hooks_available' | 'extraction_failed';
  fallback_used?: boolean;
  fallback_reason?: string | null;
}

// Phase 1: Identity Verification
export async function verifyIdentity(params: {
  name: string;
  company: string;
  role?: string;
  exaApiKey: string;
}): Promise<IdentityResult> {
  const { name, company, role, exaApiKey } = params;

  const query = `${name} ${company} ${role ?? ''}`.trim();
  console.log(`[verifyIdentity] Query: "${query}"`);

  try {
    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${exaApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        numResults: 3,
        type: 'neural',
        useAutoprompt: true,
        contents: {
          text: { maxCharacters: 500 }
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[verifyIdentity] API error: ${response.status} ${errorText}`);
      return {
        identityDecision: 'FAIL',
        confidence: 0,
        results: []
      };
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      console.error('[verifyIdentity] JSON parse error:', error);
      return {
        identityDecision: 'FAIL',
        confidence: 0,
        results: []
      };
    }

    const results = (data.results ?? []).map((r: any) => ({
      url: r.url ?? '',
      title: r.title ?? '',
      snippet: r.text ?? ''
    }));

    console.log(`[verifyIdentity] Found ${results.length} results`);

    // Check if at least one result mentions the company or person
    const hasMatch = results.some((r: any) => {
      const combined = `${r.title} ${r.snippet}`.toLowerCase();
      return combined.includes(company.toLowerCase()) || combined.includes(name.toLowerCase());
    });

    return {
      identityDecision: hasMatch ? 'PASS' : 'FAIL',
      confidence: hasMatch ? 0.75 : 0.25,
      results
    };
  } catch (error) {
    console.error(`[verifyIdentity] Error:`, error);
    return {
      identityDecision: 'FAIL',
      confidence: 0,
      results: []
    };
  }
}

// Phase 1.5: Generate Search Hypotheses with Gemini
async function generateSearchHypotheses(params: {
  name: string;
  company: string;
  role?: string;
  senderIntent?: string;
  credibilityStory?: string;
  geminiApiKey: string;
  identityConfidence?: number;
}): Promise<string[]> {
  const { name, company, role, senderIntent, credibilityStory, geminiApiKey, identityConfidence } = params;

  if (!senderIntent) {
    // Fall back to basic searches if we don't have sender's intent
    return [
      `podcast interview with ${name} at ${company}`,
      `${name} LinkedIn post about work at ${company}`,
      `${name} launches initiative at ${company}`,
      `${name} speaking at conference panel`,
      `${name} joins ${company} as ${role ?? 'executive'}`
    ];
  }

  // Compute disambiguation flag
  const forceCompany = identityConfidence !== undefined && identityConfidence < 0.8 && company?.trim().length;

  const prompt = `You are an expert at generating search queries that find CONCRETE EVIDENCE of a person's work, voice, and presence.

EVIDENCE means a specific artifact that plausibly exists as a page, recording, post, or announcement — not a topic summary.

---

CONTEXT:
Recipient: ${name}
Company: ${company}
Role: ${role || "N/A"}
Sender's Intent: ${senderIntent}

---

FIXED EVIDENCE TYPES (GENERATE ONE QUERY EACH)

1) LONG-FORM VOICE
   Artifacts: podcast interview, keynote transcript, long interview, op-ed
   Example: "podcast interview with ${name} about [lens term]"

2) SHORT-FORM VOICE
   Artifacts: LinkedIn post, blog post, written reflection, essay
   Example: "${name} LinkedIn post discussing [lens term]"

3) ACTION
   Artifacts: product or program launch, initiative led, project shipped
   Example: "${name} launches [lens term] program at ${company}"

4) PRESENCE
   Artifacts: conference speaking, panel participation, event appearance
   Example: "${name} speaking at [lens term] conference panel"

5) CONTEXT / INFLECTION
   Artifacts: role change, new scope, transition, next phase
   Example: "${name} promoted to ${role || 'new role'} at ${company}"

---

TASK

1. Lightly extract 1–2 **lens terms** from the sender's intent (domain, problem, or context).
   Do NOT infer opinions, beliefs, or motivations.
   Do NOT use abstract nouns like "strategy", "initiatives", "perspectives".

2. Generate EXACTLY 5 search queries — one per evidence type above.

3. Each query MUST:
   - include "${name}"
   - include an explicit artifact keyword (podcast, keynote, LinkedIn post, launch, panel, etc.)
   - be 6–14 words
   - read like a plausible article title or sub-header
   - use concrete artifact types, not abstract topics

4. If strong evidence for a type is unlikely:
   - generate the most conservative plausible query
   - do NOT invent specificity
   - do NOT pad with generic leadership language

${forceCompany ? `
DISAMBIGUATION:
Identity confidence is low.
To ensure the correct person is found, ALL 5 queries MUST explicitly include the string "${company}".` : `
CONTEXT:
Include "${company}" if it helps specify the domain or disambiguate the person.
If "${company}" is generic, use specific industry terms instead.`}

---

OUTPUT FORMAT
Return ONLY a valid JSON array of exactly 5 strings.
Example: ["query 1", "query 2", "query 3", "query 4", "query 5"]`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 2048,
            thinkingConfig: {
              thinkingBudget: 0, // Disable thinking tokens
            }
          }
        })
      }
    );

    if (!response.ok) {
      console.error(`[generateSearchHypotheses] Gemini error: ${response.status}`);
      return [
        `podcast interview with ${name} at ${company}`,
        `${name} LinkedIn post about work at ${company}`,
        `${name} launches initiative at ${company}`,
        `${name} speaking at conference panel`,
        `${name} joins ${company} as ${role ?? 'executive'}`
      ];
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      console.error('[generateSearchHypotheses] JSON parse error:', error);
      return [
        `podcast interview with ${name} at ${company}`,
        `${name} LinkedIn post about work at ${company}`,
        `${name} launches initiative at ${company}`,
        `${name} speaking at conference panel`,
        `${name} joins ${company} as ${role ?? 'executive'}`
      ];
    }

    // CRITICAL FIX: Concatenate ALL parts, not just the first one
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    if (!Array.isArray(parts)) {
      console.error('[generateSearchHypotheses] Invalid response structure - parts not an array');
      return [
        `podcast interview with ${name} at ${company}`,
        `${name} LinkedIn post about work at ${company}`,
        `${name} launches initiative at ${company}`,
        `${name} speaking at conference panel`,
        `${name} joins ${company} as ${role ?? 'executive'}`
      ];
    }
    const text = parts.map((part: any) => part.text ?? '').join('');
    const finishReason = data.candidates?.[0]?.finishReason ?? 'UNKNOWN';

    console.log(`[generateSearchHypotheses] Gemini returned ${parts.length} parts, total length: ${text.length} chars`);
    console.log(`[generateSearchHypotheses] Gemini finishReason: ${finishReason}`);

    // CRITICAL FIX: Proper JSON array extraction with balanced bracket matching
    let hypotheses;

    // Strategy 1: Find first complete JSON array with balanced brackets (MOST RELIABLE)
    // Do this FIRST because Gemini often returns raw JSON without code blocks
    const firstBracket = text.indexOf('[');
    if (firstBracket !== -1) {
      let depth = 0;
      let endPos = -1;
      let inString = false;
      let escapeNext = false;

      for (let i = firstBracket; i < text.length; i++) {
        const char = text[i];

        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (char === '\\') {
          escapeNext = true;
          continue;
        }

        if (char === '"') {
          inString = !inString;
          continue;
        }

        if (!inString) {
          if (char === '[') depth++;
          if (char === ']') {
            depth--;
            if (depth === 0) {
              endPos = i;
              break;
            }
          }
        }
      }

      if (endPos !== -1) {
        const jsonStr = text.substring(firstBracket, endPos + 1);
        console.log(`[generateSearchHypotheses] Extracted JSON array (balanced brackets): ${jsonStr.length} chars`);
        try {
          hypotheses = JSON.parse(jsonStr);
        } catch (e) {
          console.error(`[generateSearchHypotheses] Balanced JSON parse failed:`, e);
          console.error(`[generateSearchHypotheses] Attempted JSON:`, jsonStr.substring(0, 300));
        }
      }
    }

    // Strategy 2: Try ```json code block as fallback
    if (!hypotheses) {
      const codeBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        console.log(`[generateSearchHypotheses] Found JSON in code block`);
        const content = codeBlockMatch[1].trim();
        if (content.startsWith('[')) {
          try {
            hypotheses = JSON.parse(content);
          } catch (e) {
            console.error(`[generateSearchHypotheses] Code block JSON parse failed:`, e);
          }
        }
      }
    }

    if (!hypotheses) {
      console.error(`[generateSearchHypotheses] No valid JSON array found. First 300 chars:`, text.substring(0, 300));
      return [
        `podcast interview with ${name} at ${company}`,
        `${name} LinkedIn post about work at ${company}`,
        `${name} launches initiative at ${company}`,
        `${name} speaking at conference panel`,
        `${name} joins ${company} as ${role ?? 'executive'}`
      ];
    }

    if (!Array.isArray(hypotheses) || hypotheses.length === 0) {
      console.error(`[generateSearchHypotheses] Invalid hypotheses format`);
      return [
        `podcast interview with ${name} at ${company}`,
        `${name} LinkedIn post about work at ${company}`,
        `${name} launches initiative at ${company}`,
        `${name} speaking at conference panel`,
        `${name} joins ${company} as ${role ?? 'executive'}`
      ];
    }

    console.log(`[generateSearchHypotheses] Generated ${hypotheses.length} hypotheses:`, hypotheses);

    // Test lens term extraction: verify artifact keywords are present
    const artifactKeywords = [
      'podcast', 'interview', 'keynote', 'transcript', 'op-ed',
      'LinkedIn', 'blog post', 'essay', 'reflection',
      'launch', 'initiative', 'program', 'project',
      'speaking', 'panel', 'conference', 'event',
      'join', 'transition', 'promote', 'role', 'new scope'
    ];

    hypotheses.forEach((query, i) => {
      const lowerQuery = query.toLowerCase();
      const foundKeywords = artifactKeywords.filter(kw => lowerQuery.includes(kw.toLowerCase()));
      console.log(`[generateSearchHypotheses] Query ${i + 1} artifact keywords: [${foundKeywords.join(', ')}]`);
      if (foundKeywords.length === 0) {
        console.warn(`[generateSearchHypotheses] Query ${i + 1} missing artifact keywords: "${query}"`);
      }
    });

    return hypotheses.slice(0, 5);

  } catch (error) {
    console.error(`[generateSearchHypotheses] Error:`, error);
    return [
      `podcast interview with ${name} at ${company}`,
      `${name} LinkedIn post about work at ${company}`,
      `${name} launches initiative at ${company}`,
      `${name} speaking at conference panel`,
      `${name} joins ${company} as ${role ?? 'executive'}`
    ];
  }
}

// Phase 2: Content Discovery (with improved autoprompt + scoring)
export async function discoverContent(params: {
  name: string;
  company: string;
  role?: string;
  senderIntent?: string;
  credibilityStory?: string;
  exaApiKey: string;
  geminiApiKey: string;
  identityConfidence?: number;
}): Promise<ContentDiscoveryResult> {
  const { name, company, role, senderIntent, credibilityStory, exaApiKey, geminiApiKey, identityConfidence } = params;

  console.log(`[discoverContent] Starting discovery for ${name} at ${company}`);

  // Generate smart search hypotheses using Gemini
  const hypotheses = await generateSearchHypotheses({
    name,
    company,
    role,
    senderIntent,
    credibilityStory,
    geminiApiKey,
    identityConfidence
  });

  // Use improved autoprompt-based discovery with scoring
  const discoveryResult = await discoverContentWithAutoprompt({
    name,
    company,
    role,
    senderIntent: senderIntent || '',
    exaApiKey,
    geminiApiKey,
    hypotheses
  });

  // Log debug info
  console.log(`[discoverContent] Topics extracted:`, discoveryResult.debug.topics);
  console.log(`[discoverContent] Dropped ${discoveryResult.debug.dropped.length} URLs`);
  console.log(`[discoverContent] Top 5 scores:`, discoveryResult.debug.topScores.slice(0, 5));

  // Convert to expected format
  const urls = discoveryResult.urls.map((r, i) => ({
    id: r.url,
    url: r.url,
    title: r.title,
    score: discoveryResult.debug.topScores.find(s => s.url === r.url)?.score ?? 0,
    source: r.source
  }));

  return {
    urls,
    foundCount: discoveryResult.urls.length,
    hypotheses
  };
}

// Extract top 6-10 intent keywords from sender intent
function extractIntentKeywords(senderIntent: string): string[] {
  // 1. Normalize
  let text = senderIntent.toLowerCase();
  text = text.replace(/[^\w\s]/g, ' '); // Replace punctuation with spaces
  text = text.replace(/\s+/g, ' ').trim(); // Collapse whitespace

  // 2. Strip boilerplate phrases (do this BEFORE tokenization)
  const boilerplatePhrases = [
    // Outreach boilerplate
    "i m reaching out", "reaching out", "reach out to", "reach out",
    "would love to", "love to", "hoping to", "hope to",
    "quick chat", "quick call", "grab time",
    "i wanted to", "i want to", "want to invite", "want him to", "want her to",
    "invite him to", "invite her to", "invite them to", "invite you to",
    "invite him", "invite her",
    "i m interested in", "i m curious about",
    "see if you", "see if he", "see if she",
    "open to", "wondering if",
    "learn more", "hear about", "hear more", "your thoughts on",

    // Event logistics
    "as an mba student", "i m an mba student",
    "join us", "fireside chat",
    "speak at", "speaking at", "speak at the", "at the", "to the",
    "come speak", "come and speak",
    "for the"
  ];

  for (const phrase of boilerplatePhrases) {
    text = text.replace(new RegExp(phrase, 'g'), ' ');
  }

  text = text.replace(/\s+/g, ' ').trim();

  // 3. Tokenize and remove stopwords
  const stopwords = new Set([
    "the", "a", "an", "and", "or", "to", "of", "in", "for", "on", "with", "about", "from",
    "that", "this", "it", "is", "are", "be", "been", "being", "as", "at", "by", "into",
    "over", "under", "than", "then", "just", "around"
  ]);

  // 4. Drop low-signal verbs & filler words
  const lowSignalVerbs = new Set([
    // Outreach boilerplate
    "reach", "reaching", "chat", "call", "connect", "learn", "hear", "discuss",
    "talk", "share", "help", "looking",

    // Event logistics
    "speak", "speaker", "come", "quick",

    // Filler verbs
    "like", "would", "could", "should", "want", "wanted", "make", "getting"
  ]);

  // 5. Filter low-value tokens
  const lowValueTokens = new Set([
    // Generic
    "company", "companys", "career", "background", "experience",

    // Event logistics
    "keynote", "panel", "fireside", "conference", "summit", "event",
    "invite", "presentation",

    // Academic context
    "stanford", "university", "students", "student", "school", "business"
  ]);

  const tokens = text.split(/\s+/)
    .filter(token => token.length >= 4) // Keep tokens >= 4 chars
    .filter(token => !stopwords.has(token))
    .filter(token => !lowSignalVerbs.has(token))
    .filter(token => !lowValueTokens.has(token))
    .filter(token => !/^\d+$/.test(token)); // Not purely numeric

  // 6. Keep top 6-10 keywords (less restrictive than highlightsQuery)
  const keywords = tokens.slice(0, 10);

  console.log(`[extractIntentKeywords] Extracted ${keywords.length} keywords:`, keywords);

  return keywords;
}

// Build highlights query using Gemini to extract core topic
async function buildHighlightsQuery(senderIntent: string, geminiApiKey: string): Promise<string> {
  if (!senderIntent || !geminiApiKey) {
    console.warn('[buildHighlightsQuery] Missing senderIntent or geminiApiKey, using fallback');
    return senderIntent;
  }

  const prompt = `Extract the core topic from the following text as a 3-7 word phrase.

Rules:
- Remove action words (want, hope, invite, ask, reach out)
- Remove logistics (events, locations, timing, institutions)
- Remove people's names
- Use nouns and noun phrases only
- Do not add new information

Input:
${senderIntent}

Output (3-7 words only):`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 128,
            thinkingConfig: {
              thinkingBudget: 0, // Disable thinking tokens
            },
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[buildHighlightsQuery] Gemini API error:', response.status, errorText);
      return senderIntent;
    }

    const data = await response.json();
    console.log('[buildHighlightsQuery] Gemini response:', JSON.stringify(data));

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const finishReason = data.candidates?.[0]?.finishReason;
    const topicPhrase = parts.map((part: any) => part.text ?? '').join('').trim();

    if (!topicPhrase) {
      console.warn('[buildHighlightsQuery] Empty response from Gemini. finishReason:', finishReason, 'Full response:', JSON.stringify(data));
      return senderIntent;
    }

    console.log(`[buildHighlightsQuery] Original: "${senderIntent}" -> Topic: "${topicPhrase}"`);
    return topicPhrase;
  } catch (error) {
    console.error('[buildHighlightsQuery] Error:', error);
    return senderIntent; // Fallback to original
  }
}

// Phase 3: Content Fetching
export async function fetchContent(params: {
  urls: Array<{ id: string; url: string; title: string }>;
  exaApiKey: string;
  geminiApiKey: string;
  senderIntent?: string;
  name: string;
  company: string;
}): Promise<ContentFetchResult> {
  const { urls, exaApiKey, geminiApiKey, senderIntent, name, company } = params;

  if (!urls || urls.length === 0) {
    return { docs: [], fetchedCount: 0 };
  }

  console.log(`[fetchContent] Fetching ${urls.length} URLs`);

  const ids = urls.map(u => u.id).filter(Boolean);

  if (ids.length === 0) {
    return { docs: [], fetchedCount: 0 };
  }

  try {
    // Build Gemini-powered highlights query if senderIntent exists
    const highlightsQuery = senderIntent ? await buildHighlightsQuery(senderIntent, geminiApiKey) : undefined;

    const response = await fetch('https://api.exa.ai/contents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${exaApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ids,
        text: {
          maxCharacters: 5000,
          includeHtmlTags: false
        },
        ...(highlightsQuery ? {
          highlights: {
            query: highlightsQuery,
            numSentences: 3,
            highlightsPerUrl: 3
          }
        } : {})
      })
    });

    if (!response.ok) {
      console.error(`[fetchContent] API error: ${response.status}`);
      return { docs: [], fetchedCount: 0 };
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      console.error('[fetchContent] JSON parse error:', error);
      return { docs: [], fetchedCount: 0 };
    }

    const results = data.results ?? [];

    // Helper function to determine source type based on mention analysis
    const scoreSourceType = (text: string, title: string): SourceType => {
      const textLower = text.toLowerCase();
      const titleLower = title.toLowerCase();
      const nameLower = name.toLowerCase();
      const companyLower = company.toLowerCase();

      // Check if the person's name is mentioned in text or title
      if (textLower.includes(nameLower) || titleLower.includes(nameLower)) {
        return 'person_specific';
      }

      // Check if the company is mentioned
      if (textLower.includes(companyLower) || titleLower.includes(companyLower)) {
        return 'company_specific';
      }

      // Neither person nor company mentioned - generic content
      return 'industry_generic';
    };

    // Map results and add sourceType
    const allDocs: FetchedDocument[] = results.map((r: any) => ({
      url: r.url ?? '',
      title: r.title ?? '',
      text: r.text ?? '',
      highlights: Array.isArray(r.highlights) ? r.highlights : [],
      sourceType: scoreSourceType(r.text ?? '', r.title ?? '')
    })).filter((d: FetchedDocument) => typeof d.text === 'string' && d.text.length > 100);

    // Filter out industry_generic sources (Option B+: keep person_specific and company_specific)
    const beforeFilterCount = allDocs.length;
    const docs = allDocs.filter(doc => doc.sourceType !== 'industry_generic');
    const filteredCount = beforeFilterCount - docs.length;

    // Log filtering results
    const personSpecificCount = docs.filter(d => d.sourceType === 'person_specific').length;
    const companySpecificCount = docs.filter(d => d.sourceType === 'company_specific').length;

    console.log(`[fetchContent] Source type breakdown: person_specific=${personSpecificCount}, company_specific=${companySpecificCount}, industry_generic=${filteredCount} (filtered out)`);

    if (filteredCount > 0) {
      console.log(`[fetchContent] Filtered out ${filteredCount} industry_generic docs that don't mention "${name}" or "${company}"`);
    }

    const avgTextChars = docs.length > 0 ? Math.round(docs.reduce((sum, d) => sum + d.text.length, 0) / docs.length) : 0;
    const totalHighlightsChars = docs.reduce((sum, d) => sum + (d.highlights || []).join(' ').length, 0);

    console.log(`[fetchContent] Successfully fetched ${docs.length} documents (${beforeFilterCount} before filtering), avg_text_chars=${avgTextChars}, total_highlights_chars=${totalHighlightsChars}`);

    return {
      docs,
      fetchedCount: docs.length,
      filteredCount
    };
  } catch (error) {
    console.error(`[fetchContent] Error:`, error);
    return { docs: [], fetchedCount: 0 };
  }
}

// Phase 4: Hook Extraction with Gemini
export async function extractHooks(params: {
  docs: FetchedDocument[];
  name: string;
  company: string;
  senderIntent?: string;
  geminiApiKey: string;
}): Promise<HookExtractionResult> {
  const { docs, name, company, senderIntent, geminiApiKey } = params;

  if (!docs || docs.length === 0) {
    return {
      hooks: [],
      fallback_mode: 'failed'
    };
  }

  console.log(`[extractHooks] Analyzing ${docs.length} documents for ${name}`);

  // Import content summary builder
  const { buildContentSummary } = await import('./content-summary.ts');
  const contentSummary = buildContentSummary(docs, "normal");

  const prompt = `You are extracting personalization hooks about ${name} at ${company} based on provided content.

SENDER'S INTENT: ${senderIntent ?? 'Not specified - general networking'}

CONTENT SOURCES:
${contentSummary}

A valid hook is any specific, verifiable signal that is credibly attributable to the person's role, trajectory, professional focus, public engagement, or organizational association.

CRITICAL REQUIREMENT - Source Mentions:
- EVERY hook MUST be about ${name} specifically OR about ${company} in relation to ${name}'s role
- evidenceQuotes MUST reference ${name} by name OR ${company} in a way that connects to ${name}
- Generic industry advice that doesn't mention ${name} or ${company} is NOT valid
- If a source doesn't mention ${name} or ${company}, DO NOT use it

Source Types (already filtered for you):
- person_specific: Sources that mention ${name} by name (highest quality)
- company_specific: Sources about ${company} (useful for context about their work environment)

Important rules:
- Attribution may be direct OR indirect.
- The signal does NOT need to be authored by the person.
- Do NOT require named projects, quotes, or first-person statements.
- Do NOT infer opinions or intentions without evidence.
- Do NOT include generic company or industry descriptions unless clearly connected to the person.

DEGRADATION LADDER (you MUST return at least 1 hook):

Tier 1 — Intent-aligned hooks (preferred):
- Directly matches sender's intent
- Evidence-grounded from person_specific or company_specific sources
- Confidence: 0.7–1.0 for person_specific sources, 0.5–0.7 for company_specific

Tier 2 — Adjacent hooks (if Tier 1 yields 0):
- About recipient's background, leadership, domain, or public work
- Loosely adjacent to sender intent
- Evidence-grounded from person_specific or company_specific sources
- Confidence: 0.35–0.65 for person_specific sources, 0.25–0.5 for company_specific

Tier 3 — Identity/role hooks (if Tier 2 yields 0):
- What they do, their remit, or notable "about" facts
- Evidence-grounded from person_specific or company_specific sources
- Confidence: 0.15–0.35 for person_specific sources, 0.1–0.25 for company_specific

CONFIDENCE SCORING:
confidence = strength of evidence that this hook is TRUE about ${name}
- 0.8-1.0: Direct quote mentioning ${name} by name with specific details
- 0.5-0.7: ${name} mentioned + context, OR ${company} context directly related to ${name}'s role
- 0.3-0.5: ${company} information that provides context for ${name}'s work
- <0.3: Weak connection (avoid unless tier3 fallback)

You MUST return at least 1 hook. If you cannot find Tier 1, use Tier 2. If you cannot find Tier 2, use Tier 3.

Unacceptable signals:
- Pure speculation
- Generic company information with no individual linkage
- Industry trends not tied to the person
- Assumptions without source evidence

Output requirements:
- Return VALID JSON ONLY (raw JSON, no code fences, no backtick blocks)
- No explanations, no markdown, no formatting
- Start response immediately with {
- No prose before or after JSON
- Return exactly 3 hooks (or fewer if content insufficient)
- evidenceQuotes is REQUIRED for all hooks

STRICT CHARACTER LIMITS (critical for performance):
- title: ≤ 80 characters
- hook: ≤ 220 characters
- whyItWorks: ≤ 160 characters
- weaknessNote: ≤ 120 characters (if present)
- Each evidenceQuote: ≤ 200 characters

Required output format:
{
  "hooks": [
    {
      "id": "hook_1",
      "title": "Short label (≤80 chars)",
      "hook": "The specific fact or signal (≤220 chars)",
      "whyItWorks": "Why this connects to sender's intent (≤160 chars)",
      "confidence": 0.85,
      "strength": "tier1" | "tier2" | "tier3",
      "weaknessNote": "Optional (≤120 chars)",
      "sources": [{"label": "Source 1", "url": "..."}],
      "evidenceQuotes": [{"label": "Source 1", "quote": "verbatim text (≤200 chars)"}]
    }
  ]
}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 4000, // Increased for stability padding
            thinkingConfig: {
              thinkingBudget: 0, // Disable thinking tokens
            },
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[extractHooks] Gemini API error: ${response.status} ${errorText}`);
      return {
        hooks: [],
        fallback_mode: 'failed'
      };
    }

    const data = await response.json();

    // CRITICAL FIX: Concatenate ALL parts, not just the first one
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((part: any) => part.text ?? '').join('');
    const finishReason = data.candidates?.[0]?.finishReason ?? 'UNKNOWN';

    console.log(`[extractHooks] Gemini returned ${parts.length} parts, total length: ${text.length} chars, maxOutputTokens: 4000`);
    console.log(`[extractHooks] Gemini finishReason: ${finishReason}`);
    console.log(`[extractHooks] First 1000 chars of response:`, text.substring(0, 1000));

    // CRITICAL FIX: Proper JSON extraction instead of greedy regex
    // The greedy regex /\{[\s\S]*\}/ matches from first { to LAST }, breaking on extra text
    let parsed;
    let cleanedText = text;

    // Strategy 1: Strip code fences if present
    const codeBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      cleanedText = codeBlockMatch[1].trim();
      console.log(`[extractHooks] Stripped code fence, cleaned length: ${cleanedText.length} chars`);
    }

    // Parser guard: early exit if no JSON structure at all
    if (!cleanedText.includes('{')) {
      console.error(`[extractHooks] Parser guard: no opening brace found in cleaned text`);
      return {
        hooks: [],
        fallback_mode: 'extraction_failed',
        fallback_used: false,
        fallback_reason: 'parser_guard'
      };
    }

    // If we have opening brace but no closing, try to repair (handle truncation)
    const hasClosingBrace = cleanedText.includes('}');
    if (!hasClosingBrace) {
      console.warn(`[extractHooks] No closing brace found - likely truncation. Will attempt repair.`);
    }

    // Strategy 2: Find first complete JSON object with balanced braces (MOST RELIABLE)
    // Must handle strings containing braces like "Microsoft's {team}"
    const firstBrace = cleanedText.indexOf('{');
    if (firstBrace !== -1) {
      let depth = 0;
      let endPos = -1;
      let inString = false;
      let escapeNext = false;

      for (let i = firstBrace; i < cleanedText.length; i++) {
        const char = cleanedText[i];

        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (char === '\\') {
          escapeNext = true;
          continue;
        }

        if (char === '"') {
          inString = !inString;
          continue;
        }

        if (!inString) {
          if (char === '{') depth++;
          if (char === '}') {
            depth--;
            if (depth === 0) {
              endPos = i;
              break;
            }
          }
        }
      }

      if (endPos !== -1) {
        const jsonStr = cleanedText.substring(firstBrace, endPos + 1);
        console.log(`[extractHooks] Extracted JSON (balanced braces): ${jsonStr.length} chars`);
        console.log(`[extractHooks] Extracted JSON content:`, jsonStr);
        try {
          parsed = JSON.parse(jsonStr);
          console.log(`[extractHooks] JSON.parse succeeded! Parsed object has keys:`, Object.keys(parsed));
        } catch (e) {
          console.error(`[extractHooks] Balanced JSON parse failed:`, e);
          console.error(`[extractHooks] Attempted to parse:`, jsonStr.substring(0, 500));
        }
      } else {
        console.error(`[extractHooks] Could not find balanced braces. firstBrace=${firstBrace}, cleanedText length=${cleanedText.length}`);

        // REPAIR ATTEMPT: Try to close incomplete JSON structure
        if (!hasClosingBrace && cleanedText.includes('"hooks"')) {
          console.warn(`[extractHooks] Attempting to repair truncated JSON by closing structures`);

          let repaired = cleanedText.trim();

          // If we're in the middle of a string, close it
          const openQuotes = (repaired.match(/"/g) || []).length;
          if (openQuotes % 2 !== 0) {
            repaired += '"';
            console.log(`[extractHooks] Repair: Added closing quote`);
          }

          // Close any open objects/arrays
          // Count open braces/brackets
          let braceDepth = 0;
          let bracketDepth = 0;
          let inString = false;
          let escapeNext = false;

          for (let i = 0; i < repaired.length; i++) {
            const char = repaired[i];

            if (escapeNext) {
              escapeNext = false;
              continue;
            }

            if (char === '\\') {
              escapeNext = true;
              continue;
            }

            if (char === '"') {
              inString = !inString;
              continue;
            }

            if (!inString) {
              if (char === '{') braceDepth++;
              if (char === '}') braceDepth--;
              if (char === '[') bracketDepth++;
              if (char === ']') bracketDepth--;
            }
          }

          // Close brackets and braces
          while (bracketDepth > 0) {
            repaired += ']';
            bracketDepth--;
          }
          while (braceDepth > 0) {
            repaired += '}';
            braceDepth--;
          }

          console.log(`[extractHooks] Repair: Added ${(repaired.length - cleanedText.trim().length)} closing chars`);
          console.log(`[extractHooks] Repaired JSON (first 500 chars):`, repaired.substring(0, 500));

          // Try to parse repaired JSON
          try {
            parsed = JSON.parse(repaired);
            console.log(`[extractHooks] Repair successful! Parsed object has keys:`, Object.keys(parsed));
          } catch (e) {
            console.error(`[extractHooks] Repair failed:`, e);
          }
        }
      }
    }

    // TRUNCATION-AWARE FALLBACK: Handle MAX_TOKENS by salvaging partial JSON
    if (!parsed && finishReason === 'MAX_TOKENS') {
      console.warn(`[extractHooks] MAX_TOKENS detected, attempting partial salvage`);

      // Try to salvage last complete hook object
      const firstBrace = cleanedText.indexOf('{');
      if (firstBrace !== -1) {
        // Find all complete hook objects by looking for complete {...} patterns
        const salvaged = { hooks: [] };
        let searchStart = cleanedText.indexOf('"hooks"');

        if (searchStart !== -1) {
          const arrayStart = cleanedText.indexOf('[', searchStart);
          if (arrayStart !== -1) {
            let currentPos = arrayStart + 1;

            while (currentPos < cleanedText.length) {
              // Skip whitespace
              while (currentPos < cleanedText.length && /\s/.test(cleanedText[currentPos])) {
                currentPos++;
              }

              if (cleanedText[currentPos] === '{') {
                // Try to extract complete object
                let depth = 0;
                let endPos = -1;
                let inString = false;
                let escapeNext = false;

                for (let i = currentPos; i < cleanedText.length; i++) {
                  const char = cleanedText[i];

                  if (escapeNext) {
                    escapeNext = false;
                    continue;
                  }

                  if (char === '\\') {
                    escapeNext = true;
                    continue;
                  }

                  if (char === '"') {
                    inString = !inString;
                    continue;
                  }

                  if (!inString) {
                    if (char === '{') depth++;
                    if (char === '}') {
                      depth--;
                      if (depth === 0) {
                        endPos = i;
                        break;
                      }
                    }
                  }
                }

                if (endPos !== -1) {
                  const objStr = cleanedText.substring(currentPos, endPos + 1);
                  try {
                    const hookObj = JSON.parse(objStr);
                    salvaged.hooks.push(hookObj);
                    console.log(`[extractHooks] Salvaged hook object ${salvaged.hooks.length}`);
                    currentPos = endPos + 1;
                  } catch (e) {
                    console.error(`[extractHooks] Failed to parse salvaged object:`, e);
                    break; // Stop trying if we hit malformed JSON
                  }
                } else {
                  // Incomplete object, stop here
                  break;
                }
              } else if (cleanedText[currentPos] === ']') {
                // End of array
                break;
              } else {
                // Unexpected character, skip
                currentPos++;
              }

              // Skip comma if present
              while (currentPos < cleanedText.length && /[\s,]/.test(cleanedText[currentPos])) {
                currentPos++;
              }
            }
          }
        }

        if (salvaged.hooks.length > 0) {
          console.log(`[extractHooks] Salvaged ${salvaged.hooks.length} complete hooks from truncated output`);
          parsed = salvaged;
        }
      }
    }

    if (!parsed) {
      console.error(`[extractHooks] No valid JSON found in response. First 500 chars:`, text.substring(0, 500));
      return {
        hooks: [],
        fallback_mode: 'extraction_failed',
        fallback_used: false,
        fallback_reason: finishReason === 'MAX_TOKENS' ? 'max_tokens_no_salvage' : 'json_parse_failed'
      };
    }

    // Schema guard: validate hooks array
    if (!Array.isArray(parsed.hooks)) {
      console.error(`[extractHooks] Schema guard: hooks is not an array`, parsed);
      return {
        hooks: [],
        fallback_mode: 'extraction_failed',
        fallback_used: false,
        fallback_reason: 'schema_guard'
      };
    }

    // Validate hook elements
    const validHooks = (parsed.hooks ?? []).filter((h: any) =>
      h && typeof h === 'object' &&
      typeof h.id === 'string' &&
      typeof h.title === 'string' &&
      typeof h.hook === 'string' &&
      typeof h.confidence === 'number' &&
      Array.isArray(h.sources) &&
      Array.isArray(h.evidenceQuotes)
    );

    if (validHooks.length < parsed.hooks.length) {
      console.warn(`[extractHooks] Filtered out ${parsed.hooks.length - validHooks.length} invalid hooks`);
    }

    const hooks: HookPack[] = validHooks.slice(0, 3);
    console.log(`[extractHooks] Successfully parsed ${hooks.length} valid hooks from JSON`);

    // Calculate highlights chars for fallback decision
    const { totalHighlightsChars, shouldUseFallback } = await import('./research-fallback.ts');
    const highlightsChars = totalHighlightsChars(docs);
    const fallbackDecision = shouldUseFallback({ docs, hooksCount: hooks.length });

    console.log(`[extractHooks] normal_hooks=${hooks.length} highlights_chars=${highlightsChars}`);
    console.log(`[extractHooks] fallback_decision=${fallbackDecision.useFallback} reason=${fallbackDecision.reason}`);

    // If fallback needed, run it
    if (fallbackDecision.useFallback) {
      console.log(`[extractHooks] Running fallback extraction with raw text excerpts`);

      const contentSummaryFallback = buildContentSummary(docs, "fallback");
      const { buildExtractHooksFallbackPrompt } = await import('./prompts/extract-hooks-fallback.ts');
      const fallbackPrompt = buildExtractHooksFallbackPrompt({ name, company, senderIntent, contentSummary: contentSummaryFallback });

      const fallbackResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: fallbackPrompt }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 5000, // Increased for fallback stability
              thinkingConfig: {
                thinkingBudget: 0, // Disable thinking tokens
              },
            }
          })
        }
      );

      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        const fallbackParts = fallbackData.candidates?.[0]?.content?.parts ?? [];
        const fallbackText = fallbackParts.map((part: any) => part.text ?? '').join('');

        let fallbackParsed = null;
        const firstBrace = fallbackText.indexOf('{');
        if (firstBrace !== -1) {
          let depth = 0, lastClose = -1;
          for (let i = firstBrace; i < fallbackText.length; i++) {
            if (fallbackText[i] === '{') depth++;
            if (fallbackText[i] === '}') { depth--; if (depth === 0) { lastClose = i; break; } }
          }
          if (lastClose !== -1) {
            const jsonStr = fallbackText.substring(firstBrace, lastClose + 1);
            try {
              fallbackParsed = JSON.parse(jsonStr);
            } catch (e) {
              console.error('[extractHooks] Fallback JSON parse failed:', e);
            }
          }
        }

        if (!fallbackParsed) {
          const match = fallbackText.match(/```json\s*(\{[\s\S]*?\})\s*```/);
          if (match) {
            try {
              fallbackParsed = JSON.parse(match[1]);
            } catch (e) {
              console.error('[extractHooks] Fallback code block JSON parse failed:', e);
            }
          }
        }

        if (fallbackParsed && Array.isArray(fallbackParsed.hooks)) {
          const fallbackHooks = (fallbackParsed.hooks ?? []).slice(0, 3);
          console.log(`[extractHooks] fallback_hooks=${fallbackHooks.length}`);

          if (fallbackHooks.length > 0) {
            return { hooks: fallbackHooks, fallback_mode: 'hooks_found', fallback_used: true, fallback_reason: fallbackDecision.reason };
          } else {
            return { hooks: [], fallback_mode: 'no_hooks_available', fallback_used: true, fallback_reason: fallbackDecision.reason };
          }
        }
      }

      console.log(`[extractHooks] Fallback extraction failed (parsing error)`);
      return { hooks: [], fallback_mode: 'extraction_failed', fallback_used: true, fallback_reason: 'fallback_parse_failed' };
    }

    console.log(`[extractHooks] Extracted ${hooks.length} hooks`);

    // Determine result state
    let fallback_mode: 'hooks_found' | 'no_hooks_available' | 'extraction_failed';
    if (hooks.length > 0) {
      fallback_mode = 'hooks_found';
    } else {
      fallback_mode = 'no_hooks_available';
    }

    return {
      hooks,
      fallback_mode,
      fallback_used: false,
      fallback_reason: null
    };
  } catch (error) {
    console.error(`[extractHooks] Error:`, error);
    return {
      hooks: [],
      fallback_mode: 'extraction_failed',
      fallback_used: false,
      fallback_reason: 'exception'
    };
  }
}
