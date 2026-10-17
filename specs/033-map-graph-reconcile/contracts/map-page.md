# Contract: Map page (dashboard)

Read-only; every write goes through the chat service (D-1).

## Routes (`web/map.py`)

| Method | Path | Returns |
|---|---|---|
| GET | `/map` | page `salvage/map.html` for the header's portal; 200 with "Choose a portal" when none |
| GET | `/fragments/map/node/{screen_id}` | the inspector partial for one node (htmx swap) |

Query parameters (kept in links): `scan` (run id), `persona`, `layers` (comma list of `states`,
`errors`, `frontier`, `links`; default `states,errors,frontier`), `view` (`graph` · `list`),
`open` (a route family to expand), `node` (selected screen id, pre-selects the inspector).
Unknown values are ignored (the default applies), never a 500.

## Page structure (screen 12)

- Page head: crumbs Scans / Map, h1 "Map", meta "N screens · M transitions · K queued", the latest
  stopped scan when there is one (tag + route).
- Tabs under Scans: Scans · **Map** (`aria-current`).
- Filter bar: scan select + Apply (no navigate-on-change), persona select, layer checkboxes,
  Graph / List toggle (`.sy-seg`).
- `section.sy-graph` > `.sy-graph__canvas.mp-map-canvas` (width/height inline) >
  `svg.sy-graph__edges` (paths: `.sy-edge`, `--failed`, `--frontier`, `--blocked`) +
  `button.sy-node` per node (`data-state`, `aria-pressed`, `data-screen`, inline `left/top`,
  `.sy-node--deck` for decks, `.sy-node__route`, `__title`, `__meta` with chips, `__marks` with the
  Probe tag) + queued nodes (`data-state="frontier"`, "+N queued").
- Side (`.sy-col-side`): inspector plate (`#map-inspector`, live region polite), legend.
- List view: `table.sy-table` (route, title, states, status, depth, scans), each route a link to the
  screen page; the default under 640 px (CSS) and with `view=list`.
- Zoom control (−, fit, +) and keyboard hint; `map.js` handles selection, arrows, zoom.

## Inspector (`partials/map_inspector.html`)

Route, title, status, states (kind, form step label), scans that saw it (tag + persona), outgoing
transitions (label → route, outcome status; failed with the error code), blocked items with reason,
probe outcomes by kind (chips), link "Open screen". On a form-step node: the Probe mark form
`POST /states/{state_id}/probe-mark` with `action=mark|remove` and `back=/map?…&node=<screen>`.

## Probe mark route change (`web/states.py`)

`back` (optional): a path starting with `/map` (anything else ignored); the 303 goes there instead
of the screen page.
