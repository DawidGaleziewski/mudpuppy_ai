# Roadmap

Maintained by the `po` agent. Order follows the build order in the constitution. An item is `done`
only when every task in its range in its linked spec's `tasks.md` is `[X]`.
Status: `todo`, `in progress`, `done`. Last reviewed: 2026-09-29.

| ID | Item | Tasks | Status |
| --- | --- | --- | --- |
| R-01 | Workspace scaffold and test/lint tooling | T001–T006 | done |
| R-02 | Fingerprint package: route template, ARIA canonicalization, two-level fingerprint | T007–T011 | done |
| R-03 | Repo restructure: TS workspace moved to `apps/crawler/`; `governor` and `po` agents | — (not in tasks.md) | done |
| R-04 | Core: Zod schemas, migrations, DB access, ids, PII scrubber, evidence store, logging | T012–T021 | done |
| R-05 | Config: portal and persona loaders, `extends`, secret detection | T022–T030 | done |
| R-06 | US2 Production is only read: safety classifier, env guard, gates, rate limiter | T031–T044 | done |
| R-07 | US1 Map a portal as a guest: MCP server, obstacles, crawler runtime, agent, mock-portal run | T045–T065 | in progress |
| R-08 | US3 Portals and personas as reusable configuration | T066 | done |
| R-09 | US4 Hand locators to QA | T067–T069 | done |
| R-10 | Polish and cross-cutting concerns | T070–T074 | in progress |
| R-11 | Portal-agnostic safety and portal workspaces: robots.txt enforcement, generic rule ids, per-portal rules, per-portal data | `specs/002-portal-agnostic-safety` T001–T065 | done |
| R-12 | Dashboard UI: read-only FastAPI + htmx dashboard over the crawl DB, live updates, frontend-dev agent and revamp-dashboard skill | `specs/003-dashboard-ui` T001–T029 | done |
| R-17 | Crawl run observability trace: per-run technical trace of the crawler's own machinery (calls, phases, decisions, requests, fingerprinting, frontier, agent transcript), inspectable from the R-12 dashboard | `specs/005-crawl-run-observability-trace` T001–T046 | done |

## Notes

- R-03 is recorded as out-of-spec work (resolved 2026-09-21): repo housekeeping (TS workspace
  moved under `apps/crawler/`, `governor` and `po` agents) that delivers no feature requirement, so
  no task line is added to `tasks.md` (that would renumber T001-T074 references). Path changes it
  caused are already reflected in `tasks.md`. Traceable via commit `b1639fc` and the agents commit
  `348fac0`.
- R-06 is built before R-07 (safety first, Principle V); R-04 and R-05 block both.
- Commits: R-02 `02e17b7`, R-03 `b1639fc` and `348fac0`, R-04 `5633dc4`, R-05 `17f1187`, R-06 `eee48a9`,
  R-07 `dfe3f40` and `23c8a9b` (open), R-08 `412ed19`, R-09 `d4907a4`, R-10 partial `6f1b0d8` (open), deps `59807cb`,
  R-11 `3d4ed21`, T072 sign-off `50662f4`, R-12 `2132b2f`, `ee6519a` and `8989790`, R-17 `89c3530`.
  None of these hashes exist on `master` any more: the `feature/001-r04-core-crawler-map-mode` branch
  they were made on was squash-merged into `master` as a single commit, `2799c96` ("docs(roadmap): start
  R-04, record R-03 as out-of-spec work"). Kept here only as the historical record of when each item
  landed; use `2799c96` to find the code on `master`.
- R-04 branch: `feature/001-r04-core-crawler-map-mode` (squash-merged into `master` as `2799c96`, see
  above). R-05 to R-09 and most of R-10 were also built on this branch and are now split into one commit
  per item (see Commits); `po` closes R-07 and R-10 once their open tasks pass.
- Open in R-07: T059 (placeholder obstacle selectors need a supervised live run). Open in R-10: T073
  (quickstart on the live portal), T074 (live bypass-attempt run). T072 (manual compliance gate) is
  done (see below).
- R-11 spec folder: `specs/002-portal-agnostic-safety` (all T001-T065 done). R-11 is `done`: its
  implementation is already on `master` as commit `3d4ed21` — `git diff 3d4ed21
  origin/feature/002-r11-portal-agnostic-safety` is empty, confirming the branch tip `d7b2ad1` was
  squash-merged into `master` under `3d4ed21`'s roadmap-titled message rather than via a separate merge
  commit. No further merge is needed.
- MarketSite is on hold for legal reasons (Regulamin MarketSite art. 10.10: reuse of MarketSite
  materials "wymaga każdorazowo zgody marketsite.example"). The live-run tasks of R-07/R-10 (T059, T072, T073,
  T074) target `liveinsurer` (`portals/liveinsurer/portal.yaml`, `personas/liveinsurer/guest.yaml`) instead of
  `marketsite`. R-11's robots.txt enforcement (spec 002 US1), needed to close the `cHash` denylist
  gap, is done on `master`.
- R-12 is inserted before the BA agent at the user's request (2026-09-25) so recorded crawl data
  (liveinsurer runs, states, actions, forms, decision log) can be inspected; it is a Python app under
  `apps/dashboard/` managed with uv (FastAPI, Pydantic, Jinja + htmx), strictly read-only on
  `data/db/*.sqlite`. Resolved by constitution 1.3.0 (commit `2132b2f`), which states every app,
  whatever its language, lives in its own self-contained `apps/<name>/`.
- T072 (manual compliance sign-off for liveinsurer) is done: commit `50662f4` set
  `compliance.robots_checked_on`/`terms_reviewed_on` to 2026-09-25, `terms_reviewed_by: Randal
  Chopirik`, and replaced the placeholder `rate_limit.user_agent` contact with `tester@example.test`. The
  first live run attempted under this sign-off (T073, 2026-09-25) failed before any page load:
  `start_run` could not launch headless Chromium on this host (missing `libnss3`/`libnspr4`/
  `libasound2`); only `robots.txt` was fetched (4×200). 4 run rows were left `running` in
  `data/db/production.sqlite`, to be swept to `interrupted` by the existing `interruptStaleRuns` on next
  server start. The required browser libraries were installed on this host by 2026-09-28 (verified
  during R-17 T046, see below), so that specific blocker is resolved; T059, T073, T074 are still
  open (nobody has re-run them against `liveinsurer` since) but are no longer blocked on missing libraries.
- R-17 spec folder: `specs/005-crawl-run-observability-trace`, built on
  `feature/005-r17-crawl-run-observability-trace`. Migration `0003_trace` lands first (R-13,
  `feature/004-r13-ba-documentation`, is paused with an unmerged `0003_ba_documentation` migration
  on its own branch); when R-13 resumes it must renumber that migration to `0004_ba_documentation`
  and regenerate `data/schema/schema.sql`/`README.md` accordingly. All tasks T001–T046 are done;
  R-17 is `done`.
  - T046 (2026-09-28, this host, browser libraries now present): ran the real `mcp-server`
    entrypoint (`tsx src/main.ts`, the same command `.mcp.json` and `pnpm start` use) over real
    stdio against a real file-based store, driving a scripted `start_run` → 3×`navigate` →
    5×`act` → `finish_run` on a temporary sandbox portal (deleted afterwards via `portal:delete`).
    Confirmed live: US1 replay (call list, phases, expandable detail), US2 safety proof
    (`decision_log` count == `event decision` span count, 10 == 10; two `robots_check` events for
    the twice-requested disallowed asset), US4 diagnostics (`stabilization_timeout` on the
    never-settling page with in-flight requests and ages; `obstacle` events for the cookie banner;
    `fingerprint_assign` split/merge/similarity), Playwright trace zips written per browser call
    and excluded from `portal:export`, FR-016 run-less calls (a refused `start_run` against
    `marketsite`, still missing compliance, shown on `/activity`), an interrupted call
    (`SIGKILL` mid-`navigate`, restarted server → that call `unfinished`, the earlier one `ok`),
    SC-003 (phase sums within 0.3% of call duration), and `portal:delete`/`portal:export` handling
    of `trace_spans`/`agent_turns`/`data/traces/<portal>/` correctly. Not exercised: scenario 5
    (agent transcript import) — no live crawler-subagent transcript was available this session;
    already covered by `transcript`/`join`/`import-agent` unit tests. Scenario 7's browser trace
    was confirmed written and valid (a real zip) but not opened in `npx playwright show-trace`'s
    GUI (headless environment).
  - **Bug found and fixed while running this** (not R-17-specific — affects every real crawl):
    running the server via `tsx` (what `.mcp.json`/`pnpm start` actually do; vitest is unaffected)
    hits esbuild's hardcoded `keepNames: true` dev transform, which wraps every named
    function/arrow inside a `page.evaluate()` closure with a call to its own `__name(fn, "name")`
    runtime helper — a helper that is never defined in the page, throwing `ReferenceError: __name
    is not defined` on every `navigate`/`act` that reaches form extraction. This means no real
    crawl has actually completed a step via the real entrypoint before now; earlier live-run
    attempts (T073) never got far enough to hit it (blocked earlier, on browser launch). Fixed by
    a shared `evalInPage()` helper (`packages/crawler/src/pw-eval.ts`) that inlines esbuild's own
    `__name` shim into the same `evaluate()` round-trip (Playwright's evaluate runs in an isolated
    per-document world that `context.addInitScript` cannot reach and that resets on navigation, so
    the shim can't be set once and relied on); a no-op once compiled. Applied at all 4
    `page.evaluate` call sites (`observer.ts`, `stabilizer.ts`). Regression test:
    `packages/crawler/tests/pw-eval.test.ts` (reproduces the exact `__name`-referencing source
    shape via `new Function`, independent of tsx).
- 2026-09-25, commit `d8cff2a` (branch `feature/001-r07-liveinsurer-live-run-fixes`): the Chromium launch
  blocker above is resolved (commit `6e26bf6`, already on `master`). A fresh live guest run against
  liveinsurer got 8 steps in before being deliberately paused (not finished, not failed) after fixing five
  further blockers found in order: a CAPTCHA-detector false positive on vendor script bodies, an
  `__name is not defined` crash unique to the real tsx-run server (untested by Vitest), liveinsurer's
  two-step Cookiebot banner needing a `cookie_manage` obstacle before `cookie_banner`, click timeouts
  from strict-FIFO rate limiting (fixed with a priority lane for main-frame navigations), and ~200
  native `<select>` options flooding the frontier and starving footer links. Full detail and
  not-yet-implemented follow-ups (step latency at 1 rps, error diagnosability, decision-log gaps for
  obstacle dismissals, liveinsurer's hidden skip links) are in `specs/001-crawler-map-mode/tasks.md` under
  T059 and T073. T059, T073, T074 stay open: the next live run needs a fresh MCP reconnect and a
  supervised `crawler` subagent session to actually complete §2–§9 of the quickstart.
