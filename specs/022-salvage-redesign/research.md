# Research: spec 022

## R1 Screen identity (FR-003, T017)

- **Measured** (sandbox store, 2026-10-13): reference-insurer 21 states → 19 route templates → 20
  (route, cluster) pairs; pathfinder-dashboard 75 → 15 → 29; wikipedia 14 → 11 → 11. The repeated
  routes are real variants: `/kalkulator/opcje` twice in one cluster (same title, different
  content), `/logowanie` in two clusters (with and without the error message), dashboard tabs as
  separate clusters on one route.
- **Decision**: a screen is `(portal_id, route_template, cluster_id)`. Each state is one observed
  revision of its screen, numbered by first sighting (r1, r2, …). A changed page keeps its cluster
  and becomes the next revision; a different view on the same route (another cluster) is its own
  screen. Which revision a scan saw is already in `state_observations` (run → state); nothing new
  is stored per observation. Persona variants (R-33) read the same rows by `persona_id`.
- **Alternatives**: route template only (merges the login error page and tabs into one screen —
  wrong); fingerprint only (today: every change is a new, unrelated state — the R-44 problem).

## R2 Where screens are written

- **Decision**: migration `0015_screens` adds `screens` and `states.screen_id` + `states.screen_rev`
  and backfills them. The crawler's `record-state` step assigns both when it records a new state
  (find or create the screen; `screen_rev` = previous max + 1). Dashboard and BA read them.

## R3 Revisions of human work (FR-004, FR-005)

- **Decision**: append-only `*_revisions` tables hold every version (who, when, base revision,
  body); the entity table keeps the current head for cheap reads and is only changed together with
  a new revision row in one transaction. A write names its base revision; a stale base is refused
  (HTTP 409 with the latest) and shown as the conflict notice. Restore and withdraw are new
  revisions. First user: amendments (`amendment_revisions`, M2); then processes and change specs
  (M5).
- **Alternatives**: pure event log without heads (every read folds history — slower, more code);
  in-place updates with an audit table (history becomes optional — the R-44 complaint).

## R4 Amendments across scans (FE-S02)

- **Decision**: after a scan, each active amendment on a screen whose revision changed is either
  **carried forward** (a new amendment revision pointing at the new state: whole-screen anchors
  always; element anchors when the element key, or its role + name, is still on the new revision)
  or set to **needs re-anchor** (`needs_reanchor`, a revision with the reason). Nothing is set to
  `superseded` any more; existing `superseded` rows are shown as needs re-anchor (same status
  mapping) and migrate to `needs_reanchor`.
- `amendmentImpact` in `packages/workflow` gains a third outcome (`carried`); the chat service's
  `supersede.ts` becomes `reanchor.ts` and writes revisions.

## R6 Page context and assistant actions (FR-006, M3)

- **Message**: `POST /conversations/{id}/messages` takes an optional `context`:
  `{ "kind": "page" | "portal", "page"?: { "type": "screen" | "process" | "review" | "scan" | "docs",
  "id": "…", "rev"?: n, "ids"?: [...] } }`. The user message is stored as typed; the turn sent to
  the agent starts with one line naming the page (`Page context: screen <id> r<rev> (portal …).
  Read it with page_context before answering about it.`). "Whole yard" sends no page line.
- **Reading**: a `page_context` MCP chat tool returns the page's data from the store: for a screen
  its revisions, elements (layout keys), amendments (head + revision count) and the records citing
  it; for a process its variants and steps (M5); for a review item its record/amendment.
- **Acting in the browser**: `highlight_element({state_id, element_key})` and
  `open_page({path})` do nothing server-side; the chat service sees the tool call (ACP
  `rawInput`) and emits a `ui_action` SSE event the drawer performs (scroll + `.sy-mark--overlay`,
  or navigation). No new table, no polling.
- **Proposals**: `propose_change` writes a row in `chat_proposals` (migration 0017: id,
  conversation, portal, target kind/id, base_rev, payload JSON, status open|applied|discarded|stale,
  applied_rev, decided_by/at) and the drawer renders it as `.sy-proposal`. **Apply** runs the same
  revision write path as a BA edit (base check → 409 shows it stale); **Undo** is `restore` of the
  previous revision. The assistant itself never writes amendments (product rule 5.0.0).

## R5 Writes stay in the chat service

- **Decision**: the dashboard keeps its read-only store connection (constitution, FE-Q12). Every
  new write (amendment revisions, later processes, proposals) is an HTTP endpoint of the chat
  service, as amendments are today.
