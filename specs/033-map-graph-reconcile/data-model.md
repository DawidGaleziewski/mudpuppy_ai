# Data model: Map graph and differing states (spec 033)

## Read models (derived, no new tables)

### MapNode (dashboard `queries_map.py`)

| Field | From | Notes |
|---|---|---|
| `screen_id` | `screens.id` | one node per screen (portal, route template, cluster) |
| `route`, `title` | `screens.route_template`, `screens.title` | |
| `states` | `states` of that route template and cluster | id, kind (`states.state_kind`), form step (`form_steps.step_index`, `label`) |
| `deck` | `len(states) > 1` | drawn as `.sy-node--deck` with "N states" |
| `depth` | breadth-first over `edges` (executed, to_state not null) from the start screens | R2 |
| `status` | `observed` · `failed` (target only of failed edges) · `unobserved` (not seen by the chosen scan) · `blocked` | `data-state` |
| `scans` | `state_observations.run_id` of its states, with `runs.persona_id` | |
| `queued` | count of `frontier` rows `pending` whose `state_id` is one of its states | one "+N queued" node |
| `marked` | open `marks` (kind `probe`, target a form step of its states) | Probe tag |
| `family` | first path segment (R4) | collapse over 150 |
| `x`, `y` | layout (R2) | px |

### MapEdge

| Field | From | Notes |
|---|---|---|
| `from_screen`, `to_screen` | screens of `edges.from_state` / `to_state` | distinct pair |
| `labels` | `json_extract(action_json,'$.accessible_name')` | first three |
| `kind` | `tree` · `link` · `failed` (`edges.error` not null) · `blocked` (frontier rows with a refusal status, no target) | R1 |
| `scans` | `edges.run_id` | for the scan filter |

### DifferingStatesGroup (mcp-server `services/ba/differing-states.ts`)

| Field | Notes |
|---|---|
| `key` | `action:<screen id>:<role>:<name>` · `route:<route template>` · `replay:<state id>` (R7) |
| `kind` | `action` · `route` · `replay` |
| `point` | from screen (route, title) and action (role, name); or the route |
| `outcomes[]` | `{ screen_id, state_id, route, title, state_kind, scans[{run_id, persona, environment, started_at}], first_seen, last_seen, http_status, frequency: {seen, of}, reproduced }` |
| `reconciliation` | the latest stored reconciliation for the key, if any (status, verdicts) |

## New table `reconciliations` (migration 0025, through db-admin)

| Column | Type | Rule |
|---|---|---|
| `id` | TEXT PK | UUIDv7 |
| `portal_id` | TEXT NOT NULL | |
| `group_key` | TEXT NOT NULL | R7 key |
| `group_kind` | TEXT NOT NULL | CHECK `action`, `route`, `replay` |
| `snapshot_json` | TEXT NOT NULL | the group as the BA saw it (JSON object: point, outcomes with evidence) |
| `proposal_json` | TEXT NOT NULL | JSON array `[{state_id, verdict, hypothesis, reason}]`, one per outcome |
| `proposed_by` | TEXT NOT NULL | BA session id or `BA` |
| `proposed_at` | TEXT NOT NULL | |
| `status` | TEXT NOT NULL | CHECK `proposed`, `confirmed`, `superseded` |
| `confirmed_json` | TEXT | JSON array `[{state_id, verdict}]`; NOT NULL iff status `confirmed` |
| `confirmed_by`, `confirmed_at` | TEXT | set together with `confirmed_json` |

- Index `(portal_id, status)`; partial unique `(portal_id, group_key) WHERE status = 'proposed'`
  (one open proposal per group; a new proposal supersedes the open one).
- Verdicts: `main`, `variant_persona`, `variant_input`, `variant_flag`, `validation`, `technical`,
  `temporary`, `same`; hypotheses: `persona`, `input`, `temporary`, `session_time`, `flag`, `data`
  (checked in Zod, `@pathfinder/docs-model`: the BA's documentation model).
- Portal export and delete include the table (`portal-data.ts`).
- Dashboard read model `Reconciliation` in `models.py` (drift test).

### State transitions

`proposed` → `confirmed` (owner, through the chat service) · `proposed` → `superseded` (a newer BA
proposal for the same key) · `confirmed` stays (a new proposal for a confirmed key is a new row,
`proposed`, shown as "re-opened").
