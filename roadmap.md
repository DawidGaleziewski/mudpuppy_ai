# Roadmap

Maintained by the `po` agent. Order follows the build order in the constitution. An item is `done`
only when every task in its range in `specs/001-crawler-map-mode/tasks.md` is `[X]`.
Status: `todo`, `in progress`, `done`. Last reviewed: 2026-09-21.

| ID | Item | Tasks | Status |
| --- | --- | --- | --- |
| R-01 | Workspace scaffold and test/lint tooling | T001–T006 | done |
| R-02 | Fingerprint package: route template, ARIA canonicalization, two-level fingerprint | T007–T011 | done |
| R-03 | Repo restructure: TS workspace moved to `apps/crawler/`; `governor` and `po` agents | — (not in tasks.md) | done |
| R-04 | Core: Zod schemas, migrations, DB access, ids, PII scrubber, evidence store, logging | T012–T021 | todo |
| R-05 | Config: portal and persona loaders, `extends`, secret detection | T022–T030 | todo |
| R-06 | US2 Production is only read: safety classifier, env guard, gates, rate limiter | T031–T044 | todo |
| R-07 | US1 Map a portal as a guest: MCP server, obstacles, crawler runtime, agent, mock-portal run | T045–T065 | todo |
| R-08 | US3 Portals and personas as reusable configuration | T066 | todo |
| R-09 | US4 Hand locators to QA | T067–T069 | todo |
| R-10 | Polish and cross-cutting concerns | T070–T074 | todo |

## Notes

- R-03 has no tasks in `tasks.md`; the `po` should add a task line for it or record it as
  out-of-spec work when the item is closed.
- R-06 is built before R-07 (safety first, Principle V); R-04 and R-05 block both.
- Commits: R-02 `02e17b7`, R-03 `b1639fc` and the agents commit that follows it.
