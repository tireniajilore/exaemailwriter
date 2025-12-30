// Test the JSON parsing logic to see if it handles Gemini's actual responses

const testCases = [
  {
    name: "Code fence with complete JSON",
    input: '```json\n{\n  "hooks": [\n    {\n      "id": "hook_1",\n      "title": "Test",\n      "hook": "Test hook",\n      "whyItWorks": "It works",\n      "confidence": 0.8,\n      "sources": []\n    }\n  ]\n}\n```',
    expected: { hooks: [{ id: "hook_1", title: "Test", hook: "Test hook", whyItWorks: "It works", confidence: 0.8, sources: [] }] }
  },
  {
    name: "Code fence cut off (truncated)",
    input: '```json\n{\n  "hooks": [\n    {\n      "id": "hook_1",\n      "title": "Pursuing a New Entrepreneurial Endeavor",\n      "hook": "Chris Young recently announced his departure from Microsoft in January 2025 to pursue a new, entrepreneurial endeavor, after leading hundreds of strategic partnerships and fostering a culture of innovation as',
    expected: null // Should fail gracefully
  },
  {
    name: "Raw JSON array without fences",
    input: '["Chris Young Microsoft strategy future of business leadership", "Chris Young Microsoft strategic initiatives talent development diversity"]',
    expected: ["Chris Young Microsoft strategy future of business leadership", "Chris Young Microsoft strategic initiatives talent development diversity"]
  },
  {
    name: "Raw JSON object without fences",
    input: '{"hooks": [{"id": "hook_1", "title": "Test"}]}',
    expected: { hooks: [{ id: "hook_1", title: "Test" }] }
  }
];

// Replicate the parsing logic from exa-search.ts
function extractJSON(text: string): any {
  let parsed: any;

  // Strategy 1: Find first complete JSON object/array with balanced braces
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  let startChar = -1;
  let isArray = false;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startChar = firstBrace;
    isArray = false;
  } else if (firstBracket !== -1) {
    startChar = firstBracket;
    isArray = true;
  }

  if (startChar !== -1) {
    let depth = 0;
    let endPos = -1;
    let inString = false;
    let escapeNext = false;
    const openChar = isArray ? '[' : '{';
    const closeChar = isArray ? ']' : '}';

    for (let i = startChar; i < text.length; i++) {
      const char = text[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === openChar) depth++;
        if (char === closeChar) {
          depth--;
          if (depth === 0) {
            endPos = i;
            break;
          }
        }
      }
    }

    if (endPos !== -1) {
      const jsonStr = text.substring(startChar, endPos + 1);
      console.log(`Extracted ${jsonStr.length} chars`);
      try {
        parsed = JSON.parse(jsonStr);
        return parsed;
      } catch (e) {
        console.error(`Parse failed:`, e);
      }
    }
  }

  return null;
}

// Run tests
for (const testCase of testCases) {
  console.log(`\n=== ${testCase.name} ===`);
  console.log(`Input (first 200 chars): ${testCase.input.substring(0, 200)}`);

  const result = extractJSON(testCase.input);

  if (testCase.expected === null) {
    console.log(`Expected: null (should fail gracefully)`);
    console.log(`Result: ${result === null ? 'null ✅' : `${JSON.stringify(result)} ❌`}`);
  } else {
    const matches = JSON.stringify(result) === JSON.stringify(testCase.expected);
    console.log(`Expected: ${JSON.stringify(testCase.expected).substring(0, 100)}...`);
    console.log(`Result: ${JSON.stringify(result).substring(0, 100)}...`);
    console.log(matches ? '✅ PASS' : '❌ FAIL');
  }
}
