// Exa Search + Contents API implementation for phased research

export interface IdentityResult {
  identityDecision: 'PASS' | 'FAIL';
  confidence: number;
  results: Array<{ url: string; title: string; snippet?: string }>;
}

export interface ContentDiscoveryResult {
  urls: Array<{ id: string; url: string; title: string; score: number }>;
  foundCount: number;
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

  if (!senderIntent || !credibilityStory) {
    // Fall back to basic searches if we don't have the context
    return [
      `${name} ${company} ${role ?? ''} projects background`,
      `${name} ${company} recent work`,
      `${name} ${company} interview podcast article`
    ];
  }

  const prompt = `You are helping craft targeted research queries for a cold email to ${name} at ${company}${role ? ` (${role})` : ''}.

SENDER'S INTENT:
${senderIntent}

SENDER'S CREDIBILITY STORY:
${credibilityStory}

TASK: Generate 3 specific search hypotheses about what aspects of ${name}'s work would be most relevant to the sender's intent.

Think about:
1. What shared interests, challenges, or domains exist between sender and recipient?
2. What specific projects, initiatives, or topics has ${name} likely worked on that align with the sender's intent?
3. What unique angles could create a strong connection?

Return ONLY a JSON array of 3 search query strings (no explanations):
["search query 1", "search query 2", "search query 3"]

Each query should combine ${name}'s name, company, and a specific topic/hypothesis.

Example format:
["Jane Smith Stripe building payment infrastructure emerging markets", "Jane Smith Stripe scaling fintech teams", "Jane Smith engineering leadership financial inclusion"]`;

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
            maxOutputTokens: 512,
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
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    // Extract JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      console.error(`[generateSearchHypotheses] No JSON array found`);
      return [
        `${name} ${company} ${role ?? ''} projects`,
        `${name} ${company} recent work`,
        `${name} ${company} leadership`
      ];
    }

    const hypotheses = JSON.parse(jsonMatch[0]);

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
      foundCount: uniqueResults.length
    };
  } catch (error) {
    console.error(`[discoverContent] Error:`, error);
    return {
      urls: [],
      foundCount: 0
    };
  }
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
        ...(senderIntent ? {
          highlights: {
            query: senderIntent,
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

  // Build the prompt
  const contentSummary = docs.map((doc, i) =>
    `Source ${i + 1}: ${doc.title}\nURL: ${doc.url}\n${doc.highlights && doc.highlights.length > 0 ? 'Highlights:\n' + doc.highlights.join('\n') : doc.text.slice(0, 1000)}`
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
            maxOutputTokens: 2048,
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
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`[extractHooks] No JSON found in response`);
      return {
        hooks: [],
        fallback_mode: 'failed'
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const hooks: HookPack[] = (parsed.hooks ?? []).slice(0, 3);

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
