// Improved content discovery with autoprompt + scoring + bio suppression

export type DiscoveryUrl = {
  url: string;
  title: string;
  source: "autoprompt" | "hypothesis";
};

export interface DiscoveryDebug {
  topics: string[];
  dropped: Array<{ url: string; reason: string }>;
  topScores: Array<{ url: string; score: number; source: DiscoveryUrl["source"] }>;
}

export interface DiscoverResult {
  urls: DiscoveryUrl[];
  debug: DiscoveryDebug;
}

/** --- Generic helpers (project-wide) --- **/

// Generalizable "profile/bio gravity" suppression.
// Not site-specific; catches the common shapes of low-signal pages.
function looksLikeProfileOrDirectory(url: string): boolean {
  const u = url.toLowerCase();

  // URL patterns that tend to be bios, directories, org charts, or about pages
  // Use regex for more precise matching (avoid false positives like "/faculty/course-syllabus")
  const patterns = [
    /\/bio\/?$/,
    /\/bios\//,
    /\/profile\/?$/,
    /\/profiles\//,
    /\/people\/?$/,
    /\/person\//,
    /\/team\/?$/,
    /\/our-team/,
    /\/leadership\/?$/,
    /\/management\/?$/,
    /\/executive\/?$/,
    /\/executives\//,
    /\/board\/?$/,
    /\/directory\/?$/,
    /\/staff\/?$/,
    /\/faculty\/?$/,  // Only match if it's the end of path
    /\/about\/?$/,
    /\/who-we-are/,
    /crunchbase\.com\/person/,
    /wikipedia\.org\/wiki/,
    /imdb\.com\/name/,
  ];

  return patterns.some((p) => p.test(u));
}

function tokenize(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function countOverlap(a: string[], b: string[]): number {
  const setB = new Set(b);
  let n = 0;
  for (const tok of a) if (setB.has(tok)) n += 1;
  return n;
}

// Guardrail against "topic drift" using only title-level signals (cheap).
function isLikelyOffTopic(title: string, topics: string[]): boolean {
  const titleToks = tokenize(title);
  const topicToks = tokenize(topics.join(" "));
  return countOverlap(titleToks, topicToks) === 0;
}

// Heuristic scoring used *only at discovery time* (before you fetch full text).
// Goal: pick sources more likely to contain hook-worthy material (voice, advice, artifacts).
function scoreCandidate(opts: {
  url: string;
  title: string;
  topics: string[];
  source: "autoprompt" | "hypothesis";
}): number {
  const { url, title, topics, source } = opts;
  const u = url.toLowerCase();
  const t = (title || "").toLowerCase();

  let score = 0;

  // Prefer content surfaces where "voice" and long-form tends to exist (generic list).
  const contentDomains = [
    "linkedin.com",
    "medium.com",
    "substack.com",
    "youtube.com",
    "podcasts.apple.com",
    "open.spotify.com",
    "soundcloud.com",
    "anchor.fm",
  ];
  const blogIndicators = ["blog.", "newsletter"];

  if (contentDomains.some((d) => u.includes(d))) score += 3;
  if (blogIndicators.some((ind) => u.includes(ind))) score += 3;

  // Penalize likely profiles/directories.
  if (looksLikeProfileOrDirectory(url)) score -= 4;

  // Topic alignment (prevents broad autoprompt from wandering too far).
  const overlap = countOverlap(tokenize(title), tokenize(topics.join(" ")));
  score += Math.min(overlap, 6);

  // "Hookiness" indicators in title/URL (generic; not person-specific).
  // Weighted: high-value markers get more points
  const highValueMarkers = [
    "interview",
    "podcast",
    "talk",
    "keynote",
    "lecture",
    "workshop",
    "fireside",
    "ama",
    "q&a",
    "how to",
    "framework",
    "tips",
    "rules",
    "guide",
  ];

  const mediumValueMarkers = [
    "writing",
    "communication",
    "email",
    "outreach",
    "career",
    "advice",
    "strategy",
  ];

  if (highValueMarkers.some((m) => t.includes(m) || u.includes(m.replace(/[^a-z0-9]/g, "")))) {
    score += 3;
  } else if (mediumValueMarkers.some((m) => t.includes(m) || u.includes(m.replace(/[^a-z0-9]/g, "")))) {
    score += 1;
  }

  // Prefer deep links over homepages.
  try {
    const path = new URL(url).pathname;
    if (path && path !== "/" && path.split("/").filter(Boolean).length >= 2) score += 1;
  } catch {
    // ignore invalid URLs
  }

  // Lightly prefer hypothesis results when scores tie (they're higher precision).
  if (source === "hypothesis") score += 0.5;

  return score;
}

// URL similarity check for near-duplicate detection
function urlSimilarity(a: string, b: string): number {
  try {
    const pathA = new URL(a).pathname.split('/').filter(Boolean);
    const pathB = new URL(b).pathname.split('/').filter(Boolean);

    const common = pathA.filter(seg => pathB.includes(seg)).length;
    return common / Math.max(pathA.length, pathB.length);
  } catch {
    return 0;
  }
}

// Deduplicate by URL and near-duplicates
function deduplicateByURL<T extends { url: string; score?: number }>(items: T[]): T[] {
  const urlMap = new Map<string, T>();

  for (const item of items) {
    const existing = urlMap.get(item.url);
    if (!existing) {
      // Check for near-duplicates
      let isNearDuplicate = false;
      for (const [existingUrl, existingItem] of urlMap.entries()) {
        if (urlSimilarity(item.url, existingUrl) > 0.8) {
          // Keep the higher-scored one
          if ((item.score ?? 0) > (existingItem.score ?? 0)) {
            urlMap.delete(existingUrl);
            urlMap.set(item.url, item);
          }
          isNearDuplicate = true;
          break;
        }
      }

      if (!isNearDuplicate) {
        urlMap.set(item.url, item);
      }
    }
  }

  return Array.from(urlMap.values());
}

/**
 * Extract key topics from sender intent using Gemini
 */
export async function extractKeyTopics(params: {
  senderIntent: string;
  geminiApiKey: string;
}): Promise<string[]> {
  const { senderIntent, geminiApiKey } = params;

  const prompt = `Extract 3-5 key topics from this intent, including synonyms and adjacent concepts.

Intent: "${senderIntent}"

Return VALID JSON ONLY (no markdown, no explanation):
["topic1", "topic2", "topic3", ...]

Examples:
- "cold email writing tool for students" → ["email writing", "professional communication", "outreach strategies", "business correspondence", "student career skills"]
- "AI scheduling assistant" → ["calendar management", "meeting scheduling", "productivity tools", "time optimization", "workflow automation"]
- "fintech product for small business" → ["financial technology", "small business finance", "payments", "accounting", "business banking"]

Return the JSON array now:`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 256,
          }
        })
      }
    );

    if (!response.ok) {
      console.error('[extractKeyTopics] Gemini API error:', response.status);
      // Fallback: simple tokenization
      return senderIntent.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

    // Extract JSON array (handle markdown code fences)
    let jsonText = text.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\s*\n/, '').replace(/\n```$/, '');
    }

    const topics = JSON.parse(jsonText);

    if (Array.isArray(topics) && topics.length > 0) {
      console.log('[extractKeyTopics] Extracted topics:', topics);
      return topics;
    }

    // Fallback
    return senderIntent.toLowerCase().split(/\s+/).filter(w => w.length > 3);

  } catch (error) {
    console.error('[extractKeyTopics] Error:', error);
    // Fallback: simple tokenization
    return senderIntent.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  }
}

/**
 * Improved content discovery with autoprompt + scoring + bio suppression
 */
export async function discoverContentWithAutoprompt(params: {
  name: string;
  company: string;
  role?: string;
  senderIntent: string;
  exaApiKey: string;
  geminiApiKey: string;
  hypotheses: string[]; // From existing generateSearchHypotheses
}): Promise<DiscoverResult> {
  const { name, company, role, senderIntent, exaApiKey, geminiApiKey, hypotheses } = params;

  console.log('[discoverContentWithAutoprompt] Starting discovery');

  // Extract key topics using Gemini
  const topics = await extractKeyTopics({ senderIntent, geminiApiKey });

  // Broad, reusable autoprompt query template (NOT person-specific).
  const broadQuery = `
Find content where ${name} shares expertise, advice, or work related to:
${topics.join(", ")}

Prefer:
- first-person writing (posts, essays, newsletters)
- interviews, talks, podcasts, transcripts
- concrete artifacts (examples, frameworks, rules, lessons)

Avoid:
- generic biography/profile/directory pages
- pages that repeat titles/roles without substantive content

Context (may help disambiguation): ${name}${role ? ` is ${role}` : ""}${company ? ` at ${company}` : ""}.
`.trim();

  console.log('[discoverContentWithAutoprompt] Autoprompt query:', broadQuery.substring(0, 150) + '...');

  // BROAD SEARCH: Autoprompt
  const broadResponse = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${exaApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: broadQuery,
      useAutoprompt: true,
      type: 'neural',
      numResults: 20, // Tuned down from 30 to reduce noise
      includeDomains: ["linkedin.com", "medium.com", "substack.com", "youtube.com"],
      excludeDomains: ["wikipedia.org", "crunchbase.com"],
    })
  });

  const broadResults = broadResponse.ok
    ? ((await broadResponse.json()).results ?? [])
    : [];

  console.log(`[discoverContentWithAutoprompt] Autoprompt returned ${broadResults.length} results`);

  // SPECIFIC SEARCH: Hypothesis-based queries
  const specificPromises = hypotheses.map(async (h) => {
    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${exaApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: h,
        type: 'neural',
        numResults: 6,
        excludeDomains: ["wikipedia.org", "crunchbase.com"],
      })
    });

    return response.ok ? ((await response.json()).results ?? []) : [];
  });

  const specificNested = await Promise.all(specificPromises);
  const specificResults = specificNested.flat();

  console.log(`[discoverContentWithAutoprompt] Hypotheses returned ${specificResults.length} results`);

  // Tag provenance
  const combined = [
    ...broadResults.map((r: any) => ({
      url: r.url ?? '',
      title: r.title ?? '',
      source: "autoprompt" as const
    })),
    ...specificResults.map((r: any) => ({
      url: r.url ?? '',
      title: r.title ?? '',
      source: "hypothesis" as const
    })),
  ];

  // Deduplicate early (including near-duplicates)
  const deduped = deduplicateByURL(combined);

  console.log(`[discoverContentWithAutoprompt] After deduplication: ${deduped.length} results`);

  const dropped: Array<{ url: string; reason: string }> = [];

  // Score + drift guard + bio suppression
  const scored = deduped
    .map((r) => {
      const offTopic = isLikelyOffTopic(r.title, topics);
      const bioLike = looksLikeProfileOrDirectory(r.url);

      // Drop only the worst offenders: bio-like AND off-topic.
      if (bioLike && offTopic) {
        dropped.push({ url: r.url, reason: "bio/directory + off-topic" });
        return null;
      }

      let score = scoreCandidate({ url: r.url, title: r.title, topics, source: r.source });

      // Heavy downrank if off-topic (keeps a few "maybe relevant" results, but not many)
      if (offTopic) score -= 6;

      // Additional downrank for bio-like pages (we keep some, but they shouldn't dominate)
      if (bioLike) score -= 2;

      return { ...r, score };
    })
    .filter((x): x is { url: string; title: string; source: "autoprompt" | "hypothesis"; score: number } =>
      Boolean(x)
    );

  // Rerank before slicing
  scored.sort((a, b) => b.score - a.score);

  const top = scored.slice(0, 25);

  console.log(`[discoverContentWithAutoprompt] Top 25 results selected, dropped ${dropped.length} URLs`);
  console.log(`[discoverContentWithAutoprompt] Score distribution: min=${Math.min(...top.map(r => r.score))}, max=${Math.max(...top.map(r => r.score))}`);

  return {
    urls: top.map(({ url, title, source }) => ({ url, title, source })),
    debug: {
      topics,
      dropped,
      topScores: top.slice(0, 10).map((r) => ({ url: r.url, score: r.score, source: r.source })),
    },
  };
}
