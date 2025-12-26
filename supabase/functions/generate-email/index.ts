import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PROMPT_VERSION = 'v4.0-exa-likeyou';
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
}

interface EnforcementResults {
  did_retry: boolean;
  failures_first_pass: string[];
  failures_retry: string[];
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

function hasEmDash(text: string): boolean {
  return text.includes('—');
}

// Count "Like you," specifically (capital L, comma)
function countLikeYouCapitalized(text: string): number {
  const matches = text.match(/Like you,/g);
  return matches ? matches.length : 0;
}

// Count any case of "like you" for validation
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
  
  // A. JSON validity + required fields
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

  // B. "Like you," constraint - must be exactly once with capital L and comma
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

  // C. "Like you," sentence cannot be generic
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

  // D. Ban specific cliché phrases
  let clicheCount = 0;
  for (const cliche of BANNED_CLICHES) {
    if (combinedText.toLowerCase().includes(cliche)) {
      errors.push(`Contains banned cliché: "${cliche}"`);
      clicheCount++;
    }
  }

  // E. Bracket placeholders
  if (hasBracketPlaceholders(combinedText)) {
    errors.push('Contains bracket placeholders like [Name]');
  }

  // F. Formatting - greeting
  const bodyLines = body.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (bodyLines.length > 0) {
    const firstLine = bodyLines[0];
    const validGreeting1 = `Hi ${recipientFirstName},`;
    const validGreeting2 = `${recipientFirstName},`;
    if (!firstLine.startsWith(validGreeting1) && !firstLine.startsWith(validGreeting2)) {
      errors.push(`Greeting must start with "Hi ${recipientFirstName}," or "${recipientFirstName},"`);
    }
  }

  // G. Formatting - sign-off (must end with "Best," and nothing after)
  const trimmedBody = body.trimEnd();
  if (!trimmedBody.endsWith('Best,')) {
    errors.push('Body must end with exactly "Best," and nothing after');
  }

  // H. Em-dash ban
  if (hasEmDash(body)) {
    errors.push('Body contains em-dash (—) which is banned');
  }
  if (hasEmDash(subject)) {
    errors.push('Subject contains em-dash (—) which is banned');
  }

  // I. Ellipsis ban
  if (body.includes('...') || body.includes('…')) {
    errors.push('Body contains ellipsis (... or …) which is banned');
  }

  // J. Word count (90-170 range per spec)
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

// ============= EXA INTEGRATION =============

async function exaSearch(query: string, exaApiKey: string): Promise<ExaResult[]> {
  console.log('Exa search query:', query);
  
  const response = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${exaApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      numResults: 8,
      type: 'neural',
      useAutoprompt: true,
      contents: {
        text: {
          maxCharacters: 2000,
        },
        highlights: {
          numSentences: 3,
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
    snippet: r.highlights?.join(' ') || r.text?.substring(0, 500) || '',
    text: r.text || '',
  }));
}

async function exaGetContents(urls: string[], exaApiKey: string): Promise<ExaResult[]> {
  if (urls.length === 0) return [];
  
  console.log('Exa getContents for URLs:', urls);
  
  const response = await fetch('https://api.exa.ai/contents', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${exaApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ids: urls,
      text: {
        maxCharacters: 3000,
      },
      highlights: {
        numSentences: 5,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Exa contents error:', response.status, errorText);
    return [];
  }

  const data = await response.json();
  console.log('Exa contents returned', data.results?.length || 0, 'results');
  
  return (data.results || []).map((r: any) => ({
    url: r.url || '',
    title: r.title || '',
    snippet: r.highlights?.join(' ') || '',
    text: r.text || '',
  }));
}

async function performExaResearch(
  recipientName: string,
  recipientCompany: string,
  reachingOutBecause: string,
  exaApiKey: string
): Promise<{ queries: string[]; results: ExaResult[]; selectedUrls: string[] }> {
  const queries: string[] = [];
  let allResults: ExaResult[] = [];
  
  // Query 1: Primary search for interviews, podcasts, talks, essays
  const query1 = `${recipientName} ${recipientCompany} interview OR podcast OR talk OR keynote OR wrote OR essay OR blog OR "I think" OR "I believe"`;
  queries.push(query1);
  
  const results1 = await exaSearch(query1, exaApiKey);
  allResults = [...results1];
  
  // If results look generic (mostly LinkedIn or company pages), try query 2
  const hasSpecificContent = results1.some(r => 
    !r.url.includes('linkedin.com') && 
    !r.url.includes('/about') &&
    (r.url.includes('podcast') || r.url.includes('interview') || r.url.includes('blog'))
  );
  
  if (!hasSpecificContent && results1.length < 4) {
    const query2 = `${recipientName} ${recipientCompany} (podcast OR keynote OR interview OR "transcript" OR "Q&A")`;
    queries.push(query2);
    
    const results2 = await exaSearch(query2, exaApiKey);
    // Dedupe by URL
    for (const r of results2) {
      if (!allResults.find(existing => existing.url === r.url)) {
        allResults.push(r);
      }
    }
  }
  
  // Take top 8 results
  allResults = allResults.slice(0, 8);
  
  // Select top 3 URLs for content extraction (prioritize non-LinkedIn)
  const sortedForSelection = [...allResults].sort((a, b) => {
    const aScore = a.url.includes('linkedin.com') ? 0 : 1;
    const bScore = b.url.includes('linkedin.com') ? 0 : 1;
    return bScore - aScore;
  });
  
  const selectedUrls = sortedForSelection.slice(0, 3).map(r => r.url);
  
  // Get full content for selected URLs
  if (selectedUrls.length > 0) {
    const contentResults = await exaGetContents(selectedUrls, exaApiKey);
    
    // Merge content back into results
    for (const content of contentResults) {
      const idx = allResults.findIndex(r => r.url === content.url);
      if (idx >= 0) {
        allResults[idx].text = content.text;
        allResults[idx].snippet = content.snippet || allResults[idx].snippet;
      }
    }
  }
  
  return { queries, results: allResults, selectedUrls };
}

async function extractHookFacts(
  recipientName: string,
  recipientRole: string,
  recipientCompany: string,
  exaResults: ExaResult[],
  selectedUrls: string[],
  reachingOutBecause: string,
  LOVABLE_API_KEY: string
): Promise<HookFact[]> {
  if (exaResults.length === 0) {
    console.log('No Exa results to extract facts from');
    return [];
  }
  
  // Build context from selected sources
  const selectedResults = exaResults.filter(r => selectedUrls.includes(r.url));
  if (selectedResults.length === 0) {
    console.log('No selected sources found');
    return [];
  }
  
  const sourcesContext = selectedResults.map((r, i) => `
SOURCE ${i + 1}: ${r.url}
Title: ${r.title}
Content: ${r.text || r.snippet || '(no content available)'}
`).join('\n---\n');

  const extractionPrompt = `You are analyzing public content about ${recipientName}, ${recipientRole} at ${recipientCompany}.

The sender wants to reach out because: "${reachingOutBecause}"

Here are the sources found:
${sourcesContext}

Extract 0-2 "hook facts" that could be used to personalize a cold email. A hook fact is a specific, non-generic piece of information that:
1. Shows something distinctive about the recipient's thinking, work, or experiences
2. Could create a genuine connection point with the sender
3. Is NOT just their job title, timeline, or "co-founded X" unless there's a concrete angle

STRICT REQUIREMENTS for each fact:
- claim: A specific, interesting observation (not generic)
- source_url: The exact URL from the sources above
- evidence_quote: 8-25 words pulled DIRECTLY from the source content that supports the claim. This MUST be a real quote you can see in the content.
- why_relevant: Why this matters for the outreach
- bridge_type: One of "intent" (connects to sender's goal), "credibility" (parallel experience), or "curiosity" (interesting conversation starter)
- hook_score: 1-5 (5 = highly specific and relevant)

IMPORTANT:
- If you cannot provide a SHORT evidence_quote (8-25 words) that actually appears in the source, DO NOT include the fact
- Avoid generic facts like job titles or company founding dates
- Return EMPTY array [] if no specific, supported facts can be found
- Maximum 2 facts

Return ONLY valid JSON in this format:
{
  "facts": [
    {
      "claim": "...",
      "source_url": "...",
      "evidence_quote": "...",
      "why_relevant": "...",
      "bridge_type": "intent|credibility|curiosity",
      "hook_score": 1
    }
  ],
  "notes": "Optional notes about why you included or excluded certain facts"
}`;

  try {
    const response = await callLLM(
      LOVABLE_API_KEY,
      'You are a research analyst extracting specific, verifiable facts from source documents. Be rigorous about evidence.',
      extractionPrompt,
      RESEARCH_MODEL_NAME
    );
    
    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    
    const facts: HookFact[] = (parsed.facts || []).slice(0, 2);
    console.log('Extracted hook facts:', facts.length);
    return facts;
  } catch (e) {
    console.error('Failed to extract hook facts:', e);
    return [];
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
    const recipientLink = body.recipientLink || '';
    const askType = body.askType || 'chat';
    const reachingOutBecause = body.reachingOutBecause || '';
    const credibilityStory = body.credibilityStory || '';
    const sharedAffiliation = body.sharedAffiliation || null;
    
    const source = body.source || 'app';
    const scenarioName = body.scenario_name || body.scenarioName || null;
    const sessionId = body.sessionId || null;

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

    if (!recipientLink || !recipientLink.startsWith('http')) {
      return new Response(
        JSON.stringify({ error: 'Please provide a valid public URL' }),
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
      recipientLink,
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

    // ============= STEP 1: Exa Research =============
    let exaQueries: string[] = [];
    let exaResults: ExaResult[] = [];
    let selectedSources: string[] = [];
    let hookFacts: HookFact[] = [];
    
    if (EXA_API_KEY) {
      console.log('Step 1: Performing Exa research...');
      
      try {
        const exaData = await performExaResearch(
          recipientName,
          recipientCompany,
          reachingOutBecause,
          EXA_API_KEY
        );
        
        exaQueries = exaData.queries;
        exaResults = exaData.results;
        selectedSources = exaData.selectedUrls;
        
        console.log(`Exa returned ${exaResults.length} results, selected ${selectedSources.length} for extraction`);
        
        // Extract hook facts from the content
        hookFacts = await extractHookFacts(
          recipientName,
          recipientRole,
          recipientCompany,
          exaResults,
          selectedSources,
          reachingOutBecause,
          LOVABLE_API_KEY
        );
        
        console.log(`Extracted ${hookFacts.length} hook facts`);
      } catch (e) {
        console.error('Exa research failed:', e);
      }
    } else {
      console.log('EXA_API_KEY not configured, skipping Exa research');
    }

    // ============= STEP 2: Generate Email =============
    console.log('Step 2: Generating email...');
    
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
        
        // Retry with specific failure feedback
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

    return new Response(
      JSON.stringify({
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
      }),
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
