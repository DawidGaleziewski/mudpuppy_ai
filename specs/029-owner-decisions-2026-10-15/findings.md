# Findings: spec 029 (owner decisions 2026-10-15)

Nothing new came up while building; the decisions themselves are recorded next to the findings
they answer (spec 025 F-16, spec 024 F-11/F-12, spec 028 F-01/F-02).

## Close-out review: feature/029-owner-decisions-2026-10-15 (2026-10-15)

| # | File:line | Guideline | Finding | Change | Size | Outcome |
| - | --------- | --------- | ------- | ------ | ---- | ------- |
| 1 | apps/dashboard/src/pathfinder_dashboard/queries_review.py:68 | G-04 | `records_to_confirm` grew a flag parameter `assumptions=False` | split into `records_to_confirm`, `assumptions_to_check` and a shared `_unconfirmed(conn, portal, kind)`; same SQL | small | fixed |
| 2 | apps/dashboard/CLAUDE.md | G-30 | notes miss `Ctx.url` naming the portal and the Review assumptions group | one line each | small | fixed |

Checks after fixes: crawler `pnpm test` (all, gates included) ✓ 1991; dashboard ruff ✓, suite ✓
(parallel, then perf and serial). Summary: 2 findings, 2 fixed, 0 deferred, 0 rejected.
