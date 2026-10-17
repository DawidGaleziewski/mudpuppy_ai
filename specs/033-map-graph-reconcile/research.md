# Research: Map graph and differing states (spec 033)

## R1 · What the map draws as edges

- **Decision:** the drawing shows the **discovery tree** (for each screen, the first observed move
  that reached it, breadth first from the start screen) plus every **failed** and **blocked** edge;
  all other observed transitions ("cross links", e.g. the header and footer links on every page)
  are drawn only with the layer **Links** on, and are always listed in the inspector and counted.
- **Rationale:** `live_map.py` (spec 010 T049) found that drawing all moves makes a hairball: every
  page links to every footer page. The tree shows how the portal spreads; the inspector keeps the
  full transition list, so nothing is hidden (FR-003, SC-001 count every transition).
- **Alternatives:** all edges always (unreadable beyond ~20 screens); edge bundling (needs a client
  layout library, against A-3).

## R2 · Layout on the server

- **Decision:** a layered layout in Python (`queries_map.py`): depth = breadth-first distance over
  observed transitions from the start screen(s); layer order by one barycenter pass (a node sits
  under the mean position of its tree parent's children), fixed node size 150 × 72 px, 40 px
  horizontal gap, 70 px between layers. Positions are inline `left/top` (allowed: layout), edges are
  SVG paths (vertical cubic curves between node bottoms and tops), like screen 12.
- **Start screens:** the screens of the first state each scan observed (its seed); when none is
  known, the route `/`. Unreachable screens (only reached by direct navigation) sit in an extra
  layer at the end, labelled "opened by address".
- **Rationale:** deterministic, testable with fixtures, no client library; the design says "the
  server computes positions; the client pans and zooms".
- **Alternatives:** Mermaid (already used by the live map, but no buttons, no aria-pressed, no
  inspector); a JS graph library (new dependency, CDN rules, client layout).

## R3 · Pan and zoom

- **Decision:** the graph container scrolls (the design's `.sy-graph { overflow: auto }`); a small
  zoom control (−, fit, +) scales the canvas through a CSS custom property set by `map.js`
  (`--mp-map-scale` on `.mp-map-canvas`, transform-origin top left). The R-19 `diagram-zoom.js`
  works on an SVG viewBox and does not fit HTML buttons over an SVG, so it is not reused.

## R4 · Route families over 150 nodes

- **Decision:** family = the first path segment of the route template (`/kalkulator/kierowca` →
  `/kalkulator`; a hash route `/ubezpieczenia#/szkody/nowa` → `/ubezpieczenia`). Over 150 nodes,
  each family with more than one screen is drawn as one deck node (`+N pages`) whose inspector lists
  its screens and offers "Open this family" (`?open=/kalkulator`, kept in the address).

## R5 · Scan and persona filters

- **Decision:** `?scan=<run id>`: nodes and edges the scan observed are drawn normally, the rest
  with `data-state="unobserved"` (dashed ash, the design's "not reached"). `?persona=<id>`: the
  shown scans are that persona's; with both, the scan must be the persona's. Layers `?layers=`
  states, errors, frontier, links (default states, errors, frontier). All in the address (FR-007).

## R6 · Where differing-states groups are computed

- **Decision:** in TypeScript, `services/ba/differing-states.ts` in `@pathfinder/mcp-server`,
  behind the BA tool `list_differing_states`. When the BA proposes verdicts, the proposal stores a
  **snapshot** of the group (outcomes with their evidence), and the dashboard's Review shows the
  stored snapshot. The dashboard does not compute groups.
- **Rationale:** one implementation, no Python twin to drift (the access matrix needed a shared
  fixture to keep two in step, spec 024); Review shows exactly what the BA reasoned about.
  Q4 (groups without a proposal in Review) stays open; with this design a later answer "yes" means
  a Python reader of the same snapshot shape or a chat route that asks the server.
- **Alternatives:** compute in both (drift risk); a SQL view (the frequency and recheck logic is not
  comfortable in SQL).

## R7 · Group rules

- **Action group** (`action:<screen id>:<role>:<name>`): the same from-screen (screen = route
  template + cluster of the from-state) and action (role and accessible name, the identity used
  across scans) led, in executed edges of two or more scans or two personas, to states of two or
  more different screens. Outcomes = target screens.
- **Route group** (`route:<route template>`): one route template holds states of two or more
  clusters (screens) that are not form steps of one wizard (same `form_step` route) and not a kind
  other than `main` (validation, technical, …). Outcomes = those screens.
- **Replay group** (`replay:<state id>`): a `replay_diverged` event in a scan's trace (spec 032
  F-01). Outcomes = the expected step and the seen step.
- **Evidence per outcome:** scans (id, persona, environment, started), first and last seen, HTTP
  status of the page load (`network_calls` of the edge, else the visit), frequency (scans that saw
  it / scans that took the action), reproduced (seen again in a later scan than the first).
- **Same rules in the eval check** of SC-005 (fixture store with known groups).

## R8 · Verdicts and the BA flow

- **Verdict list:** `main`, `variant_persona`, `variant_input`, `variant_flag`, `validation`,
  `technical`, `temporary`, `same`. Hypotheses in order: `persona`, `input`, `temporary`,
  `session_time`, `flag`, `data`.
- **BA flow:** in a documentation session the BA calls `list_differing_states` for the portal
  before documenting a process, proposes verdicts for the groups on the process's screens
  (`propose_verdicts`), and documents with confirmed verdicts where they exist, else with its own
  proposal marked inferred. Documentation rules FR-016 go into `.claude/agents/ba.md` and the
  `ba-practice` skill.

## R9 · Writes

- **Proposals:** written by the BA tool (the `pathfinder-ba` server owns BA writes).
- **Confirmations:** the dashboard posts to the chat service, `POST /portals/{p}/reconciliations/{id}/confirm`
  (`apps/chat/src/api-reconciliations.ts`, like `api-marks.ts`); the reviewer comes from
  `PATHFINDER_REVIEWER`, as for marks and Review edits.
- **Probe marks from the map:** the existing dashboard route `POST /states/{id}/probe-mark` (spec
  032) gains a `back` parameter (a local path, validated) so the map returns to itself.

## R10 · Design package refresh

- The committed package `docs/design/salvage-yard` and the runtime design system
  `static/salvage/css/salvage.css` are older than the owner's package of 2026-10-16
  (`user_input/graph_handler/mudpuppy-salvage-yard (2).zip`): screens 12–16, docs 10 and 11, and
  the map-graph, card, choice and path classes are missing. The CSS change is additions only
  (checked by diff). First task: copy the package's `design-system/css/salvage.css`, `screens/`,
  `docs/` and `screenshots/` into the repo (the skill was refreshed in spec 032).
