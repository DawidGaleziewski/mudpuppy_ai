# Findings: spec 077

Owner rule: every bug or slip gets an eval or test idea.

| # | Part | What was wrong | Cause | Test or eval idea |
| - | ---- | -------------- | ----- | ----------------- |
| F-01 | chat | A turn whose setup threw (a launch that throws, a row that does not parse) left the person waiting: no answer, no error, no log (spec 075 F-01) | `runTurn` treated every failure as AcpChat's, which logs only its own | Fixed: an `error` event with a logged reference unless AcpChat sent one this turn (`error-flow.test.ts`: a launch that throws) |
| F-02 | dashboard | After the person's Stop the live scan's reason was the crawler's refusal of its next call ("run … is interrupted; no further actions are possible") and the last page was drawn failed | `scan_live` takes the last call's error as the stop reason | Fixed: a confirmed `scan.stop` makes the reason "You pressed Stop." and no page failed (`test_wb_scan.py`). Eval idea: a golden prompt "why did it stop?" after a Stop |
| F-03 | dashboard, chat | The live conversation showed event turns as the assistant gets them: `[event]` and the instructions ("Say in one line that it is starting…") | The event text is one string for the model and the person | Fixed: an event is its fact, a blank line, then the instruction; the console shows the fact only (`queries_wb.event_line`, `test_workbench_live.py`) |
| F-04 | web | The main bundle was 859 kB: every page and the state libraries loaded up front (R-105 (1)) | Pages imported eagerly in `App.tsx` | Fixed: one chunk per page (React Router's object `lazy`), main 230 kB; a test drives the real lazy routes (`navigation.test.tsx`) |
| F-05 | web tests | With lazy pages, 104 page tests failed: the first import of a page took longer than `findBy`'s 1 s | Each test file loads its pages for the first time inside the test | `render-at` resolves every page once per file (top-level await); one test keeps the real lazy routes |
| F-06 | dashboard | No Content Security Policy on the console (spec 043 F-08, R-94 (6)) | Never added | Fixed: `spa.py` sends the designer's policy with inline styles allowed (custom properties, Mermaid's `<style>`); `test_api_app.py`; `ui:check` on 19 pages at two widths, a Mermaid diagram and the live WebSocket with no console error |
| F-07 | dashboard ui:check | With the CSP on, `ui:check` could not inject axe-core (an inline script) | `addScriptTag` is a page script | axe is evaluated by the browser's tools (`page.evaluate`), so the page's own CSP violations still show as console errors |
| F-08 | crawler evals | A server that cannot start on the eval's workspace showed only inside a paid trial (R-97 (5); spec 045 F-02, F-03) | `--dry-run` stopped before the servers | Fixed: the dry run boots each MCP server and lists its tools, exit 2 when one fails (`mcp-check.test.ts`); tried on reference-insurer: 11 and 23 tools |
| F-09 | crawler evals | The eval's MCP config file in `/tmp` was never removed (R-97 (8)) | Written per process, no cleanup | Removed when the eval exits (three older ones from earlier evals are still in `/tmp`) |
| F-10 | chat evals | One grouping trial in three gave up when `workflow_state` was refused (R-97 (6), spec 045 F-04) | The eval's fence had only the two grouping tools; the orchestrator's prompt says to call `workflow_state` | Allowed (read-only, as in the chat); D-1. Eval idea: the next grouping baseline counts trials that save nothing |
| F-11 | roadmap | R-98 (3) ("the access matrix's `budget_limited` personas in the React Access page") was still listed as open | Built in the React port (`Access.tsx` callout) without the roadmap line being closed | Closed in the roadmap |
| F-12 | crawler runtime | A first split of `classifyPress` returned null for a fault with `status: null` instead of the calls' status | `!== undefined` is not `??` | Caught in review before the slow tier: `?? null` then a null check, as before |

## Decisions for the owner to review

- **D-1** The grouping eval allows `workflow_state` instead of telling the prompt it has only two
  tools: it is read-only and the chat's assistant has it, so the trial is closer to the chat. The
  baseline was made without it; the next trial may differ for that reason.
- **D-2** The CSP allows inline styles (`style-src 'self' 'unsafe-inline'`), not the designer's
  nonce: the console is a static build (no per-response nonce), the design system sets custom
  properties in `style`, and Mermaid writes a `<style>` into each diagram. Scripts stay `'self'`
  only.

## Close-out review: feature/077-react-2-leftovers (2026-10-24)

| # | File:line | Guideline | Finding | Change | Size | Outcome |
| - | --------- | --------- | ------- | ------ | ---- | ------- |
| 1 | apps/web/CLAUDE.md:25 (and LAYOUT.md) | G-30, FA-7 | Agent notes do not say that every page route in `App.tsx` now goes through `page(path, () => import(...), 'Name')` (code splitting) or that `tests/render-at.tsx` resolves the lazy pages; the next agent adding a page would write an eager `element:` | add one line under Layout | small | fixed in the close-out commit (a line under Layout in `apps/web/CLAUDE.md`) |
| 2 | apps/crawler/packages/mcp-server/src/runtime/pipeline/probe.ts:200-228 | G-29 | `classifyPress` split into `pressMessages` and `pressHttpStatus` touches `runtime/**`; the lock is the slow tier (probe e2e/gates), and the fast tier does not prove it. Reading shows no behaviour change (the transition query is now skipped when a fault status exists; it is read-only) | none | small | done: `pnpm test:slow` ran on the final version before T051's commit (31 + 22 files green, pipeline golden unchanged) |
| 3 | apps/chat, packages/workflow, apps/crawler (changed lines) | G-01..G-04 | No new size, complexity, depth or params warnings on changed lines or new files (eslint on every changed file, ruff C901/PLR on changed Python); remaining warnings sit in untouched code | none | none | no finding |
| 4 | apps/web (changed files) | FA-1..FA-7 | Layers, state placement, styling, types, dead code and duplication clean: `pnpm check` green (typecheck, lint, stylelint, knip, jscpd, 224 tests) | none | none | no finding |

Checks after fixes (no source edits were needed): web `pnpm check` ✓; chat typecheck ✓ lint ✓ (0 errors) test ✓ (382); workflow typecheck ✓ lint ✓ test ✓ (29); dashboard `ruff check` ✓ pytest -n auto not perf/serial ✓ (598); crawler typecheck ✓ lint ✓ test:fast ✓ (2276); test:slow not run (finding 2).
Summary: 2 findings, both closed by the parent (1 fixed, 1 checked by the slow tier), 0 rejected.
