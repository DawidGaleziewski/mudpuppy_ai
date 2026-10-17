# Findings: spec 035 run graph

## Close-out review

| # | File:line | Guideline | Finding | Change | Size | Outcome |
|---|-----------|-----------|---------|--------|------|---------|
| 1 | apps/dashboard/src/pathfinder_dashboard/web/runs.py:197 (`section_values`) | G-03 (ruff PLR0915) | The graph branch took the function from within the 50-statement limit on master to 56 statements. | Moved the branch's values into `graph_values()` (returns data and filters); now 51, still 1 over. | small | Partly fixed (56 to 51) |
| 2 | apps/dashboard/src/pathfinder_dashboard/web/runs.py:197 (`section_values`) | G-03, G-06 | The remaining statement over the limit needs the long if-chain split by section (one values function per tab), which touches every tab. | none | large | Deferred (follow-up: split `section_values` per tab) |

Checked, no finding: `queries_run_graph.py` (about 290 lines, no function over 80 lines, SQL only in queries, G-13/G-15 respected); `graph.html` (sy- classes only, one primary button (Resume), statuses through `sy.status`/`sy.run_status`, the legend's raw `sy-status` spans match `map_graph.html`, `--sy-gap` inline custom property as in `map_inspector.html`, no colours or fonts inline); `find-old-styles.sh` on graph.html: TOTAL 0.

Checks after fixes: ruff check passed; pytest -n auto -m 'not perf and not serial' passed; pytest -m 'perf or serial' passed.

Summary: 2 findings, 0 fixed fully, 1 partly fixed, 1 large deferred.
