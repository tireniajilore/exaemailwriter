// Multi-angle autoprompt discovery (autoprompt-first, no hypotheses)

export interface NormalizedIntent {
  compressed: string;  // 20-35 word compressed version
  entities: string[];  // Key entities extracted (names, places, topics)
}

export interface DiscoveryUrl {
  url: string;
  title: string;
  angle: "voice" | "authored" | "teaching" | "social";
}

export interface DiscoveryDebug {
  normalizedIntent: NormalizedIntent;
  dropped: Array<{ url: string; reason: string }>;
  topScores: Array<{ url: string; score: number; angle: string }>;
  angleDistribution: Record<string, number>;
}

export interface DiscoverResult {
  urls: DiscoveryUrl[];
  debug: DiscoveryDebug;
}

/** --- Step 1: Intent Normalization --- **/

/**
 * Normalize sender intent for search:
 * - Compress if too long (>280 chars or >60 words)
 * - Extract key entities (topics, places, roles)
 */
export async function normalizeIntentForSearch(params: {
  senderIntent: string;
  geminiApiKey: string;
}): Promise<NormalizedIntent> {
  const { senderIntent, geminiApiKey } = params;

  const wordCount = senderIntent.split(/\s+/).length;
  const charCount = senderIntent.length;

  // If already short, return as-is with simple entity extraction
  if (charCount <= 280 && wordCount <= 60) {
    return {
      compressed: senderIntent,
      entities: extractEntitiesHeuristic(senderIntent)
    };
  }

  console.log(`[normalizeIntent] Intent too long (${wordCount} words, ${charCount} chars), compressing...`);

  // Try LLM compression
  try {
    const prompt = `Compress this outreach intent to 20-35 words, keeping only the core topic.

Rules:
- Focus on WHAT (topic/product) not HOW (outreach logistics)
- Remove: "reach out", "ask", "chat", "invite", "feedback", "advice", scheduling terms
- Keep: product/tool names, domain expertise, specific topics
- Extract key entities separately

Input: "${senderIntent}"

Return VALID JSON ONLY:
{
  "compressed": "20-35 word compressed version",
  "entities": ["entity1", "entity2", ...]
}

Example:
Input: "I'm building a cold email tool for students applying to MBA programs. Glenn teaches at Stanford GSB and I heard he's great at editing and writing. I want to get his feedback on the tool before we launch and ask if he'd be willing to chat for 15 minutes about our value prop."

Output:
{
  "compressed": "cold email writing tool for MBA students",
  "entities": ["Stanford", "GSB", "editing", "writing", "MBA programs"]
}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 256,
          }
        })
      }
    );

    if (response.ok) {
      const data = await response.json();
      let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      // Strip markdown code fences
      text = text.trim();
      if (text.startsWith('```')) {
        text = text.replace(/^```(?:json)?\s*\n/, '').replace(/\n```$/, '');
      }

      const result = JSON.parse(text);

      if (result.compressed && result.entities && Array.isArray(result.entities)) {
        console.log(`[normalizeIntent] LLM compressed: "${result.compressed}" (${result.compressed.split(' ').length} words)`);
        console.log(`[normalizeIntent] Entities extracted:`, result.entities);
        return result;
      }
    }
  } catch (error) {
    console.error('[normalizeIntent] LLM compression failed:', error);
  }

  // Fallback: heuristic compression
  console.log('[normalizeIntent] Using heuristic fallback');
  return normalizeIntentHeuristic(senderIntent);
}

/**
 * Heuristic fallback for intent normalization
 */
function normalizeIntentHeuristic(senderIntent: string): NormalizedIntent {
  let text = senderIntent;

  // Remove common outreach/scheduling phrases
  const noisePhrases = [
    /reach out to/gi,
    /get in touch/gi,
    /connect with/gi,
    /ask (?:for|about)/gi,
    /quick chat/gi,
    /coffee chat/gi,
    /15 minutes?/gi,
    /30 minutes?/gi,
    /feedback on/gi,
    /advice on/gi,
    /thoughts on/gi,
    /willing to/gi,
    /would you/gi,
    /could you/gi,
    /I'?m building/gi,
    /we'?re building/gi,
    /before (?:we|I) launch/gi,
  ];

  noisePhrases.forEach(pattern => {
    text = text.replace(pattern, '');
  });

  // Take first sentence or first 200 chars
  const firstSentence = text.split(/[.!?]/)[0];
  const compressed = (firstSentence.length > 200 ? firstSentence.substring(0, 200) : firstSentence).trim();

  // Extract entities
  const entities = extractEntitiesHeuristic(senderIntent);

  return { compressed, entities };
}

/**
 * Simple heuristic entity extraction (nouns, capitalized terms, domain terms)
 */
function extractEntitiesHeuristic(text: string): string[] {
  const entities = new Set<string>();

  // Extract capitalized phrases (likely proper nouns)
  const capitalizedMatches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
  capitalizedMatches.forEach(m => {
    if (m.length > 2 && !['The', 'A', 'An', 'I', 'My', 'We', 'Our'].includes(m)) {
      entities.add(m);
    }
  });

  // Extract domain-specific terms (technical, tools, industries)
  const domainTerms = [
    /\b(?:AI|ML|SaaS|API|CRM|ERP|fintech|edtech|healthtech)\b/gi,
    /\b(?:tool|platform|software|app|product|service)\b/gi,
    /\b(?:MBA|PhD|undergraduate|graduate|student|professor|lecturer)\b/gi,
    /\b(?:email|writing|communication|outreach|marketing|sales)\b/gi,
  ];

  domainTerms.forEach(pattern => {
    const matches = text.match(pattern) || [];
    matches.forEach(m => entities.add(m.toLowerCase()));
  });

  return Array.from(entities).slice(0, 8); // Limit to top 8
}

/** --- Step 2 & 3: Multi-Angle Autoprompt --- **/

type SearchAngle = "voice" | "authored" | "teaching" | "social";

interface AngleQuery {
  angle: SearchAngle;
  query: string;
}

/**
 * Build angle-specific queries using normalized intent + entities
 */
function buildAngleQueries(params: {
  name: string;
  company: string;
  role?: string;
  normalizedIntent: NormalizedIntent;
}): AngleQuery[] {
  const { name, company, role, normalizedIntent } = params;

  const context = role && company ? ` (${role} at ${company})` : company ? ` at ${company}` : '';
  const { compressed, entities } = normalizedIntent;

  // Build entity hints (only if we have specific entities)
  const entityHint = entities.length > 0
    ? `, particularly related to ${entities.slice(0, 3).join(", ")}`
    : '';

  return [
    {
      angle: "voice",
      query: `Find interviews, podcasts, talks, or Q&A sessions where ${name}${context} shares advice or insights about ${compressed}${entityHint}. Prefer direct quotes and transcripts.`
    },
    {
      angle: "authored",
      query: `Find articles, essays, blog posts, or newsletters written by ${name}${context} about ${compressed}${entityHint}. Prefer first-person writing.`
    },
    {
      angle: "teaching",
      query: `Find courses, workshops, lectures, or teaching materials where ${name}${context} teaches about ${compressed}${entityHint}. Prefer syllabi and course content.`
    },
    {
      angle: "social",
      query: `Find LinkedIn posts, tweets, or professional updates from ${name}${context} about ${compressed}${entityHint}. Prefer recent short-form advice.`
    },
  ];
}

/** --- Step 4 & 5: Search + Score + Rank --- **/

/**
 * Bio/directory pattern detection (generic, reusable)
 */
function looksLikeProfileOrDirectory(url: string): boolean {
  const u = url.toLowerCase();

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
    /\/faculty\/?$/,
    /\/about\/?$/,
    /\/who-we-are/,
  ];

  return patterns.some(p => p.test(u));
}

/**
 * Check if title is off-topic (zero overlap with intent)
 */
function isLikelyOffTopic(title: string, normalizedIntent: NormalizedIntent): boolean {
  const titleTokens = tokenize(title);
  const intentTokens = tokenize(normalizedIntent.compressed);
  const entityTokens = normalizedIntent.entities.flatMap(e => tokenize(e));

  const allIntentTokens = new Set([...intentTokens, ...entityTokens]);

  // If title has zero overlap with intent or entities, it's off-topic
  return !titleTokens.some(t => allIntentTokens.has(t));
}

function tokenize(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Score candidate URL for quality (discovery-time, before fetch)
 */
function scoreCandidate(params: {
  url: string;
  title: string;
  angle: SearchAngle;
  normalizedIntent: NormalizedIntent;
}): number {
  const { url, title, angle, normalizedIntent } = params;
  const u = url.toLowerCase();
  const t = title.toLowerCase();

  let score = 0;

  // Content-rich domains
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
  const blogIndicators = ["blog.", "/blog/", "newsletter"];

  if (contentDomains.some(d => u.includes(d))) score += 3;
  if (blogIndicators.some(ind => u.includes(ind))) score += 3;

  // Penalize profile/directory patterns
  if (looksLikeProfileOrDirectory(url)) score -= 4;

  // Topic alignment (overlap with compressed intent + entities)
  const titleTokens = tokenize(title);
  const intentTokens = tokenize(normalizedIntent.compressed);
  const entityTokens = normalizedIntent.entities.flatMap(e => tokenize(e));

  const overlap = titleTokens.filter(t =>
    intentTokens.includes(t) || entityTokens.includes(t)
  ).length;

  score += Math.min(overlap, 6);

  // High-value hookiness markers
  const highValueMarkers = [
    "interview",
    "podcast",
    "talk",
    "keynote",
    "lecture",
    "workshop",
    "how to",
    "framework",
    "tips",
    "rules",
    "guide",
  ];

  const mediumValueMarkers = [
    "writing",
    "communication",
    "advice",
    "strategy",
    "teaches",
  ];

  if (highValueMarkers.some(m => t.includes(m) || u.includes(m.replace(/\s+/g, "")))) {
    score += 3;
  } else if (mediumValueMarkers.some(m => t.includes(m) || u.includes(m.replace(/\s+/g, "")))) {
    score += 1;
  }

  // Deep link bonus
  try {
    const path = new URL(url).pathname;
    if (path && path !== "/" && path.split("/").filter(Boolean).length >= 2) {
      score += 1;
    }
  } catch {
    // ignore
  }

  // Angle-specific bonuses
  if (angle === "voice" || angle === "authored") {
    score += 1; // Prefer direct voice/writing over teaching/social
  }

  return score;
}

/**
 * URL similarity for near-duplicate detection
 */
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

/**
 * Deduplicate by URL and near-duplicates
 */
function deduplicateByURL<T extends { url: string; score?: number }>(items: T[]): T[] {
  const urlMap = new Map<string, T>();

  for (const item of items) {
    // Normalize URL
    let normalizedUrl = item.url.toLowerCase();
    try {
      const parsed = new URL(normalizedUrl);
      // Remove UTM params
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(param => {
        parsed.searchParams.delete(param);
      });
      // Remove trailing slash
      parsed.pathname = parsed.pathname.replace(/\/$/, '');
      normalizedUrl = parsed.toString();
    } catch {
      // ignore invalid URLs
    }

    const existing = urlMap.get(normalizedUrl);
    if (!existing) {
      // Check for near-duplicates
      let isNearDuplicate = false;
      for (const [existingUrl, existingItem] of urlMap.entries()) {
        if (urlSimilarity(normalizedUrl, existingUrl) > 0.8) {
          // Keep the higher-scored one
          if ((item.score ?? 0) > (existingItem.score ?? 0)) {
            urlMap.delete(existingUrl);
            urlMap.set(normalizedUrl, item);
          }
          isNearDuplicate = true;
          break;
        }
      }

      if (!isNearDuplicate) {
        urlMap.set(normalizedUrl, item);
      }
    }
  }

  return Array.from(urlMap.values());
}

/**
 * Ensure angle diversity in top results
 * Guarantees at least minPerAngle URLs from each angle (if available)
 */
function ensureAngleDiversity<T extends { angle: string; score: number }>(
  scored: T[],
  minPerAngle: number = 2
): T[] {
  const byAngle = new Map<string, T[]>();

  // Group by angle
  scored.forEach(item => {
    if (!byAngle.has(item.angle)) {
      byAngle.set(item.angle, []);
    }
    byAngle.get(item.angle)!.push(item);
  });

  // Sort each angle's results by score
  byAngle.forEach(items => items.sort((a, b) => b.score - a.score));

  const diverse: T[] = [];

  // First pass: guarantee minPerAngle from each angle
  const angles = Array.from(byAngle.keys());
  for (let i = 0; i < minPerAngle; i++) {
    angles.forEach(angle => {
      const items = byAngle.get(angle)!;
      if (items.length > i) {
        diverse.push(items[i]);
      }
    });
  }

  // Second pass: fill remaining slots with highest-scored items
  const remaining = scored.filter(item => !diverse.includes(item));
  remaining.sort((a, b) => b.score - a.score);

  return [...diverse, ...remaining];
}

/** --- Main Discovery Function --- **/

export async function discoverContentMultiAngle(params: {
  name: string;
  company: string;
  role?: string;
  senderIntent: string;
  exaApiKey: string;
  geminiApiKey: string;
}): Promise<DiscoverResult> {
  const { name, company, role, senderIntent, exaApiKey, geminiApiKey } = params;

  console.log('[discoverMultiAngle] Starting multi-angle autoprompt discovery');

  // Step 1: Normalize intent
  const normalizedIntent = await normalizeIntentForSearch({ senderIntent, geminiApiKey });

  console.log(`[discoverMultiAngle] Normalized intent: "${normalizedIntent.compressed}"`);
  console.log(`[discoverMultiAngle] Entities:`, normalizedIntent.entities);

  // Step 2 & 3: Build angle queries
  const angleQueries = buildAngleQueries({ name, company, role, normalizedIntent });

  console.log(`[discoverMultiAngle] Searching ${angleQueries.length} angles...`);

  // Exa excludeDomains for bio suppression (generic patterns)
  const excludeDomains = [
    "wikipedia.org",
    "crunchbase.com",
    "*.edu/people",
    "*.edu/faculty",
    "*.edu/staff",
    "*.edu/leadership",
    "*.edu/team",
  ];

  // Step 4: Search all angles in parallel
  const anglePromises = angleQueries.map(async ({ angle, query }) => {
    try {
      const response = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${exaApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          useAutoprompt: true,
          type: 'neural',
          numResults: 8, // 4 angles × 8 = 32 total
          excludeDomains,
        })
      });

      if (!response.ok) {
        console.error(`[discoverMultiAngle] ${angle} search failed:`, response.status);
        return [];
      }

      const data = await response.json();
      const results = data.results ?? [];

      console.log(`[discoverMultiAngle] ${angle}: ${results.length} results`);

      return results.map((r: any) => ({
        url: r.url ?? '',
        title: r.title ?? '',
        angle
      }));
    } catch (error) {
      console.error(`[discoverMultiAngle] ${angle} error:`, error);
      return [];
    }
  });

  const angleResults = await Promise.all(anglePromises);
  const allResults = angleResults.flat();

  console.log(`[discoverMultiAngle] Total results before dedup: ${allResults.length}`);

  // Step 5: Deduplicate
  const deduped = deduplicateByURL(allResults);

  console.log(`[discoverMultiAngle] After deduplication: ${deduped.length}`);

  const dropped: Array<{ url: string; reason: string }> = [];

  // Step 5b/5c: Score + filter
  const scored = deduped
    .map(r => {
      const offTopic = isLikelyOffTopic(r.title, normalizedIntent);
      const bioLike = looksLikeProfileOrDirectory(r.url);

      // Hard drop: bio-like AND off-topic (worst offenders)
      if (bioLike && offTopic) {
        dropped.push({ url: r.url, reason: "bio/directory + off-topic" });
        return null;
      }

      let score = scoreCandidate({ url: r.url, title: r.title, angle: r.angle, normalizedIntent });

      // Downrank off-topic
      if (offTopic) score -= 6;

      // Downrank bio-like (but keep if on-topic)
      if (bioLike) score -= 2;

      return { ...r, score };
    })
    .filter((x): x is { url: string; title: string; angle: SearchAngle; score: number } =>
      Boolean(x)
    );

  // Step 5d: Ensure angle diversity
  const diverse = ensureAngleDiversity(scored, 2); // Min 2 per angle

  // Take top 25
  const top = diverse.slice(0, 25);

  console.log(`[discoverMultiAngle] Top 25 selected, dropped ${dropped.length} URLs`);
  console.log(`[discoverMultiAngle] Score range: ${Math.min(...top.map(r => r.score))}-${Math.max(...top.map(r => r.score))}`);

  // Angle distribution
  const angleDistribution: Record<string, number> = {};
  top.forEach(r => {
    angleDistribution[r.angle] = (angleDistribution[r.angle] || 0) + 1;
  });

  console.log(`[discoverMultiAngle] Angle distribution:`, angleDistribution);

  return {
    urls: top.map(({ url, title, angle }) => ({ url, title, angle })),
    debug: {
      normalizedIntent,
      dropped,
      topScores: top.slice(0, 10).map(r => ({ url: r.url, score: r.score, angle: r.angle })),
      angleDistribution,
    },
  };
}
