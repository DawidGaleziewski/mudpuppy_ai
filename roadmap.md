# Roadmap

Maintained by the `po` agent. Order follows the build order in the constitution. An item is `done`
only when every task in its range in its linked spec's `tasks.md` is `[X]`.
Status: `todo`, `in progress`, `done`. Last reviewed: 2026-10-03.

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
| R-13 | BA documentation store and BA agent: Layer B records with revisions and evidence links, BA MCP tools, `ba` subagent and BA skill, works on map evidence; reference portal with ground truth | `specs/004-ba-documentation` US1, T001–T032 | done |
| R-14 | Crawler trace mode: record one named process as ordered steps, stop at the submit boundary on production, follow-up tasks drive trace runs | `specs/004-ba-documentation` US4, T033–T050 | done |
| R-15 | Docs tab: SRS view per portal with evidence and run links, revision history, review actions (confirm/reject/comment), constitution amendment for the review write path | `specs/004-ba-documentation` US2 + US3, T051–T071 | done |
| R-16 | SRS export and goal evaluation: deterministic Markdown + Mermaid + machine-readable export with traceability matrix and Unknowns section; `docs:evaluate` scores the docs against the reference portal's ground truth | `specs/004-ba-documentation` US5 + US6 + polish, T072–T082 | done |
| R-18 | To discuss: API discovery depth and browser tooling (richer network capture in the crawler; Playwright MCP and Chrome DevTools MCP as developer debugging tools only) | — (no spec yet) | todo |
| R-19 | To discuss: pan and zoom for Docs diagrams (large maps are too small to read) | — (no spec yet) | todo |
| R-20 | To discuss: screenshots as evidence, with the described elements highlighted, shown on record pages | — (no spec yet) | todo |
| R-21 | To discuss: low-fidelity wireframes per screen, drawn from recorded evidence in one style | — (no spec yet) | todo |
| R-22 | Glossary and BA wiki: one source for Pathfinder and BA terms, dashboard Glossary page, `[?]` tooltips and section intros, local BA wiki with cited sources, glossary-sync step in the close-out | `specs/006-glossary-ba-wiki` T001–T030 | done |

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
- R-13 closed 2026-10-03: the user tested the whole flow and signed it off. All work is on `master`
  (squash `4666e02`, fix `6a90a6d`); `feature/004-r13-ba-documentation` is deleted. R-14 and R-15
  are built together on `feature/004-r14-r15-trace-mode-docs-tab` so trace results can be seen in
  the dashboard.
- R-14 + R-15 built 2026-10-03 on `feature/004-r14-r15-trace-mode-docs-tab` (Opus for the trace
  core, review path, constitution and diagram parity; Sonnet agents for the foundation, agent/skill
  docs and the Docs tab). Commits: `c66de2c` (R-14 T033–T049), `cfda2d0` (R-15 T054, T059 TS,
  T064–T066, T070), `b5ea41a` (R-15 T051–T063, T067–T069). Constitution is 1.4.0. Open: T050
  (trace each open FUP on `reference-insurer`, one on `reference-insurer-readonly`, re-run the BA)
  and T071 (browser review incl. two-tab stale case). T050 needs a NEW Claude Code session so the
  `pathfinder` server starts with the trace tools; the server migrates `sandbox.sqlite` to 0005 on
  start.
  - 2026-10-03 sandbox test run (`fa41957`): `/docs` returned 404 because the dashboard on :8765
    was started before the Docs code (no `--dev` reload); restarted. `/healthz` now reports a code
    fingerprint and `uv run pathfinder-dashboard-smoke --env <env>` flags a stale server and GETs
    every reachable page/fragment (4 000 per env, all 200 on sandbox and production).
    `pnpm trace:smoke` (scripted, real stdio server, no LLM) ran: sandbox calculator (15 steps),
    travel (6), comparison (4) reach their goal pages; `reference-insurer-readonly` stops at
    "Kup polisę" (`external-side-effect`, run completed, open question added). Found and fixed: a
    trace acting with an action id from an earlier page reloaded it and lost the typed values;
    now refused. Added the missing persona for `reference-insurer-readonly` (shared inputs mixin).
    T050 still needs the `crawler` agent itself (new session) and a `ba` re-run; FUP-001..003 were
    not linked (`--followups` does that) so they stay `open` for that run.
  - 2026-10-03 T050 agent run (new session, sandbox): `crawler` agent traced FUP-001 (OC/AC,
    20 steps, `goal_reached`, "Kup polisę" refused), FUP-002 (travel, both date errors and the
    result), FUP-003 (comparison, same-product error and the result) → all `done`; FUP-004 stopped
    with `TRACE_BOUNDARY_REACHED` on "Wyślij zapytanie" (ceiling `read`) → `blocked`; FUP-005 not
    run (needs a customer account). `reference-insurer-readonly` via the agent was refused with
    `ENV_GUARD_REFUSED` (`.mcp.json` has only a sandbox server); covered by `trace:smoke` above.
    `ba` re-run (session `01a1014a-3b57`): PROC-001..003 fully observed, PROC-004 up to the
    boundary, UC-001..004, SCR-013..017, BR-017..023, new FUP-006/007, OQ-008; `docs:audit` ok
    (137 records, 0 findings). FUP-001 needed two retries, reset to `open` by hand in the sandbox
    store (a failed trace leaves the FUP `blocked`). Found (the prompts above carried workarounds
    for 1 and 2), fixed afterwards on this branch:
    1. `start_run` returned no `base_url`; in trace mode there is no frontier, so the agent guessed
       URLs and abandoned. Now `start_run` returns `base_url` and `crawler.md` says to start there.
    2. An action's `value` (the persona's `trace_inputs` suggestion) was read as the field's
       current content; the agent filled only one field and "Dalej" did nothing. Renamed to
       `suggested_value`; a held-back click now also records one "Browser validation on <field>:
       <message>" outcome per invalid field.
    3. Forms were recorded only for a newly created state, so a trace over states an earlier run
       created recorded none and the BA left DI-019..026 without attributes. Now recorded once per
       state per run.
    Ceiling raised at the user's request: `reference-insurer` (portal and its guest persona) is
    `external-side-effect`; `reference-insurer-readonly` stays `read`. FUP-004 still cannot reach
    the confirmation: any phone or e-mail value is masked by the PII scrubber, so `act` refuses it
    (`PII_SUSPECTED`); only the "both empty" error is reachable. Not fixed: the step result gives
    counts only, not table text (the BA reads the premium from evidence); a failed trace leaves
    its FUP `blocked` with no way to retry.
  - 2026-10-03 T071: the user reviewed the Docs tab in a browser on sandbox (quickstart R-15
    steps 1–3) and accepted it; remarks became R-19..R-21.
  - 2026-10-03 T050 re-run (new session, server started after `3ee745f`): `crawler` agent with no
    workarounds in the prompt traced FUP-004 (run `01a10202-84e0`, `completed`, `goal_reached`,
    13 steps, FUP-004 `done`). With `Telefon` and `E-mail` empty, the portal showed "Podaj telefon
    lub e-mail."; then it reached `/kontakt/dziekujemy` "Dziękujemy za wiadomość". No boundary on
    the raised ceiling. Found, not fixed: `act` refused every e-mail value with `@` as
    `PII_SUSPECTED` (4 tries, incl. `test@example.invalid`) and also `000-000-000`, but accepted
    `Telefon` `000000000`, which the agent chose itself (the persona has no `Telefon`). So the
    decision below ("can only reach validation") no longer holds. T050 is `[X]`.
    Fixed in `1462cb0`: an e-mail on a reserved test TLD (`.invalid`, `.test`, `.example`) is now a
    synthetic input for `act` and `trace_inputs`; evidence still masks it as `[email]`.
    `ba` re-run (session `01a102cb-ade7`, `completed`): PROC-004 `observed_extent: full`, UC-004 to
    the confirmation with three exception flows, new SCR-018 (`/kontakt/dziekujemy`) and FUP-008
    (e-mail only; too short `Telefon`), 12 revisions (BR-012/013, REQ-006, SCR-007, CAP-005,
    DI-015/016, NFR-003, OQ-002, ASM-002, ...). `docs:audit` ok: 139 records, 220 revisions,
    869 links, 0 findings. Gaps: no network call recorded for the POST to `/kontakt`: it is a
    classic HTML form POST + redirect, and the recorder takes only `xhr`/`fetch` by design (R-18).
    The shared trace-inputs mixin now has `E-mail: test@example.invalid` (no `Telefon`).
  Decisions taken by default, confirmed by the user 2026-10-03:
  - Trace runs only: a submit whose form declares GET/HEAD counts as read (the calculator's
    "Dalej"/"Oblicz składkę"); POST and label/target rules still raise; map mode unchanged.
  - Every trace step records a state and an edge; fill/check/select do not add depth.
  - `trace_inputs` in `personas/reference-insurer/guest.yaml` first had no `Telefon`/`E-mail`
    (the scrubber refused any e-mail), so FUP-004 could only reach validation. Superseded by
    `1462cb0`: it now has `E-mail: test@example.invalid` and FUP-004 reaches the confirmation.
  - New Docs status labels (`[DRFT]`, `[RJCT]`, `[OLD.]`, `[WDRN]`, `[OPEN]`, `[WORK]`, `[BLKD]`,
    `[CNCL]`, `[BNDY]`, `[ABND]`) added to the Console vocabulary; extra live fragments beyond
    `http-routes-docs.md`; the screen-navigation diagram omits global-menu targets.
- R-14 and R-15 closed 2026-10-03: the user signed off both. The Layer B spec docs
  (`specs/004-ba-documentation`: tasks checkpoints, quickstart, research, trace-tools contract) are
  updated to match. FUP-008 (contact form with e-mail only; too short `Telefon`) stays `open` in the
  store, deliberately not traced; so does FUP-005 (needs a customer account, OQ-001). Merged into
  `master` as one squash commit, like R-13; `feature/004-r14-r15-trace-mode-docs-tab` is deleted.
  Next: R-16 (T072–T082).
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
- R-19..R-21 added 2026-10-03 from the user's notes after the first sandbox review of the Docs tab
  (`user_input/raw_idea/raw_dashboard_and_documentation.md`); nothing is decided or specified.
  None is on the roadmap yet in another form; R-20/R-21 would feed R-16's export.
  - R-19 diagrams: Mermaid already renders SVG in the dashboard (`static/js/diagrams.js`), so pan,
    zoom and a full-screen view need only a small vendored script (e.g. `svg-pan-zoom`, about 30 KB,
    same vendoring as Mermaid; check its licence) or a few dozen lines of our own JS; no new tool, no server
    change. Smallest of the three; fits a dashboard polish task.
  - R-20 screenshots: deliberately left out of v1 (`observer.ts`: "regex masking cannot redact
    pixels"); the constitution allows them only if PII is scrubbed or access-restricted. Precedent:
    R-17 already stores Playwright traces with screenshots for non-production portals, locally,
    never exported. Fit: capture one screenshot per new state at observation time (same moment as
    the ARIA snapshot, so it matches the fingerprint), using Playwright's `mask` option to paint
    over every input and any element whose text the PII scrubber would change; production only with
    an operator opt-in. Highlights: record each action's/field's bounding box with the state and
    draw the highlight in the dashboard over the image, instead of baking it into the pixels, so
    one image serves every record that cites it (SCR, DI, BR). Needs: a migration (screenshot ref
    + boxes, `db-admin`), evidence store for binary files, a BA evidence kind for "screen region",
    and a constitution check. No new external tool (Playwright is already there). Capturing during
    map/trace runs beats a separate screenshot run, which would revisit pages and could drift from
    the recorded state; a re-capture option for old states can come later. Highest value for human
    readers; biggest of the three.
  - R-21 wireframes: an AI drawing freely in Excalidraw would invent layout, which breaks the
    facts-only rule. Better: generate the wireframe deterministically from the recorded ARIA
    snapshot (headings, fields, buttons, tables in page order) as SVG in one fixed style, and
    optionally export Excalidraw's open `.excalidraw` JSON so a person can edit it. PII-safe by
    construction (labels only, already masked), so it is the fallback where screenshots are not
    allowed (production) and suits the R-16 export. Do after R-20, or instead of it for production.
- R-22 added 2026-10-03 from `user_input/raw_idea/raw_glossary_help.md`; nothing is decided. Terms
  the user named: run, route template, confidence, settled, cluster, evidence (what it consists
  of, per run), action, persona, safety class, top locator, target, frontier, decision, trace,
  process. Fit: one source file (e.g. a YAML glossary under `docs/`) that the dashboard loads for
  tooltips and a glossary page, and that a README renders; a "glossary sync" line in the SDD
  close-out checklist (beside changelog) keeps it current per feature. BA wiki: local pages
  linking to and citing recognised sources (IIBA BABOK, IREB CPRE, ISO/IEC/IEEE 29148); write
  them in our own words with short quotes and the original link, since BABOK and similar texts are
  copyrighted and cannot be copied wholesale. No new tool needed. Distinct from the BA agent's
  `GL` records, which describe the portal's terms, not Pathfinder's.
- 2026-10-03: R-22 moved ahead of R-16 at the user's request (the terms block understanding the
  UI). Spec, plan and tasks in `specs/006-glossary-ba-wiki` on `feature/006-r22-glossary-ba-wiki`.
  Scope is the user's rating of 71 proposed terms (`term-review.md`): 59 Must/Nice in v1, 12
  skipped. Decided: Claude writes all entries; tooltips by default, section intros for Run,
  State, Analysis session, Gaps; Actions column "Target" renamed "Links to"; longer pages for
  frontier and evidence. R-16 stays next after R-22.
- R-22 built 2026-10-03: `1217667` (US1 T001–T011: glossary source, README, Glossary page),
  `a5a4f62` (US2–US4 T012–T024: tooltips and intros, BA wiki, glossary sync step), then polish
  T025–T028. Quickstart results (T028): gates green (dashboard 376 tests, crawler 1030); a planted
  unknown term in a template fails `test_glossary_templates.py` naming template and id (SC-005);
  `docs/glossary/README.md` equals the rendered source (SC-006, test); Glossary page, long pages,
  wiki pages, run and Docs tooltips checked in Chromium at 1280 and 375 px with no horizontal
  page scroll; a broken `glossary.yaml` shows a `[WARN]` state and plain labels everywhere else.
  Open: T029 (user sign-off, SC-002) and T030 (close).
  - Findings while building: (1) `data/README.md` says network shape records are stored in
    `data/evidence/`; the code keeps them in `network_calls` columns and writes evidence JSON only
    for robots.txt policies and large trace payloads. Not fixed here (outside R-22). (2)
    `tests/test_main.py` leaked `PATHFINDER_*` env vars into later tests (`delenv` on an unset
    variable records nothing); fixed, because with the glossary's dev-mode reload it made the full
    suite take 6+ minutes. (3) Below 1024 px stacked tables hide their header row, so column
    tooltips are desktop only; heading tooltips and intros show at every width. (4) BABOK v3
    technique pages are members-only, so wiki pages cite them by section and never quote them;
    the IREB glossary is quoted; ISO 29148 is cited via IEEE's public page.
  - Not done (suggestions): Escape to dismiss a hovered tooltip (needs JS; focus moves away
    already dismiss it); `?env=` is not carried on `[?]` links (macros have no request context).
- R-22 closed 2026-10-03: the user reviewed the Glossary, the frontier and evidence pages in the
  dashboard and signed off (T029). `speckit-analyze` found no critical issues; one medium (SC-003
  on stacked tables, accepted and noted in the spec) and three low wording items, all resolved
  (`8b0cf28`). Glossary sync: every entry is new in R-22, nothing else to update. Next: R-16.
- R-16 started 2026-10-03 on `feature/004-r16-srs-export-goal-evaluation` (spec 004, T072–T082).
  Pre-implementation `speckit-analyze`: 0 critical, 1 high, 5 medium, 4 low, all resolved in the
  docs before coding: T072 now seeds a full BA record set (the fixture store had none); "all" mode
  shows a newer draft over its `confirmed baseline: rev N`; rejected-only and withdrawn records go
  to a new `appendix-change-log.md`; broken evidence links are listed in `11-unknowns.md`;
  `docs:export` refuses to replace a folder that is not a previous export; the ground-truth
  contract example matches the real schema; glossary sync is part of T082; tasks tagged
  `[opus]`/`[sonnet]`.
- R-16 US5 built (T072–T076): `docs:export` renders README, 01–12, `appendix-change-log.md` and
  `records.json` from `@pathfinder/docs` (`render/model.ts` reads, chapters are pure). Goldens from
  a fixed seed (`seedDocRecords`, fixture store with `deterministicIds`). T076 on
  `data/db/sandbox.sqlite`: 139 `reference-insurer` records, two exports `diff -r` empty (SC-007);
  `--confirmed-only` has 0 records (nothing in the sandbox store is confirmed yet). Readability notes:
  (1) the screen navigation diagram keeps 1 transition and omits 121 as global navigation, because
  every reference page links to every menu target; the export uses the dashboard's filter for parity,
  so this is a R-19 topic (a per-screen "links to" list may read better than one diagram); (2) state
  evidence labels repeat the page title suffix (" | Towarzystwo Ubezpieczeń Wzorcowych") on every
  line; (3) `DataItemConstraints` has no min/max, so a range constraint can only be written as
  `format` text; T078's constraint matcher has to account for that.
- R-16 US6 evaluator built (T077–T078): `docs:evaluate` (`@pathfinder/docs/src/evaluate.ts`, pure
  `evaluate()` + `loadEvalInput()`), JSON + Markdown report, exit 0/1/2. The first run on the existing
  sandbox store (R-13–R-15 data) found the rule matcher too loose: 4 "over-claims" were honest records
  quoting a hidden rule's anchor label (the login prompt on `/moje-polisy/przedluz`, the premium table
  row "Składka łączna"), and "all fields required" counted as the postcode-format and year-range
  rules. Fix: optional `claim_markers` per ground-truth rule (its numbers or key phrase, EN + PL),
  required in addition to the anchor; the reference portal test checks hidden-rule markers appear on
  no guest page (it caught "likwidator", which the FAQ shows). Baseline on that store: screens 94.1,
  fields 100, constraints 71.4, rules 93.8, processes 80, terms 100, 0 over-claims; fails
  constraints (driver/options step fields have no constraints) and processes (P05 renewal behind
  login has no process record). T079 runs the full pipeline on a fresh store.
- T079 goal run done 2026-10-04 on the cleared sandbox store: map `01a10603…` (12 states, frontier
  drained) → BA → 8 traces (FUP-001..004 plus variants: trip over 90 days, same product twice,
  contact without phone/e-mail, engine 3000 cm3) → BA → trace FUP-009 "Kup polisę" (with WIOSNA10)
  → BA. 158 records, `docs:audit` clean. `docs:evaluate`: screens 100 (17/17), fields 100,
  constraints 100 (49/49), rules 100 (16/16), processes 100 (5/5), terms 100, 0 over-claims; SC-008
  and SC-009 pass. Two crawler depth bugs blocked the map run and were fixed first (`74a3c66`,
  `64a2e65`). Every bug, gap and slip found is in `specs/004-ba-documentation/goal-run-findings.md`
  (F-01…F-16) as input for a later tests/evals item; open ones include map mode pressing submits
  when the persona allows it (F-10), the evaluator matching a rule on any one marker (F-13, rules
  score is generous: R05 counts with one engine band unobserved) and BA revisions losing citations
  from runs outside the session (F-16). Still open in the store: FUP-005..008 (need a customer
  account, OQ-001), FUP-010/011 (more calculator and travel variants).
- T082 speckit-analyze (2026-10-04, R-16 scope), findings and how each was resolved:
  - I1 (HIGH, cross-spec): map mode presses submit buttons when the persona's class allows it
    (F-10), against spec 001 FR-011 ("without being submitted"). Allowed by the constitution (sandbox
    only), but an open defect against R-04; to fix in the crawler in a later item. Nothing was sent in
    the goal run (browser validation held every empty form).
  - U1 (MEDIUM): `docs:evaluate` matching is deterministic and documented (FR-063), but a rule counts
    when any one claim marker appears (F-13), so the rules score is generous (R05 counts with the 0.9
    band unobserved). Accepted for R-16; stricter matching (all-of and negative markers, partial
    scores) goes to the later tests/evals item.
  - C1 (MEDIUM): SC-008 counts "the traces the BA requests". Eight of the nine goal-run traces came
    from BA follow-ups (FUP-001..004, FUP-009, and the variants named in FUP-002..004); the 3000 cm3
    engine trace was added by Claude from the baseline misses. Without it R05 would likely miss:
    rules 15/16 (93.8%), still above 70%, so SC-008 holds either way.
  - I2 (LOW): plan.md project structure now lists `docs:evaluate` / `docs-evaluate.ts`.
  - D1 (LOW): BA revisions can cite only runs in their session, so older citations would drop (F-16);
    no R-16 requirement covers it, logged for a later item.
- R-16 closed 2026-10-04: the user signed it off. Squash-merged into `master` as one commit, like
  R-13 to R-15; `feature/004-r16-srs-export-goal-evaluation` is deleted. Spec 004 is complete
  (T001–T082).
