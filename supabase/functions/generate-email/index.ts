import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PROMPT_VERSION = 'v6.0-exa-only';
const MODEL_NAME = 'google/gemini-2.5-flash';
const RESEARCH_MODEL_NAME = 'google/gemini-2.5-flash';

// ============= SUPER PROMPT (Updated for V2) =============
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
- If researched facts are provided, use at most 1–2 facts
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

// ============= VALIDATOR =============

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

interface ValidationResult {
  valid: boolean;
  errors: string[];
  likeYouCount: number;
  wordCount: number;
  clicheCount: number;
}

interface HookFact {
  claim: string;
  source_url: string;
  evidence_quote: string;
  why_relevant: string;
  bridge_type: 'intent' | 'credibility' | 'curiosity';
  hook_score: number;
}

interface ExaResult {
  url: string;
  title: string;
  snippet: string;
  text?: string;
  score?: number;
}

interface EnforcementResults {
  did_retry: boolean;
  failures_first_pass: string[];
  failures_retry: string[];
}

// ============= QUERY PLAN TYPES =============
type AskType = "chat" | "feedback" | "referral" | "job" | "other";

interface QueryPlan {
  queries: string[];
  intent_keywords: string[];
  intent_angle: string;
}

interface ResearchDebug {
  queryPlan: QueryPlan;
  queriesUsed: string[];
  urlScores: { url: string; title: string; score: number; reasons: string[] }[];
  urlsFetched: string[];
  factRejectionReasons?: string[];
  notes?: string;
}

// ============= KEYWORD EXTRACTION =============

const STOPWORDS = new Set([
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it', 'they', 'them',
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'so', 'as', 'at', 'by',
  'for', 'in', 'of', 'on', 'to', 'with', 'from', 'up', 'down', 'is', 'are',
  'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
  'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
  'this', 'that', 'these', 'those', 'what', 'which', 'who', 'how', 'when',
  'where', 'why', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'not', 'only', 'same', 'than', 'too', 'very',
  'just', 'also', 'now', 'here', 'there', 'about', 'into', 'over', 'after',
  'before', 'between', 'under', 'again', 'further', 'once', 'during', 'out',
  'through', 'because', 'while', 'although', 'though', 'since', 'until',
  'unless', 'however', 'therefore', 'thus', 'hence', 'etc', 'like', 'want',
  'need', 'get', 'got', 'getting', 'make', 'made', 'making', 'take', 'took',
  'taking', 'know', 'knew', 'knowing', 'think', 'thought', 'thinking', 'see',
  'saw', 'seeing', 'come', 'came', 'coming', 'go', 'went', 'going', 'look',
  'looking', 'use', 'using', 'find', 'finding', 'give', 'giving', 'tell',
  'telling', 'ask', 'asking', 'work', 'working', 'seem', 'seeming', 'feel',
  'feeling', 'try', 'trying', 'leave', 'leaving', 'call', 'calling', 'keep',
  'keeping', 'let', 'letting', 'begin', 'beginning', 'show', 'showing',
  'hear', 'hearing', 'play', 'playing', 'run', 'running', 'move', 'moving',
  'live', 'living', 'believe', 'believing', 'bring', 'bringing', 'happen',
  'write', 'writing', 'provide', 'sit', 'stand', 'lose', 'pay', 'meet',
  'include', 'continue', 'set', 'learn', 'change', 'lead', 'understand',
  'watch', 'follow', 'stop', 'create', 'speak', 'read', 'allow', 'add',
  'spend', 'grow', 'open', 'walk', 'win', 'offer', 'remember', 'love',
  'consider', 'appear', 'buy', 'wait', 'serve', 'die', 'send', 'expect',
  'build', 'stay', 'fall', 'cut', 'reach', 'kill', 'remain', 'suggest',
  'raise', 'pass', 'sell', 'require', 'report', 'decide', 'pull'
]);

const GENERIC_WORDS = new Set([
  'help', 'advice', 'connect', 'career', 'journey', 'growth', 'success',
  'opportunity', 'excited', 'interested', 'learn', 'explore', 'discuss',
  'chat', 'talk', 'meeting', 'call', 'share', 'insights', 'thoughts',
  'perspective', 'experience', 'background', 'story', 'path', 'role',
  'position', 'company', 'team', 'organization', 'industry', 'space',
  'field', 'area', 'sector', 'market', 'world', 'way', 'things', 'stuff',
  'people', 'person', 'someone', 'anyone', 'everyone', 'years', 'time',
  'today', 'tomorrow', 'week', 'month', 'year', 'future', 'past', 'current',
  'new', 'old', 'great', 'good', 'best', 'better', 'big', 'small', 'first',
  'last', 'next', 'different', 'important', 'able', 'right', 'high', 'long',
  'little', 'own', 'young', 'sure', 'real', 'possible', 'possible', 'public',
  'early', 'late', 'hard', 'major', 'general', 'local', 'certain', 'clear'
]);

function extractKeywords(text: string): string[] {
  // Tokenize: split on whitespace and punctuation, lowercase
  const tokens = text.toLowerCase()
    .replace(/[^\w\s\-\/]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
  
  // Extract phrases (2-3 word combinations that might be meaningful)
  const phrases: string[] = [];
  const words = text.toLowerCase().split(/\s+/);
  for (let i = 0; i < words.length - 1; i++) {
    const w1 = words[i].replace(/[^\w\-]/g, '');
    const w2 = words[i + 1].replace(/[^\w\-]/g, '');
    if (w1.length > 2 && w2.length > 2 && !STOPWORDS.has(w1) && !STOPWORDS.has(w2)) {
      phrases.push(`${w1} ${w2}`);
    }
  }
  
  // Filter tokens
  const filtered = tokens.filter(t => 
    !STOPWORDS.has(t) && 
    !GENERIC_WORDS.has(t) &&
    t.length > 2
  );
  
  // Dedupe and prioritize
  const seen = new Set<string>();
  const result: string[] = [];
  
  // Add phrases first (more specific)
  for (const p of phrases) {
    if (!seen.has(p) && result.length < 10) {
      seen.add(p);
      result.push(p);
    }
  }
  
  // Then single words
  for (const w of filtered) {
    if (!seen.has(w) && result.length < 15) {
      seen.add(w);
      result.push(w);
    }
  }
  
  return result;
}

function determineIntentAngle(keywords: string[]): string {
  const keywordStr = keywords.join(' ').toLowerCase();
  
  if (keywordStr.match(/scale|growth|market|expand|international|global|latam|emea|apac/)) {
    return 'shared scaling challenge';
  }
  if (keywordStr.match(/regulated|compliance|privacy|security|audit|legal|policy/)) {
    return 'shared regulatory constraint';
  }
  if (keywordStr.match(/ai|ml|machine learning|automation|data|analytics/)) {
    return 'shared technical domain';
  }
  if (keywordStr.match(/founder|startup|build|launch|ship|product/)) {
    return 'shared builder experience';
  }
  if (keywordStr.match(/ops|operations|process|efficiency|workflow/)) {
    return 'shared operational focus';
  }
  if (keywordStr.match(/mission|impact|underrepresented|diversity|social/)) {
    return 'shared mission/value';
  }
  if (keywordStr.match(/pivot|transition|career|decision|tradeoff/)) {
    return 'shared moment/decision';
  }
  
  return 'shared domain problem';
}

// ============= QUERY PLAN BUILDER (WITH DISAMBIGUATION) =============

function buildExaQueryPlan(input: {
  recipientName: string;
  recipientCompany: string;
  recipientRole: string;
  reachingOutBecause: string;
  credibilityStory: string;
  askType: AskType;
}): QueryPlan {
  const { recipientName, recipientCompany, recipientRole, reachingOutBecause, credibilityStory } = input;
  
  // Extract keywords from sender intent
  const reasonKeywords = extractKeywords(reachingOutBecause).slice(0, 8);
  const storyKeywords = extractKeywords(credibilityStory).slice(0, 5);
  const intentKeywords = [...new Set([...reasonKeywords, ...storyKeywords])].slice(0, 10);
  
  const intentAngle = determineIntentAngle(intentKeywords);
  
  console.log('Intent keywords:', intentKeywords);
  console.log('Intent angle:', intentAngle);
  
  const queries: string[] = [];
  
  // Get top 2 keywords for query building
  const kw1 = intentKeywords[0] || '';
  const kw2 = intentKeywords[1] || '';
  const kwPhrase = intentKeywords.find(k => k.includes(' ')) || '';
  
  // CRITICAL: All niche queries now include company for disambiguation
  // Tier A: Long-form / opinion / interview content (with company)
  if (kw1) {
    queries.push(`"${recipientName}" ${recipientCompany} interview ${kw1}${kw2 ? ' ' + kw2 : ''}`);
  }
  if (kw1) {
    queries.push(`"${recipientName}" ${recipientCompany} podcast ${kw1}`);
  }
  if (kw1) {
    queries.push(`"${recipientName}" ${recipientCompany} talk OR keynote ${kw1}`);
  }
  if (kw1) {
    queries.push(`"${recipientName}" ${recipientCompany} wrote OR essay ${kw1}`);
  }
  if (kwPhrase) {
    queries.push(`"${recipientName}" ${recipientCompany} "${kwPhrase}"`);
  }
  
  // Tier B: Initiative / project angle (with company)
  if (kw1) {
    queries.push(`"${recipientName}" ${recipientCompany} ${kw1} initiative OR program`);
  }
  
  // Dedupe and limit to 6 queries
  const uniqueQueries = [...new Set(queries)].slice(0, 6);
  
  return {
    queries: uniqueQueries,
    intent_keywords: intentKeywords,
    intent_angle: intentAngle,
  };
}

// ============= IDENTITY ANCHOR QUERIES =============

function buildIdentityQueries(recipientName: string, recipientCompany: string, recipientRole: string): string[] {
  // These queries are meant to be CORRECT, not niche
  // They establish who the person is before we search for niche content
  return [
    `"${recipientName}" ${recipientCompany} ${recipientRole}`,
    `"${recipientName}" ${recipientCompany} executive biography`,
  ];
}

// ============= IDENTITY VALIDATION =============

interface IdentityScoreResult {
  score: number;
  reasons: string[];
  isIdentityMatch: boolean;
}

function scoreIdentityMatch(
  url: string, 
  title: string, 
  text: string, 
  recipientCompany: string, 
  recipientRole: string
): IdentityScoreResult {
  const lowerTitle = title.toLowerCase();
  const lowerText = text.toLowerCase();
  const lowerCompany = recipientCompany.toLowerCase();
  const combinedContent = `${lowerTitle} ${lowerText}`;
  
  let score = 0;
  const reasons: string[] = [];
  
  // Positive: Company name match
  if (combinedContent.includes(lowerCompany)) {
    score += 3;
    reasons.push(`+3: company match "${recipientCompany}"`);
  }
  
  // Positive: Role keywords match
  const roleKeywords = recipientRole.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  for (const keyword of roleKeywords) {
    if (keyword.length > 3 && combinedContent.includes(keyword)) {
      score += 2;
      reasons.push(`+2: role keyword "${keyword}"`);
      break; // Only count once
    }
  }
  
  // Negative: Wrong-domain keywords (common disambiguation conflicts)
  const wrongDomainPatterns = [
    // Music/entertainment (Chris Young the singer)
    { patterns: ['country music', 'country singer', 'tour', 'album', 'song', 'lyrics', 'nashville', 'grammy nomination', 'concert'], penalty: -5, desc: 'music industry' },
    // Sports (common name conflicts)
    { patterns: ['nfl', 'nba', 'mlb', 'quarterback', 'pitcher', 'drafted', 'touchdown', 'home run'], penalty: -5, desc: 'sports' },
    // Other entertainment
    { patterns: ['actor', 'actress', 'movie star', 'hollywood', 'tv show', 'reality tv'], penalty: -4, desc: 'entertainment' },
  ];
  
  for (const { patterns, penalty, desc } of wrongDomainPatterns) {
    for (const pattern of patterns) {
      if (combinedContent.includes(pattern) && !combinedContent.includes(lowerCompany)) {
        score += penalty;
        reasons.push(`${penalty}: wrong domain "${desc}" (found "${pattern}")`);
        break;
      }
    }
  }
  
  // Threshold: score >= 4 means confident identity match
  const isIdentityMatch = score >= 4;
  
  return { score, reasons, isIdentityMatch };
}

// ============= URL SCORING (NICHE-ENOUGH) =============

interface UrlScoreResult {
  score: number;
  reasons: string[];
}

function scoreUrl(url: string, title?: string): UrlScoreResult {
  const lowerUrl = url.toLowerCase();
  const lowerTitle = (title || '').toLowerCase();
  
  let score = 0;
  const reasons: string[] = [];
  
  // Positive signals (artifacts)
  const artifactPatterns = [
    'podcast', 'interview', 'transcript', 'talk', 'keynote', 'panel',
    'blog', 'essay', 'op-ed', 'newsletter', 'fireside', 'conversation',
    'wrote', 'writes', 'author'
  ];
  
  for (const pattern of artifactPatterns) {
    if (lowerUrl.includes(pattern) || lowerTitle.includes(pattern)) {
      score += 3;
      reasons.push(`+3: artifact pattern "${pattern}"`);
      break;
    }
  }
  
  // Publication/event sites boost
  const publicationDomains = [
    'medium.com', 'substack.com', 'forbes.com', 'techcrunch.com', 'wired.com',
    'hbr.org', 'mit.edu', 'stanford.edu', 'ycombinator.com', 'firstround.com',
    'a16z.com', 'sequoia.com', 'nfx.com', 'reforge.com', 'lenny', 'stratechery',
    'fastcompany.com', 'inc.com', 'entrepreneur.com', 'bloomberg.com',
    'axios.com', 'protocol.com', 'theinformation.com', 'podcasts', 'youtube.com/watch'
  ];
  
  for (const domain of publicationDomains) {
    if (lowerUrl.includes(domain)) {
      score += 2;
      reasons.push(`+2: publication domain "${domain}"`);
      break;
    }
  }
  
  // LinkedIn penalty (but don't block entirely)
  if (lowerUrl.includes('linkedin.com')) {
    score -= 5;
    reasons.push('-5: LinkedIn');
  }
  
  // Bio/about page penalty
  const bioPatterns = ['/about', '/bio', '/leadership', '/team', '/company', '/executive', 'wikipedia.org'];
  for (const pattern of bioPatterns) {
    if (lowerUrl.includes(pattern)) {
      score -= 4;
      reasons.push(`-4: bio pattern "${pattern}"`);
      break;
    }
  }
  
  // Title penalties
  const badTitlePatterns = ['executive profile', 'leadership', 'about', 'biography', 'board of directors'];
  for (const pattern of badTitlePatterns) {
    if (lowerTitle.includes(pattern)) {
      score -= 3;
      reasons.push(`-3: bad title pattern "${pattern}"`);
      break;
    }
  }
  
  return { score, reasons };
}

function isNicheEnoughResult(url: string, title: string, snippet: string): boolean {
  const scoreResult = scoreUrl(url, title);
  
  // Must have positive score to be considered niche
  if (scoreResult.score < 0) return false;
  
  // Check snippet for opinion/viewpoint indicators
  const opinionIndicators = [
    'i think', 'i believe', 'we learned', 'lesson', 'mistake', 'challenge',
    'surprised', 'realized', 'decision', 'why we', 'how we', 'built', 'shipped',
    'launched', 'grew', 'scaled', 'pivoted', 'failed', 'succeeded'
  ];
  
  const lowerSnippet = snippet.toLowerCase();
  const hasOpinion = opinionIndicators.some(ind => lowerSnippet.includes(ind));
  
  if (hasOpinion) return true;
  
  // If no opinion but score is high enough, still include
  return scoreResult.score >= 3;
}

// ============= VALIDATOR HELPERS =============

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
    if (lowerText.includes(cliche)) {
      count++;
    }
  }
  return count;
}

function hasBracketPlaceholders(text: string): boolean {
  return /\[[A-Za-z]+\]/.test(text);
}

function validateEmail(
  rawText: string,
  recipientFirstName: string
): ValidationResult {
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

// ============= HELPERS =============

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

// ============= EXA SEARCH WITH CONTENT =============

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
        text: {
          maxCharacters: 3000, // Get more content for extraction
        },
        highlights: {
          numSentences: 5,
        },
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

// ============= RESEARCH PIPELINE (EXA ONLY WITH IDENTITY ANCHOR) =============

interface IdentityAnchorResult {
  confirmed: boolean;
  identityUrls: string[];
  identityScores: { url: string; title: string; score: number; reasons: string[]; isIdentityMatch: boolean }[];
  notes?: string;
}

async function performResearch(
  recipientName: string,
  recipientCompany: string,
  recipientRole: string,
  reachingOutBecause: string,
  credibilityStory: string,
  askType: AskType,
  exaApiKey: string
): Promise<{
  queryPlan: QueryPlan;
  queriesUsed: string[];
  exaResults: ExaResult[];
  selectedResults: ExaResult[];
  debug: ResearchDebug;
  identityAnchor: IdentityAnchorResult;
}> {
  
  // ============= STEP 0: Identity Anchor (ALWAYS RUN FIRST) =============
  console.log('=== STEP 0: Identity Anchor ===');
  
  const identityQueries = buildIdentityQueries(recipientName, recipientCompany, recipientRole);
  console.log('Identity queries:', identityQueries);
  
  const identityScores: { url: string; title: string; score: number; reasons: string[]; isIdentityMatch: boolean }[] = [];
  let identityResults: ExaResult[] = [];
  const identityQueriesUsed: string[] = [];
  
  // Run identity queries (max 2)
  for (const query of identityQueries.slice(0, 2)) {
    identityQueriesUsed.push(query);
    const results = await exaSearchWithContent(query, exaApiKey, 5); // Only top 5 for identity
    
    for (const r of results) {
      if (!identityResults.find(existing => existing.url === r.url)) {
        identityResults.push(r);
        
        // Score for identity match (not niche-ness)
        const identityScore = scoreIdentityMatch(
          r.url, 
          r.title, 
          r.text || r.snippet || '', 
          recipientCompany, 
          recipientRole
        );
        identityScores.push({
          url: r.url,
          title: r.title,
          score: identityScore.score,
          reasons: identityScore.reasons,
          isIdentityMatch: identityScore.isIdentityMatch,
        });
      }
    }
  }
  
  // Sort by identity score
  identityScores.sort((a, b) => b.score - a.score);
  console.log('Identity scores:', identityScores.map(s => ({ 
    url: s.url.substring(0, 50), 
    score: s.score, 
    match: s.isIdentityMatch 
  })));
  
  // Check if we have confident identity match (score >= 4)
  const confirmedIdentityUrls = identityScores
    .filter(s => s.isIdentityMatch)
    .map(s => s.url);
  
  const identityAnchor: IdentityAnchorResult = {
    confirmed: confirmedIdentityUrls.length > 0,
    identityUrls: confirmedIdentityUrls.slice(0, 2),
    identityScores,
    notes: confirmedIdentityUrls.length === 0 
      ? 'Could not confidently disambiguate recipient identity; name may be ambiguous.' 
      : undefined,
  };
  
  console.log('Identity anchor confirmed:', identityAnchor.confirmed);
  
  // If no identity match, return early with empty results
  if (!identityAnchor.confirmed) {
    console.log('STOPPING: No confident identity match found');
    
    const emptyQueryPlan: QueryPlan = {
      queries: [],
      intent_keywords: [],
      intent_angle: 'identity disambiguation failed',
    };
    
    const debug: ResearchDebug = {
      queryPlan: emptyQueryPlan,
      queriesUsed: identityQueriesUsed,
      urlScores: [],
      urlsFetched: [],
      notes: 'Research stopped: could not confirm recipient identity. Name may be ambiguous.',
    };
    
    return {
      queryPlan: emptyQueryPlan,
      queriesUsed: identityQueriesUsed,
      exaResults: identityResults,
      selectedResults: [],
      debug,
      identityAnchor,
    };
  }
  
  // ============= STEP 1: Build Niche Query Plan =============
  console.log('=== STEP 1: Build Niche Query Plan ===');
  
  const queryPlan = buildExaQueryPlan({
    recipientName,
    recipientCompany,
    recipientRole,
    reachingOutBecause,
    credibilityStory,
    askType,
  });
  
  console.log('Niche query plan:', queryPlan);
  
  const queriesUsed: string[] = [...identityQueriesUsed];
  let allResults: ExaResult[] = [...identityResults];
  const urlScores: { url: string; title: string; score: number; reasons: string[] }[] = [];
  
  // ============= STEP 2: Exa Niche Search with Early Stopping =============
  console.log('=== STEP 2: Niche Exa Search ===');
  
  const MAX_QUERIES = 3;
  const MIN_NICHE_RESULTS = 2;
  
  for (let i = 0; i < Math.min(queryPlan.queries.length, MAX_QUERIES); i++) {
    const query = queryPlan.queries[i];
    queriesUsed.push(query);
    
    const results = await exaSearchWithContent(query, exaApiKey);
    
    // Dedupe by URL and FILTER by identity match
    for (const r of results) {
      if (!allResults.find(existing => existing.url === r.url)) {
        allResults.push(r);
        
        // First check identity match (must pass)
        const identityScore = scoreIdentityMatch(
          r.url, 
          r.title, 
          r.text || r.snippet || '', 
          recipientCompany, 
          recipientRole
        );
        
        // If wrong person, skip entirely
        if (identityScore.score < 0) {
          console.log(`Skipping ${r.url.substring(0, 50)} - identity score ${identityScore.score} (wrong person)`);
          continue;
        }
        
        // Then score for niche-ness
        const nicheScore = scoreUrl(r.url, r.title);
        
        // Combined score: identity match is prerequisite, then niche score
        const combinedScore = identityScore.isIdentityMatch 
          ? nicheScore.score + 2 // Bonus for confirmed identity
          : nicheScore.score - 2; // Penalty if not confirmed
        
        urlScores.push({
          url: r.url,
          title: r.title,
          score: combinedScore,
          reasons: [...identityScore.reasons, ...nicheScore.reasons],
        });
      }
    }
    
    // Check if we have enough niche results with identity match
    const nicheWithIdentity = urlScores.filter(s => s.score >= 3);
    console.log(`After query ${i + 1}: ${allResults.length} total, ${nicheWithIdentity.length} niche+identity`);
    
    if (nicheWithIdentity.length >= MIN_NICHE_RESULTS) {
      console.log('Early stopping: enough niche+identity results found');
      break;
    }
  }
  
  // ============= STEP 3: Score and Select Top Results =============
  console.log('=== STEP 3: Score and Select ===');
  
  // Sort by combined score
  urlScores.sort((a, b) => b.score - a.score);
  console.log('URL scores (identity+niche):', urlScores.map(s => ({ url: s.url.substring(0, 60), score: s.score })));
  
  // Select top 2-4 results that pass both identity and niche checks
  const selectedResults: ExaResult[] = [];
  const urlsFetched: string[] = [];
  
  for (const scored of urlScores) {
    if (selectedResults.length >= 4) break;
    
    // Only include if combined score is positive (identity confirmed + some niche value)
    if (scored.score >= 1) {
      const result = allResults.find(r => r.url === scored.url);
      if (result && !selectedResults.includes(result)) {
        selectedResults.push(result);
        urlsFetched.push(result.url);
      }
    }
  }
  
  console.log(`Selected ${selectedResults.length} results for extraction:`, urlsFetched);
  
  const debug: ResearchDebug = {
    queryPlan,
    queriesUsed,
    urlScores,
    urlsFetched,
  };
  
  return {
    queryPlan,
    queriesUsed,
    exaResults: allResults.slice(0, 8),
    selectedResults,
    debug,
    identityAnchor,
  };
}

// ============= HOOK FACT EXTRACTION =============

async function extractHookFacts(
  recipientName: string,
  recipientRole: string,
  recipientCompany: string,
  selectedResults: ExaResult[],
  reachingOutBecause: string,
  intentKeywords: string[],
  LOVABLE_API_KEY: string
): Promise<{ facts: HookFact[]; rejectionReasons: string[] }> {
  console.log('=== STEP 4: Hook Fact Extraction ===');
  
  if (selectedResults.length === 0) {
    console.log('No content to extract facts from');
    return { facts: [], rejectionReasons: ['No search results to extract from'] };
  }
  
  // Build context from Exa content
  const sourcesContext = selectedResults.map((result, i) => `
SOURCE ${i + 1}: ${result.url}
Title: ${result.title}
Content:
${result.text || result.snippet || '(no content)'}
`).join('\n---\n');

  const keywordsContext = intentKeywords.length > 0 
    ? `\nSender's intent keywords: ${intentKeywords.join(', ')}`
    : '';

  const extractionPrompt = `You are analyzing public content about ${recipientName}, ${recipientRole} at ${recipientCompany}.

The sender wants to reach out because: "${reachingOutBecause}"${keywordsContext}

Here are the sources found:
${sourcesContext}

Extract 0-3 "hook facts" that could be used to personalize a cold email. 

A NICHE-ENOUGH hook fact is:
✓ A specific opinion/idea they expressed (with context)
✓ A specific initiative with a "why" angle
✓ A notable takeaway from a talk/podcast/interview
✓ A concrete non-obvious detail that bridges to sender story

NOT niche-enough (REJECT these):
✗ "X is EVP at Y" (just job title)
✗ "X joined Y in 2023" (just timeline)
✗ "X previously worked at Z" (just history)
✗ "X co-founded A" without an angle
✗ "X is known for..." (generic)
✗ Generic awards or "featured in" lists

STRICT REQUIREMENTS for each fact:
- claim: A specific, interesting observation (not generic)
- source_url: The exact URL from the sources above
- evidence_quote: 8-25 words pulled DIRECTLY from the source content
- why_relevant: Why this matters for the outreach (connect to sender intent)
- bridge_type: "intent" (connects to sender's goal), "credibility" (parallel experience), or "curiosity" (interesting conversation starter)
- hook_score: 1-5 (5 = highly specific and relevant, 1 = borderline useful)

IMPORTANT:
- Only include facts with hook_score >= 3
- If you cannot find niche-enough facts, return EMPTY array []
- Maximum 3 facts, prefer quality over quantity

Return ONLY valid JSON in this format:
{
  "facts": [...],
  "rejection_reasons": ["reason why a potential fact was rejected", ...]
}`;

  try {
    const response = await callLLM(
      LOVABLE_API_KEY,
      'You are a research analyst extracting specific, verifiable facts. Be rigorous about what counts as "niche-enough". Reject generic bio information.',
      extractionPrompt,
      RESEARCH_MODEL_NAME
    );
    
    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    
    // Filter to only include facts with score >= 3
    const facts: HookFact[] = (parsed.facts || [])
      .filter((f: HookFact) => f.hook_score >= 3)
      .slice(0, 3);
    
    const rejectionReasons: string[] = parsed.rejection_reasons || [];
    
    console.log('Extracted hook facts:', facts.length);
    console.log('Rejection reasons:', rejectionReasons);
    
    return { facts, rejectionReasons };
  } catch (e) {
    console.error('Failed to extract hook facts:', e);
    return { facts: [], rejectionReasons: ['Extraction failed: ' + String(e)] };
  }
}

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

    // ============= RESEARCH PIPELINE =============
    let exaQueries: string[] = [];
    let exaResults: ExaResult[] = [];
    let selectedSources: string[] = [];
    let hookFacts: HookFact[] = [];
    let researchDebug: ResearchDebug | null = null;
    let intentKeywords: string[] = [];
    let identityAnchorResult: IdentityAnchorResult | null = null;
    
    if (EXA_API_KEY) {
      console.log('Starting research pipeline (Exa only with identity anchor)...');
      
      try {
        const researchData = await performResearch(
          recipientName,
          recipientCompany,
          recipientRole,
          reachingOutBecause,
          credibilityStory,
          askType,
          EXA_API_KEY
        );
        
        exaQueries = researchData.queriesUsed;
        exaResults = researchData.exaResults;
        selectedSources = researchData.selectedResults.map(r => r.url);
        intentKeywords = researchData.queryPlan.intent_keywords;
        researchDebug = researchData.debug;
        identityAnchorResult = researchData.identityAnchor;
        
        console.log(`Research complete: identity confirmed=${identityAnchorResult.confirmed}, ${exaResults.length} Exa results, ${researchData.selectedResults.length} selected`);
        
        // Only extract hook facts if identity was confirmed
        if (identityAnchorResult.confirmed && researchData.selectedResults.length > 0) {
          const extraction = await extractHookFacts(
            recipientName,
            recipientRole,
            recipientCompany,
            researchData.selectedResults,
            reachingOutBecause,
            intentKeywords,
            LOVABLE_API_KEY
          );
          
          hookFacts = extraction.facts;
          if (researchDebug) {
            researchDebug.factRejectionReasons = extraction.rejectionReasons;
          }
          
          console.log(`Extracted ${hookFacts.length} niche hook facts`);
        } else if (!identityAnchorResult.confirmed) {
          console.log('Skipping hook fact extraction: identity not confirmed');
          if (researchDebug) {
            researchDebug.notes = 'Hook fact extraction skipped: could not confirm recipient identity.';
          }
        }
      } catch (e) {
        console.error('Research pipeline failed:', e);
        if (researchDebug) {
          researchDebug.notes = 'Research pipeline failed: ' + String(e);
        }
      }
    } else {
      console.log('EXA_API_KEY not configured, skipping research');
    }

    // ============= GENERATE EMAIL =============
    console.log('=== STEP 5: Generate Email ===');
    
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

    // Build hook facts section
    let hookFactsSection = '';
    if (hookFacts.length > 0) {
      hookFactsSection = `
RESEARCHED HOOK FACTS (use 1-2 to create the "Like you," bridge):
${hookFacts.map((f, i) => `
${i + 1}. Claim: ${f.claim}
   Source: ${f.source_url}
   Evidence: "${f.evidence_quote}"
   Relevance: ${f.why_relevant}
   Bridge type: ${f.bridge_type}
`).join('')}

Use these facts to create a genuine connection, not as praise or résumé summary.`;
    } else {
      hookFactsSection = `
NO RESEARCHED FACTS AVAILABLE.
Create the "Like you," bridge using ONLY:
- The sender's credibility story
- The recipient's role and company context
Do NOT imply you did specific research on the recipient.`;
    }

    const userPrompt = `Generate a cold email with these details:

RECIPIENT:
- Name: ${recipientName}
- Role: ${recipientRole} at ${recipientCompany}
${hookFactsSection}
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
    console.log(`exa_queries: ${exaQueries.length}`);
    console.log(`exa_results: ${exaResults.length}`);
    console.log(`selected_sources: ${selectedSources.length}`);
    console.log(`hook_facts: ${hookFacts.length}`);
    console.log(`did_retry: ${enforcementResults.did_retry}`);
    console.log(`failures_first_pass: ${JSON.stringify(enforcementResults.failures_first_pass)}`);
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
            has_em_dash: hasEmDash(emailData.body),
            latency_ms: latencyMs,
            validator_passed: validation.valid,
            validator_errors: validation.valid ? null : validation.errors,
            like_you_count: likeYouCount,
            exa_queries: exaQueries,
            exa_results: exaResults.map(r => ({ url: r.url, title: r.title, snippet: r.snippet })),
            selected_sources: selectedSources,
            researched_facts: hookFacts,
            enforcement_results: enforcementResults,
          });

        if (insertError) {
          console.error('Failed to log generation:', insertError);
        } else {
          console.log('Generation logged successfully');
        }
      }
    } catch (logError) {
      console.error('Error logging generation:', logError);
    }

    // Build response
    const responseData: any = {
      subject: emailData.subject,
      body: emailData.body,
      // Research data
      exaQueries,
      exaResults: exaResults.map(r => ({ url: r.url, title: r.title, snippet: r.snippet })),
      selectedSources,
      hookFacts,
      // Legacy compatibility
      researchedFacts: hookFacts.map(f => f.claim),
      // Enforcement
      enforcementResults,
      // Validation
      validatorPassed: validation.valid,
      validatorErrors: validation.valid ? null : validation.errors,
      // Metrics
      likeYouCount,
      wordCount,
      clicheCount,
      retryUsed: enforcementResults.did_retry,
    };

    // Include debug data for test harness
    if (includeDebug) {
      responseData.debug = {
        ...researchDebug,
        identityAnchor: identityAnchorResult,
      };
    }

    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in generate-email function:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to generate email. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
