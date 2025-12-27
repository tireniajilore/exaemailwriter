import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============= DEPLOY VERSION - BUMP THIS ON EACH DEPLOY =============
const DEPLOY_VERSION = "2025-12-27c-exa-research";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "x-deploy-version, x-generation-id",
};

const PROMPT_VERSION = "v9.0-voice-first";
const MODEL_NAME = "google/gemini-2.5-flash";

// Exa Research config
const EXA_RESEARCH_TIMEOUT_MS = 180000; // 3 minutes
const EXA_RESEARCH_POLL_INTERVAL_MS = 3000; // 3 seconds

// Helper to build response headers with deploy version and generation ID
function buildResponseHeaders(generationId: string): Record<string, string> {
  return {
    ...corsHeaders,
    "Content-Type": "application/json",
    "x-deploy-version": DEPLOY_VERSION,
    "x-generation-id": generationId,
  };
}

// ============= SUPER PROMPT (Voice-First v9) =============
const SUPER_PROMPT = `

You write cold emails that read like a single, continuous thought from a real person — not a template, not a checklist.
The email should feel like someone thinking out loud to a respected peer: warm, specific, human, and slightly under-polished.

CORE MENTAL MODEL (THIS OVERRIDES ALL OTHER RULES)
Do not assemble an email. Explain why you're writing.
Write as if you're answering this question in one flowing explanation:
"Why should this person care about this message right now?"
Everything in the email should logically follow from that explanation.
If a sentence doesn't naturally lead to the next one, rewrite.

BEFORE WRITING THE EMAIL:
In 2–3 sentences, silently explain to yourself:
Why am I writing this person right now?
What specific overlap or tension makes this message necessary?

Then write the email as a natural explanation of that.
Do NOT structure the email. Let it flow.

YOUR PERSONA
You are a real person with a real reason for reaching out.
You respect the recipient. You are not pitching. You are not performing. You are not trying to sound impressive.
Write like you'd text someone you admire but don't know yet.

THE ONE NON-NEGOTIABLE RULE
The email MUST contain exactly one instance of:
"Like you," (capital L, comma after)
This phrase is not decoration. It should feel inevitable, not inserted.
Rule: If the sentence still works without "Like you," rewrite it until it doesn't.

HOW "LIKE YOU" SHOULD FUNCTION
"Like you," must express a shared lived reality, not a belief or value.
It should connect:
* what they've done
* to what you've done
* and why that overlap matters now
GOOD:
* "Like you, I'm now dedicated to storytelling as an avenue for inspiring black boys and girls."
* "Like you, I want to write about the small human actions that transform hearts and minds"
* "Like you, I want to devote my career to applying technology to improving conservation."
* "Like you, I was born and raised in Italy, but I built my career outside our country."
* "Like you, I am often told I bite off more than I can chew"
NEVER:
* "Like you, I care about inclusion."
* "Like you, I believe in innovation."
* "Like you, we share a commitment to…"
If it sounds like a mission statement, rewrite.
You may NOT use belief verbs (believe, think, care, passionate).


FLOW OVER STRUCTURE (IMPORTANT)
Do not write:
* hook paragraph
* credibility paragraph
* ask paragraph
Instead:
* Let one idea naturally lead to the next
* Use connective language a human would use out loud:

The email should feel like ONE thought, not three blocks.

OPENING RULE (STILL STRICT)
The first sentence after the greeting must contain new information.
Default to sender-side news:
* what you're building
* what you're organizing
* what you're offering
* a concrete detail from their work (the detail itself, not "I read…")
ALLOWED:
* "Stanford's Black Business Conference is coming back in October."
* "We're building a payments tool focused on LatAm gig workers."
* "That stat in your Afrotech piece — 40% lacking device access — stuck with me."
BANNED AS FIRST SENTENCE:
* "I read…"
* "I saw…"
* "I wanted to reach out…"
* "This might be out of the blue…"
* "My name is…"
* "I'm a…"

LANGUAGE + TONE (UNCHANGED, BUT SIMPLIFIED)
* Simple words beat impressive ones
* One sentence = one idea
* Short is better than clever
* Warm, but not emotional
* Casual, but not sloppy
* No corporate polish
If a 12-year-old wouldn't say it, rewrite it.

CREDIBILITY (SUBTLE)
Credibility should feel incidental, not announced.
Prefer:
* "I've been working on X for a few years" Over:
* "I bring extensive experience in X"
No titles. No awards. No flexing.

SHOW, DON'T TELL (MANDATORY)
Never describe their qualities. Point to something concrete instead.
* BAD: "Your leadership demonstrated vision"
* GOOD: "The Activision deal took two years — that kind of patience is rare."

TEXTURE RULES (USE SPARINGLY)
* One-line paragraphs are fine
* A single specific detail beats three generic ones
* Don't explain who they are to them
* Ask one real, answerable question

LENGTH
Readable in under 20 seconds. If you can say it in 80 words, don't stretch to 120.

ENDING + ASK
The ask should feel like the natural conclusion of the explanation — not a switch in tone.
Prefer:
* "Would you be up for a quick call?"
* "Any chance you'd want to talk about it?"
Avoid:
* formality
* hedging
* "no pressure" language

HARD RULES (AUTOMATIC REJECTION IF VIOLATED)
* "Like you," appears exactly once
* No em-dashes
* No clichés ("reaching out because", "would love to connect", etc.)
* No invented research
* No résumé summaries
* End with exactly:
Best,
Nothing after.

FINAL CHECK — READ ALOUD

Before returning the email, read it as if you're saying it out loud to a real person.

If any sentence:
- sounds like something you wouldn't say in a normal conversation
- feels polite but empty
- sounds like a press release, slide deck, or LinkedIn post

Rewrite that sentence using simpler, more natural words.

Do this once. Then return the final email only.

`;

// ============= TYPES =============

type AskType = "chat" | "feedback" | "referral" | "job" | "other";
type BridgeAngle = "domain" | "value" | "tradeoff" | "artifact" | "inflection" | "shared-affiliation";
type EvidenceType = "quote" | "named_initiative" | "described_decision" | "named_artifact" | "public_stance";
type IdentityDecision = "PASS_HIGH" | "PASS_LOW" | "FAIL";

interface ValidationResult {
  valid: boolean;
  errors: string[];
  likeYouCount: number;
  wordCount: number;
  clicheCount: number;
}

interface LikeYouIngredients {
  shared_axis: string;
  shared_action: string;
  shared_stakes: string;
  optional_phrases?: string[];
}

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
    intent_theme: string;
  };
  scores: {
    identity_conf: number;
    non_generic: number;
    intent_fit: number;
    bridgeability: number;
    overall: number;
  };
}

interface ProfileSummary {
  current_role: string;
  current_company: string;
  education: string[];
  past_companies: string[];
  skills: string[];
  career_trajectory?: string;
  company_context?: string;
  likely_interests: string[];
  source: "linkedin" | "fingerprint" | "hypothesis" | "mixed" | "exa_research";
}

interface SenderIntentProfile {
  primary_theme: string;
  secondary_themes: string[];
  must_include_terms: string[];
  avoid_terms: string[];
  preferred_evidence_types: EvidenceType[];
}

interface EnforcementResults {
  did_retry: boolean;
  failures_first_pass: string[];
  failures_retry: string[];
}

// ============= EXA RESEARCH OUTPUT SCHEMA =============
// This schema is the HARD CONTRACT with Exa Research API.
// All research logic is delegated to Exa via instructions.

const EXA_RESEARCH_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    identity: {
      type: "object",
      properties: {
        canonical_name: { type: "string" },
        company: { type: "string" },
        role: { type: "string" },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        decision: { type: "string", enum: ["PASS_HIGH", "PASS_LOW", "FAIL"] },
        disambiguators: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["canonical_name", "company", "confidence", "decision"],
    },
    hook_packs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          hook_fact: {
            type: "object",
            properties: {
              claim: { type: "string" },
              source_url: { type: "string" },
              evidence: { type: "string" },
              evidence_type: {
                type: "string",
                enum: ["quote", "named_initiative", "described_decision", "named_artifact", "public_stance"],
              },
            },
            required: ["claim", "source_url", "evidence", "evidence_type"],
          },
          bridge: {
            type: "object",
            properties: {
              bridge_angle: {
                type: "string",
                enum: ["domain", "value", "tradeoff", "artifact", "inflection", "shared-affiliation"],
              },
              why_relevant: { type: "string" },
              like_you_ingredients: {
                type: "object",
                properties: {
                  shared_axis: { type: "string" },
                  shared_action: { type: "string" },
                  shared_stakes: { type: "string" },
                  optional_phrases: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: ["shared_axis", "shared_action", "shared_stakes"],
              },
              intent_theme: { type: "string" },
            },
            required: ["bridge_angle", "why_relevant", "like_you_ingredients", "intent_theme"],
          },
          scores: {
            type: "object",
            properties: {
              identity_conf: { type: "number", minimum: 0, maximum: 1 },
              non_generic: { type: "number", minimum: 0, maximum: 1 },
              intent_fit: { type: "number", minimum: 0, maximum: 1 },
              bridgeability: { type: "number", minimum: 0, maximum: 1 },
              overall: { type: "number", minimum: 0, maximum: 1 },
            },
            required: ["identity_conf", "non_generic", "intent_fit", "bridgeability", "overall"],
          },
        },
        required: ["hook_fact", "bridge", "scores"],
      },
    },
    fallback: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["sufficient", "minimal", "failed"] },
        profile_summary: {
          type: "object",
          properties: {
            current_role: { type: "string" },
            current_company: { type: "string" },
            education: { type: "array", items: { type: "string" } },
            past_companies: { type: "array", items: { type: "string" } },
            skills: { type: "array", items: { type: "string" } },
            career_trajectory: { type: "string" },
            likely_interests: { type: "array", items: { type: "string" } },
          },
          required: ["current_role", "current_company"],
        },
        reason: { type: "string" },
      },
      required: ["mode"],
    },
    citations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          url: { type: "string" },
          title: { type: "string" },
        },
        required: ["url"],
      },
    },
    research_notes: { type: "string" },
  },
  required: ["identity", "hook_packs", "fallback", "citations"],
};

// ============= EXA RESEARCH FUNCTIONS =============

function buildExaResearchInstructions(
  recipientName: string,
  recipientCompany: string,
  recipientRole: string,
  reachingOutBecause: string,
  credibilityStory: string,
  askType: AskType,
): string {
  return `
RESEARCH TASK: Find personalization hooks for a cold email to ${recipientName}, ${recipientRole} at ${recipientCompany}.

═══════════════════════════════════════════════════════════════════
SENDER CONTEXT (USE THIS TO SCORE RELEVANCE)
═══════════════════════════════════════════════════════════════════

Why sender is reaching out: "${reachingOutBecause}"
Sender's credibility/story: "${credibilityStory}"
Ask type: ${askType}

Your job is to find facts about ${recipientName} that CREATE A BRIDGE to the sender's purpose.
Generic facts are useless. Intent-aligned facts are gold.

═══════════════════════════════════════════════════════════════════
IDENTITY REQUIREMENTS (GATE 1 - MUST PASS BEFORE CONTINUING)
═══════════════════════════════════════════════════════════════════

You must FIRST verify identity with high confidence:
- Search for "${recipientName}" at "${recipientCompany}"
- Look for LinkedIn, company about pages, press mentions
- Extract disambiguators: specific projects, past companies, education, initiatives
- Watch for confounders (other people with same name)

IDENTITY DECISION:
- PASS_HIGH (confidence >= 0.75): Full name + company confirmed, unique disambiguators found
- PASS_LOW (confidence 0.45-0.74): Partial match, company confirmed but limited unique signals
- FAIL (confidence < 0.45): Cannot reliably identify person, too many confounders

If FAIL: Set fallback.mode = "failed" and stop. DO NOT fabricate hooks.

═══════════════════════════════════════════════════════════════════
EVIDENCE REQUIREMENTS (GATE 2 - WHAT COUNTS AS A HOOK)
═══════════════════════════════════════════════════════════════════

A valid hook_fact MUST include at least one:
✓ QUOTE - Exact words they said (from interview, podcast, article)
✓ NAMED_INITIATIVE - A specific named project/program they created or led
✓ DESCRIBED_DECISION - A specific choice they made with concrete context
✓ NAMED_ARTIFACT - A specific talk, article, book, paper by title
✓ PUBLIC_STANCE - A clearly stated position on an issue

AUTOMATICALLY REJECT:
✗ "Known for..." / "Interest in..." / "Focus on..."
✗ "Has been involved in..." / "Passionate about..."
✗ Generic role descriptions or job history
✗ Anything you cannot point to a specific URL

═══════════════════════════════════════════════════════════════════
INTENT-FIT SCORING (CRITICAL - THIS IS THE PRIORITY)
═══════════════════════════════════════════════════════════════════

Score each potential hook 0.0-1.0 on INTENT_FIT:
- 1.0: Directly connects to sender's purpose (perfect bridge)
- 0.7-0.9: Related topic that sender can credibly connect to
- 0.4-0.6: Tangentially related, requires creative bridging
- 0.0-0.3: Irrelevant to sender's purpose (do not include)

ONLY include hooks with intent_fit >= 0.5
PRIORITIZE hooks with intent_fit >= 0.7

═══════════════════════════════════════════════════════════════════
LIKE_YOU_INGREDIENTS (NOT A SENTENCE - RAW MATERIALS)
═══════════════════════════════════════════════════════════════════

For each hook, provide ingredients to craft a "Like you," sentence:
- shared_axis: The domain/theme both sender and recipient care about
- shared_action: What they both DO in that space
- shared_stakes: Why it matters to both

The email writer will combine these. Keep them concrete, not abstract.

═══════════════════════════════════════════════════════════════════
SUFFICIENCY RULES (DETERMINES FALLBACK MODE)
═══════════════════════════════════════════════════════════════════

Research is SUFFICIENT if:
- 2+ hook_packs with overall >= 0.6
- At least 1 hook with intent_fit >= 0.7
- At least 1 hook has pointable evidence (quote, named_artifact, named_initiative)

If SUFFICIENT: Set fallback.mode = "sufficient"

If NOT SUFFICIENT but identity PASSED:
- Set fallback.mode = "minimal"
- Populate profile_summary with whatever you found (education, past companies, trajectory)
- Populate likely_interests based on their role/company
- Set fallback.reason explaining what's missing

═══════════════════════════════════════════════════════════════════
OUTPUT REQUIREMENTS
═══════════════════════════════════════════════════════════════════

Return structured JSON matching the provided schema:
- identity: confidence scoring and decision
- hook_packs: 0-3 valid hooks (sorted by overall score descending)
- fallback: mode + profile_summary if needed
- citations: all URLs you used
- research_notes: brief notes on what you found/didn't find

DO NOT:
- Fabricate quotes or facts
- Include hooks with identity_conf < 0.5
- Include hooks with intent_fit < 0.5
- Pad with generic observations
- Return more than 3 hook_packs

PRIORITIZE:
- Intent alignment over generic impressiveness
- Specific pointable evidence over vague claims
- Honest "minimal" fallback over fabricated hooks
`;
}

interface ExaResearchResult {
  researchId: string;
  status: "pending" | "completed" | "failed";
  output?: {
    identity: {
      canonical_name: string;
      company: string;
      role?: string;
      confidence: number;
      decision: IdentityDecision;
      disambiguators?: string[];
    };
    hook_packs: HookPack[];
    fallback: {
      mode: "sufficient" | "minimal" | "failed";
      profile_summary?: ProfileSummary;
      reason?: string;
    };
    citations: { url: string; title?: string }[];
    research_notes?: string;
  };
  error?: string;
  latency_ms?: number;
}

async function createExaResearchTask(
  instructions: string,
  exaApiKey: string,
  generationId: string,
): Promise<{ researchId: string; error?: string }> {
  console.log(`[exa_research] Creating task generation_id=${generationId}`);

  try {
    const response = await fetch("https://api.exa.ai/research/v1", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${exaApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instructions,
        outputSchema: EXA_RESEARCH_OUTPUT_SCHEMA,
        model: "exa-research", // Use standard model for cost efficiency
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[exa_research] Create task failed: status=${response.status} body=${errorText} generation_id=${generationId}`);
      return { researchId: "", error: `Exa API error: ${response.status}` };
    }

    const data = await response.json();
    console.log(`[exa_research] Task created: researchId=${data.researchId} generation_id=${generationId}`);
    return { researchId: data.researchId };
  } catch (e) {
    console.error(`[exa_research] Create task error: ${e} generation_id=${generationId}`);
    return { researchId: "", error: String(e) };
  }
}

async function pollExaResearchTask(
  researchId: string,
  exaApiKey: string,
  generationId: string,
  timeoutMs: number = EXA_RESEARCH_TIMEOUT_MS,
): Promise<ExaResearchResult> {
  const startTime = Date.now();
  let pollCount = 0;

  while (Date.now() - startTime < timeoutMs) {
    pollCount++;
    
    try {
      const response = await fetch(`https://api.exa.ai/research/v1/${researchId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${exaApiKey}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[exa_research] Poll failed: status=${response.status} body=${errorText} generation_id=${generationId}`);
        return {
          researchId,
          status: "failed",
          error: `Exa poll error: ${response.status}`,
          latency_ms: Date.now() - startTime,
        };
      }

      const data = await response.json();
      console.log(`[exa_research] Poll ${pollCount}: status=${data.status} generation_id=${generationId}`);

      if (data.status === "completed") {
        const latency = Date.now() - startTime;
        console.log(`[exa_research] Completed in ${latency}ms (${pollCount} polls) generation_id=${generationId}`);

        // Extract parsed output
        const parsed = data.result?.parsed;
        if (!parsed) {
          return {
            researchId,
            status: "failed",
            error: "No parsed output in response",
            latency_ms: latency,
          };
        }

        return {
          researchId,
          status: "completed",
          output: parsed,
          latency_ms: latency,
        };
      }

      if (data.status === "failed") {
        return {
          researchId,
          status: "failed",
          error: data.error || "Research task failed",
          latency_ms: Date.now() - startTime,
        };
      }

      // Still pending, wait and poll again
      await new Promise((resolve) => setTimeout(resolve, EXA_RESEARCH_POLL_INTERVAL_MS));
    } catch (e) {
      console.error(`[exa_research] Poll error: ${e} generation_id=${generationId}`);
      // Continue polling unless timeout
    }
  }

  // Timeout
  console.error(`[exa_research] Timeout after ${timeoutMs}ms generation_id=${generationId}`);
  return {
    researchId,
    status: "failed",
    error: `Research timeout after ${timeoutMs}ms`,
    latency_ms: timeoutMs,
  };
}

// ============= V2 RESEARCH RESULT (OUTPUT CONTRACT) =============

interface V2ResearchResult {
  hookPacks: HookPack[];
  senderIntentProfile: SenderIntentProfile | null;
  profileSummary?: ProfileSummary;
  minimalResearch: boolean;
  exaResearchId?: string;
  exaResearchLatencyMs?: number;
  citations: { url: string; title?: string }[];
  identityDecision: IdentityDecision;
  identityConfidence: number;
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
  LOVABLE_API_KEY: string,
  generationId: string,
): Promise<V2ResearchResult> {
  console.log(`=== V2 Research (Exa Research API) === generation_id=${generationId}`);

  // Stage 0: Extract sender intent profile (still useful for email generation context)
  const intentProfile = await extractSenderIntentProfile(
    reachingOutBecause,
    credibilityStory,
    askType,
    LOVABLE_API_KEY,
  );

  console.log("Sender Intent Profile:", {
    primary_theme: intentProfile.primary_theme,
    must_include_terms: intentProfile.must_include_terms.slice(0, 5),
  });

  // Build instructions for Exa Research
  const instructions = buildExaResearchInstructions(
    recipientName,
    recipientCompany,
    recipientRole,
    reachingOutBecause,
    credibilityStory,
    askType,
  );

  // Create Exa Research task
  const { researchId, error: createError } = await createExaResearchTask(
    instructions,
    exaApiKey,
    generationId,
  );

  if (createError || !researchId) {
    console.error(`[exa_research] Failed to create task: ${createError} generation_id=${generationId}`);
    return {
      hookPacks: [],
      senderIntentProfile: intentProfile,
      minimalResearch: true,
      citations: [],
      identityDecision: "FAIL",
      identityConfidence: 0,
      notes: `Exa Research task creation failed: ${createError}`,
    };
  }

  // Poll for completion
  const result = await pollExaResearchTask(researchId, exaApiKey, generationId);

  if (result.status === "failed" || !result.output) {
    console.error(`[exa_research] Task failed: ${result.error} generation_id=${generationId}`);
    return {
      hookPacks: [],
      senderIntentProfile: intentProfile,
      minimalResearch: true,
      exaResearchId: researchId,
      exaResearchLatencyMs: result.latency_ms,
      citations: [],
      identityDecision: "FAIL",
      identityConfidence: 0,
      notes: `Exa Research failed: ${result.error}`,
    };
  }

  // Consume the output (TRUST THE SCHEMA)
  const output = result.output;
  
  console.log(`[exa_research] identity_decision=${output.identity.decision} confidence=${output.identity.confidence} hook_packs=${output.hook_packs.length} fallback_mode=${output.fallback.mode} generation_id=${generationId}`);

  // Build profile summary from fallback if needed
  let profileSummary: ProfileSummary | undefined;
  if (output.fallback.mode === "minimal" && output.fallback.profile_summary) {
    profileSummary = {
      ...output.fallback.profile_summary,
      source: "exa_research",
    };
  }

  const isMinimalResearch = output.hook_packs.length === 0 || output.fallback.mode !== "sufficient";

  return {
    hookPacks: output.hook_packs,
    senderIntentProfile: intentProfile,
    profileSummary,
    minimalResearch: isMinimalResearch,
    exaResearchId: researchId,
    exaResearchLatencyMs: result.latency_ms,
    citations: output.citations,
    identityDecision: output.identity.decision,
    identityConfidence: output.identity.confidence,
    notes: output.research_notes || output.fallback.reason,
  };
}

// ============= STAGE 0: SENDER INTENT PROFILE (KEPT) =============

async function extractSenderIntentProfile(
  reachingOutBecause: string,
  credibilityStory: string,
  askType: AskType,
  LOVABLE_API_KEY: string,
): Promise<SenderIntentProfile> {
  console.log("=== Stage 0: Extract Sender Intent Profile ===");

  const prompt = `Analyze the sender's intent and extract a profile for research targeting.

SENDER CONTEXT:
- Why reaching out: "${reachingOutBecause}"
- Credibility story: "${credibilityStory}"
- Ask type: ${askType}

TASK:
Extract a Sender Intent Profile that captures what the sender ACTUALLY cares about.

OUTPUT JSON ONLY:
{
  "primary_theme": "the core topic/domain (e.g., 'inclusion / Black leadership pipeline', 'AI safety')",
  "secondary_themes": ["optional", "secondary", "themes"],
  "must_include_terms": ["6-12 terms likely to appear in relevant content"],
  "avoid_terms": ["4-10 terms that indicate irrelevant content"],
  "preferred_evidence_types": ["quote", "named_initiative", "described_decision"]
}`;

  try {
    const response = await callLLM(
      LOVABLE_API_KEY,
      "You extract sender intent profiles to guide cold email research. Be specific about themes and terms.",
      prompt,
    );

    const cleaned = response.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      primary_theme: parsed.primary_theme || "",
      secondary_themes: parsed.secondary_themes || [],
      must_include_terms: parsed.must_include_terms || [],
      avoid_terms: parsed.avoid_terms || [],
      preferred_evidence_types: parsed.preferred_evidence_types || ["quote", "named_initiative", "described_decision"],
    };
  } catch (e) {
    console.error("Failed to extract sender intent profile:", e);

    // Fallback: extract simple keywords
    const combinedText = `${reachingOutBecause} ${credibilityStory}`.toLowerCase();
    const simpleTerms = extractSimpleKeywords(combinedText);

    return {
      primary_theme: reachingOutBecause.substring(0, 50),
      secondary_themes: [],
      must_include_terms: simpleTerms.slice(0, 8),
      avoid_terms: [],
      preferred_evidence_types: ["quote", "named_initiative", "described_decision"],
    };
  }
}

function extractSimpleKeywords(text: string): string[] {
  const stopwords = new Set([
    "i", "me", "my", "we", "our", "you", "your", "the", "a", "an", "and", "or", "but",
    "to", "for", "of", "in", "on", "at", "by", "with", "is", "are", "was", "were",
    "be", "been", "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "this", "that", "these", "those", "it", "its", "about", "who", "what",
    "where", "when", "why", "how",
  ]);

  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopwords.has(w))
    .slice(0, 12);
}

// ============= HELPER FUNCTIONS =============

async function callLLM(
  LOVABLE_API_KEY: string,
  systemPrompt: string,
  userPrompt: string,
  modelName: string = MODEL_NAME,
): Promise<string> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Lovable AI error:", response.status, errorText);
    throw { status: response.status, message: errorText };
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ============= VALIDATION CONSTANTS =============

const BANNED_CLICHES = [
  "i'm reaching out because", "reaching out because", "passionate about",
  "would love to connect", "keen interest", "impact at scale", "innovative solutions",
  "extensive experience", "impressed by", "exceptional track record",
  "exploring career paths", "thought leadership", "fostering", "driving impact",
  "deeply resonated", "your incredible", "your remarkable", "your impressive",
  "dedicated my career", "share a commitment", "believe in the importance",
];

const GENERIC_LIKE_YOU_PATTERNS = [
  "passionate about", "think a lot about", "reaching out", "aligned with",
  "resonates", "inspired", "keen to", "deeply appreciate", "share a commitment",
  "believe in", "dedicated to", "driving", "fostering", "cultivating", "championing",
];

const BANNED_LIKE_YOU_VERBS = ["believe", "think", "care", "passionate", "focused", "committed", "want to"];

const CORPORATE_PADDING_PHRASES = [
  "in the space", "thought leader", "synergy", "leverage", "ecosystem", "holistic",
  "paradigm", "stakeholder", "best practices", "core competencies", "value proposition",
  "move the needle", "circle back", "take this offline",
];

const ROBOTIC_VOICE_PATTERNS = [
  "i came across", "i stumbled upon", "i noticed that you", "i was particularly struck",
  "i was impressed", "i was drawn to", "i wanted to reach out", "i hope this email finds you",
  "i would love to", "i'd love to connect", "i believe we could", "i think there's an opportunity",
  "excited to explore", "keen to discuss", "eager to learn", "looking forward to the opportunity",
  "would be thrilled", "would be honored", "greatly appreciate", "truly appreciate",
  "deeply appreciate", "resonate deeply", "resonated with me", "speaks to my",
  "aligns perfectly", "perfectly aligned", "really stood out", "caught my attention",
  "piqued my interest",
];

// ============= VALIDATION =============

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
}

function hasEmDash(text: string): boolean {
  return text.includes("—");
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
    if (sentence.toLowerCase().includes("like you")) {
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
    const cleaned = rawText.replace(/```json\n?|\n?```/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    errors.push("Output was not valid JSON");
    return { valid: false, errors, likeYouCount: 0, wordCount: 0, clicheCount: 0 };
  }

  if (!parsed.subject || typeof parsed.subject !== "string") {
    errors.push('Missing or invalid "subject" field');
  }
  if (!parsed.body || typeof parsed.body !== "string") {
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
      
      for (const verb of BANNED_LIKE_YOU_VERBS) {
        const verbRegex = new RegExp(`\\b${verb}\\b`, 'i');
        if (verbRegex.test(likeYouSentence)) {
          errors.push(`The "Like you," sentence contains banned verb "${verb}" - express shared lived reality, not beliefs`);
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
    errors.push("Contains bracket placeholders like [Name]");
  }

  const bodyLines = body.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
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
    if (lastLine !== "Best,") {
      errors.push('Body must end with exactly "Best," and nothing after');
    }
  }

  if (hasEmDash(body)) {
    errors.push("Body contains em-dash (—) which is banned");
  }
  if (hasEmDash(subject)) {
    errors.push("Subject contains em-dash (—) which is banned");
  }

  if (body.includes("...") || body.includes("…")) {
    errors.push("Body contains ellipsis (... or …) which is banned");
  }

  const wordCount = countWords(body);
  if (wordCount < 60) {
    errors.push(`Body has ${wordCount} words (minimum 60 required)`);
  }
  if (wordCount > 150) {
    errors.push(`Body has ${wordCount} words (maximum 150 allowed—shorter is better)`);
  }

  for (const phrase of CORPORATE_PADDING_PHRASES) {
    if (combinedText.toLowerCase().includes(phrase)) {
      errors.push(`Contains corporate padding phrase: "${phrase}"`);
    }
  }

  const roboticMatches: string[] = [];
  for (const pattern of ROBOTIC_VOICE_PATTERNS) {
    if (combinedText.toLowerCase().includes(pattern)) {
      roboticMatches.push(pattern);
    }
  }
  if (roboticMatches.length > 0) {
    errors.push(`Sounds robotic/generic. Remove: "${roboticMatches[0]}". Write like you'd text a friend.`);
  }

  const sentences = body.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  for (const sentence of sentences) {
    const sentenceWords = countWords(sentence);
    if (sentenceWords > 35) {
      errors.push(`Contains a ${sentenceWords}-word sentence (max 35). Break it up.`);
      break;
    }
  }

  const likeYouSentenceForAbstraction = extractSentenceWithLikeYou(body);
  if (likeYouSentenceForAbstraction) {
    const likeYouWords = countWords(likeYouSentenceForAbstraction);
    if (likeYouWords > 30) {
      errors.push(`"Like you," sentence is ${likeYouWords} words (aim for under 25)`);
    }
  }

  // Opening sentence validation
  const contentLines = bodyLines.slice(1).filter((l) => l !== "Best,");
  if (contentLines.length > 0) {
    const firstParagraph = contentLines[0];
    const firstSentenceMatch = firstParagraph.match(/^[^.!?]+[.!?]/);
    const firstSentence = firstSentenceMatch ? firstSentenceMatch[0].toLowerCase() : firstParagraph.toLowerCase();

    const BANNED_OPENING_PATTERNS = [
      /^i read\b/, /^i saw\b/, /^i came across\b/, /^i found\b/, /^i noticed\b/,
      /^i stumbled\b/, /^i discovered\b/, /^i was reading\b/, /^i was looking\b/,
      /^i wanted to reach out\b/, /^reaching out\b/, /^i'm reaching out\b/, /^i'm writing\b/,
      /^i'll keep this short\b/, /^quick question\b/, /^quick note\b/, /^random question\b/,
      /^this might be out of the blue\b/, /^i'm a huge fan\b/, /^i've long admired\b/, /^i've been following\b/,
      /^i'm a\b/, /^i am a\b/, /^i'm an\b/, /^i am an\b/, /^my name is\b/,
      /^i work at\b/, /^i work as\b/, /^i just finished\b/, /^i'm working on\b/, /^i'm building\b/, /^i'm currently\b/,
    ];

    const SELF_INTRO_PATTERNS = [
      /^i'm a\b/, /^i am a\b/, /^i'm an\b/, /^i am an\b/, /^my name is\b/,
      /^i work at\b/, /^i work as\b/, /^i just finished\b/, /^i'm working on\b/, /^i'm building\b/, /^i'm currently\b/,
    ];

    let foundBanned = false;
    for (const pattern of SELF_INTRO_PATTERNS) {
      if (pattern.test(firstSentence)) {
        errors.push(`Opening sentence is self-intro — lead with what you're OFFERING (event/product/ask), not who you ARE.`);
        foundBanned = true;
        break;
      }
    }

    if (!foundBanned) {
      for (const pattern of BANNED_OPENING_PATTERNS) {
        if (pattern.test(firstSentence)) {
          errors.push(`Opening sentence starts with banned pattern — lead with sender-side news or a specific detail`);
          break;
        }
      }
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

function buildRetryInstruction(errors: string[], recipientFirstName?: string): string {
  const errorList = errors.map((e) => `- ${e}`).join("\n");

  const greetingReminder = recipientFirstName
    ? `- Email body MUST start with "Hi ${recipientFirstName}," on its own line`
    : '- Email body MUST start with "Hi [Name]," on its own line';

  return `

REWRITE REQUIRED — your previous output had issues:
${errorList}

VOICE REMINDER (most important):
- Write like you're texting a smart friend, not drafting a memo
- The "Like you," line should be the most NATURAL sentence, not the most formal
- Shorter is better. If it can be said in fewer words, do it.
- Reference specific things (names, projects, numbers) not abstractions

HARD FIXES:
${greetingReminder}
- "Like you," must appear exactly once (capital L, comma after)
- "Like you," sentence must be under 25 words and feel natural
- Readable in under 20 seconds. Shorter is better. Do not pad.
- End with just "Best," 
- No em-dashes, no brackets, no corporate buzzwords

Return ONLY valid JSON with "subject" and "body".`;
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

function buildProfileSummaryPromptSection(summary: ProfileSummary): string {
  const sections: string[] = [];

  sections.push(`RECIPIENT PROFILE (limited research - be honest about what you know):`);
  sections.push(`- Current: ${summary.current_role} at ${summary.current_company}`);

  if (summary.career_trajectory) {
    sections.push(`- Career path: ${summary.career_trajectory}`);
  }

  if (summary.education.length > 0) {
    sections.push(`- Education: ${summary.education.slice(0, 3).join(", ")}`);
  }

  if (summary.past_companies.length > 0 && !summary.career_trajectory) {
    sections.push(`- Previously at: ${summary.past_companies.slice(0, 3).join(", ")}`);
  }

  if (summary.skills.length > 0) {
    sections.push(`- Skills/expertise: ${summary.skills.slice(0, 5).join(", ")}`);
  }

  if (summary.likely_interests.length > 0) {
    sections.push(`- Likely cares about: ${summary.likely_interests.slice(0, 3).join(", ")}`);
  }

  sections.push(`
IMPORTANT - MINIMAL RESEARCH MODE:
We could not find specific interviews, podcasts, or quotes from this person.
DO NOT fabricate specific facts, quotes, or initiatives.

For your "Like you," line, use ONE of these approaches:
1. SHARED TRAJECTORY: If you share a similar career path
2. SHARED DOMAIN: If you work in the same space/industry
3. SHARED CHALLENGE: Reference a challenge common to their role

DO NOT USE generic phrases like "Like you, I'm passionate about..." or "Like you, I believe in..."`);

  return sections.join("\n");
}

// ============= MAIN HANDLER =============

serve(async (req) => {
  const generationId = crypto.randomUUID();
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const body = await req.json();

    const recipientName = body.recipientName || "";
    const recipientCompany = body.recipientCompany || "";
    const recipientRole = body.recipientRole || "";
    const askType = (body.askType || "chat") as AskType;
    const reachingOutBecause = body.reachingOutBecause || "";
    const credibilityStory = body.credibilityStory || "";
    const sharedAffiliation = body.sharedAffiliation || null;

    const source = body.source || "app";
    const scenarioName = body.scenario_name || body.scenarioName || null;
    const sessionId = body.sessionId || null;
    const includeDebug = body.includeDebug || source === "test_harness";
    
    // BOOT log
    console.log(`BOOT generate-email deploy_version=${DEPLOY_VERSION} generation_id=${generationId} session_id=${sessionId}`);
    
    const responseHeaders = buildResponseHeaders(generationId);

    // Input validation
    if (!recipientName || recipientName.length < 2 || recipientName.length > 100) {
      return new Response(JSON.stringify({ error: "Invalid recipient name" }), {
        status: 400,
        headers: responseHeaders,
      });
    }

    if (!recipientCompany || recipientCompany.length < 1 || recipientCompany.length > 100) {
      return new Response(JSON.stringify({ error: "Invalid company name" }), {
        status: 400,
        headers: responseHeaders,
      });
    }

    if (!recipientRole || recipientRole.length < 1 || recipientRole.length > 100) {
      return new Response(JSON.stringify({ error: "Invalid role/title" }), {
        status: 400,
        headers: responseHeaders,
      });
    }

    if (!credibilityStory || credibilityStory.length < 10 || credibilityStory.length > 1000) {
      return new Response(JSON.stringify({ error: "Credibility story must be between 10 and 1000 characters" }), {
        status: 400,
        headers: responseHeaders,
      });
    }

    if (!reachingOutBecause || reachingOutBecause.length < 5 || reachingOutBecause.length > 500) {
      return new Response(JSON.stringify({ error: "Please explain why you are reaching out (5-500 characters)" }), {
        status: 400,
        headers: responseHeaders,
      });
    }

    const recipientFirstName = recipientName.split(" ")[0];

    const inputJson = {
      recipientName,
      recipientCompany,
      recipientRole,
      askType,
      reachingOutBecause,
      credibilityStory,
      sharedAffiliation,
    };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const EXA_API_KEY = Deno.env.get("EXA_API_KEY");

    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(JSON.stringify({ error: "Failed to generate email. Please try again." }), {
        status: 500,
        headers: responseHeaders,
      });
    }

    // ============= V2 RESEARCH (SINGLE EXA RESEARCH CALL) =============
    let researchResult: V2ResearchResult | null = null;

    if (EXA_API_KEY) {
      console.log("Starting V2 research (Exa Research API)...");

      try {
        researchResult = await performV2Research(
          recipientName,
          recipientCompany,
          recipientRole,
          reachingOutBecause,
          credibilityStory,
          askType,
          EXA_API_KEY,
          LOVABLE_API_KEY,
          generationId,
        );

        console.log(`V2 Research complete: ${researchResult.hookPacks.length} Hook Packs, identity=${researchResult.identityDecision}`);
      } catch (e) {
        console.error("V2 Research pipeline failed:", e);
      }
    } else {
      console.log("EXA_API_KEY not configured, skipping research");
    }

    // ============= GENERATE EMAIL =============
    console.log("=== Generate Email ===");

    // Build shared affiliation section if provided
    let sharedAffiliationSection = "";
    if (sharedAffiliation && sharedAffiliation.name) {
      sharedAffiliationSection = `
SHARED AFFILIATION (user-declared, use ONLY as last resort for "Like you," connection):
- Connection: ${sharedAffiliation.name}
${sharedAffiliation.detail ? `- Sender's connection: ${sharedAffiliation.detail}` : ""}

IMPORTANT: Only use this if no stronger craft/problem/constraint parallel exists.`;
    }

    // Build Hook Packs section
    let hookPacksSection = "";
    if (researchResult && researchResult.hookPacks.length > 0) {
      const topHookPacks = [...researchResult.hookPacks]
        .sort((a, b) => b.scores.intent_fit - a.scores.intent_fit)
        .slice(0, 2);

      const labels = ["PRIMARY", "BACKUP"];
      hookPacksSection = `
RESEARCH FOUND (use to craft your "Like you," line):
${topHookPacks
  .map(
    (hp, i) => `
[${labels[i]}] SPECIFIC FACT: ${hp.hook_fact.claim}
   Evidence: "${hp.hook_fact.evidence}"
   Source: ${hp.hook_fact.source_url}
   
   RAW INGREDIENTS FOR "Like you,":
   - What you both do: ${hp.bridge.like_you_ingredients.shared_action}
   - The world you share: ${hp.bridge.like_you_ingredients.shared_axis}
   - Why it matters: ${hp.bridge.like_you_ingredients.shared_stakes}
   
   Intent fit: ${(hp.scores.intent_fit * 100).toFixed(0)}%
`,
  )
  .join("")}

INSTRUCTIONS:
- Use the PRIMARY hook pack. It has the highest intent fit.
- Rewrite the "Like you," line to sound natural
- Reference the specific fact somewhere in the email`;
    } else if (researchResult?.profileSummary) {
      hookPacksSection = buildProfileSummaryPromptSection(researchResult.profileSummary);
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
${researchResult?.senderIntentProfile ? `- Theme: ${researchResult.senderIntentProfile.primary_theme}` : ""}

REMEMBER:
- Include "Like you," exactly once (capital L, comma)
- Put the "Like you," line in paragraph 1 or 2
- Readable in under 20 seconds. Shorter is better.
- One clear ask at the end
- End with just "Best," (no name after)
- No em-dashes, no brackets, no corporate speak

Return JSON only:
{
  "subject": "...",
  "body": "..."
}`;

    // Generate email with validation and retry
    let rawResponse: string;
    let validation: ValidationResult;
    const enforcementResults: EnforcementResults = {
      did_retry: false,
      failures_first_pass: [],
      failures_retry: [],
    };

    try {
      console.log("Generating email (attempt 1)...");
      rawResponse = await callLLM(LOVABLE_API_KEY, SUPER_PROMPT, userPrompt);
      console.log("AI response:", rawResponse);

      validation = validateEmail(rawResponse, recipientFirstName);
      enforcementResults.failures_first_pass = validation.errors;

      if (!validation.valid) {
        console.log("Validation failed (attempt 1):", validation.errors);

        enforcementResults.did_retry = true;
        const retryPrompt = userPrompt + buildRetryInstruction(validation.errors, recipientFirstName);

        console.log("Generating email (attempt 2 - retry)...");
        rawResponse = await callLLM(LOVABLE_API_KEY, SUPER_PROMPT, retryPrompt);
        console.log("AI response (retry):", rawResponse);

        validation = validateEmail(rawResponse, recipientFirstName);
        enforcementResults.failures_retry = validation.errors;

        if (!validation.valid) {
          console.log("Validation still failed after retry:", validation.errors);
        } else {
          console.log("Retry succeeded, validation passed");
        }
      } else {
        console.log("Validation passed on first attempt");
      }
    } catch (error: any) {
      if (error.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: responseHeaders,
        });
      }
      if (error.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }), {
          status: 402,
          headers: responseHeaders,
        });
      }

      console.error("Generation error:", error);
      return new Response(JSON.stringify({ error: "Failed to generate email. Please try again." }), {
        status: 500,
        headers: responseHeaders,
      });
    }

    // Parse final response
    let emailData: { subject: string; body: string };
    try {
      const cleanedContent = rawResponse.replace(/```json\n?|\n?```/g, "").trim();
      emailData = JSON.parse(cleanedContent);
    } catch {
      console.error("Failed to parse final response as JSON");
      return new Response(JSON.stringify({ error: "Failed to generate valid email. Please try again." }), {
        status: 500,
        headers: responseHeaders,
      });
    }

    const latencyMs = Date.now() - startTime;
    const wordCount = countWords(emailData.body);
    const clicheCount = countCliches(emailData.subject + " " + emailData.body);
    const likeYouCount = countLikeYouCapitalized(emailData.body);

    // Log analytics
    console.log(`=== GENERATION ANALYTICS === generation_id=${generationId}`);
    console.log(`hook_packs: ${researchResult?.hookPacks.length || 0}`);
    console.log(`intent_profile: ${researchResult?.senderIntentProfile?.primary_theme || "none"}`);
    console.log(`exa_research_id: ${researchResult?.exaResearchId || "none"}`);
    console.log(`exa_research_latency_ms: ${researchResult?.exaResearchLatencyMs || 0}`);
    console.log(`identity_decision: ${researchResult?.identityDecision || "none"}`);
    console.log(`identity_confidence: ${researchResult?.identityConfidence || 0}`);
    console.log(`citations: ${researchResult?.citations.length || 0}`);
    console.log(`did_retry: ${enforcementResults.did_retry}`);
    console.log(`like_you_count: ${likeYouCount}`);
    console.log(`word_count: ${wordCount}`);
    console.log(`validator_passed: ${validation.valid}`);
    console.log(`latency_ms: ${latencyMs}`);
    console.log(`deploy_version: ${DEPLOY_VERSION}`);
    console.log(`============================`);

    // Log to database
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

      if (supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { error: insertError } = await supabase.from("email_generations").insert({
          session_id: sessionId,
          source,
          scenario_name: scenarioName,
          input_json: inputJson,
          prompt_version: PROMPT_VERSION,
          model_name: MODEL_NAME,
          research_model_name: "exa-research",
          subject: emailData.subject,
          body: emailData.body,
          word_count: wordCount,
          cliche_count: clicheCount,
          like_you_count: likeYouCount,
          has_em_dash: hasEmDash(emailData.body),
          validator_passed: validation.valid,
          validator_errors: validation.errors.length > 0 ? validation.errors : null,
          enforcement_results: enforcementResults,
          exa_queries: researchResult?.exaResearchId ? [researchResult.exaResearchId] : [],
          exa_results: researchResult?.citations.map((c) => ({ url: c.url, title: c.title })) || [],
          selected_sources: researchResult?.citations.map((c) => c.url) || [],
          researched_facts: researchResult?.hookPacks.map((hp) => hp.hook_fact.claim) || [],
          latency_ms: latencyMs,
        });

        if (insertError) {
          console.error("Failed to log generation:", insertError);
        }
      }
    } catch (logError) {
      console.error("Logging error:", logError);
    }

    // Build response
    const hookPacks = researchResult?.hookPacks || [];

    // Legacy format for UI
    const hookFacts = hookPacks.map((hp) => ({
      claim: hp.hook_fact.claim,
      source_url: hp.hook_fact.source_url,
      evidence_quote: hp.hook_fact.evidence,
      why_relevant: hp.bridge.why_relevant,
      bridge_type: hp.bridge.bridge_angle === "domain" ? ("intent" as const) :
                   hp.bridge.bridge_angle === "value" ? ("credibility" as const) : ("curiosity" as const),
      hook_score: Math.max(1, Math.min(5, Math.round(hp.scores.overall * 5))),
    }));

    const responsePayload: any = {
      subject: emailData.subject,
      body: emailData.body,
      hookPacks,
      hookFacts,
      exaQueries: researchResult?.exaResearchId ? [researchResult.exaResearchId] : [],
      exaResults: researchResult?.citations.map((c) => ({ url: c.url, title: c.title, snippet: "" })) || [],
      selectedSources: researchResult?.citations.map((c) => c.url) || [],
      enforcementResults,
      validatorPassed: validation.valid,
      validatorErrors: validation.errors.length > 0 ? validation.errors : null,
      likeYouCount,
      wordCount,
      clicheCount,
      retryUsed: enforcementResults.did_retry,
    };

    // Debug info for test harness
    if (includeDebug && researchResult) {
      responsePayload.debug = {
        senderIntentProfile: researchResult.senderIntentProfile,
        exaResearchId: researchResult.exaResearchId,
        exaResearchLatencyMs: researchResult.exaResearchLatencyMs,
        identityDecision: researchResult.identityDecision,
        identityConfidence: researchResult.identityConfidence,
        citations: researchResult.citations,
        notes: researchResult.notes,
      };
    }

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Unhandled error:", error);
    return new Response(JSON.stringify({ error: "An unexpected error occurred. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
