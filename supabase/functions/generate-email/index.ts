import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PROMPT_VERSION = 'v3.1-validator';
const MODEL_NAME = 'google/gemini-2.5-flash';

const SUPER_PROMPT = `You are an expert writing coach who crafts short, vivid, highly personalized cold emails.
Your job is to use the sender's inputs AND any researched information about the recipient to write a warm, confident, memorable email that a busy person will actually read and respond to.

The email must be readable in under 20 seconds (roughly 120–150 words).

NON-NEGOTIABLE REQUIREMENTS:
- The email body MUST contain the exact lowercase phrase "like you" exactly once.
- Do NOT use "As a fellow…" style openers; prefer "Like you, …".
- Do not use any banned cliché phrases.
- End with exactly "Best," and nothing after.

CONNECTION HIERARCHY (choose the strongest available "like you" bridge):
1) Shared domain, tension, or challenge (preferred)
2) Parallel anchored to a researched fact (moment, decision, artifact, opinion)
3) Parallel anchored to the recipient's role or company context
4) Shared affiliation (school, company, program) only as a last resort

HOW TO WRITE THE "LIKE YOU" LINE:
- Use "like you" to express a specific parallel (challenge, transition, tradeoff, or craft)
- Keep it concrete and non-obvious
- The sentence containing "like you" must NOT include generic phrases like "passionate about", "think a lot about", "reaching out", "aligned with", "resonates", "inspired", "keen to", or "deeply appreciate"
- Do NOT use alternate phrasing such as "As a fellow…" or "As someone who also…"
- The sentence containing "like you" should appear early in the email (first or second paragraph)

RESEARCH USAGE RULES:
- If researched facts are provided, use at most 1–2 facts
- Use facts as anchors for a parallel or question, not as praise or résumé summary
- Do NOT summarize the recipient's career or list accomplishments
- If no researched facts exist, still create a "like you" bridge using role/company context and the sender's story

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
- 1–2 short paragraphs establishing the hook (include the "like you" line early)
- One small, specific ask
- Sign-off: "Best," with nothing after

DO NOT EVER:
- Invent private or sensitive information
- Imply research you did not do
- Stack multiple personalization angles
- Use "like you" more than once
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

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

function hasEmDash(text: string): boolean {
  return text.includes('—') || text.includes('--');
}

function countLikeYou(text: string): number {
  const lowerText = text.toLowerCase();
  const matches = lowerText.match(/like you/g);
  return matches ? matches.length : 0;
}

function extractSentenceWithLikeYou(body: string): string | null {
  const lowerBody = body.toLowerCase();
  // Split on sentence-ending punctuation
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
  const lowerBody = body.toLowerCase();
  const lowerSubject = subject.toLowerCase();
  const lowerCombined = combinedText.toLowerCase();

  // B. "like you" constraint
  const likeYouCount = countLikeYou(body);
  if (likeYouCount === 0) {
    errors.push('Body must contain the exact phrase "like you"');
  } else if (likeYouCount > 1) {
    errors.push(`Body contains "like you" ${likeYouCount} times (must be exactly once)`);
  }

  // C. "like you" sentence cannot be generic
  if (likeYouCount >= 1) {
    const likeYouSentence = extractSentenceWithLikeYou(body);
    if (likeYouSentence) {
      const lowerSentence = likeYouSentence.toLowerCase();
      for (const pattern of GENERIC_LIKE_YOU_PATTERNS) {
        if (lowerSentence.includes(pattern)) {
          errors.push(`The "like you" sentence contains generic phrase "${pattern}"`);
          break; // Only report one generic pattern per sentence
        }
      }
    }
  }

  // D. Ban specific cliché phrases
  let clicheCount = 0;
  for (const cliche of BANNED_CLICHES) {
    if (lowerCombined.includes(cliche)) {
      errors.push(`Contains banned cliché: "${cliche}"`);
      clicheCount++;
    }
  }

  // E. Formatting - greeting
  const bodyLines = body.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (bodyLines.length > 0) {
    const firstLine = bodyLines[0];
    const validGreeting1 = `Hi ${recipientFirstName},`;
    const validGreeting2 = `${recipientFirstName},`;
    if (!firstLine.startsWith(validGreeting1) && !firstLine.startsWith(validGreeting2)) {
      errors.push(`Greeting must start with "Hi ${recipientFirstName}," or "${recipientFirstName},"`);
    }
  }

  // E. Formatting - sign-off
  const trimmedBody = body.trimEnd();
  if (!trimmedBody.endsWith('Best,')) {
    errors.push('Body must end with exactly "Best," and nothing after');
  }

  // F. Punctuation bans
  if (body.includes('—')) {
    errors.push('Body contains em-dash (—) which is banned');
  }
  if (subject.includes('—')) {
    errors.push('Subject contains em-dash (—) which is banned');
  }
  if (body.includes('...') || body.includes('…')) {
    errors.push('Body contains ellipsis (... or …) which is banned');
  }
  if (subject.includes('...') || subject.includes('…')) {
    errors.push('Subject contains ellipsis (... or …) which is banned');
  }

  // G. Length
  const wordCount = countWords(body);
  if (wordCount < 110) {
    errors.push(`Body has ${wordCount} words (minimum 110 required)`);
  }
  if (wordCount > 160) {
    errors.push(`Body has ${wordCount} words (maximum 160 allowed)`);
  }

  return {
    valid: errors.length === 0,
    errors,
    likeYouCount,
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

Non-negotiables:
- The body must include the exact lowercase phrase "like you" exactly once.
- The sentence containing "like you" must be specific and NOT include any banned generic phrases (passionate about, think a lot about, reaching out, aligned with, resonates, inspired, keen to, deeply appreciate).
- Do not use any banned clichés listed above.
- End with exactly "Best," and nothing after.
- Word count must be between 110 and 160 words.
Return ONLY valid JSON with keys "subject" and "body".`;
}

// ============= HELPERS =============

// Determine connection type used based on email content and inputs
function detectConnectionType(
  body: string, 
  researchedFacts: string[], 
  sharedAffiliation: any
): 'domain' | 'research' | 'role' | 'affiliation' {
  const lowerBody = body.toLowerCase();
  
  // Check for affiliation keywords
  if (sharedAffiliation && sharedAffiliation.name) {
    const affiliationName = sharedAffiliation.name.toLowerCase();
    if (lowerBody.includes(affiliationName)) {
      return 'affiliation';
    }
  }
  
  // Check if researched facts are referenced
  if (researchedFacts.length > 0) {
    for (const fact of researchedFacts) {
      const keywords = fact.toLowerCase().split(' ').filter(w => w.length > 5);
      for (const keyword of keywords.slice(0, 3)) {
        if (lowerBody.includes(keyword)) {
          return 'research';
        }
      }
    }
  }
  
  // Default to domain (challenge/tension) or role
  return 'domain';
}

// Map ask type to readable text
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

// Map affiliation type to readable text
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
  userPrompt: string
): Promise<string> {
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL_NAME,
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const body = await req.json();
    
    // New research-based inputs
    const recipientName = body.recipientName || '';
    const recipientCompany = body.recipientCompany || '';
    const recipientRole = body.recipientRole || '';
    const recipientLink = body.recipientLink || '';
    const askType = body.askType || 'chat';
    const reachingOutBecause = body.reachingOutBecause || '';
    const credibilityStory = body.credibilityStory || '';
    
    // Shared affiliation (optional, user-declared)
    const sharedAffiliation = body.sharedAffiliation || null;
    
    const source = body.source || 'app';
    const scenarioName = body.scenario_name || body.scenarioName || null;

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

    // Store input for logging
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
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'Failed to generate email. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 1: Research the recipient using the public link
    console.log('Step 1: Researching recipient from:', recipientLink);
    
    const researchPrompt = `I need to write a cold email to ${recipientName}, who is ${recipientRole} at ${recipientCompany}.

Here is a public link about them: ${recipientLink}

Based on this link and any public information you can find about this person, please extract 2-3 specific, relevant facts that could be used to personalize a cold email. Focus on:
- Recent projects, achievements, or initiatives they've led
- Their professional background or career path
- Any public talks, articles, or interviews
- Their company's recent news or focus areas

Return ONLY a JSON object in this exact format:
{
  "facts": [
    "Specific fact 1 about the person or their work",
    "Specific fact 2 about the person or their work"
  ],
  "summary": "One sentence summary of who this person is professionally"
}

Only return facts you are reasonably confident about based on public information. Do not invent or assume private details.`;

    const researchResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [
          { role: 'system', content: 'You are a research assistant. Extract specific, factual information about people from public sources. Be accurate and do not invent information.' },
          { role: 'user', content: researchPrompt }
        ],
      }),
    });

    let researchedFacts: string[] = [];
    let recipientSummary = '';

    if (researchResponse.ok) {
      const researchData = await researchResponse.json();
      const researchContent = researchData.choices[0].message.content;
      console.log('Research response:', researchContent);
      
      try {
        const cleanedResearch = researchContent.replace(/```json\n?|\n?```/g, '').trim();
        const parsed = JSON.parse(cleanedResearch);
        researchedFacts = parsed.facts || [];
        recipientSummary = parsed.summary || '';
        console.log('Extracted facts:', researchedFacts);
      } catch (e) {
        console.log('Could not parse research response, continuing without specific facts');
      }
    } else {
      console.log('Research step failed, continuing with basic info');
    }

    // Step 2: Generate the email using the research AND shared affiliation
    console.log('Step 2: Generating email with research...');
    if (sharedAffiliation) {
      console.log('Shared affiliation provided:', sharedAffiliation);
    }
    
    // Build shared affiliation section if provided
    let sharedAffiliationSection = '';
    if (sharedAffiliation && sharedAffiliation.name) {
      const affiliationTypes = (sharedAffiliation.types || [])
        .map((t: string) => getAffiliationTypeLabel(t))
        .join(', ');
      
      sharedAffiliationSection = `
SHARED AFFILIATION (user-declared, use ONLY as last resort for "like you" connection):
- Connection type: ${affiliationTypes}
- Shared institution or organization: ${sharedAffiliation.name}${sharedAffiliation.detail ? `
- Sender's connection: ${sharedAffiliation.detail}` : ''}

IMPORTANT: Only use this shared affiliation if no stronger domain/challenge parallel exists. If used, express it with "like you" phrasing (e.g., "Like you, I came up through ${sharedAffiliation.name}..."). Do NOT use "As a fellow..." phrasing.`;
    }

    const userPrompt = `Generate a cold email with these details:

RECIPIENT:
- Name: ${recipientName}
- Role: ${recipientRole} at ${recipientCompany}
- Public profile: ${recipientLink}
${recipientSummary ? `- Summary: ${recipientSummary}` : ''}
${researchedFacts.length > 0 ? `- Researched facts to reference:\n  ${researchedFacts.map((f, i) => `${i + 1}. ${f}`).join('\n  ')}` : ''}
${sharedAffiliationSection}

SENDER'S CONTEXT:
- Asking for: ${getAskTypeLabel(askType)}
- Reason for reaching out: ${reachingOutBecause}
- Credibility story: ${credibilityStory}

INSTRUCTIONS:
- The email MUST include the exact phrase "like you" exactly once in the body
- Prefer a "like you" connection based on shared domain or challenge from the sender's story
- Use shared school/company/program only if no stronger parallel exists
- The "like you" line should appear early (first or second paragraph)
- Make a specific ask related to "${getAskTypeLabel(askType)}"
- Keep the body between 110-160 words
- Greeting must be "Hi ${recipientFirstName}," or "${recipientFirstName},"
- End with exactly "Best," and nothing after

Return your response in this exact JSON format:
{
  "subject": "Your subject line here",
  "body": "Your full email body here with proper line breaks"
}

Only return the JSON, no other text.`;

    // Generate email with validation and retry logic
    let rawResponse: string;
    let validation: ValidationResult;
    let validationErrorsFirstPass: string[] = [];
    let validationErrorsRetry: string[] = [];
    let retryUsed = false;

    try {
      console.log('Generating email (attempt 1)...');
      rawResponse = await callLLM(LOVABLE_API_KEY, SUPER_PROMPT, userPrompt);
      console.log('AI response:', rawResponse);
      
      // Validate first attempt
      validation = validateEmail(rawResponse, recipientFirstName);
      validationErrorsFirstPass = validation.errors;
      
      if (!validation.valid) {
        console.log('Validation failed (attempt 1):', validation.errors);
        
        // Retry with specific failure feedback
        retryUsed = true;
        const retryPrompt = userPrompt + buildRetryInstruction(validation.errors);
        
        console.log('Generating email (attempt 2 - retry)...');
        rawResponse = await callLLM(LOVABLE_API_KEY, SUPER_PROMPT, retryPrompt);
        console.log('AI response (retry):', rawResponse);
        
        // Validate retry
        validation = validateEmail(rawResponse, recipientFirstName);
        validationErrorsRetry = validation.errors;
        
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
    const likeYouPresent = countLikeYou(emailData.body) === 1;
    const connectionTypeUsed = detectConnectionType(emailData.body, researchedFacts, sharedAffiliation);
    const wordCount = countWords(emailData.body);
    const clicheCount = countCliches(emailData.subject + ' ' + emailData.body);

    // Log analytics
    console.log('=== GENERATION ANALYTICS ===');
    console.log(`validation_failed_first_pass: ${validationErrorsFirstPass.length > 0}`);
    console.log(`retry_used: ${retryUsed}`);
    console.log(`validation_errors_first_pass: ${JSON.stringify(validationErrorsFirstPass)}`);
    console.log(`validation_errors_retry: ${JSON.stringify(validationErrorsRetry)}`);
    console.log(`like_you_count: ${countLikeYou(emailData.body)}`);
    console.log(`word_count: ${wordCount}`);
    console.log(`cliche_count: ${clicheCount}`);
    console.log(`like_you_present: ${likeYouPresent}`);
    console.log(`connection_type: ${connectionTypeUsed}`);
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
            source,
            scenario_name: scenarioName,
            input_json: { 
              ...inputJson, 
              researchedFacts,
              like_you_present: likeYouPresent,
              retry_used: retryUsed,
              connection_type_used: connectionTypeUsed,
              validation_failed_first_pass: validationErrorsFirstPass.length > 0,
              validation_errors_first_pass: validationErrorsFirstPass,
              validation_errors_retry: validationErrorsRetry,
            },
            prompt_version: PROMPT_VERSION,
            model_name: MODEL_NAME,
            subject: emailData.subject,
            body: emailData.body,
            word_count: wordCount,
            cliche_count: clicheCount,
            has_em_dash: hasEmDash(emailData.body),
            latency_ms: latencyMs,
            validator_passed: validation.valid,
            validator_errors: validation.valid ? null : validation.errors,
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
        researchedFacts,
        likeYouPresent,
        retryUsed,
        connectionTypeUsed,
        validatorPassed: validation.valid,
        validatorErrors: validation.valid ? null : validation.errors,
        wordCount,
        clicheCount,
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
