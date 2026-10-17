# Feature Specification: Map graph and differing states (R-69 (4)–(5))

**Feature Branch**: `feature/033-r69-map-graph-and-reconcile`

**Created**: 2026-10-17

**Status**: Done (merged 2026-10-17)

**Input**: R-69 (4) BA reconciles the states of one page, (5) graph page; the owner's `graph_handler`
input and design package (`11-map-runs.md` §2, §6, §7; screens 12 and 16). Spec 032 (R-69 (1)–(3),
merged v1.0.35) built form steps, state kinds, probe outcomes, the marks table and Probe marks.

## Context

The owner asked (2026-10-17, after the live scans of all five test portals) "where can I see the
graphs of the run in the UI?": today a scan's map exists only as tables (States, Actions,
Frontier tabs of a run). The design package draws the map as a graph people steer the next scan
from, and adds a review step for a page seen in different states across scans (an environment
error once, a variant for another persona), so the BA does not document whichever state it saw.

## Owner decisions on record

- **D-1** The dashboard writes nothing itself: every write goes through the chat service (spec 022,
  kept in spec 032 for marks).
- **D-2** The BA agent proposes, a person confirms (verdicts are inferred until confirmed in Review).
- **D-3** Order: (1)–(3) first (done), then (4) and (5) together on this branch; R-66 (replay to a
  node, resume, retry, directed scans) after.
- **D-4** Probing only when asked (spec 032 owner answer 3): Probe marks are the only marks with an
  effect today.

## Decisions made for the owner (owner away; open questions at the end)

- **A-1** The Map page lives under Scans (Scans ▸ Map), as in screen 12, for the portal chosen in the
  header, across all its scans by default.
- **A-2** Only Probe marks can be set from the map. Start here, Focus, Retry, Recheck and Skip need
  R-66's replay to mean anything, so they are not shown (no dead buttons); the Next scan plan tray
  and "Plan next scan" come with R-66.
- **A-3** The graph is drawn on the server (positions and edges computed there, plain markup sent to
  the browser); the browser only pans, zooms and selects. Same pan/zoom as the other dashboard
  diagrams (R-19).
- **A-4** A differing-states group is found by the system, not by the BA: the BA reasons about the
  groups it is given and proposes verdicts.
- **A-5** The server-side refusal of a process whose only step is an error page belongs to R-70 (3)
  (another item, in the roadmap); here the documentation rules go into the BA's guidance and the
  verdicts feed it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See what was mapped as a graph (Priority: P1)

The owner opens Scans ▸ Map for a portal and sees every screen the scans reached as a node and
every recorded action as an edge, laid out by depth from the start page. Several states of one
route (form steps, a validation state) stack as one deck with a count. Pages with unvisited
actions show one dashed "+N queued" node. A failed action is red, a blocked one hollow. The owner
can filter to one scan (what it did not see greys out), to one persona, and switch layers (states,
errors, frontier). A list view shows the same nodes for a screen reader or a phone.

**Why this priority**: it answers the owner's question directly and is the base the marks and
reconciliation sit on.

**Independent Test**: open the Map page on a store with one completed and one interrupted scan;
the node and edge counts match the store, the interrupted scan's queued items show as "+N queued",
and the list view lists the same screens.

**Acceptance Scenarios**:

1. **Given** a portal with scans, **When** the owner opens Scans ▸ Map, **Then** each screen
   (route template and cluster) is one node, placed in the layer of its smallest depth from the start
   page, and each distinct observed transition between two screens is one edge.
2. **Given** a route with three form steps and a validation state, **When** the map is drawn,
   **Then** that route is one deck node labelled with its route and "4 states".
3. **Given** a page with 38 pending frontier items, **When** the frontier layer is on, **Then**
   one dashed node "+38 queued" hangs off that page, and with the layer off it is gone.
4. **Given** an action whose execution failed, **When** the map is drawn, **Then** its edge is red
   and its target node, when nothing else reached it, is marked failed with the scan id.
5. **Given** the scan filter set to one scan, **When** the map is drawn, **Then** nodes and edges
   that scan did not see are greyed out, not removed.
6. **Given** more than 150 nodes, **When** the map is drawn, **Then** route families (same first
   path segment below the start page) are collapsed into one deck each, and the owner can open one.
7. **Given** a phone-width screen or the List toggle, **When** the owner views the map, **Then** a
   list of the same nodes (route, title, states, status, depth) is shown, each linking to its
   screen page.

---

### User Story 2 - Inspect a node and mark a form for probing (Priority: P1)

The owner clicks (or reaches by keyboard) a node; the inspector shows its states, the scans that
saw it, its actions and, for a form step, its probe outcomes. On a form-step node the owner marks
the step for probing; the node shows the orange Probe tag, and the next "probe the marked forms"
scan uses the mark (spec 032).

**Why this priority**: the owner's input asks for nodes that steer the crawler; Probe marks are the
one steering mark that works today.

**Independent Test**: select a form-step node, mark it for probing, reload: the node carries the
Probe tag and the screen page shows the same mark.

**Acceptance Scenarios**:

1. **Given** the map, **When** the owner presses Tab to a node and Enter (or clicks it), **Then** the
   node is selected (pressed), and the inspector shows route, title, status, the states with their
   kinds, the scans that saw it, its outgoing actions with their outcome, and its probe outcomes.
2. **Given** a selected node holding a form step, **When** the owner chooses "Mark for probing",
   **Then** the mark is stored through the chat service and the node shows the Probe tag; "Remove
   the mark" removes it.
3. **Given** the chat service is not running, **When** the owner tries to mark, **Then** the map
   says the mark could not be saved and why, and nothing else changes.
4. **Given** a node that is not a form step, **When** it is selected, **Then** no mark button is
   shown.
5. **Given** the keyboard, **When** the owner uses the arrow keys on a selected node, **Then** focus
   moves to a connected node.

---

### User Story 3 - The BA explains a page seen in different states (Priority: P2)

After scans, the system lists differing-states groups for a portal: the same screen and action led
to different screens in different scans; one route holds several states that form steps and state
kinds do not explain; or a scan's way back to a state diverged. The BA agent gets each group with
its evidence (scans, personas, times, HTTP status, how often each outcome was seen, whether a later
scan saw it again), checks the hypotheses in order (persona, input, temporary, session or time,
feature flag, data) and proposes a verdict per outcome with its reason: main state, variant (by
persona, input or flag), validation state, technical error state, temporary (recheck), or same
state.

**Why this priority**: it prevents the documentation from resting on an error page; it needs the
map's data but not its page.

**Independent Test**: on a store where one action led to the quote form in two scans and to an
HTTP 503 page in one, the group is listed and the BA proposes "main state" for the form and
"temporary, recheck" for the 503 page, citing the three scans.

**Acceptance Scenarios**:

1. **Given** one from-screen and action that led to two different screens in different scans,
   **When** the groups are computed, **Then** one group holds both outcomes with their scans,
   personas, first and last time seen, HTTP status and frequency ("1 of 3 scans").
2. **Given** a route whose several states are all explained by form steps or state kinds, **When**
   the groups are computed, **Then** no group is made for it.
3. **Given** a group, **When** the BA proposes verdicts, **Then** each outcome gets one verdict from
   the list and a reason naming the hypothesis that explains it and the evidence; the proposal is
   stored as inferred.
4. **Given** outcomes that differ only between personas, **When** the BA reasons, **Then** the
   verdict is "variant (persona)" and the documentation rule says to document it per persona.
5. **Given** an outcome seen once with HTTP 5xx and not seen again, **When** the BA reasons,
   **Then** the verdict is "temporary, recheck", and the BA documents it as an environment issue
   (an open question), never as a process step.

---

### User Story 4 - The owner confirms verdicts in Review (Priority: P2)

Review gains a kind "Differing states". Each item shows the graph point (from screen, action,
outcomes), the evidence table, the hypotheses checked and the BA's proposed verdicts. The owner
confirms or changes each verdict; confirmed verdicts are what the BA uses when it documents.

**Why this priority**: the owner's rule is that the BA proposes and a person confirms.

**Independent Test**: open Review ▸ Differing states with one proposed group, change one verdict
and confirm: the group leaves the open list, the verdicts show as confirmed with the reviewer's
name, and the BA's next documentation pass reads them.

**Acceptance Scenarios**:

1. **Given** a proposed group, **When** the owner opens Review, **Then** "Differing states" lists it
   with its count, and the item shows outcomes, evidence, hypotheses and the proposed verdicts
   (drawn as proposals).
2. **Given** the item, **When** the owner confirms (with or without changing verdicts), **Then** the
   verdicts are stored through the chat service as confirmed, with who and when, and the item
   leaves the open list.
3. **Given** a group without a BA proposal yet, **When** the owner opens it, **Then** it shows the
   evidence and says the BA has not proposed verdicts, and confirming is not offered.
4. **Given** confirmed verdicts, **When** the BA documents the process that contains the screen,
   **Then** the step is documented by its main state and the other outcomes as states of that step;
   a step whose only outcome is an error page is documented as not observed, with an open question.

---

### Edge Cases

- A portal with no scans: the Map page says so and points to the chat to start one.
- A scan still running: the map shows what is recorded so far and says the scan is running.
- An edge whose target state is unknown (the action led nowhere or was skipped): drawn to a small
  dashed end, not to a node.
- A cycle (a link back to the start page): drawn as an edge back up; layering uses the smallest
  depth, so cycles do not move nodes.
- Two screens with the same title on different routes: the node label shows the route, the title
  as the second line.
- Several portals in one store: the map shows only the portal chosen in the header; with none
  chosen, it asks for one.
- A group whose outcomes are later all explained by a new form step or state kind: it stops being
  listed (computed afresh), and a proposal already made stays visible in its history.
- The BA proposes a verdict not in the list: refused with the list of verdicts.

## Requirements *(mandatory)*

### Functional Requirements

**Map (US1, US2)**

- **FR-001**: The system MUST offer a Map page per portal under Scans, reachable from the Scans
  page and the nav, covering all the portal's scans by default.
- **FR-002**: Each screen (route template and cluster) MUST be one node; states of one route that
  are form steps or other state kinds of one screen MUST stack as a deck with a state count.
- **FR-003**: Each distinct transition between two screens observed in any shown scan MUST be one
  edge, counted and listed in the inspector; the drawing MUST show the discovery tree (the first
  move that reached each screen) and every failed and blocked edge, and the other links only with
  the Links layer on (every page links to the footer pages: drawn all at once they hide the map);
  edges MUST be encoded as observed (solid), failed (red, only where the crawler's action failed),
  frontier (dashed) and blocked (hollow end, with the refusal reason in the inspector).
- **FR-004**: Pending frontier items of a page MUST be folded into one dashed count on that page's
  node ("+38 queued", the chip screen 12 draws), shown only while the frontier layer is on; failed
  and blocked items likewise, on the errors layer.
- **FR-005**: Nodes MUST be placed in layers by their smallest depth from the start page, with
  positions computed before the page is sent; the page MUST pan and zoom like the other dashboard
  diagrams.
- **FR-006**: Over 150 nodes, route families MUST be collapsed by default into one deck per family,
  which the owner can expand.
- **FR-007**: Filters MUST exist for scan (all, or one, greying out the rest), persona, and layers
  (states, errors, frontier, links), and MUST be kept in the page address so a filtered map can be shared.
- **FR-008**: A list view MUST show the same nodes with route, title, state count, status and depth,
  each linking to the screen page; it MUST be the default below phone width.
- **FR-009**: Nodes MUST be keyboard-reachable buttons; selection MUST be shown as pressed; arrow
  keys MUST move to a connected node; Enter MUST select; double click or a link MUST open the
  screen page.
- **FR-010**: The inspector MUST show, for the selected node: route, title, status, its states with
  kind and form step, the scans that saw it (with persona), its outgoing actions with their outcome,
  and its probe outcomes by kind.
- **FR-011**: On a node holding a form step, the inspector MUST offer "Mark for probing" and
  "Remove the mark", stored through the chat service's existing marks route; marked nodes MUST show
  the Probe tag (the marker tag for a person's intent). No other mark kind is shown.
- **FR-012**: The map MUST read the store only; a failed mark write MUST show its reason and leave
  the map unchanged.

**Differing states (US3, US4)**

- **FR-013**: The system MUST compute differing-states groups per portal: (a) the same from-screen
  and action led to different screens across scans; (b) one route holds several states not
  explained by form steps or state kinds; (c) a scan's way back to a state diverged (recorded as
  `REPLAY_DIVERGED`). Groups MUST be recomputed from the store, not edited by hand.
- **FR-014**: Each group MUST carry, per outcome: the scans that saw it, their personas and
  environment, first and last time seen, HTTP status, frequency, and whether a later scan saw the
  same outcome again.
- **FR-015**: The BA agent MUST be able to list the groups of a portal with their evidence and to
  propose one verdict per outcome from: main state, variant (persona), variant (input), variant
  (flag), validation state, technical error state, temporary (recheck), same state; each with a
  reason naming the hypothesis checked and the evidence; stored as a proposal.
- **FR-016**: The BA guidance MUST give the hypothesis order (persona, input, temporary, session or
  time, feature flag, data) and the documentation rules: a step is documented by its main state;
  variants, validation and technical states are states of that step, never the step; a temporary
  state is an environment issue (open question) and never a process step; a step only ever seen as
  an error is not observed (open question); persona variants are documented per persona.
- **FR-017**: Review MUST list a kind "Differing states" with the open groups that have a proposal,
  showing outcomes, evidence, hypotheses and proposed verdicts as proposals.
- **FR-018**: The owner MUST be able to confirm a group's verdicts, changing any of them first; the
  confirmation MUST be stored through the chat service with who and when; confirmed groups leave
  the open list and remain readable.
- **FR-019**: The BA's evidence reads MUST include confirmed verdicts for the screens they cover, so
  a documentation pass follows them.
- **FR-020**: A verdict outside the list MUST be refused with the list; a proposal for a group that
  no longer exists MUST be refused with a reason.

### Key Entities

- **Map node**: a screen (portal, route template, cluster) with its states, depth, status (observed,
  failed, not reached, blocked), scans that saw it and marks. Derived from stored states; not a new
  record.
- **Map edge**: a transition between two screens (from the stored transitions), with its encoding
  and the scans that saw it. Derived.
- **Queued cluster**: the count of pending frontier items of one page. Derived.
- **Differing-states group**: a graph point (from screen and action, or one route) with two or more
  outcomes and their evidence. Derived, keyed so a proposal can refer to it.
- **Reconciliation**: the BA's proposal for one group (verdict and reason per outcome, author,
  time) and, once confirmed, the reviewer's verdicts (who, when). Stored; new.
- **Mark** (exists, spec 032): only Probe marks on form steps are written.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For each of the five test portals, the Map page shows every screen and transition the
  store holds for it (counts equal), and the owner can find a given screen from the map in under
  30 seconds.
- **SC-002**: The Map page of the largest test portal (about 60 screens) opens in under 2 seconds,
  and one of 300 screens in under 4 seconds.
- **SC-003**: The map passes the dashboard's UI check at 1280 and 390 px wide (no page-level
  sideways scroll, one heading, at most one primary button, no serious accessibility issue), and
  every node can be reached and selected with the keyboard only.
- **SC-004**: A Probe mark set from the map is the same mark the screen page shows (one stored mark,
  never two).
- **SC-005**: On a seeded store with a known set of differing outcomes (a temporary 503, a persona
  variant, a validation state, an unexplained second state), every group is found and no group is
  made for states explained by form steps or kinds (no false groups).
- **SC-006**: Run on that seeded store, the reference BA proposes the expected verdict for at least
  3 of the 4 groups, each with a reason citing evidence.
- **SC-007**: After the owner confirms verdicts, the BA's next documentation of the process never
  documents an error page or a temporary state as a process step (checked by an eval check).

## Assumptions

- The store already holds what the map needs: states with route template, cluster, kind and form
  step; transitions with status and errors; frontier items with depth and status; scans with
  persona. Depth from the start page is computed from the transitions (breadth first), so it does
  not depend on any one scan's recorded depth.
- Route families: the first path segment below `/` (for `/ubezpieczenia#/szkody/...` the part before
  the hash's first segment).
- Pan and zoom reuse the existing diagram code (R-19); no new client library.
- The existing Review kind "Unexplained differences" (spec 024, access by persona) stays; "Differing
  states" is a separate kind for outcomes of the same action.
- Rechecks (a scan that replays to a node to see it again) are R-66; until then "temporary,
  recheck" verdicts are listed for a future recheck, not run.

## Open questions for the owner

- **Q1** Should the other mark kinds (Start here, Focus, Skip) be settable already, stored for R-66,
  or only arrive with R-66 (current choice: with R-66, no dead buttons)?
- **Q2** Should the map's default be all scans, or the latest scan (current choice: all scans, as
  screen 12)?
- **Q3** Should a confirmed "same state" verdict merge the two states in the store (the design's
  "merge fingerprints"), or only tell the BA to treat them as one (current choice: only tell the
  BA; merging changes recorded evidence and needs its own decision)?
- **Q4** Should Review show differing-states groups before the BA has proposed verdicts (current
  choice: listed only with a proposal; the BA sees all)?

## Owner answers (2026-10-17, after the merge of v1.0.36)

- The three bank proposals: "all fine" (confirmed as proposed).
- **Q1:** the other marks move to R-66 (as built: not shown).
- **Q2:** the map opens on all scans (as built).
- **Q3:** "for now let's merge": a confirmed `same` verdict merges the screens in the store
  (FR-021); the owner checks how it works and reviews it again later (roadmap R-69 note).
- **Q4:** Review shows every group, with or without a BA proposal (FR-022).

### Requirements from the answers

- **FR-021**: Confirming a group where an outcome has the verdict `same` MUST merge that outcome's
  screen into the group's main outcome's screen (the first outcome with `main`, else the first one
  not `same`): the screen is drawn and grouped as part of the other from then on, its states and
  evidence stay as recorded, and the merge can be undone by clearing it.
- **FR-022**: Review → Differing states MUST list every current group of the portal: with the BA's
  proposal when there is one (verdicts to confirm), else with its evidence and a note that the BA
  has not proposed verdicts yet (nothing to confirm).
