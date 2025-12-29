import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============= DEPLOY VERSION - BUMP THIS ON EACH DEPLOY =============
const DEPLOY_VERSION = "2025-12-27d-exa-flat-schema";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "x-deploy-version, x-generation-id",
};

const PROMPT_VERSION = "v9.0-voice-first";
const MODEL_NAME = "gemini-2.5-flash";

// Exa Research config
const EXA_RESEARCH_TIMEOUT_MS = 90000; // 90 seconds - Exa needs time to complete research gathering phase
const EXA_RESEARCH_POLL_INTERVAL_MS = 2000; // 2 seconds (faster polling for early stop)

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
type IdentityDecision = "PASS" | "FAIL";

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

// FLATTENED SCHEMA - Max depth 5 levels to satisfy Exa API constraints
// We flatten nested objects (scores, like_you_ingredients) to top-level properties
const EXA_RESEARCH_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    identity_canonical_name: { type: "string" },
    identity_company: { type: "string" },
    identity_role: { type: "string" },
    identity_confidence: { type: "number" },
    identity_decision: { type: "string", enum: ["PASS", "FAIL"] },
    identity_disambiguators: { type: "array", items: { type: "string" } },
    hook_packs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          // hook_fact fields (flattened)
          claim: { type: "string" },
          source_url: { type: "string" },
          evidence: { type: "string" },
          evidence_type: { type: "string", enum: ["quote", "named_initiative", "described_decision", "named_artifact", "public_stance"] },
          // bridge fields (flattened)
          bridge_angle: { type: "string", enum: ["domain", "value", "tradeoff", "artifact", "inflection", "shared-affiliation"] },
          why_relevant: { type: "string" },
          // like_you_ingredients (flattened)
          shared_axis: { type: "string" },
          shared_action: { type: "string" },
          shared_stakes: { type: "string" },
          // simplified scoring - just one score
          score_intent_fit: { type: "number" },
        },
        required: ["claim", "source_url", "evidence", "evidence_type", "bridge_angle", "why_relevant", "shared_axis", "shared_action", "shared_stakes", "score_intent_fit"],
      },
    },
    fallback_mode: { type: "string", enum: ["sufficient", "minimal", "failed"] },
    fallback_reason: { type: "string" },
    // Profile summary fields (simplified)
    profile_education: { type: "array", items: { type: "string" } },
    profile_past_companies: { type: "array", items: { type: "string" } },
    profile_named_artifacts: { type: "array", items: { type: "string" } },
    profile_key_topics: { type: "array", items: { type: "string" } },
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
  required: ["identity_canonical_name", "identity_company", "identity_confidence", "identity_decision", "hook_packs", "fallback_mode", "citations"],
};

// Helper to map flattened Exa output back to internal HookPack type
function mapFlatHookPackToInternal(flat: Record<string, unknown>): HookPack {
  const intentFit = (flat.score_intent_fit as number) || 0;
  return {
    hook_fact: {
      claim: (flat.claim as string) || "",
      source_url: (flat.source_url as string) || "",
      evidence: (flat.evidence as string) || "",
      evidence_type: (flat.evidence_type as EvidenceType) || "quote",
    },
    bridge: {
      bridge_angle: (flat.bridge_angle as BridgeAngle) || "domain",
      why_relevant: (flat.why_relevant as string) || "",
      like_you_ingredients: {
        shared_axis: (flat.shared_axis as string) || "",
        shared_action: (flat.shared_action as string) || "",
        shared_stakes: (flat.shared_stakes as string) || "",
      },
      intent_theme: (flat.intent_theme as string) || "",
    },
    scores: {
      // Simplified scoring: we only have score_intent_fit now
      // Map it to all score fields for backward compatibility
      identity_conf: intentFit,
      non_generic: intentFit,
      intent_fit: intentFit,
      bridgeability: intentFit,
      overall: intentFit,
    },
  };
}

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
You are researching ${recipientName} (${recipientRole} at ${recipientCompany}) to find 1-2 SPECIFIC hooks for a cold email.

TIME BUDGET: 30 seconds max. STOP IMMEDIATELY once you find 2 hooks with score_intent_fit >= 0.7.

SENDER'S PURPOSE:
"${reachingOutBecause}"
Ask type: ${askType}
Credibility: "${credibilityStory}"

INSTRUCTIONS:
1. IDENTITY: Confirm this person exists at this company. Extract 2-3 disambiguators (e.g., past company, project name, education). Set identity_decision = "PASS" if confident, "FAIL" if not.

2. SEARCH STRATEGY (you decide which to try first):
   - Intent-first: Search for topics related to sender's purpose. Filter results to ${recipientName}.
   - Profile-first: Search for ${recipientName} + ${recipientCompany}. Filter results for intent relevance.

3. WHAT COUNTS AS A HOOK:
   ✓ Quote they said (with exact words)
   ✓ Named initiative/project they led
   ✓ Specific decision/tradeoff they made
   ✓ Named artifact (talk, article, paper by title)
   ✗ Generic "passionate about X" or "known for Y"
   ✗ Job history without specifics

4. SCORE EACH HOOK (0.0–1.0):
   score_intent_fit: How well does this connect to sender's purpose?
   - 1.0 = perfect bridge
   - 0.7 = strong relevance
   - 0.5 = weak connection
   Only return hooks with score_intent_fit >= 0.5.

5. LIKE_YOU INGREDIENTS (for each hook):
   - shared_axis: domain both care about
   - shared_action: what they both do
   - shared_stakes: why it matters

6. EARLY STOP POLICY:
   - If you find 2 hooks with score_intent_fit >= 0.7, STOP and return immediately.
   - Quality over quantity: better to have 1 excellent hook (0.8+) than 2 mediocre ones.

7. FALLBACK_MODE:
   - "sufficient": 2 hooks found (score_intent_fit >= 0.7) OR 1 excellent hook (>= 0.8)
   - "minimal": identity passed, but no strong hooks. ALWAYS fill profile_* fields (max 2 items each: education, past companies, named artifacts, key topics).
   - "failed": identity failed or no usable data. Still provide any profile_* data you found.

OUTPUT (max 2 hooks):
{
  "identity_decision": "PASS" | "FAIL",
  "identity_confidence": 0.0–1.0,
  "identity_canonical_name": "...",
  "identity_company": "...",
  "identity_disambiguators": ["...", "..."],
  "hook_packs": [
    {
      "claim": "...",
      "source_url": "https://...",
      "evidence": "...",
      "evidence_type": "quote" | "named_initiative" | ...,
      "bridge_angle": "domain" | "value" | "tradeoff" | ...,
      "why_relevant": "...",
      "shared_axis": "...",
      "shared_action": "...",
      "shared_stakes": "...",
      "score_intent_fit": 0.8
    }
  ],
  "fallback_mode": "sufficient" | "minimal" | "failed",
  "fallback_reason": "...",
  "profile_education": ["...", "..."],
  "profile_past_companies": ["...", "..."],
  "profile_named_artifacts": ["...", "..."],
  "profile_key_topics": ["...", "..."],
  "citations": [{"url": "...", "title": "..."}]
}

DO NOT fabricate. DO NOT pad with generic facts. Return ≤2 hooks. PRIORITIZE SPEED.
`;
}

// Raw flattened output from Exa Research API
interface FlatExaResearchOutput {
  identity_canonical_name: string;
  identity_company: string;
  identity_role?: string;
  identity_confidence: number;
  identity_decision: IdentityDecision;
  identity_disambiguators?: string[];
  hook_packs: Array<Record<string, unknown>>;
  fallback_mode: "sufficient" | "minimal" | "failed";
  fallback_reason?: string;
  // Simplified profile fields
  profile_education?: string[];
  profile_past_companies?: string[];
  profile_named_artifacts?: string[];
  profile_key_topics?: string[];
  citations: { url: string; title?: string }[];
  research_notes?: string;
}

interface ExaResearchResult {
  researchId: string;
  status: "pending" | "completed" | "failed";
  output?: FlatExaResearchOutput;
  error?: string;
  latency_ms?: number;
  partial?: boolean; // True if this was partial data grabbed at timeout
  // Debug fields
  exa_http_status?: number;
  exa_response_bytes?: number;
  exa_raw_keys?: string[];
  exa_parse_error?: string;
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

      // DEBUG: Capture HTTP status
      const httpStatus = response.status;

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[exa_research] Poll failed: status=${response.status} body=${errorText} generation_id=${generationId}`);
        return {
          researchId,
          status: "failed",
          error: `Exa poll error: ${response.status}`,
          latency_ms: Date.now() - startTime,
          exa_http_status: httpStatus,
        };
      }

      // DEBUG: Capture raw response text before parsing
      const rawText = await response.text();
      const responseBytes = rawText.length;

      let data: any;
      let parseError: string | undefined;
      try {
        data = JSON.parse(rawText);
      } catch (e) {
        parseError = String(e);
        console.error(`[exa_research] Parse error: ${e} generation_id=${generationId}`);
        return {
          researchId,
          status: "failed",
          error: `JSON parse error: ${parseError}`,
          latency_ms: Date.now() - startTime,
          exa_http_status: httpStatus,
          exa_response_bytes: responseBytes,
          exa_parse_error: parseError,
        };
      }

      // DEBUG: Capture top-level keys
      const rawKeys = Object.keys(data);
      const elapsed = Date.now() - startTime;

      console.log(`[exa_research] Poll ${pollCount}: status=${data.status} elapsed=${elapsed}ms http_status=${httpStatus} bytes=${responseBytes} keys=${rawKeys.join(',')} generation_id=${generationId}`);

      if (data.status === "completed") {
        const latency = Date.now() - startTime;
        console.log(`[exa_research] Completed in ${latency}ms (${pollCount} polls) generation_id=${generationId}`);

        // Extract parsed output - Exa returns it in data.output, not data.result.parsed
        const parsed = data.output;
        console.log(`[exa_research] Output present: ${!!parsed}, type: ${typeof parsed}, generation_id=${generationId}`);

        if (!parsed) {
          console.error(`[exa_research] No output in response. Full data:`, JSON.stringify(data, null, 2));
          return {
            researchId,
            status: "failed",
            error: "No parsed output in response",
            latency_ms: latency,
            exa_http_status: httpStatus,
            exa_response_bytes: responseBytes,
            exa_raw_keys: rawKeys,
          };
        }

        return {
          researchId,
          status: "completed",
          output: parsed,
          latency_ms: latency,
          exa_http_status: httpStatus,
          exa_response_bytes: responseBytes,
          exa_raw_keys: rawKeys,
        };
      }

      if (data.status === "failed") {
        return {
          researchId,
          status: "failed",
          error: data.error || "Research task failed",
          latency_ms: Date.now() - startTime,
          exa_http_status: httpStatus,
          exa_response_bytes: responseBytes,
          exa_raw_keys: rawKeys,
        };
      }

      // Still pending, wait and poll again
      await new Promise((resolve) => setTimeout(resolve, EXA_RESEARCH_POLL_INTERVAL_MS));
    } catch (e) {
      console.error(`[exa_research] Poll error: ${e} generation_id=${generationId}`);
      // Continue polling unless timeout
    }
  }

  // Timeout - make one final attempt to grab partial results
  console.error(`[exa_research] Timeout after ${timeoutMs}ms, attempting final poll for partial results generation_id=${generationId}`);

  try {
    const response = await fetch(`https://api.exa.ai/research/v1/${researchId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${exaApiKey}`,
      },
    });

    if (response.ok) {
      const rawText = await response.text();
      const data = JSON.parse(rawText);

      console.log(`[exa_research] Final poll status: ${data.status} generation_id=${generationId}`);

      // If we have any output, even if status is still "pending", try to use it
      // BUT: Only accept it if it has the minimum required structure
      if (data.output && typeof data.output === 'object') {
        console.log(`[exa_research] Found partial output on timeout. Output keys: ${Object.keys(data.output).join(', ')} generation_id=${generationId}`);
        console.log(`[exa_research] Partial output structure: has_hook_packs=${!!data.output.hook_packs}, has_identity_decision=${!!data.output.identity_decision}, has_fallback_mode=${!!data.output.fallback_mode} generation_id=${generationId}`);
        console.log(`[exa_research] Full partial output: ${JSON.stringify(data.output, null, 2)}`);

        // Ensure minimum required fields exist with defaults
        const normalizedOutput: FlatExaResearchOutput = {
          identity_canonical_name: data.output.identity_canonical_name || "",
          identity_company: data.output.identity_company || "",
          identity_role: data.output.identity_role || "",
          identity_confidence: typeof data.output.identity_confidence === 'number' ? data.output.identity_confidence : 0,
          identity_decision: (data.output.identity_decision as IdentityDecision) || "FAIL",
          identity_disambiguators: Array.isArray(data.output.identity_disambiguators) ? data.output.identity_disambiguators : [],
          hook_packs: Array.isArray(data.output.hook_packs) ? data.output.hook_packs : [],
          fallback_mode: (data.output.fallback_mode as "sufficient" | "minimal" | "failed") || "failed",
          fallback_reason: data.output.fallback_reason || "Partial results at timeout",
          profile_education: Array.isArray(data.output.profile_education) ? data.output.profile_education : [],
          profile_past_companies: Array.isArray(data.output.profile_past_companies) ? data.output.profile_past_companies : [],
          profile_named_artifacts: Array.isArray(data.output.profile_named_artifacts) ? data.output.profile_named_artifacts : [],
          profile_key_topics: Array.isArray(data.output.profile_key_topics) ? data.output.profile_key_topics : [],
          citations: Array.isArray(data.output.citations) ? data.output.citations : [],
          research_notes: data.output.research_notes || "Partial results captured at timeout",
        };

        return {
          researchId,
          status: "completed",
          output: normalizedOutput,
          latency_ms: timeoutMs,
          partial: true, // Flag to indicate this was partial data at timeout
        };
      }
    }
  } catch (e) {
    console.error(`[exa_research] Final poll failed: ${e} generation_id=${generationId}`);
  }

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
  exaPartialResults?: boolean; // True if results were grabbed at timeout
  citations: { url: string; title?: string }[];
  identityDecision: IdentityDecision;
  identityConfidence: number;
  notes?: string;
  // Exa debug fields
  exa_http_status?: number;
  exa_response_bytes?: number;
  exa_raw_keys?: string[];
  exa_parse_error?: string;
}

async function performV2Research(
  recipientName: string,
  recipientCompany: string,
  recipientRole: string,
  reachingOutBecause: string,
  credibilityStory: string,
  askType: AskType,
  exaApiKey: string,
  GEMINI_API_KEY: string,
  generationId: string,
): Promise<V2ResearchResult> {
  console.log(`=== V2 Research (Exa Research API) === generation_id=${generationId}`);

  // Stage 0: Extract sender intent profile (still useful for email generation context)
  let intentProfile: SenderIntentProfile;
  try {
    intentProfile = await extractSenderIntentProfile(
      reachingOutBecause,
      credibilityStory,
      askType,
      GEMINI_API_KEY,
    );

    console.log("Sender Intent Profile:", {
      primary_theme: intentProfile.primary_theme,
      must_include_terms: intentProfile.must_include_terms.slice(0, 5),
    });
  } catch (e) {
    console.error(`[sender_intent] Failed to extract sender intent profile: ${e} generation_id=${generationId}`);
    return {
      hookPacks: [],
      senderIntentProfile: null,
      minimalResearch: true,
      citations: [],
      identityDecision: "FAIL",
      identityConfidence: 0,
      notes: `Failed to extract sender intent profile: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

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
      exa_http_status: result.exa_http_status,
      exa_response_bytes: result.exa_response_bytes,
      exa_raw_keys: result.exa_raw_keys,
      exa_parse_error: result.exa_parse_error,
    };
  }

  // Consume the output (TRUST THE SCHEMA - map flattened to internal types)
  const output = result.output;

  console.log(`[exa_research] About to process output. Output keys: ${Object.keys(output).join(', ')} generation_id=${generationId}`);
  console.log(`[exa_research] Output has hook_packs: ${!!output.hook_packs}, hook_packs type: ${typeof output.hook_packs}, is_array: ${Array.isArray(output.hook_packs)} generation_id=${generationId}`);
  console.log(`[exa_research] identity_decision=${output.identity_decision} confidence=${output.identity_confidence} hook_packs=${output.hook_packs?.length || 0} fallback_mode=${output.fallback_mode} generation_id=${generationId}`);

  // Map flattened hook_packs to internal HookPack type
  const hookPacks: HookPack[] = output.hook_packs ? output.hook_packs.map(mapFlatHookPackToInternal) : [];

  // Build profile summary from flattened fields if needed
  // IMPORTANT: Always build profile in minimal/failed mode so LLM has context even on timeout
  let profileSummary: ProfileSummary | undefined;
  const fallbackMode = output.fallback_mode || "failed";

  if (fallbackMode === "minimal" || fallbackMode === "failed") {
    const hasProfileData =
      (output.profile_education && output.profile_education.length > 0) ||
      (output.profile_past_companies && output.profile_past_companies.length > 0) ||
      (output.profile_named_artifacts && output.profile_named_artifacts.length > 0) ||
      (output.profile_key_topics && output.profile_key_topics.length > 0);

    if (hasProfileData) {
      // Use identity fields from Exa as fallback to user-provided fields
      const role = output.identity_role || recipientRole;
      const company = output.identity_company || recipientCompany;

      profileSummary = {
        current_role: role,
        current_company: company,
        education: output.profile_education || [],
        past_companies: output.profile_past_companies || [],
        skills: output.profile_key_topics || [], // Map key_topics to skills for compatibility
        career_trajectory: undefined, // Not in new schema
        likely_interests: output.profile_named_artifacts || [], // Map artifacts to interests
        source: "exa_research",
      };
    }
  }

  const isMinimalResearch = hookPacks.length === 0 || fallbackMode !== "sufficient";

  return {
    hookPacks,
    senderIntentProfile: intentProfile,
    profileSummary,
    minimalResearch: isMinimalResearch,
    exaResearchId: researchId,
    exaResearchLatencyMs: result.latency_ms,
    exaPartialResults: result.partial || false,
    citations: output.citations || [],
    identityDecision: output.identity_decision || "FAIL",
    identityConfidence: output.identity_confidence || 0,
    notes: output.research_notes || output.fallback_reason || "No research notes available",
    exa_http_status: result.exa_http_status,
    exa_response_bytes: result.exa_response_bytes,
    exa_raw_keys: result.exa_raw_keys,
    exa_parse_error: result.exa_parse_error,
  };
}

// ============= STAGE 0: SENDER INTENT PROFILE (KEPT) =============

async function extractSenderIntentProfile(
  reachingOutBecause: string,
  credibilityStory: string,
  askType: AskType,
  GEMINI_API_KEY: string,
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
      GEMINI_API_KEY,
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
  GEMINI_API_KEY: string,
  systemPrompt: string,
  userPrompt: string,
  modelName: string = MODEL_NAME,
): Promise<string> {
  // Direct Google Gemini API call
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `${systemPrompt}\n\n${userPrompt}`
        }]
      }],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 8192,
      }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini API error:", response.status, errorText);
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  console.log("Gemini API response:", JSON.stringify(data, null, 2));

  // Better error handling for response structure
  if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
    console.error("Unexpected Gemini response structure:", JSON.stringify(data, null, 2));
    throw new Error(`Unexpected Gemini API response structure: ${JSON.stringify(data)}`);
  }

  return data.candidates[0].content.parts[0].text;
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

  // Initialize trace for debugging
  const trace: Array<{ stage: string; decision?: string; counts?: Record<string, number | string> }> = [];

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

    // NEW: Accept selected hook from research_jobs flow
    const selectedHook = body.selectedHook || null;

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

    // Trace: input validation passed
    trace.push({
      stage: "input_validation",
      decision: "passed",
      counts: { fields_validated: 5 },
    });

    const inputJson = {
      recipientName,
      recipientCompany,
      recipientRole,
      askType,
      reachingOutBecause,
      credibilityStory,
      sharedAffiliation,
    };

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const EXA_API_KEY = Deno.env.get("EXA_API_KEY");

    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is not configured");
      return new Response(JSON.stringify({ error: "Failed to generate email. Please try again." }), {
        status: 500,
        headers: responseHeaders,
      });
    }

    // ============= V2 RESEARCH =============
    // NEW FLOW: If selectedHook is provided, skip research (frontend already did it via research_jobs)
    // OLD FLOW: Still support direct Exa Research Agent call for backwards compatibility
    let researchResult: V2ResearchResult | null = null;

    if (selectedHook) {
      console.log("Using pre-selected hook from research_jobs flow");
      console.log(`Selected hook: "${selectedHook.title}" (confidence: ${selectedHook.confidence})`);

      // Trace: using selected hook
      trace.push({
        stage: "research_source",
        decision: "using_selected_hook",
        counts: {
          hook_confidence: selectedHook.confidence,
        },
      });

      // We'll use selectedHook directly in email generation below
      // No need to populate researchResult for the new flow
    } else if (EXA_API_KEY) {
      console.log("Starting V2 research (Exa Research API - legacy flow)...");

      // Trace: research start
      trace.push({
        stage: "exa_research_start",
        decision: "exa_api_key_present",
      });

      try {
        researchResult = await performV2Research(
          recipientName,
          recipientCompany,
          recipientRole,
          reachingOutBecause,
          credibilityStory,
          askType,
          EXA_API_KEY,
          GEMINI_API_KEY,
          generationId,
        );

        console.log(`V2 Research complete: ${researchResult.hookPacks.length} Hook Packs, identity=${researchResult.identityDecision}`);

        // Trace: research complete
        trace.push({
          stage: "exa_research_complete",
          decision: researchResult.identityDecision,
          counts: {
            hook_packs: researchResult.hookPacks.length,
            citations: researchResult.citations.length,
            identity_confidence: researchResult.identityConfidence,
          },
        });
      } catch (e) {
        console.error("V2 Research pipeline failed:", e);
        console.error("Error details:", e instanceof Error ? e.message : String(e));
        trace.push({
          stage: "exa_research_complete",
          decision: "error",
          counts: { hook_packs: 0 },
          error: e instanceof Error ? e.message : String(e),
        });
        // Don't set researchResult - it will remain undefined and we'll proceed without hooks
      }
    } else {
      console.log("No research data provided and EXA_API_KEY not configured");
      trace.push({
        stage: "research_source",
        decision: "no_research_available",
      });
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

    // NEW FLOW: Use selectedHook if provided from research_jobs
    if (selectedHook) {
      const sources = selectedHook.sources || [];
      const sourcesText = sources.map((s: any) => `${s.label}: ${s.url}`).join('\n   ');

      hookPacksSection = `
RESEARCH FOUND (use to craft your "Like you," line):
[SELECTED HOOK] ${selectedHook.title}
   Hook: ${selectedHook.hook}
   Why it works: ${selectedHook.whyItWorks}
   Confidence: ${(selectedHook.confidence * 100).toFixed(0)}%
   ${sourcesText ? `Sources:\n   ${sourcesText}` : ''}

INSTRUCTIONS:
- This hook was specifically selected by the user
- Use it to craft a natural "Like you," line
- Reference the specific fact from the hook somewhere in the email`;
    } else if (researchResult && researchResult.hookPacks.length > 0) {
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

      // Trace: email generation start
      const topHookPack = researchResult?.hookPacks?.[0];
      trace.push({
        stage: "email_generation_start",
        decision: topHookPack ? "using_primary_hook_pack" : "no_hooks_available",
        counts: {
          hook_packs_available: researchResult?.hookPacks.length || 0,
        },
      });

      rawResponse = await callLLM(GEMINI_API_KEY, SUPER_PROMPT, userPrompt);
      console.log("AI response:", rawResponse);

      validation = validateEmail(rawResponse, recipientFirstName);
      enforcementResults.failures_first_pass = validation.errors;

      if (!validation.valid) {
        console.log("Validation failed (attempt 1):", validation.errors);

        enforcementResults.did_retry = true;
        const retryPrompt = userPrompt + buildRetryInstruction(validation.errors, recipientFirstName);

        console.log("Generating email (attempt 2 - retry)...");
        rawResponse = await callLLM(GEMINI_API_KEY, SUPER_PROMPT, retryPrompt);
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

      // Trace: email generation complete
      trace.push({
        stage: "email_generation_complete",
        decision: enforcementResults.did_retry ? "retry_used" : "first_attempt_success",
        counts: {
          attempts: enforcementResults.did_retry ? 2 : 1,
          validation_errors: validation.errors.length,
        },
      });
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

    // Trace: final validation stats
    trace.push({
      stage: "final_validation",
      decision: validation.valid ? "passed" : "failed",
      counts: {
        word_count: wordCount,
        like_you_count: likeYouCount,
        cliche_count: clicheCount,
        validator_errors: validation.errors.length,
      },
    });

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
    if (includeDebug) {
      responsePayload.debug = {
        trace,
        ...(researchResult && {
          senderIntentProfile: researchResult.senderIntentProfile,
          exaResearchId: researchResult.exaResearchId,
          exaResearchLatencyMs: researchResult.exaResearchLatencyMs,
          exaPartialResults: researchResult.exaPartialResults,
          identityDecision: researchResult.identityDecision,
          identityConfidence: researchResult.identityConfidence,
          citations: researchResult.citations,
          notes: researchResult.notes,
          // Exa debug fields
          exa_http_status: researchResult.exa_http_status,
          exa_response_bytes: researchResult.exa_response_bytes,
          exa_raw_keys: researchResult.exa_raw_keys,
          exa_parse_error: researchResult.exa_parse_error,
        }),
      };
    }

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Unhandled error:", error);
    console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");
    console.error("Error message:", error instanceof Error ? error.message : String(error));

    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({
      error: "Failed to generate email. Please try again.",
      details: errorMessage,
      type: error instanceof Error ? error.constructor.name : typeof error
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
