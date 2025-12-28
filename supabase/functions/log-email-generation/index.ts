import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROMPT_VERSION = "v2.0-research";
const MODEL_NAME = "google/gemini-2.5-flash";

const SUPER_PROMPT = `You are an expert writing coach who crafts short, vivid, highly personalized cold emails.
Your job is to use the sender’s inputs AND any researched information about the recipient to write a warm, confident, memorable email that a busy, impressive person will actually read and respond to.

The email must be short, sharp, and readable in under 20 seconds (roughly 120–150 words).

MANDATORY LOGIC (do this in order):

STEP 1 — PARALLEL CHECK  
Determine whether a genuine parallel exists between:
- the sender’s lived experience, decision, or tension
- and something the recipient has built, navigated, argued, or led

A genuine parallel must be:
- situational (same type of challenge, transition, or tradeoff)
- specific (rooted in a real moment, project, or decision)
- non-obvious (not just same school, same company, same title)

STEP 2 — LEXICAL REQUIREMENT  
IF a genuine parallel exists:
- You MUST include the exact lowercase phrase: **“like you”**
- It MUST appear exactly once in the email body
- It MUST be part of a sentence that explicitly draws the parallel
- It MUST sound natural and conversational

IF no genuine parallel exists:
- Do NOT include the phrase “like you” at all

STEP 3 — VERIFICATION (do this silently before returning output)  
- If a genuine parallel exists AND the phrase “like you” does NOT appear exactly once → REWRITE the email
- If the phrase “like you” appears more than once → REWRITE the email
- If no genuine parallel exists AND “like you” appears → REWRITE the email

SIGNAL PRIORITY (pick ONE primary lane):
1. A one-in-a-million “like you” parallel (preferred when available)
2. Shared affiliation (school, company, program) if it meaningfully strengthens the connection
3. Sender’s standalone story or insight
4. Researched facts for grounding or context

CORE RULES:
- If researched facts are provided, use at most 1–2 SPECIFIC facts
- Use facts only as anchors for a parallel or question, never as praise or résumé summary
- If NO researched facts are provided, do NOT imply research was done
- Do NOT summarize the recipient’s career or list accomplishments
- Pick ONE lane and commit to it
- Be “one in a million, not one of a million”

STYLE RULES:
- Use vivid, concrete language
- Simple, human tone
- No em-dashes (—), no semicolons, no ellipses
- No MBA or corporate clichés
- No generic praise or flattery
- No bracket placeholders
- End with “Best,” and nothing after

STRUCTURE:
- Subject line: short, specific, intriguing
- Greeting using the recipient’s first name
- 1–2 short paragraphs establishing the hook
  - If a parallel exists, the sentence containing “like you” should appear here
- One small, specific ask that is easy to say yes to
- Sign-off: “Best,”

DO NOT EVER:
- Invent private or sensitive information
- Imply research when none exists
- Overuse shared affiliation
- Stack multiple personalization angles
- Use the phrase “like you” more than once
- Explain the connection instead of demonstrating it
- Include a name after the sign-off`;

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

function hasEmDash(text: string): boolean {
  return text.includes("—") || text.includes("--");
}

function getAskTypeLabel(askType: string): string {
  const labels: Record<string, string> = {
    chat: "a short introductory chat",
    feedback: "feedback on something",
    referral: "a referral or introduction",
    job: "job or recruiting related discussion",
    other: "other",
  };
  return labels[askType] || askType;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const body = await req.json();
    const { sessionId, ...emailRequest } = body;

    // Validation
    if (!sessionId || typeof sessionId !== "string") {
      console.error("Validation failed: missing sessionId");
      return new Response(JSON.stringify({ error: "Session ID is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // New research-based inputs
    const recipientName = emailRequest.recipientName || "";
    const recipientCompany = emailRequest.recipientCompany || "";
    const recipientRole = emailRequest.recipientRole || "";
    const recipientLink = emailRequest.recipientLink || "";
    const askType = emailRequest.askType || "chat";
    const reachingOutBecause = emailRequest.reachingOutBecause || "";
    const credibilityStory = emailRequest.credibilityStory || "";

    if (!recipientName || !recipientCompany || !credibilityStory || !reachingOutBecause) {
      console.error("Validation failed: missing required email fields");
      return new Response(JSON.stringify({ error: "Missing required email fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!recipientLink || !recipientLink.startsWith("http")) {
      return new Response(JSON.stringify({ error: "Please provide a valid public URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const inputJson = {
      recipientName,
      recipientCompany,
      recipientRole,
      recipientLink,
      askType,
      reachingOutBecause,
      credibilityStory,
    };

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase configuration");
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify session exists and check rate limiting
    const { data: session, error: sessionError } = await supabase
      .from("prolific_sessions")
      .select("id, completed_at")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError || !session) {
      console.error("Session not found:", sessionId);
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Reject if session is already completed
    if (session.completed_at) {
      console.error("Session already completed:", sessionId);
      return new Response(JSON.stringify({ error: "Session has already been completed" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limiting: check number of generations for this session (max 10 per session)
    const { count: generationCount } = await supabase
      .from("email_generations")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId);

    if (generationCount && generationCount >= 10) {
      console.error("Rate limit exceeded for session:", sessionId);
      return new Response(JSON.stringify({ error: "Maximum email generations reached for this session" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Research the recipient
    console.log("Step 1: Researching recipient from:", recipientLink);

    const researchPrompt = `I need to write a cold email to ${recipientName}, who is ${recipientRole} at ${recipientCompany}.

Public link to start from (may or may not be accessible):
${recipientLink}

SENDER’S INTENT (use this to decide what is relevant):
- Why the sender is reaching out: ${reachingOutBecause}
- What they are asking for: ${getAskTypeLabel(askType)}
- Sender’s credibility or lived experience: ${credibilityStory}

TASK:
Extract 0–3 VERIFIABLE, NON-OBVIOUS “hook facts” that would make THIS outreach feel specific, intentional, and well-targeted.

A “hook fact” MUST satisfy BOTH:
- It is supported by a real, public URL
- It directly supports or deepens the sender’s reason for reaching out

Good hook facts are typically:
1) A specific idea, argument, or opinion the recipient has publicly expressed (article, post, talk)
2) A concrete project, initiative, or decision they led, with a clear angle (what problem it addressed or why it mattered)
3) A talk, interview, essay, or artifact with a notable takeaway
4) A non-obvious detail that creates a natural bridge to the sender’s story or question

AVOID returning generic biographical facts unless no hook facts exist:
- Job titles, tenure, or career timelines (“joined X in 2023,” “previously at Y”)
- Founding facts or leadership roles without a specific angle or takeaway
- Portfolio lists, awards, or accomplishments that do not connect to the sender’s intent

CRITICAL RULES:
1) Every fact MUST include a real, verifiable source_url
2) NEVER fabricate, guess, or approximate URLs
3) If you cannot find clearly relevant hook facts, return an EMPTY facts array
4) Prefer returning zero facts over returning generic or résumé-style information

Return ONLY this JSON format:
{
  "facts": [
    {
      "claim": "One specific, verifiable hook fact (not a generic bio line)",
      "source_url": "Exact URL where this was found",
      "why_relevant": "Brief explanation of how this fact supports the sender’s outreach intent"
    }
  ],
  "summary": "One sentence professional summary ONLY if directly supported by the returned sources; otherwise empty string"
}
The facts array may be empty [] if no verifiable facts are found. This is preferred over fabricating information.
Do not invent or assume private details. Do not fabricate source URLs.`;

    const researchResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [
          {
            role: "system",
            content:
              "You are a research assistant. Extract specific, factual information about people from public sources. Be accurate and do not invent information.",
          },
          { role: "user", content: researchPrompt },
        ],
      }),
    });

    let researchedFacts: Array<{ claim: string; source_url: string }> = [];
    let recipientSummary = "";

    if (researchResponse.ok) {
      const researchData = await researchResponse.json();
      const researchContent = researchData.choices[0].message.content;
      console.log("Research response:", researchContent);

      try {
        const cleanedResearch = researchContent.replace(/```json\n?|\n?```/g, "").trim();
        const parsed = JSON.parse(cleanedResearch);
        // Handle both old format (string[]) and new format ({claim, source_url}[])
        if (Array.isArray(parsed.facts)) {
          researchedFacts = parsed.facts.filter((f: any) => typeof f === "object" && f.claim && f.source_url);
        }
        recipientSummary = parsed.summary || "";
        console.log("Extracted facts:", researchedFacts);
      } catch (e) {
        console.log("Could not parse research response, continuing without specific facts");
      }
    } else {
      console.log("Research step failed, continuing with basic info");
    }

    // Step 2: Generate the email
    console.log("Step 2: Generating email for session:", sessionId);

    const factsForPrompt =
      researchedFacts.length > 0
        ? `- Researched facts (USE these to personalize):\n  ${researchedFacts.map((f, i) => `${i + 1}. ${f.claim} (source: ${f.source_url})`).join("\n  ")}`
        : "- Researched facts: NONE AVAILABLE";

    const userPrompt = `Generate a cold email with these details:

RECIPIENT:
- Name: ${recipientName}
- Role: ${recipientRole} at ${recipientCompany}
- Public profile: ${recipientLink}
${recipientSummary ? `- Summary: ${recipientSummary}` : ""}
${factsForPrompt}

SENDER'S CONTEXT:
- Asking for: ${getAskTypeLabel(askType)}
- Reason for reaching out: ${reachingOutBecause}
- Credibility story: ${credibilityStory}


INSTRUCTIONS:
${
  researchedFacts.length > 0
    ? `- Use 1-2 of the researched facts naturally in the email to show personalization`
    : `- NO researched facts are available. Do NOT imply you've researched the recipient or reference specific details about their work. Instead, connect through the sender's story and the recipient's role/company only.`
}
- Lead with the sender's credibility story as the hook
- Make a specific ask related to "${getAskTypeLabel(askType)}"
- Keep it around 120-150 words
- Address ${recipientName.split(" ")[0]} by their first name

Return your response in this exact JSON format:
{
  "subject": "Your subject line here",
  "body": "Your full email body here with proper line breaks"
}

Only return the JSON, no other text.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [
          { role: "system", content: SUPER_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Lovable AI error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "Failed to generate email" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    let emailData;
    try {
      const cleanedContent = content.replace(/```json\n?|\n?```/g, "").trim();
      emailData = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      return new Response(JSON.stringify({ error: "Failed to generate email" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const latencyMs = Date.now() - startTime;

    // Log generation to database
    const { data: generation, error: insertError } = await supabase
      .from("email_generations")
      .insert({
        session_id: sessionId,
        source: "prolific",
        input_json: { ...inputJson, researchedFacts },
        prompt_version: PROMPT_VERSION,
        model_name: MODEL_NAME,
        subject: emailData.subject,
        body: emailData.body,
        word_count: countWords(emailData.body),
        has_em_dash: hasEmDash(emailData.body),
        latency_ms: latencyMs,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Failed to log generation:", insertError);
    } else {
      console.log("Generation logged:", generation.id);
    }

    return new Response(
      JSON.stringify({
        subject: emailData.subject,
        body: emailData.body,
        generationId: generation?.id,
        researchedFacts,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in log-email-generation:", error);
    return new Response(JSON.stringify({ error: "An unexpected error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
