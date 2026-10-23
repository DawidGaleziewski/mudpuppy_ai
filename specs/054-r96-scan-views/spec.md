# Spec 054: the scan-based views in React (R-96, step 5)

**Branch:** `feature/054-r96-scan-views` · **Owner (2026-10-23):** step 5 builds One scan's path
(the recorded map), the Recorded pages view and the scan page with its Graph tab; the other scan
tabs link to the htmx page until a later step; the writes (Probe mark, the next-scan marks, the
graph's restarts) come with it, behind a confirm, as the React console's first writes. D-9: the
new API and pages carry full scan ids (the owner tells the designer).

## What this step builds

- **FR-001 The recorded map's API.** `GET /api/portals/{p}/map/recorded` (`scan`, `persona`,
  `layers` repeated with an empty one for "none ticked", `open`) over `queries_map.map_view`
  (`web/api_recorded.py` over `queries_app_recorded.py`): nodes placed, their status mapped
  (`map_node`), their chips (states, queued, failed, blocked) for the layers asked, the Probe
  mark; edges with their state (`failed`; `unseen` when the chosen scans did not make the move;
  `retired` for a link off the discovery tree, the All links layer) and the legend's words; the
  scans to choose from with full ids (D-9) and mapped statuses; the personas; the open marks.
  404 for an unknown portal.
- **FR-002 One recorded node.** `GET /api/portals/{p}/map/recorded/{screen_id}` over
  `queries_map_node.node_detail`: states (kind mapped), the scans that saw it (full ids), moves
  out, items left (frontier status mapped), probe outcomes as chips, the next-scan marks (each
  with its label, hint, whether it is on and the state it goes on or comes off), the Probe mark
  (state and on). 404 for a screen not on the portal.
- **FR-003 The recorded pages.** `GET /api/portals/{p}/screens/recorded` (`q`, `page`, 25 a page)
  over `queries_screens.portal_screens`: picture, title, route, confidence (mapped), form probes
  (a chip), scans, personas, last seen; the totals and the form-step summary.
- **FR-004 One scan.** `GET /api/scans/{id}` over `queries.run_summary` and the header's counts:
  the scan's facts, status (mapped), warning, and the tabs with their counts (Graph here, the
  others as links to `/runs/{id}?tab=…`). `GET /api/scans/{id}/graph` over
  `queries_run_graph.run_graph`: nodes placed in the order seen, status mapped, chips, the stop
  node, the path to it, failures with their transition, the recovery (steps, queued, warning,
  persona, environment) and the variations. 404 for an unknown scan.
- **FR-005 The writes**, each a `POST` under `/api` that checks the origin (403), needs
  `MUDPUPPY_REVIEWER` (409 with the way on), forwards to the chat service (502 with its refusal,
  or the start command when it is down) and answers `{ok, message, href}`:
  `/api/states/{state}/marks` (`kind`, `action` mark or remove), `/api/states/{state}/probe-mark`
  (`action`), `/api/scans/{id}/skip` (`transition_id`, a failed action of the scan), and
  `/api/scans/{id}/restart` (`run_type` continue or retry, `transition_id`, `variation`), which
  sends the request to the portal's conversation and answers its address. The htmx routes and
  these share one module (`web/chat_writes.py`), so both send the same calls.
- **FR-006 The map's third view.** Screens ▸ Map gains One scan's path (`view=path`); a portal
  without a model opens on it. Its tools: Scans, Persona, the layers (States, Errors, Queue, All
  links), Graph or List, all in the URL. The graph reuses `Graph` / `GraphNode` (a deck for
  several states, a folded family as a link); the inspector shows the node's facts, and its Probe
  and next-scan marks ask first (`Confirm`), then say what happened (`Callout live`) and refresh.
- **FR-007 Recorded pages.** Screens' views gain Recorded pages
  (`/app/portals/:portal/screens/recorded`): the filter, the table, the pages.
- **FR-008 The scan page** `/app/scans/:scan`: the head (full id), the summary facts, the tabs
  (Graph in React, the others to the htmx page), the Graph tab: how it went or where it stopped,
  the path, Resume (a stopped scan), the graph, the legend, the screens in the order seen, and the
  selected screen with its failures (Retry this path with a variation, Skip it) and Mark Start
  here; each write asks first. The Scans list links each scan here.
- **FR-009 The design system** gains `Confirm` (`sy-dialog`: a question, what will happen, Cancel
  and the one confirming button) and `Path` (`sy-path`: steps, the current one, a failed one), each
  with a story and tests; `postJson` and one mutation hook carry every write.

## Not in this step

- The scan page's other tabs (States … Docs) in React; the plan and recovery pages; the chat
  drawer (a restart's conversation opens on the htmx `/chat`).
- For the designer: edge classes for the recorded map (a move off the tree, a move other scans
  made: `retired` and `unseen` stand in), and the earlier ones (Picture's zoom button and wide
  dialog, a variant spanning the row, a sticky zoom bar and the graph box height).

## Validation

- [x] `pnpm typecheck && pnpm lint && pnpm test` in `apps/web` (51 tests: Confirm, Path,
      GraphNode's deck and marks; the recorded map drawn, its filters asked of the API, a mark
      confirmed then posted, Cancel posting nothing, a refusal shown as a failure, the map of a
      portal without a model; Recorded pages and their filter; the scan page, a retry with a
      variation, Resume); `pnpm build`; `pnpm build-storybook`.
- [x] Dashboard: ruff and the whole suite; `tests/test_api_recorded.py`, `tests/test_api_scan.py`,
      `tests/test_api_writes.py` (the chat calls' bodies, 403 / 409 / 422 / 502, restarts' messages).
- [x] `pnpm --dir apps/dashboard ui:check` at 1280 and 390 px against the local-dev store
      (reference-insurer-local: 21 screens, 237 transitions; proving-ground-shop-local without a
      model; a stopped and a completed scan): all pass. Found on the way: whole scan ids overflowed
      the inspector's Facts at 1280 px; Seen in now takes the plate's whole width.

## Decisions

- Writes answer `{ok, message, href}`: 403 another origin, 409 no `MUDPUPPY_REVIEWER`, 422 an
  unknown target, 502 when the chat service refused or is not running (its message says which).
- The recorded map's routes come before `api_screens` (its `/screens/{key}` would take
  `/screens/recorded`).

## Close-out review: feature/054-r96-scan-views (2026-10-23)

No changed line over the complexity limits (the `create_app` and `states.py` warnings predate the
branch); no file over G-01; no SQL in routers; no router imports another (G-13); pages and app
have no `className`, `style` or `sy-`; Confirm and Path have stories.

| # | File:line | Guideline | Finding | Change | Size | Outcome |
|---|---|---|---|---|---|---|
| 1 | `web/api_writes.py` `_mark` | G-04 | Six parameters; `web` comes from `c.request`. | Dropped `web` | small | fixed |
| 2 | `apps/web/CLAUDE.md` Layout | G-30 | `src/app/` did not name `api-*.ts`, `api-write.ts`, `ConfirmedWrite.tsx`. | One line added | small | fixed |
| 3 | `web/plan.py` `__all__` | G-11 / G-20 | A re-export kept only for a test's import. | The test imports `web.chat_writes`; `__all__` dropped | small | fixed |
| 4 | `ScanGraph.tsx` selected node | skill rule 4 | The page picked its first node by a raw state (`'failed'`). | The API sends `open_node` | small | fixed |
| 5 | `web/api_writes.py` `restart` | G-15 | Only `restart` skips the reviewer check. | none: a restart needs no reviewer, as the htmx route | — | rejected |
