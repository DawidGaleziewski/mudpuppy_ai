# Plan: spec 035 (R-74)

Dashboard only; no schema, crawler or chat change. Read-only queries; the actions reuse the
chat-service paths of R-66.

- `queries_run_graph.py` (new): `run_graph(conn, run_id)` builds `RunNode`s from this scan's
  `state_observations` (merged screens folded into their target), failures from its edges with
  an error, frontier counts per screen, moves from its executed edges, positions from
  `map_layout.layout`, the stop screen from `queries_plan.recovery` (last good state), the path
  from the layout's parent chain; `screen_count`, `needs_attention` for the tab count and the
  default tab.
- `queries_plan.py`: `error_text` public, `VARIATIONS` moved here (routers do not import each
  other, G-13), the failure list no longer capped at 20 (Skip validates against it).
- `web/runs.py`: section `graph` first, default tab by `needs_attention`; values `graph`,
  `selected`, `note`, `node_h`, `variations`.
- `templates/salvage/partials/graph.html` (new); `run_detail.html` loads `map.js` on the tab;
  `map.js` opens on an `aria-current` node too.
- Redirects: `web/plan.py` `_back` and the skip handler honour `from=graph`; `web/states.py`
  mark handler returns to a `/runs/…` back link with `note=`.
- Scan history: `queries_scans.HistoryRow.failed`; `scans_body.html` links the graph.
- Tests: `tests/test_run_graph.py` (model, page, redirects, history); three route tests follow the
  new default tab; glossary `scan-graph`; `docs/how-to-use.md`.
