# Roadmap

Maintained by the `po` agent. Order follows the build order in the constitution. An item is `done`
only when every task in its range in its linked spec's `tasks.md` is `[X]`.
Status: `todo`, `in progress`, `done`. Last reviewed: 2026-10-02.

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
| R-13 | BA documentation store and BA agent: Layer B records with revisions and evidence links, BA MCP tools, `ba` subagent and BA skill, works on map evidence; reference portal with ground truth | `specs/004-ba-documentation` US1, T001–T032 | in progress |
| R-14 | Crawler trace mode: record one named process as ordered steps, stop at the submit boundary on production, follow-up tasks drive trace runs | `specs/004-ba-documentation` US4, T033–T050 | todo |
| R-15 | Docs tab: SRS view per portal with evidence and run links, revision history, review actions (confirm/reject/comment), constitution amendment for the review write path | `specs/004-ba-documentation` US2 + US3, T051–T071 | todo |
| R-16 | SRS export and goal evaluation: deterministic Markdown + Mermaid + machine-readable export with traceability matrix and Unknowns section; `docs:evaluate` scores the docs against the reference portal's ground truth | `specs/004-ba-documentation` US5 + US6 + polish, T072–T082 | todo |
| R-18 | To discuss: API discovery depth and browser tooling (richer network capture in the crawler; Playwright MCP and Chrome DevTools MCP as developer debugging tools only) | — (no spec yet) | todo |

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
  and regenerate `data/schema/schema.sql`/`README.md` accordingly (done 2026-10-02, see the merge
  note at the end). All tasks T001–T046 are done;
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
- R-13 to R-16 (BA documentation) share `specs/004-ba-documentation`, started 2026-09-26 on branch
  `feature/004-r13-ba-documentation`. Scope decided with the user: full as-is SRS including processes
  (hence trace mode, R-14), Layer B in SQLite written only via BA MCP tools, living records with stable
  ids and kept revisions linked to evidence and runs, review actions in the dashboard (needs a
  constitution MINOR amendment for a review-only write path, R-15), docs in English with portal terms
  verbatim. Acceptance and goal measurement run on a local reference portal with a ground-truth
  manifest (D8, 2026-09-26); liveinsurer data is a test bed only and not needed. Task ranges come from `specs/004-ba-documentation/tasks.md` (82 tasks).
- R-17 was added 2026-09-27 at the user's request and inserted before R-13, the same way R-12 was
  inserted before the BA agent. It is distinct from R-14 "Crawler trace mode": R-14 records a named
  business process as steps for the BA to document; R-17 is a technical, per-run debug trace of the
  crawler's own machinery. R-13 was paused while R-17 was built.
- R-13 status as of 2026-10-02 (11 of T001–T032 done): T001, T002 (`@pathfinder/docs` and
  `@pathfinder/reference-portal` scaffold), T003–T005 (reference portal server, pages, rules,
  `ground-truth.json`), T007, T008 (Layer B migration, Zod schemas, db-types), T017 (Layer B in the
  portal data partition), T029–T031 (`ba-practice` skill and `ba` agent). Not started: T006, T009–T016,
  T018–T028, T032. The `pathfinder-ba` entry is left out of `.mcp.json` until T026 adds
  `mcp-server/src/ba-main.ts` (the `start:ba` script already points at it); add it back then. Model
  plan for the rest: mechanical tasks on Sonnet; T024, T026–T028 and T032 on Opus.
- 2026-10-02: `feature/004-r13-ba-documentation` merged into `master` so R-13 continues there. Done
  in the merge: the Layer B migration is renumbered to `0004_ba_documentation` (R-14's planned one
  becomes `0005_trace_processes`; spec 004 docs updated), `data/schema/schema.sql` and `README.md`
  carry both `0003_trace` and `0004`, `portal:delete` drops Layer B before the trace tables, and the
  dashboard got read models for the eight Layer B tables (its schema-drift test requires one per
  table; no screens yet, that is R-15). All feature branches are merged and deleted.
- 2026-10-02, R-13 continues on `feature/004-r13-ba-documentation` again (reset to `master`), at the
  user's request. T006 done: `portals/reference-insurer` (sandbox), `portals/reference-insurer-readonly`
  (production, same server), `personas/reference-insurer/guest.yaml`, loaded by `real-files.test.ts`.
  `.mcp.json` now starts the `pathfinder` server with `PATHFINDER_ENV=sandbox`; the user keeps it
  sandboxed while testing, so switch it back before any live run. Still open before the BA server:
  T009–T016, T018, T019, then T020–T028.
- T032, map half only (2026-10-02): guest map run `01a0fe67-3a93-7000-9fc4-035a144567ff` on
  `reference-insurer` in `data/db/sandbox.sqlite`, status `completed`, frontier empty. 12 states (`/`,
  the three product pages, `/porownanie`, `/kalkulator/pojazd`, `/kontakt`, `/faq`, `/slowniczek`,
  `/moje-polisy`, `/moje-polisy/przedluz`, `/logowanie`), 195 actions executed, 6 skipped at the read
  ceiling (5 mutating, 1 external-side-effect), 2 rule candidates (both login walls), 3 open
  questions. Dashboard: `/runs/<id>?env=sandbox` (the dashboard opens on `production` by default).
  The BA half, `docs:audit` and the session id / record counts / FUPs are still owed; T032 stays `[ ]`.
  Findings from the run:
  - `api_endpoints: 0` is correct: the reference portal is server-rendered HTML only, with no JSON
    route and no `fetch`/XHR (its one inline script toggles the `Dalej` button).
  - Five of the portal's eight forms are `method="get"` (three calculator steps, travel quote,
    comparison) but map mode classes their submit buttons as mutating and skips them, so
    `/kalkulator/kierowca`, `/kalkulator/opcje`, `/kalkulator/wynik`, `/ubezpieczenia/podroze/wynik`
    and `/porownanie/wynik` are unmapped. Decided with the user: keep it this way; trace mode (R-14)
    is what reaches them.
  - Unexplained: `/faq` and `/ubezpieczenia/dom` got the same cluster id; each state reports its
    form only on the first visit (`forms: 0` on revisits). Not investigated.
- R-13, BA server built (2026-10-03): T009–T028 done, so 31 of T001–T032; only T032's BA half is open.
  `@pathfinder/docs` has keys, the status engine, the relation table, the observed rule, evidence
  resolution, the audit and a fixture store; `@pathfinder/mcp-server` has a second entry `ba-main.ts`
  serving 13 `pathfinder-ba` tools (reads, sessions, record writes in one transaction each);
  `pnpm docs:audit [<portal>] --env <env>` prints a JSON report and exits 1 on findings. `.mcp.json`
  lists `pathfinder-ba` on `PATHFINDER_ENV=sandbox`. To close R-13: open a new Claude Code session
  (MCP servers load at session start), run the `ba` agent on run `01a0fe67-…`, then
  `pnpm docs:audit reference-insurer --env sandbox`, and record the session id, record counts by
  kind and the FUPs here. Deviations and open points are in
  `session_dump/2026-10-03-r13-ba-server-built.md`.
- T032, BA half (2026-10-03): `ba` agent session `01a0feb6-2b98-7000-b44d-e992133d03f9` on run
  `01a0fe67-…`, status `completed`, all seven passes recorded. `pnpm docs:audit reference-insurer
  --env sandbox` exits 0: 100 records, 104 revisions, 253 evidence links, no findings. T032 is `[X]`,
  so R-13 is at 32 of 32; not merged, the user tests the whole flow first.
  - Records by kind, all `draft`, none withdrawn: 12 screens, 6 capabilities, 4 processes
    (`map_only`), 16 business rules, 8 requirements, 18 data items, 16 glossary terms, 3 NFRs,
    6 assumptions, 7 open questions, 4 follow-ups. No use cases (no trace run yet). The 4 extra
    revisions are CAP-002..005, revised once to add their `contains` process relation.
  - Follow-ups, all `open`, trace mode, guest persona, for T050: FUP-001 OC/AC calculator through all
    four steps, plus one invalid `Kod pocztowy`; FUP-002 travel premium result, plus a trip over
    90 days and a return before departure; FUP-003 comparison result, plus the same product chosen
    twice; FUP-004 contact enquiry confirmation, plus neither `Telefon` nor `E-mail` filled (needs a
    run whose ceiling allows the POST).
  - All 3 crawler open questions are `addressed` (by FUP-001, FUP-003, ASM-004); both rule candidates
    are cited by BR-015. No pending feedback existed.
  - What the BA hit: `record-kinds.md` in the BA skill does not give the `data_item.seen_in` shape
    (`{kind: form|network_call, target_id}`), the NFR category spelling `localisation`, or that
    `measured.value` is a string; each cost a `SCHEMA_INVALID` round. `finish_session` refused the
    summary as `PII_SUSPECTED` until the run id was taken out of it. `get_run_evidence` for edges at
    limit 200 exceeded the agent's output limit, so it read 20 of 195 edges (all from `/`) and took
    other entry points from snapshot links. BR-008, BR-011 and BR-013 are inferred from instruction
    text only, with no recorded enforcement.
  - Changed after the session, at the user's request: `withdraw_record` on a follow-up now sets an
    `open` task to `cancelled`; `.claude-trace/` is in `.gitignore`. The BA skill now gives the
    `seen_in`, NFR category and `measured` shapes, says to page `get_run_evidence` with the default
    limit until `next_cursor` is null, and to keep ids out of prose; the tool's `limit` description
    says to leave it unset. The records from session `01a0feb6-…` were written from 20 of 195 edges;
    a second BA session on the same run should revise the screen entry points from the full list.
  - Second BA session (2026-10-03) `01a0fed4-3423-7000-8ee8-aeb61d44aa55`, same run, `completed`: read
    every page (195 edges, 201 actions, 202 decisions, 12 states, 5 forms, 2 rule candidates,
    3 questions) with no page too large. 25 revisions (SCR-001..012 entry points now cite edges,
    CAP-005, CAP-006, PROC-001..004, BR-015, BR-016, REQ-001, REQ-007, FUP-001..003) and 2 new
    records (NFR-004 "No broken internal navigation for a guest", FUP-005 login and policy renewal
    with a customer account, depends on OQ-001). No confidence raised, nothing withdrawn.
    `docs:audit` exits 0: 102 records, 131 revisions, 432 links.
  - Bug found: every follow-up's stored `target` is `{}`. `FollowupTarget` is a `z.union` whose first
    member `{ url?: string }` accepts any object and strips `process_name`/`goal`; the top-level
    `.strict()` does not reach nested objects. Tests never read a target back. Fixed in `6a90a6d`
    (both target forms strict, `url` stays optional per data-model.md; tests read targets back).
  - Third BA session (2026-10-03) `01a0fee9-6ae2-7000-aa40-a1ac75ffbe85`, after reconnecting
    `pathfinder-ba`, `completed`: only FUP-001..005 revised to restore their targets, all trace:
    FUP-001 "Oblicz składkę OC/AC", FUP-002 "Oblicz składkę podróżną", FUP-003 "Porównaj" (the
    button, not the "Porównanie" nav link), FUP-004 "Wyślij zapytanie", FUP-005 "Przedłuż polisę"
    (login plus renewal; needs the customer account asked for in OQ-001). Read back and checked in
    the store. `docs:audit` exits 0: 102 records, 136 revisions, 454 links. FUP-001 rev 2's change
    note claims a target that the bug had emptied.
- R-18 added 2026-10-02 at the user's request, to discuss later; nothing is decided or specified.
  Starting points: (1) the crawler already records page-made `xhr`/`fetch` calls as method, path
  template, status and body shapes linked to the triggering action
  (`packages/crawler/src/network-recorder.ts`); it does not record classic form POSTs or WebSockets,
  drops bodies over the size cap, and never interprets what a call means (that is the BA's job).
  (2) Idea from https://stevekinney.com/writing/driving-vs-debugging-the-browser: Playwright MCP
  drives a browser, Chrome DevTools MCP debugs one. Position so far: neither goes to the crawler
  agent, because a second browser would bypass the `pathfinder` server's scope, denylist, robots,
  rate-limit, read-ceiling and PII gates; DevTools MCP may be useful to developers for checking what
  the recorder missed; richer capture belongs in the recorder itself.
