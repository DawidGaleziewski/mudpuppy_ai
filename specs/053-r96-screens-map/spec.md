# Spec 053: the React model map (R-96, step 4)

**Branch:** `feature/053-r96-screens-map` · **Owner (2026-10-22 night answers):** "We do full
change to React first … Goal is no more htmx, just React SPA app." This step moves Screens ▸ Map
of the portal model (designer screen v2-08) to the React console.

## What this step builds

- **FR-001 The API.** `GET /api/portals/{p}/map` (`view` now or since, `layers` repeated with
  an empty one for "none ticked", `process`, `open`) over `queries_model_map.model_map`
  (`web/api_map.py` over `queries_app_map.py`): nodes with their place, chips (as `Chip`), role
  and dim; edges with their state, path and rule label; the bundled menu links; the processes
  for the overlay; the links out of each node with their state mapped (`action`). 404 for an
  unknown portal; `has_model` false when the portal has no model yet.
- **FR-002 The inspector's actions.** A screen's actions (`/api/portals/{p}/screens/{key}`) say
  where each one goes (`place`: inside, out, menu), so the inspector lists "Actions inside" and
  "Links out" without deciding it itself.
- **FR-003 The map** `/app/portals/:portal/screens/map`: the view (Now, Since previous release),
  a process overlay, the layers (retired links, not seen since, not checked), Graph or List, all
  in the URL. The graph: screens as buttons placed by the API, a folded route family as a link
  that opens it, edges in their state with the rule's condition, the legend; zoom (out, fit, in);
  arrow keys move along the discovery tree. Selecting a screen opens it in the inspector (the
  side column): facts, actions checked, variants, actions inside, links out, the latest changes
  and a link to the screen. The list carries the same facts as a table.
- **FR-004 Screens views.** Screens and Map share a views nav (List, Map); the htmx Recorded
  pages stay until the recorded map moves (next step).
- **FR-005 The design system** gains `Graph` / `GraphNode` (with `GraphEdge` data), `Legend`,
  `Bundle` and `ViewNav` (links with `aria-current`), each with a story and tests.

## Not in this step

- The view One scan's path (the recorded map), the Recorded pages view and the Scans graph: the
  next step.

- For the designer: a class for a sticky zoom bar over the graph and a graph box height (Graph
  keeps layout-only inline styles: canvas size, zoom, node places, 75vh).

## Validation

- [x] `pnpm typecheck && pnpm lint && pnpm test` in `apps/web` (37 tests: Graph's edges, nodes,
      deck link, zoom limits and arrow keys; the map drawn, a screen in the inspector, the view and
      layers asked of the API, the list, no model); `pnpm build`; `pnpm build-storybook`.
- [x] Dashboard: ruff and the whole suite; `tests/test_api_map.py` (placed and drawn, layers
      from the address with "none ticked", since and overlay, no model, 404, actions' place).
- [x] `pnpm --dir apps/dashboard ui:check` at 1280 and 390 px on the map (Now, Since, an overlay
      with a selected screen, List), the Screens list and a portal without a model, against the
      local-dev store (reference-insurer-local: 21 screens, 23 links): all pass. Found on the way:
      the graph box grew to the whole canvas (1092 px); it scrolls inside 75vh now, as the htmx map.

## Close-out review: feature/053-r96-screens-map (2026-10-23)

Lint clean; ruff complexity report empty on the changed Python; no file over G-01; every `sy-`
class used exists in the designer's CSS.

| # | File:line | Guideline | Finding | Change | Size | Outcome |
|---|---|---|---|---|---|---|
| 1 | `ScreensMap.tsx` node meta | skill rules 4, 5 | The page built the "N actions inside" chip and its plural itself. | The API sends `inside` (a `Chip`) on each node; the page shows it with `ShownChip` | small | fixed (after the review) |
| 2 | `ScreensMap.tsx` bundle, `meta()` | skill rule 4 | Sentences from API counts ("10 links · bundled", the head's meta) built in the page. | none: kept (page copy from counts, as Screens' meta; no product value mapped) | — | accepted |
| 3 | `Graph.tsx` | skill rule 1 | Layout-only inline styles in a design-system component (canvas size, zoom, node places, 75vh), as the designer's markup puts positions inline. | none | large (needs designer) | open, in "Not in this step" and roadmap R-96 |
| 4 | `ScreensMap.tsx` `MapList` | G-22 | Index key on a node's links out (no stable id; fixed per response). | none | — | accepted |

After #1: apps/web typecheck, lint, 37 tests, build, Storybook build; dashboard ruff and the
whole suite.
