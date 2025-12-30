export function buildExtractHooksFallbackPrompt(params: {
  name: string;
  company: string;
  senderIntent?: string;
  contentSummary: string;
}): string {
  const { name, company, senderIntent, contentSummary } = params;

  return `You are extracting personalization hooks about ${name} at ${company} based on provided content.

SENDER'S INTENT: ${senderIntent ?? 'Not specified - general networking'}

CONTENT SOURCES:
${contentSummary}

TASK (TWO STEPS IN ONE RESPONSE):

STEP A: Evidence Selection
For each source above, select 1-2 verbatim snippets (50-150 words each) that are directly relevant to the sender's intent. Copy the text exactly as written.

STEP B: Hook Extraction
Using ONLY the snippets you selected in Step A, extract hooks.

A valid hook is any specific, verifiable signal that is credibly attributable to the person's role, trajectory, professional focus, public engagement, or organizational association.

Important rules:
- Attribution may be direct OR indirect.
- The signal does NOT need to be authored by the person.
- Do NOT require named projects, quotes, or first-person statements.
- Do NOT infer opinions or intentions without evidence.
- Do NOT include generic company or industry descriptions unless clearly connected to the person.

DEGRADATION LADDER (you MUST return at least 1 hook):

Tier 1 — Intent-aligned hooks (preferred):
- Directly matches sender's intent
- Evidence-grounded
- Confidence: 0.7–1.0

Tier 2 — Adjacent hooks (if Tier 1 yields 0):
- About recipient's background, leadership, domain, or public work
- Loosely adjacent to sender intent
- Evidence-grounded
- Confidence: 0.35–0.65

Tier 3 — Identity/role hooks (if Tier 2 yields 0):
- What they do, their remit, or notable "about" facts
- Evidence-grounded
- Confidence: 0.15–0.35

You MUST return at least 1 hook. If you cannot find Tier 1, use Tier 2. If you cannot find Tier 2, use Tier 3.

Unacceptable signals:
- Pure speculation
- Generic company information with no individual linkage
- Industry trends not tied to the person
- Assumptions without source evidence

CRITICAL CONSTRAINTS:
- Do NOT invent facts not present in the snippets
- evidenceQuotes must be copied verbatim from the sources
- You MUST return at least 1 hook

Output requirements:
- Return VALID JSON ONLY
- No explanations
- No markdown
- No prose before or after JSON
- Always return an object with a "hooks" array
- evidenceQuotes is REQUIRED for all hooks

Required output format:
{
  "hooks": [
    {
      "id": "hook_1",
      "title": "Short label",
      "hook": "The specific fact or signal (1-2 sentences)",
      "whyItWorks": "Why this connects to sender's intent (1 sentence)",
      "confidence": 0.85,
      "strength": "tier1" | "tier2" | "tier3",
      "weaknessNote": "Optional explanation if confidence < 0.5",
      "sources": [{"label": "Source 1", "url": "..."}],
      "evidenceQuotes": [{"label": "Source 1", "quote": "verbatim text from source"}]
    }
  ]
}`;
}
