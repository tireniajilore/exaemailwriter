export function buildExtractHooksFallbackPrompt(params: {
  name: string;
  company: string;
  senderIntent?: string;
  contentSummary: string;
}): string {
  const { name, company, senderIntent, contentSummary } = params;

  return `You are extracting personalization hooks from research about ${name} at ${company}.

SENDER'S INTENT: ${senderIntent ?? 'Not specified - general networking'}

CONTENT SOURCES:
${contentSummary}

TASK (TWO STEPS IN ONE RESPONSE):

STEP A: Evidence Selection
For each source above, select 1-2 verbatim snippets (50-150 words each) that are directly relevant to the sender's intent. Copy the text exactly as written.

STEP B: Hook Extraction
Using ONLY the snippets you selected in Step A, extract 1-3 specific hooks that:
1. Reference a named project, quote, decision, or artifact
2. Are directly relevant to the sender's intent
3. Have verifiable evidence from the selected snippets

CRITICAL CONSTRAINTS:
- Do NOT invent facts not present in the snippets
- evidenceQuotes must be copied verbatim from the sources
- If insufficient evidence exists, return { "hooks": [] }

OUTPUT FORMAT (JSON only):
{
  "hooks": [
    {
      "id": "hook_1",
      "title": "Short label",
      "hook": "The specific fact or quote (1-2 sentences)",
      "whyItWorks": "Why this connects to sender's intent (1 sentence)",
      "confidence": 0.85,
      "sources": [{"label": "Source 1", "url": "..."}],
      "evidenceQuotes": [{"label": "Source 1", "quote": "verbatim text from source"}]
    }
  ]
}`;
}
