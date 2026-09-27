# Roadmap

Maintained by the `po` agent. Order follows the build order in the constitution. An item is `done`
only when every task in its range in its linked spec's `tasks.md` is `[X]`.
Status: `todo`, `in progress`, `done`. Last reviewed: 2026-09-27.

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
| R-17 | Crawl run observability trace: step-by-step trace of a crawl run (every MCP tool call with inputs/outputs, safety/action-gate and robots/denylist decisions, fingerprinting and state matching, frontier picks, obstacles, timings, errors), inspectable per run, most naturally in the R-12 dashboard | — (needs spec `005-…` via speckit-specify) | todo |
| R-13 | BA documentation store and BA agent: Layer B records with revisions and evidence links, BA MCP tools, `ba` subagent and BA skill, works on map evidence; reference portal with ground truth | `specs/004-ba-documentation` US1, T001–T032 | in progress |
| R-14 | Crawler trace mode: record one named process as ordered steps, stop at the submit boundary on production, follow-up tasks drive trace runs | `specs/004-ba-documentation` US4, T033–T050 | todo |
| R-15 | Docs tab: SRS view per portal with evidence and run links, revision history, review actions (confirm/reject/comment), constitution amendment for the review write path | `specs/004-ba-documentation` US2 + US3, T051–T071 | todo |
| R-16 | SRS export and goal evaluation: deterministic Markdown + Mermaid + machine-readable export with traceability matrix and Unknowns section; `docs:evaluate` scores the docs against the reference portal's ground truth | `specs/004-ba-documentation` US5 + US6 + polish, T072–T082 | todo |

## Notes

- R-03 is recorded as out-of-spec work (resolved 2026-09-21): repo housekeeping (TS workspace
  moved under `apps/crawler/`, `governor` and `po` agents) that delivers no feature requirement, so
  no task line is added to `tasks.md` (that would renumber T001-T074 references). Path changes it
  caused are already reflected in `tasks.md`. Traceable via commit `b1639fc` and the agents commit
  `348fac0`.
- R-06 is built before R-07 (safety first, Principle V); R-04 and R-05 block both.
- Commits: R-02 `02e17b7`, R-03 `b1639fc` and `348fac0`, R-04 `5633dc4`, R-05 `17f1187`, R-06 `eee48a9`,
  R-07 `dfe3f40` and `23c8a9b` (open), R-08 `412ed19`, R-09 `d4907a4`, R-10 partial `6f1b0d8` (open), deps `59807cb`,
  R-11 `3d4ed21`, T072 sign-off `50662f4`, R-12 `2132b2f`, `ee6519a` and `8989790`.
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
  server start. T059, T073, T074 stay open pending a host with the required browser libraries.
- R-13 to R-16 (BA documentation) share `specs/004-ba-documentation`, started 2026-09-26 on branch
  `feature/004-r13-ba-documentation`. Scope decided with the user: full as-is SRS including processes
  (hence trace mode, R-14), Layer B in SQLite written only via BA MCP tools, living records with stable
  ids and kept revisions linked to evidence and runs, review actions in the dashboard (needs a
  constitution MINOR amendment for a review-only write path, R-15), docs in English with portal terms
  verbatim. Acceptance and goal measurement run on a local reference portal with a ground-truth
  manifest (D8, 2026-09-26); liveinsurer data is a test bed only and not needed. Task ranges come from `specs/004-ba-documentation/tasks.md` (82 tasks).
- R-17 added 2026-09-27 at the user's request and inserted before R-13, the same way R-12 was
  inserted before the BA agent: the user wants a deeper look at what happens under the hood during a
  crawl run — every MCP tool call with its inputs/outputs, safety/action-gate and robots/denylist
  decisions, fingerprinting and state-matching, frontier picks, obstacles, timings and errors — each
  inspectable per run. It has no spec yet (needs `005-…` via `speckit-specify`). It is distinct from
  R-14 "Crawler trace mode": R-14 records a named business process as steps for the BA to document;
  R-17 is a technical, per-run debug/observability trace of the crawler's own machinery, independent of
  any business process. R-13 (BA documentation) is paused (`in progress`, not being advanced) until
  R-17 is done.
- R-13 progress/handover as of 2026-09-27: done — T007, T008 (migration 0003, Zod schemas + db-types,
  round-trip test; commit `3d71724`), T029–T031 (`ba-practice` skill and `ba` agent; commit `c19b454`),
  and the `@pathfinder/docs`/`@pathfinder/reference-portal` scaffold plus the `pathfinder-ba` server
  entry (T001, T002; commit `ce9322e`). Uncommitted WIP on disk (not committed, left for the next
  session): reference portal T003–T005 (server, pages, rules, `ground-truth.json` + Zod + tests) —
  typecheck fails because the reference-portal `tsconfig.json` lacks Node types, plus
  `src/pages/forms.ts:108` has an `x` possibly undefined; 2 server tests fail because they expect the
  contiguous text "Składka łączna 1 719,00 zł" / "240,00 zł" but the total renders as a `<th>`/`<td>`
  table row. T017 (Layer B partition in `core/src/portal-data.ts`) is written but
  `tests/portal-data.test.ts`'s `snapshotOf` filters all non-`runs`/`states` tables by `run_id`, and the
  Layer B tables have no such column, so that test and `mcp-server/tests/workspaces.test.ts` fail for
  the same reason. Not started: T006, T009, T010–T016, T018–T028, T032. Model plan for the rest:
  mechanical tasks continue on Sonnet; T024, T026–T028 and T032 are better done on Opus.
- Commits since the previous review: `1dd2e57` (governor agent description fix, no roadmap item),
  `3d71724` (R-13 T007/T008, see above).
