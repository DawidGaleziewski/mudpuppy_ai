# Findings: spec 028 branch (R-51, R-39 round 4, R-33 P2)

Per memory `log-every-bug-for-evals`: symptom, cause, fix, test or eval idea.

## F-01 Real-sandbox smoke test: process links 404 after a portal switch, 2026-10-15

- **What**: the commit hook's dashboard suite failed
  `test_every_linked_page_renders_on_a_copy_of_the_real_sandbox` with `404
  /processes/PRC-001?env=sandbox` (and `variant=A`, `variant=B`). The real sandbox has had a BA
  process (`PRC-001`, reference-insurer) since 2026-10-14 18:10, so earlier commits that ran the
  dashboard suite before that did not see it; nothing in this branch touches the dashboard.
- **Cause**: the smoke crawl is breadth-first over one cookie jar. The link was found on
  `/?portal=reference-insurer`; by the time it was fetched, a later `?portal=wikipedia` page had
  switched the portal cookie, and a process key is per portal, so the page answered 404. A reader
  with two tabs on different portals can hit the same 404 (the link carries no portal).
- **Fix**: the crawl follows each link with the portal choice of the page it was found on
  (`tests/test_smoke.py`). The product side (links to portal-scoped pages carrying `portal=`) is
  left as a suggestion.
- **Test idea**: a BA-fixture smoke case with two portals that both have a `PRC-001`.
- **Owner decision 2026-10-15**: links should name the portal (built in spec 029 T006:
  `Ctx.url` adds `portal=` to process links and Review selections).

## F-02 Review's nav count builds the whole access matrix on every page, 2026-10-15 (review note)

- **What**: `queries_review.count()` (the nav marker on every page) now calls
  `access_matrix` for the chosen portal to count unexplained differences. Cheap on the fixture and
  today's stores; not measured on a portal with hundreds of screens and many personas.
- **Next**: measure on the liveinsurer or reference store with two personas; if slow, cache per store
  version or count in SQL. A measured problem goes to R-24 (memory `token-issues-to-r24` is for
  tokens; this one is wall-clock, so a perf test in the dashboard's `perf` marker).
- **Test idea**: a `perf` test building a 300-screen, 5-persona store and timing `count()`.
- **Owner decision 2026-10-15**: measure first. Built (spec 029 T005, `tests/test_perf_access.py`,
  budget 0.5 s): the whole test, store built included, took 0.43 s, so no cache.

## Close-out review: feature/028-r51-r39-r33-relations-access (2026-10-15)

| # | File:line | Guideline | Finding | Change | Size | Outcome |
| - | --------- | --------- | ------- | ------ | ---- | ------- |
| 1 | apps/crawler/packages/mcp-server/src/ba-tools/index.ts:139 | G-23 / prettier | lengthened `get_access_matrix` description left unformatted | `prettier --write` on the file | small | fixed |
| 2 | apps/dashboard/src/pathfinder_dashboard/web/review.py:18 | G-13 | Review router imports the Access view helper `views_access.attributes_by_persona` | move the attributes helpers to `deps.py` or `queries_settings.py` | large | deferred (views_access is a helper, not a router; follow-up) |
| 3 | apps/dashboard/src/pathfinder_dashboard/queries_settings.py:83 | G-13 | calls the private `queries_chat._collect_refs` | make it public and update callers | large | deferred (follow-up) |
| 4 | apps/dashboard/CLAUDE.md, apps/crawler/packages/docs/CLAUDE.md | G-30 | notes miss the Review differences group, side by side, the export's new screen lists | one line each | small | fixed |
| 5 | apps/crawler/packages/mcp-server/src/ba-tools/index.ts:112 | G-02 | `registerBaTools` 172 lines (unchanged length) | none | – | rejected (predates the branch) |
| 6 | apps/crawler/packages/docs/src/render/chapters/structure.ts:235 | G-22 | `no-base-to-string` warning from an older commit | none | – | rejected (not in changed lines) |

Checks after fixes: crawler typecheck ✓ lint ✓ test:fast ✓; `pnpm test` (all, gates included) ✓
after the F-09@026 eval case; dashboard full suite ✓ (commit hook); chat ✓ 255; workflow ✓ 29.
Summary: 6 findings, 2 fixed, 2 deferred, 2 rejected.
