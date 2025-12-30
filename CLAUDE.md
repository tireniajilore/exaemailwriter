# CLAUDE.md

## Project Overview
This repo builds a cold-email generation tool powered by Exa search and Gemini AI. The system researches recipients, extracts personalization hooks, and generates contextual emails.

**Priorities (in order):**
1. Correctness of the research pipeline
2. Graceful degradation (never return empty results)
3. Debuggability (comprehensive logging and tracing)
4. Speed of iteration (small, reviewable changes)

## Architecture

### Pipeline Stages
1. **Phase 1: Identity Verification** - Verify recipient exists with Exa
2. **Phase 2: Content Discovery** - Generate Gemini-powered search queries, retrieve top URLs
3. **Phase 3: Content Fetching** - Fetch full text + highlights from Exa
4. **Phase 4: Hook Extraction** - Extract personalization hooks using Gemini with degradation ladder

### Key Technologies
- **Exa API**: Neural search for person/company discovery
- **Gemini 2.5 Flash**: Query generation, topic extraction, hook extraction
- **Supabase Edge Functions**: Serverless Deno runtime
- **React + TypeScript**: Frontend wizard UI

## Non-Negotiables

### Data Integrity
- **Never invent facts, sources, or user data**
- All hooks must have `evidenceQuotes` with verbatim text from sources
- Never hallucinate company info, role details, or attributions
- Use degradation ladder (tier1 → tier2 → tier3) instead of returning empty

### Graceful Degradation
- Prefer partial output + clear fallback over throwing errors
- Every pipeline stage must handle missing/partial upstream data
- Use fallback modes: `hooks_found`, `no_hooks_available`, `extraction_failed`
- Minimum 1 hook guaranteed via tier3 (identity/role hooks)

### Safety Guards
- Guard all optional fields before access (especially `arrays?.length`, `.map()`)
- Always check `Array.isArray()` before treating parsed data as array
- Parser guards: check for `{` and `}` before JSON extraction
- Schema guards: validate structure after parsing

### Code Quality
- Keep changes small, reviewable, and reversible
- No abstractions without 3+ instances of real repetition
- Document "why" in comments, not "what"
- Prefer explicit over clever

## TDD Method (Scaled to This Project)

We use **TDD-lite**: focus tests on contracts and regressions, not exhaustive unit coverage.

### What We Test (in order of ROI)
1. **Contract tests** for public functions and pipeline stage outputs
2. **Fallback behavior** (timeouts, empty search results, malformed model output)
3. **Parsing + schema validation** (JSON extraction, required keys, type guards)
4. **Critical formatting rules** for emails (length bounds, banned clichés, required sections)
5. A small number of **integration tests** that run pipeline end-to-end with mocks

### What We Do NOT Test
- UI pixel details
- Vendor SDK internals (Exa, Gemini)
- "Perfect" prompt compliance (test guardrails + structure instead)
- Edge cases that require >10 lines of setup

### The Loop (Red → Green → Refactor)
1. **Red:** Write a failing test for the behavior change or bug
2. **Green:** Minimal code to pass
3. **Refactor:** Only after green; keep diffs small

### Batch Size
- Default batch: **2–5 tests** before implementation when changes touch multiple components
- If it's a one-line fix, write **one regression test first**, then patch
- For prompt changes: write acceptance test with fixture, verify structure + fallback

### Test Pyramid for This Repo
- ~60% unit tests (pure helpers: parsing, validation, scoring, formatting)
- ~30% integration tests (pipeline stages with mocks)
- ~10% end-to-end tests (one "happy path" + key fallback paths)

### Required Regression Tests (always add when relevant)
If you touch any of these, add/adjust tests:
- Timeout handling returns a valid shape
- Empty hooks path still produces valid email draft
- Malformed JSON from model does not crash extraction
- Missing `hook_packs` (or similar) does not crash logging or mapping
- Every stage returns a `{ decision, counts?, error?, fallback_mode? }` trace entry
- Parser handles code fences, extra prose, partial JSON
- Degradation ladder produces tier3 hooks when tier1/tier2 fail

### Mocking Policy (so tests stay fast)
- **Never call external APIs in tests**
- Mock Exa responses (good, empty, partial, error)
- Mock Gemini responses (valid JSON, invalid JSON, empty, truncated, MAX_TOKENS)
- Use fixtures stored in `/tests/fixtures/`
- Mock at function boundary, not HTTP layer

### Acceptance Tests (the only "output quality" tests we enforce)
Each generated email must:
- Be within configured word count bounds
- Have one clear ask
- Avoid banned clichés list (config-driven)
- Not include hallucinated specifics when hooks are empty
- Maintain stable section structure (opening → credibility → ask → close)
- Reference hooks with source attribution when present

Each hook extraction must:
- Return at least 1 hook (via degradation ladder)
- Include `strength` field (tier1/tier2/tier3)
- Include `evidenceQuotes` array
- Set confidence ranges correctly (tier1: 0.7-1.0, tier2: 0.35-0.65, tier3: 0.15-0.35)
- Include `weaknessNote` when confidence < 0.5

### When to Skip TDD
Only skip if:
- The change is purely comments/docs, OR
- You are doing a spike behind a feature flag with no production impact

If skipped, add a TODO + issue to backfill tests before merge.

## Logging + Debuggability (Required)

### Trace Structure
Every run produces a `trace[]` with stage-by-stage decisions:
```typescript
{
  stage: 'identity' | 'discovery' | 'fetching' | 'extraction',
  status: 'success' | 'partial' | 'failed',
  counts: { urls?: number, docs?: number, hooks?: number },
  fallback_mode?: string,
  fallback_used?: boolean,
  highlights_chars?: number,
  error?: string
}
```

### Logging Requirements
- **Never log PII** (names, emails, company-specific data in production)
- **Do log:** stage name, request_id, counts, fallback_mode, error summaries, finishReason
- Log at key decision points: fallback triggers, parser failures, empty responses
- Use structured logs: `console.log('[stage] key=value key2=value2')`

### Debug Points (Always Log)
- Gemini API calls: model, maxOutputTokens, finishReason, response length
- Parser decisions: code fence stripped, braces found, JSON extraction method
- Fallback triggers: reason (hooks_zero, highlights_thin), threshold values
- Hook quality: tier distribution, confidence ranges, evidenceQuotes presence

## Prompt Engineering Standards

### All Gemini Prompts Must
1. **Enforce strict JSON mode:**
   - "Return VALID JSON ONLY"
   - "No explanations, no markdown, no prose"
   - "If you cannot comply fully, still return valid JSON"

2. **Include graceful fallback:**
   - Specify empty state: `{ "hooks": [] }`
   - Never leave behavior undefined

3. **Be deterministic where possible:**
   - Low temperature (0.1-0.3)
   - Clear output format with examples
   - Explicit constraints

4. **Guard against hallucination:**
   - "Do NOT invent facts not present in sources"
   - "evidenceQuotes must be copied verbatim"
   - "No speculation or assumptions"

### Token Budgets
- `buildHighlightsQuery`: maxOutputTokens >= 128
- Normal hook extraction: maxOutputTokens = 2500
- Fallback hook extraction: maxOutputTokens = 3500
- Query generation: maxOutputTokens = 1024

## Anti-Patterns (Do Not Do These)

### Code Patterns
- ❌ Don't introduce new abstractions unless 3+ instances of real repetition
- ❌ Don't refactor working code without a test that would fail before the refactor
- ❌ Don't add "agent" flows unless explicitly requested
- ❌ Don't access optional fields without guards: `data.hooks.map()` → `(data.hooks ?? []).map()`
- ❌ Don't catch-and-swallow errors without logging
- ❌ Don't use magic numbers: `if (confidence >= 0.65)` → use named constants

### Prompt Patterns
- ❌ Don't ask models to "explain" in production (only in debug mode)
- ❌ Don't leave output format ambiguous
- ❌ Don't use vague terms: "good quality" → define quality criteria
- ❌ Don't assume model compliance: always validate output

### Architecture Patterns
- ❌ Don't add database reads in hot path without caching
- ❌ Don't serialize large objects in logs (truncate to 500 chars)
- ❌ Don't mix UI state with pipeline state
- ❌ Don't create circular dependencies between modules

## Debugging Workflows

### When Hook Extraction Returns Empty
1. Check logs for `[extractHooks] fallback_decision=true reason=X`
2. Verify highlights_chars in Phase 3 logs
3. Check Gemini finishReason (SAFETY, MAX_TOKENS, RECITATION)
4. Inspect full response JSON in logs
5. Verify degradation ladder reached tier3

### When Parsing Fails
1. Check `[extractHooks] Parser guard` logs
2. Verify code fence stripping occurred
3. Check balanced brace extraction logs
4. Look for special characters breaking JSON
5. Verify schema guard passed

### When Quality is Low
1. Check hook `strength` distribution (should prefer tier1)
2. Verify `evidenceQuotes` are present and verbatim
3. Check confidence scores match tier ranges
4. Review `weaknessNote` for tier2/tier3 hooks
5. Inspect source content quality in Phase 3

## Development Workflow

### Making Changes
1. Read relevant section of this file first
2. Write failing test (or skip if docs-only)
3. Implement minimal fix
4. Verify logs show expected behavior
5. Run related tests
6. Commit with descriptive message

### Commit Message Format
```
<verb> <what>: <why if not obvious>

Examples:
- Add degradation ladder to hook extraction
- Fix parser guard: run after code fence stripping
- Relax hook attribution requirements for tier2/tier3
```

### Before Deploying
- [ ] All tests pass
- [ ] Logs include debug info for new code paths
- [ ] No PII in logs
- [ ] Fallback behavior defined for new features
- [ ] Parser guards added for new JSON fields

## Key Files Reference

### Pipeline Core
- `supabase/functions/shared/exa-search.ts` - All 4 pipeline phases
- `supabase/functions/research-run/index.ts` - Background research worker
- `supabase/functions/research/index.ts` - API endpoint for starting research

### Utilities
- `supabase/functions/shared/research-fallback.ts` - Fallback decision logic
- `supabase/functions/shared/content-summary.ts` - Content summarization (normal/fallback modes)
- `supabase/functions/shared/prompts/extract-hooks-fallback.ts` - Fallback extraction prompt

### UI
- `src/pages/Index.tsx` - Research wizard and polling logic
- `src/components/research/` - Research progress UI components

## Configuration

### Environment Variables (Required)
- `EXA_API_KEY` - Exa search API key
- `GEMINI_API_KEY` - Google Generative AI API key
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role (functions only)

### Tunable Thresholds
- Fallback trigger: `minHighlightsChars = 600` (research-fallback.ts)
- Content summary: normal=300 chars, fallback=2200 chars (content-summary.ts)
- Confidence tiers: tier1=0.7-1.0, tier2=0.35-0.65, tier3=0.15-0.35

## Questions to Ask Before Starting

1. **Does this require a prompt change?** → Write acceptance test with fixture first
2. **Could this return empty/null?** → Add fallback mode or degradation tier
3. **Is this adding a new optional field?** → Add type guard and default value
4. **Will this change logs?** → Ensure no PII, add structured keys
5. **Does this touch parsing?** → Add parser guard and malformed input test
