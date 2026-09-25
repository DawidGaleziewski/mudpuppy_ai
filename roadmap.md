# Roadmap

Maintained by the `po` agent. Order follows the build order in the constitution. An item is `done`
only when every task in its range in its linked spec's `tasks.md` is `[X]`.
Status: `todo`, `in progress`, `done`. Last reviewed: 2026-09-25.

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

## Notes

- R-03 is recorded as out-of-spec work (resolved 2026-09-21): repo housekeeping (TS workspace
  moved under `apps/crawler/`, `governor` and `po` agents) that delivers no feature requirement, so
  no task line is added to `tasks.md` (that would renumber T001-T074 references). Path changes it
  caused are already reflected in `tasks.md`. Traceable via commit `b1639fc` and the agents commit
  `348fac0`.
- R-06 is built before R-07 (safety first, Principle V); R-04 and R-05 block both.
- Commits: R-02 `02e17b7`, R-03 `b1639fc` and `348fac0`, R-04 `5633dc4`, R-05 `17f1187`, R-06 `eee48a9`,
  R-07 `dfe3f40` and `23c8a9b` (open), R-08 `412ed19`, R-09 `d4907a4`, R-10 partial `6f1b0d8` (open), deps `59807cb`,
  R-11 `3d4ed21`, T072 sign-off `50662f4`.
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
- T072 (manual compliance sign-off for liveinsurer) is done: commit `50662f4` set
  `compliance.robots_checked_on`/`terms_reviewed_on` to 2026-09-25, `terms_reviewed_by: Randal
  Chopirik`, and replaced the placeholder `rate_limit.user_agent` contact with `tester@example.test`. The
  first live run attempted under this sign-off (T073, 2026-09-25) failed before any page load:
  `start_run` could not launch headless Chromium on this host (missing `libnss3`/`libnspr4`/
  `libasound2`); only `robots.txt` was fetched (4×200). 4 run rows were left `running` in
  `data/db/production.sqlite`, to be swept to `interrupted` by the existing `interruptStaleRuns` on next
  server start. T059, T073, T074 stay open pending a host with the required browser libraries.
