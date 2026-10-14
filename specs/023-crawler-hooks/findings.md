# Findings: spec 023 (R-53 crawler hooks and URL lists)

The acceptance cases that are gates (`packages/gates/tests/hooks.test.ts`, proving-ground page
`/__test/hook-gate`), and what came up while building.

## F-01 A page that only works with a cookie and a script patch (SC-001), 2026-10-14

- **Case**: `/__test/hook-gate` shows "Strona otwarta" and a "Dalej" button only when the cookie
  `pg_hook_consent=1` is set and `window.__pgPatched` was set before the page's script ran.
- **Gate**: with an `onRunStart` hook that adds the cookie and an init script, the observed page
  is open and has the button; the same run without hooks records "Brak zgody".

## F-02 A disallowed regex URL is never opened (SC-002), 2026-10-14

- **Case**: the gate page links `/__test/hooks/polisa/123/druk`; `urls.disallowed` holds the
  regex `/\/polisa\/\d+\/druk/`.
- **Gate**: the link is a skipped frontier item with "excluded by rule …" and no page visit has
  that URL; a `navigate` to it is refused.

## F-03 `urls.allowed` limits a scan to one section (SC-003), 2026-10-14

- **Case**: `urls.allowed: ["/__test/hook-gate", "/__test/hooks/sekcja/*"]`.
- **Gate**: the section link is queued, the other two links are out of scope with
  `urls.allowed`, and `/sklep` is refused.

## F-04 A throwing hook leaves the run going with one recorded failure (SC-005), 2026-10-14

- **Gate**: an `onPageLoad` hook that throws: the page is still observed, one decision note
  `hook:onPageLoad:<fn>` says `failed`, the run is still running.

## F-05 Subagent script edits continue

- The T004 migration agent used only the Edit tool (no slip), after the brief named the rule
  twice. Logged as the counterpart of spec 022 F-13.

## F-06 The pipeline golden lock flakes on a rate-limiter wait under load, 2026-10-14

- **Symptom**: in `pnpm test:slow` (e2e and gates in parallel), `pipeline-golden.e2e.test.ts`
  failed with one extra `limiter_wait` event (and every later id shifted by one); alone it passed
  twice, and it passed in the full `pnpm test` before.
- **Cause**: `limiter_wait` is emitted only when the limiter actually waited, which depends on
  timing; the golden normaliser keeps it.
- **Test idea**: drop `limiter_wait` events from the golden normaliser (or give the mock portal's
  run an unlimited rate), so the lock covers the pipeline order, not the clock.

## Close-out review: feature/023-r53-crawler-hooks (2026-10-14)

| # | File:line | Guideline | Finding | Change | Size | Outcome |
| - | --------- | --------- | ------- | ------ | ---- | ------- |
| 1 | apps/crawler/packages/hooks/src/run.ts:61 | G-04 | `contextFor` took 6 positional parameters (limit 5) | `contextFor(deps, { point, url, action }, { did, log })` | small | fixed |
| 2 | apps/crawler/packages/mcp-server/src/runtime/pipeline/process-page.ts:25 | G-02, G-06 | `processPage` grew from 77 to 89 lines with the hook calls (limit 80) | `runPageLoadHooks(rs)` and a `notePatched(ctx, rs, stateId, pageHooks)` that decides itself, both in `runtime/hooks.ts`; 89 → 81 lines | small | partly fixed (1 line over; goes away with the next split of `processPage`) |
| 3 | apps/proving-ground/backend/src/proving_ground/estate.py:91 | G-20 | `HOOK_GATE_COOKIE` is defined and never used (the cookie name is written in the page script) | removed the constant and its trailing comment | small | fixed |
| 4 | apps/crawler/packages/safety/CLAUDE.md:28 | G-30 | test count "6 files" is stale (10 test files after this branch) | corrected | small | fixed |
| 5 | apps/crawler/packages/mcp-server/CLAUDE.md, apps/crawler/packages/config/CLAUDE.md | G-30 | not updated for spec 023: mcp-server layout lacks `runtime/hooks.ts`, `services/run-hooks.ts` and the hook calls in navigate/act/process-page/settle; config notes lack `urls`, `hooks`, `timeouts`, `url-entry.ts` | add one layout line each (files are outside the branch's changed files, so not edited here) | small | deferred → parent session |
| 6 | apps/crawler/packages/mcp-server/src/services/start-run.ts:137 | G-02, G-03, G-06 | `startRunRecord` is 199 lines, complexity 17; the hook loading added 3 lines to a function already over both limits | split the preflight, scope and insert phases into helpers | large | deferred → follow-up |
| 7 | runtime/pipeline/process-page.ts:27,53 and runtime/hooks.ts (`notePatched`, `onRun`) | G-18 | the `onPageLoad` call and the `hook:patched` note run and write the decision log outside `step()`, so they are not in a step's span and not in the `reported(…)` order | make hook runs a `step(sc, 'hooks', …)` returning `reported(…, [decision(…)])`; changes the span tree locked by `pipeline-golden.e2e.test.ts` | large | deferred → follow-up |

Checks after fixes: typecheck ✓ lint ✓ (0 errors) test:fast ✓ (25 files, 209 tests); dashboard ruff ✓ pytest -n auto ✓; proving-ground backend ruff ✓ pytest ✓. test:slow not run (the parent session runs `pnpm test`; fixes 1 and 2 touch `runtime/hooks.ts` and `process-page.ts`, so the golden test needs that pass).
Summary: 7 findings, 3 fixed, 1 partly fixed, 3 deferred, 0 rejected.
