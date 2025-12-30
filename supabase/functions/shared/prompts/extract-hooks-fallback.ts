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

Acceptable signals include (non-exhaustive):
- Evidence of role, responsibilities, or team membership
- Career transitions or professional trajectory
- Public participation in discussions, forums, or discourse
- Association with initiatives, domains, or functions
- Documented context that helps explain what the person works on or cares about

Unacceptable signals:
- Pure speculation
- Generic company information with no individual linkage
- Industry trends not tied to the person
- Assumptions without source evidence

CRITICAL CONSTRAINTS:
- Do NOT invent facts not present in the snippets
- evidenceQuotes must be copied verbatim from the sources
- If insufficient evidence exists, return { "hooks": [] }

Output requirements:
- Return VALID JSON ONLY
- No explanations
- No markdown
- No prose before or after JSON
- Always return an object with a "hooks" array

Required output format:
{
  "hooks": [
    {
      "id": "hook_1",
      "title": "Short label",
      "hook": "The specific fact or signal (1-2 sentences)",
      "whyItWorks": "Why this connects to sender's intent (1 sentence)",
      "confidence": 0.85,
      "sources": [{"label": "Source 1", "url": "..."}],
      "evidenceQuotes": [{"label": "Source 1", "quote": "verbatim text from source"}]
    }
  ]
}`;
}
