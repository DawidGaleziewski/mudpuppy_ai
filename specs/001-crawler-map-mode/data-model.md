# Phase 1 Data Model: Crawler Map Mode

Scope: Layer A (mechanical UI state graph) only, per `user_input/raw_idea/tech-stack.md`'s
two-layer model. Layer B (processes, rules, requirements, tests — the BA/QA deliverables) is
out of scope for this feature and is not created here. All records are written through the
`mcp-server` (agent-facing tools and the server-internal recording services in
`contracts/mcp-tools.md`), never by raw SQL from the agent (constitution Technical Constraints).
The agent cannot write State/Transition/Form/API Call/Frontier/Action records at all; the server writes them
from its own observation.

Every semantic *record* (State, Transition, Form) carries the two fields Principle II makes
non-negotiable: `confidence` and `evidence_ref`. A write missing either MUST be rejected by
the MCP tool and is also impossible at the schema level (NOT NULL + CHECK). API Call is a
shape-only observation and carries neither (decision R-04); Rule Candidate carries `evidence_ref`
and a fixed `inferred` confidence.

Storage conventions (ids = UUIDv7 text, timestamps = UTC ISO 8601 text with ms, JSON = TEXT with
`json_valid`) and the generated DDL live in `data/schema/` (`README.md`, `schema.sql`); migration
`data/migrations/0001_init.*`. Types below are logical; the DDL is authoritative for storage.

## Portal (config, not a DB row)

Source: `portals/<portal>/portal.yaml`. Loaded and validated by `config`, consumed by
`safety` (denylist, scope) and `crawler` (budgets). Not persisted to SQLite as its own table;
a run stores the resolved portal id/version alongside its config snapshot (see Run).

| Field | Type | Notes |
|---|---|---|
| `id` | string (slug) | Matches the directory name, e.g. `marketsite` |
| `base_url` | string (URL) | Entry point for crawling |
| `environment` | `"production" \| "staging" \| "sandbox"` | FR-005: only `production` unlocks the production guard; its absence blocks any run against a production-looking address |
| `max_action_class` | `"read" \| …` (optional) | Portal ceiling; defaults to `read` when `environment: production` |
| `compliance` | object | `robots_checked_on`, `terms_reviewed_on`, `terms_reviewed_by`; production run refused while any is null — FR-026 |
| `item_route_templates` | string[] | Route templates that count as item pages for the FR-024 cap |
| `scope` | object | `allowed_domains`, `allowed_paths`, `external_link_policy` (`record` \| `follow`), `max_depth`, `max_states`, `max_actions_per_state`, `max_run_time_minutes`, `max_steps` — FR-007 |
| `denylist` | string[] (rule ids or patterns) | Includes logout, delete, payment, bidding, buy-now, messaging/contact-seller, reveal-seller-contact, listing-creation path — FR-007 |
| `obstacles` | object[] | Known cookie banner / popup / chat widget selectors and handler ids — FR-019 |
| `rate_limit` | object | `requests_per_second`, `max_concurrency`, `user_agent`/`header` — FR-006 |
| `item_view_cap` | integer | Max individual item/listing page visits — FR-024 |
| `block_signatures` | string[] | Optional extra case-insensitive response-body substrings that mean the portal is blocking the crawler — FR-008 |

**Validation**: rejected with a file-naming, problem-naming error if it fails the Zod schema
(FR-017). `environment: production` is the only value that permits a production run (FR-005).

## Persona (config, not a DB row until resolved)

Source: `personas/<portal>/[<process>/]<persona>.yaml`, composable via `extends` against
other personas or `personas/_mixins/*`. Loaded and validated by `config`; the *resolved*
effective persona (post-`extends`) is what a run stores a snapshot of.

| Field | Type | Notes |
|---|---|---|
| `id` | string (slug) | e.g. `guest` |
| `extends` | string[] | References to other persona files or mixins; later entries override earlier ones — FR-016 |
| `auth` | object \| `"none"` | `none` for the guest persona; credential fields, when present, are references by name only, never inline values — FR-017 |
| `max_action_class` | `"read" \| "mutating" \| "destructive" \| "external-side-effect"` | Persona's own ceiling; effective ceiling is `min(portal, persona)` — FR-018 |
| `scope_restrictions` | object (partial Scope) | Optional narrowing of the portal's scope |
| `budgets` | object (partial Scope budgets) | Optional narrowing of the portal's budgets |
| `consent` | object | e.g. `decline_location: true`, `decline_marketing: true` — FR-023 |
| `viewport` | `{ width, height }` | Run comparability metadata (FR-020) |
| `locale` | string | Run comparability metadata (FR-020) |

**Validation**: circular `extends` and inline secrets are rejected with a message naming the
file and the problem (FR-017, User Story 3 Acceptance Scenario 4–5).

## Run

Table `runs`. One row per `map` invocation.

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUIDv7) | |
| `portal_id` | string | |
| `persona_id` | string | |
| `mode` | `"map"` | `"trace"` is a future value (FR-022) — schema must not need to change to add it |
| `environment` | string | Copied from portal config at run start |
| `env_version_or_date` | string | For comparing runs (FR-020) |
| `seed_id` | string \| null | Not applicable to a guest/read-only run against production, but the field exists per FR-020's comparability requirement |
| `viewport`, `locale`, `browser` | string | FR-020 |
| `config_snapshot` | JSON | Fully resolved portal + persona config used, for reproducibility |
| `status` | `"running" \| "completed" \| "stopped_warning" \| "interrupted"` | `stopped_warning` = FR-008 block/CAPTCHA stop |
| `warning` | string \| null | Run-level warning text (block/CAPTCHA, FR-008); required when `status = stopped_warning` (CHECK) |
| `steps_used` | integer | Persisted step counter for budget enforcement and resume (FR-020) |
| `elapsed_ms` | integer | Accumulated active run time in ms (excludes downtime between resumes) |
| `max_depth_reached` | integer | Deepest navigation depth so far |
| `started_at`, `ended_at` | timestamp | UTC ISO 8601 text; `ended_at` null while running |
| `coverage` | JSON | states, actions executed, actions skipped by class, API endpoints seen — FR-021 |

**State transitions**: `running → completed`; `running → stopped_warning` (block/CAPTCHA,
FR-008); `running → interrupted` (crash/manual stop), resumable back to `running` without
repeating recorded work (FR-020, SC-010).

## State

Table `states`.

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUIDv7) | |
| `fingerprint` | string (sha256) | Unique — Level 1 fingerprint, see `research.md` §1 |
| `cluster_id` | string | Level 2 grouping for near-duplicates (FR-009) |
| `route_template` | string | e.g. `/oferty/:id` |
| `title` | string | |
| `evidence_ref` | string (sha256 path) | masked ARIA snapshot (`<sha256>.<ext>`) — required, Principle II |
| `confidence` | `"observed" \| "inferred" \| "needs_confirmation"` | FR-003 |
| `stabilization` | `"settled" \| "never_stabilized"` | Set by the stabilizer (research §3); a `never_stabilized` state is still recorded with evidence |
| `first_seen_run` | string (run id) | |

States are global by fingerprint. Relationship table
`state_observations(run_id, state_id, persona_id, evidence_ref, observed_at, composition_json)` (PK
`run_id, state_id`, FKs to `runs` and `states`; `composition_json` is a nullable JSON
`PageComposition` since 0011, spec 015) records which run/persona saw a state. It answers
`get_known_states(run_id)` and supports cross-run and cross-persona comparison (FR-020, and the
future permission-matrix use case named in `tech-stack.md`, not built here).

**Merge/split**: every fingerprint merge or split decision is written to the decision log
(FR-021), not silently applied.

## Transition (Edge)

Table `edges`.

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUIDv7) | |
| `from_state` | string (state id) | Required, FK |
| `to_state` | string (state id) \| null | Nullable: skipped edges and actions that lead to no new state |
| `action_json` | JSON | Action descriptor: role, accessible name, ranked candidate locators (role+name, label/text, `data-testid`, container) — FR-013 |
| `safety_class` | `"read" \| "mutating" \| "destructive" \| "external-side-effect"` | FR-004; only `read` transitions are ever executed on production |
| `run_id` | string | |
| `status` | `"executed" \| "skipped"` | Skipped transitions still get a row so the frontier report can reference them |
| `evidence_ref` | string | Required, Principle II |
| `confidence` | `"observed" \| "inferred" \| "needs_confirmation"` | FR-003 |
| `error` | JSON \| null | Any error observed executing the action |
| `stabilization` | `"settled" \| "never_stabilized"` | As for State |

## Form

Table `forms`.

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUIDv7) | |
| `run_id` | string | FK |
| `state_id` | string | FK |
| `fields_json` | JSON | Per field: name, type, required, constraints, options, validation messages — FR-011 |
| `evidence_ref`, `confidence` | — | Required, Principle II |

Forms are recorded, never submitted (FR-011); there is no `submitted` state in this model.

## API Call

Table `network_calls`. Carries no `evidence_ref`/`confidence`: it is a shape-only observation, and
its `run_id` FK plus optional `edge_id` provide traceability.

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUIDv7) | |
| `run_id` | string | FK; `record_api_call` takes a `run_id` |
| `edge_id` | string \| null | Null when observed passively on state load rather than tied to one action |
| `method` | string | |
| `url_template` | string | Same route-templating rules as page routes (FR-012) |
| `status` | integer | |
| `req_schema`, `res_schema` | JSON | Shape only — no PII payloads (FR-012, FR-014) |
| `console_errors` | JSON array (text column, default `[]`) | Captured alongside |

**Constraint**: FR-025 — this table only ever holds calls *observed being made by the
portal's own pages*; the crawler itself never calls the portal's API directly.

## Action

Table `actions`. Persists every server-issued `action_id` (from `navigate`, `act`, and the action
extractor); `act` accepts only ids present here whose `state_id` is the current state, else
`UNKNOWN_ACTION`.

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUIDv7) | This is the `action_id` |
| `run_id`, `state_id` | string | FKs; state the action was extracted from |
| `role`, `accessible_name` | string, string \| null | |
| `action_json` | JSON | Ranked locators (FR-013) |
| `safety_class` | enum | Computed by `safety` |
| `allowed` | boolean | Whether it may be executed under scope/denylist/ceiling |
| `skip_reason` | string \| null | Required when `allowed` is false (CHECK) |
| `created_at` | timestamp | |

## Frontier Item

Table `frontier`. Server-owned queue plus history for a run; one table, no separate queue or visited
table.

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUIDv7) | Time-ordered, so it doubles as FIFO tie-break |
| `run_id`, `state_id` | string | FKs |
| `action_id` | string \| null | FK to `actions`; null for `navigate` refusals with no extracted action |
| `action_json` | JSON | Same shape as an edge's action descriptor (for navigate refusals: `{kind:"navigate", url}`) |
| `safety_class` | string | |
| `status` | `"pending" \| "done" \| "skipped_unsafe" \| "out_of_scope" \| "denylisted" \| "budget_reached" \| "unreachable"` | `pending` = queued, `done` = executed; the rest are FR-010 skips |
| `priority` | integer | Higher first |
| `depth` | integer | Navigation depth of the item (for the depth budget) |
| `reason` | string \| null | Required for every skip status (CHECK); references the rule/cap (FR-010, FR-021) |
| `created_at`, `updated_at` | timestamp | |

`get_next_frontier_item` selects the `pending` row with the highest `priority`, then smallest `id`,
without mutating it; `act` moves it to `done` or a skip status. Resume (FR-020) continues from
`pending` rows. Visited set = `state_observations` of the run plus `done` frontier rows.

## Decision Log Entry

Table `decision_log` (FR-021). Persisted in SQLite so it is queryable across runs; the pino logger
mirrors entries but the table is the record.

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUIDv7) | |
| `run_id` | string | FK |
| `kind` | `"skip" \| "refuse" \| "merge" \| "split" \| "warning"` | |
| `rule` | string \| null | Rule or cap that applied |
| `reason` | string | |
| `subject_ref` | string \| null | State/edge/frontier/action id concerned |
| `detail_json` | JSON \| null | |
| `created_at` | timestamp | |

## Open Question

Table `open_questions`.

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUIDv7) | |
| `run_id` | string | FK |
| `text` | string | e.g. "why is this button disabled for guests?" |
| `about_ref` | string | State/edge/form id it concerns (polymorphic, validated by the tool, no FK) |
| `status` | `"open" \| "addressed"` | Addressed only by a later BA action, out of scope here |

## Rule Candidate

Table `rule_candidates`. A flagged inference the crawler may emit (FR-002, constitution
Principle III); never a fact.

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUIDv7) | |
| `run_id` | string | FK |
| `text` | string | e.g. "guests appear to see max 24 results per page" |
| `about_ref` | string | State/edge/form id; the server copies that record's `evidence_ref` |
| `evidence_ref` | string | Required, Principle II |
| `confidence` | `"inferred"` | Forced by the server; the agent cannot set it |

## Evidence

Not a table — a filesystem convention: `data/evidence/<sha256>.<ext>` (masked ARIA snapshot
JSON, network shape record), content-addressed so identical evidence is stored once.
Every `evidence_ref` field above stores this path/hash. PII masking (FR-014) happens before
the file is written. Layout and lifecycle owned by the `db-admin` subagent
(`.claude/agents/db-admin.md`); see `data/README.md`.

## Cross-cutting validation rules

- No record (State, Transition, Form) may be written without both `confidence` and
  `evidence_ref` populated — enforced in the `mcp-server` write tools and by NOT NULL/CHECK
  constraints in the schema (Principle II, FR-003). API Call is exempt (shape-only, no PII).
- `safety_class` on a Transition is always computed by the `safety` package, never supplied
  by the agent as free text (FR-004).
- A Run's `config_snapshot` always reflects the fully resolved (post-`extends`,
  ceiling-applied) config, so two runs can be diffed even if the source files change later
  (FR-018, FR-020).
