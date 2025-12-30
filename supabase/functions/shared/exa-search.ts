// Exa Search + Contents API implementation for phased research

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

export interface FetchedDocument {
  url: string;
  title: string;
  text: string;
  highlights?: string[];
}

export interface ContentFetchResult {
  docs: FetchedDocument[];
  fetchedCount: number;
}

export interface HookPack {
  id: string;
  title: string;
  hook: string;
  whyItWorks: string;
  confidence: number;
  sources: Array<{ label: string; url: string }>;
}

export interface HookExtractionResult {
  hooks: HookPack[];
  fallback_mode: 'sufficient' | 'minimal' | 'failed';
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

    const data = await response.json();
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
}): Promise<string[]> {
  const { name, company, role, senderIntent, credibilityStory, geminiApiKey } = params;

  if (!senderIntent) {
    // Fall back to basic searches if we don't have sender's intent
    return [
      `${name} ${company} ${role ?? ''} projects background`,
      `${name} ${company} recent work`,
      `${name} ${company} interview podcast article`
    ];
  }

  const prompt = `You are generating search queries for Exa, a neural semantic search engine.

IMPORTANT CONTEXT ABOUT EXA:
Exa works best when queries describe the KIND OF DOCUMENT you want to find,
not when they ask questions or make claims.

Good Exa queries:
- Read like descriptions of articles, interviews, talks, or essays
- Combine: ENTITY + CONTENT TYPE + THEME
- Are neutral and discovery-oriented (do not assert facts)

Bad Exa queries:
- Resume bullets or invented claims (e.g. "led X", "built Y")
- Outreach or email language ("I'm reaching out", "would like to")
- Vague domain-only phrases with no entity anchor
- Career summaries ("background", "experience", "profile")

---

Recipient: ${name}
Company: ${company}
Role: ${role || "N/A"}

Sender's Intent:
${senderIntent}

---

TASK

Generate EXACTLY 3 Exa search queries.

Each query must target a DIFFERENT TYPE of PUBLICLY VERIFIABLE SIGNAL.
You are searching for evidence that MAY exist — do NOT assume anything is true.

Generate the queries in this order:

1) PUBLIC VOICE
   A query that could surface interviews, podcasts, talks, panels, essays,
   or other first-person public commentary by ${name}.
   (Do not reference specific quotes or opinions.)

2) PROFESSIONAL WORK / COMPANY CONTEXT
   A query that could surface initiatives, programs, strategies, or areas of
   work associated with ${name}'s role or company.
   (Do not claim ownership or leadership.)

3) CAREER FACTS / TRANSITIONS
   A query that could surface factual career history or role transitions
   involving ${name}.
   (Do not speculate on motivations.)

---

CONSTRAINTS

- Each query MUST include ${name}.
- Include ${company} ONLY if it helps narrow the search.
- Queries should be 8–16 words.
- Use content-type nouns when appropriate (e.g. interview, podcast, talk, essay).
- Avoid claims, outreach language, or resume-style wording.
- The three queries must not be near-duplicates.

---

OUTPUT FORMAT

Return ONLY a JSON array of 3 strings, in the same order as above.
No explanations. No markdown. No extra text.

Example output format:
[
  "search query 1",
  "search query 2",
  "search query 3"
]`;

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
            temperature: 0.7,
            maxOutputTokens: 2048,
          }
        })
      }
    );

    if (!response.ok) {
      console.error(`[generateSearchHypotheses] Gemini error: ${response.status}`);
      return [
        `${name} ${company} ${role ?? ''} projects`,
        `${name} ${company} recent work`,
        `${name} ${company} leadership`
      ];
    }

    const data = await response.json();

    // CRITICAL FIX: Concatenate ALL parts, not just the first one
    const parts = data.candidates?.[0]?.content?.parts ?? [];
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
        `${name} ${company} ${role ?? ''} projects`,
        `${name} ${company} recent work`,
        `${name} ${company} leadership`
      ];
    }

    if (!Array.isArray(hypotheses) || hypotheses.length === 0) {
      console.error(`[generateSearchHypotheses] Invalid hypotheses format`);
      return [
        `${name} ${company} ${role ?? ''} projects`,
        `${name} ${company} recent work`,
        `${name} ${company} leadership`
      ];
    }

    console.log(`[generateSearchHypotheses] Generated ${hypotheses.length} hypotheses:`, hypotheses);
    return hypotheses.slice(0, 3);

  } catch (error) {
    console.error(`[generateSearchHypotheses] Error:`, error);
    return [
      `${name} ${company} ${role ?? ''} projects`,
      `${name} ${company} recent work`,
      `${name} ${company} leadership`
    ];
  }
}

// Phase 2: Content Discovery
export async function discoverContent(params: {
  name: string;
  company: string;
  role?: string;
  senderIntent?: string;
  credibilityStory?: string;
  exaApiKey: string;
  geminiApiKey: string;
}): Promise<ContentDiscoveryResult> {
  const { name, company, role, senderIntent, credibilityStory, exaApiKey, geminiApiKey } = params;

  console.log(`[discoverContent] Starting discovery for ${name} at ${company}`);

  // Generate smart search hypotheses using Gemini
  const hypotheses = await generateSearchHypotheses({
    name,
    company,
    role,
    senderIntent,
    credibilityStory,
    geminiApiKey
  });

  const searches = hypotheses.map((query, i) => ({
    query,
    label: `hypothesis_${i + 1}`
  }));

  try {
    const searchPromises = searches.map(async (search) => {
      const response = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${exaApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: search.query,
          numResults: 5,
          type: 'neural',
          useAutoprompt: true
        })
      });

      if (!response.ok) {
        console.error(`[discoverContent] ${search.label} search failed: ${response.status}`);
        return [];
      }

      const data = await response.json();
      return (data.results ?? []).map((r: any) => ({
        id: r.id ?? r.url,
        url: r.url ?? '',
        title: r.title ?? '',
        score: r.score ?? 0,
        source: search.label
      }));
    });

    const allResults = await Promise.all(searchPromises);
    const flatResults = allResults.flat();

    console.log(`[discoverContent] Found ${flatResults.length} total results`);

    // Deduplicate by URL
    const urlMap = new Map<string, any>();
    flatResults.forEach(result => {
      if (result.url && !urlMap.has(result.url)) {
        urlMap.set(result.url, result);
      }
    });

    const uniqueResults = Array.from(urlMap.values());

    // Sort by score and take top 5-8
    const topResults = uniqueResults
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 8);

    return {
      urls: topResults,
      foundCount: uniqueResults.length,
      hypotheses
    };
  } catch (error) {
    console.error(`[discoverContent] Error:`, error);
    return {
      urls: [],
      foundCount: 0,
      hypotheses: []
    };
  }
}

// Extract top 6-10 intent keywords from sender intent
function extractIntentKeywords(senderIntent: string): string[] {
  // 1. Normalize
  let text = senderIntent.toLowerCase();
  text = text.replace(/[^\w\s]/g, ' '); // Replace punctuation with spaces
  text = text.replace(/\s+/g, ' ').trim(); // Collapse whitespace

  // 2. Strip boilerplate phrases
  const boilerplatePhrases = [
    // Outreach boilerplate
    "i'm reaching out", "reaching out", "reach out",
    "would love to", "love to", "hoping to",
    "quick chat", "quick call", "grab time",
    "i wanted to", "i'm interested in", "i'm curious about",
    "see if you", "open to", "wondering if",
    "learn more", "hear about", "your thoughts on",

    // Event logistics
    "as an mba student", "i'm an mba student",
    "invite you to", "join us", "fireside chat"
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

// Build deterministic highlights query from sender intent
function buildHighlightsQuery(senderIntent: string): string {
  // 1. Normalize
  let text = senderIntent.toLowerCase();
  text = text.replace(/[^\w\s]/g, ' '); // Replace punctuation with spaces
  text = text.replace(/\s+/g, ' ').trim(); // Collapse whitespace

  // 2. Strip boilerplate phrases
  const boilerplatePhrases = [
    // Outreach boilerplate
    "i'm reaching out", "reaching out", "reach out",
    "would love to", "love to", "hoping to",
    "quick chat", "quick call", "grab time",
    "i wanted to", "i'm interested in", "i'm curious about",
    "see if you", "open to", "wondering if",
    "learn more", "hear about", "your thoughts on",

    // Event logistics
    "as an mba student", "i'm an mba student",
    "invite you to", "join us", "fireside chat"
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

  // 6. Keep up to 12 tokens
  const finalTokens = tokens.slice(0, 12);

  // 7. Rebuild phrase
  let result = finalTokens.join(' ');

  // Cap to ~80 characters
  if (result.length > 80) {
    result = result.substring(0, 80).trim();
  }

  // Fallback: if result is empty or < 3 tokens, use first 12 words of original after boilerplate removal
  if (finalTokens.length < 3) {
    const fallbackTokens = text.split(/\s+/).slice(0, 12);
    result = fallbackTokens.join(' ');
  }

  console.log(`[buildHighlightsQuery] Original: "${senderIntent}" -> Query: "${result}"`);

  return result || senderIntent; // Ultimate fallback to original
}

// Phase 3: Content Fetching
export async function fetchContent(params: {
  urls: Array<{ id: string; url: string; title: string }>;
  exaApiKey: string;
  senderIntent?: string;
}): Promise<ContentFetchResult> {
  const { urls, exaApiKey, senderIntent } = params;

  if (!urls || urls.length === 0) {
    return { docs: [], fetchedCount: 0 };
  }

  console.log(`[fetchContent] Fetching ${urls.length} URLs`);

  const ids = urls.map(u => u.id).filter(Boolean);

  if (ids.length === 0) {
    return { docs: [], fetchedCount: 0 };
  }

  try {
    // Build deterministic highlights query if senderIntent exists
    const highlightsQuery = senderIntent ? buildHighlightsQuery(senderIntent) : undefined;

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

    const data = await response.json();
    const results = data.results ?? [];

    const docs: FetchedDocument[] = results.map((r: any) => ({
      url: r.url ?? '',
      title: r.title ?? '',
      text: r.text ?? '',
      highlights: r.highlights ?? []
    })).filter((d: FetchedDocument) => d.text && d.text.length > 100);

    console.log(`[fetchContent] Successfully fetched ${docs.length} documents`);

    return {
      docs,
      fetchedCount: docs.length
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

  // Build the prompt - limit content to leave room for output
  // With 8 docs, use max 300 chars each = 2400 chars content, leaving ~1600 tokens for output
  const contentSummary = docs.slice(0, 6).map((doc, i) =>
    `Source ${i + 1}: ${doc.title}\nURL: ${doc.url}\n${doc.highlights && doc.highlights.length > 0 ? doc.highlights.slice(0, 3).join('\n').slice(0, 300) : doc.text.slice(0, 300)}`
  ).join('\n\n---\n\n');

  const prompt = `You are extracting personalization hooks from research about ${name} at ${company}.

SENDER'S INTENT: ${senderIntent ?? 'Not specified - general networking'}

CONTENT SOURCES:
${contentSummary}

TASK: Extract 1-3 specific hooks that:
1. Reference a named project, quote, decision, or artifact
2. Are directly relevant to the sender's intent
3. Have verifiable evidence from the sources

For each hook, create:
- id: unique identifier (hook_1, hook_2, etc.)
- title: Short label (e.g., "Led Microsoft's AI Ethics Framework")
- hook: The specific fact or quote (1-2 sentences)
- whyItWorks: Why this connects to sender's intent (1 sentence)
- confidence: 0.0-1.0 score of how strong/relevant this hook is
- sources: Array of {label, url} from the content above

Return JSON only:
{
  "hooks": [
    {
      "id": "hook_1",
      "title": "...",
      "hook": "...",
      "whyItWorks": "...",
      "confidence": 0.85,
      "sources": [{"label": "Source 1", "url": "..."}]
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
            maxOutputTokens: 8192,
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

    console.log(`[extractHooks] Gemini returned ${parts.length} parts, total length: ${text.length} chars`);
    console.log(`[extractHooks] Gemini finishReason: ${finishReason}`);
    console.log(`[extractHooks] First 1000 chars of response:`, text.substring(0, 1000));

    // CRITICAL FIX: Proper JSON extraction instead of greedy regex
    // The greedy regex /\{[\s\S]*\}/ matches from first { to LAST }, breaking on extra text
    let parsed;

    // Strategy 1: Find first complete JSON object with balanced braces (MOST RELIABLE)
    // Must handle strings containing braces like "Microsoft's {team}"
    const firstBrace = text.indexOf('{');
    if (firstBrace !== -1) {
      let depth = 0;
      let endPos = -1;
      let inString = false;
      let escapeNext = false;

      for (let i = firstBrace; i < text.length; i++) {
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
        const jsonStr = text.substring(firstBrace, endPos + 1);
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
        console.error(`[extractHooks] Could not find balanced braces. firstBrace=${firstBrace}, text length=${text.length}`);
      }
    }

    // Strategy 2: Try ```json code block as fallback
    if (!parsed) {
      const codeBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        console.log(`[extractHooks] Found JSON in code block`);
        const content = codeBlockMatch[1].trim();
        if (content.startsWith('{')) {
          try {
            parsed = JSON.parse(content);
          } catch (e) {
            console.error(`[extractHooks] Code block JSON parse failed:`, e);
          }
        }
      }
    }

    if (!parsed) {
      console.error(`[extractHooks] No valid JSON found in response. First 500 chars:`, text.substring(0, 500));
      return {
        hooks: [],
        fallback_mode: 'failed'
      };
    }

    const hooks: HookPack[] = (parsed.hooks ?? []).slice(0, 3);
    console.log(`[extractHooks] Successfully parsed ${hooks.length} hooks from JSON`);

    console.log(`[extractHooks] Extracted ${hooks.length} hooks`);

    // Determine fallback mode
    const strongHooks = hooks.filter(h => (h.confidence ?? 0) >= 0.65);
    const decentHooks = hooks.filter(h => (h.confidence ?? 0) >= 0.5);

    let fallback_mode: 'sufficient' | 'minimal' | 'failed';
    if (strongHooks.length >= 2) {
      fallback_mode = 'sufficient';
    } else if (decentHooks.length >= 1) {
      fallback_mode = 'minimal';
    } else {
      fallback_mode = 'failed';
    }

    return {
      hooks,
      fallback_mode
    };
  } catch (error) {
    console.error(`[extractHooks] Error:`, error);
    return {
      hooks: [],
      fallback_mode: 'failed'
    };
  }
}
