# Fallback Extractive Evidence Mode

## Overview

The research pipeline now includes a two-mode hook extraction system:

1. **Normal mode**: Exa highlights → Gemini hook extraction (fast, works when highlights are good)
2. **Fallback mode**: Raw text excerpts → Gemini evidence selection + hook extraction (slower, works when highlights thin/empty)

## When Fallback Triggers

Fallback activates when:
- `hooks_count === 0` (normal extraction returned no hooks), OR
- `total_highlights_chars < 600` (highlights too sparse)

## How Fallback Works

1. Builds longer content summaries (2200 chars/doc vs 300 chars in normal mode)
2. Calls Gemini with two-step prompt:
   - STEP A: Select 1-2 verbatim evidence snippets per doc
   - STEP B: Extract hooks using ONLY those snippets
3. Returns hooks with `evidenceQuotes` field containing verbatim source text

## Configuration

### Thresholds
- `minHighlightsChars`: 600 (tunable in `research-fallback.ts`)

### Gemini Settings
- Normal extraction: temp=0.3, maxTokens=2500
- Fallback extraction: temp=0.2, maxTokens=3500

### Content Summary Modes
- Normal: 300 chars/doc, highlights-first
- Fallback: 2200 chars/doc, raw text only

## Trace Fields

New fields in extraction result:
- `fallback_used`: boolean
- `fallback_reason`: "hooks_zero" | "highlights_thin" | null

Logs include:
- `highlights_total_chars`
- `normal_hooks` count
- `fallback_decision` + `reason`
- `fallback_hooks` count (if fallback runs)

## Files Changed

- `shared/research-fallback.ts` - fallback decision logic
- `shared/content-summary.ts` - two-mode summary builder
- `shared/prompts/extract-hooks-fallback.ts` - fallback Gemini prompt
- `shared/exa-search.ts` - Phase 3/4 orchestration + types
- `research/index.ts` + `research-run/index.ts` - unchanged (use shared extractHooks)

## Use Cases

### Journey Intents
Input: "I want to learn about his journey from the UK to Stanford"
- Exa highlights often miss biographical narrative
- Fallback uses raw text excerpts to find journey evidence

### Normal DEI/Project Intents
Input: "Invite to speak about diversity in tech"
- Highlights work well (quotes, initiatives)
- Normal mode succeeds, fallback not triggered
