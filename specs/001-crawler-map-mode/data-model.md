# Phase 1 Data Model: Crawler Map Mode

Scope: Layer A (mechanical UI state graph) only, per `user_input/raw_idea/tech-stack.md`'s
two-layer model. Layer B (processes, rules, requirements, tests — the BA/QA deliverables) is
out of scope for this feature and is not created here. All records are written through the
`mcp-server` (agent-facing tools and the server-internal recording services in
`contracts/mcp-tools.md`), never by raw SQL from the agent (constitution Technical Constraints).
The agent cannot write State/Transition/Form/API Call records at all; the server writes them
from its own observation.

Every entity below that is a *record* (State, Transition, Form, API Call) carries the two
fields Principle II makes non-negotiable: `confidence` and `evidence_ref`. A write missing
either MUST be rejected by the MCP tool, not merely discouraged.

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
| `id` | string (uuid) | |
| `portal_id` | string | |
| `persona_id` | string | |
| `mode` | `"map"` | `"trace"` is a future value (FR-022) — schema must not need to change to add it |
| `environment` | string | Copied from portal config at run start |
| `env_version_or_date` | string | For comparing runs (FR-020) |
| `seed_id` | string \| null | Not applicable to a guest/read-only run against production, but the field exists per FR-020's comparability requirement |
| `viewport`, `locale`, `browser` | string | FR-020 |
| `config_snapshot` | JSON | Fully resolved portal + persona config used, for reproducibility |
| `status` | `"running" \| "completed" \| "stopped_warning" \| "interrupted"` | `stopped_warning` = FR-008 block/CAPTCHA stop |
| `started_at`, `ended_at` | timestamp | |
| `coverage` | JSON | states, actions executed, actions skipped by class, API endpoints seen — FR-021 |

**State transitions**: `running → completed`; `running → stopped_warning` (block/CAPTCHA,
FR-008); `running → interrupted` (crash/manual stop), resumable back to `running` without
repeating recorded work (FR-020, SC-010).

## State

Table `states`.

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) | |
| `fingerprint` | string (sha256) | Unique — Level 1 fingerprint, see `research.md` §1 |
| `cluster_id` | string | Level 2 grouping for near-duplicates (FR-009) |
| `route_template` | string | e.g. `/oferty/:id` |
| `title` | string | |
| `evidence_ref` | string (sha256 path) | ARIA snapshot / screenshot — required, Principle II |
| `confidence` | `"observed" \| "inferred" \| "needs_confirmation"` | FR-003 |
| `stabilization` | `"settled" \| "never_stabilized"` | Set by the stabilizer (research §3); a `never_stabilized` state is still recorded with evidence |
| `first_seen_run` | string (run id) | |

Relationship table `state_observations(state_id, run_id, persona_id, evidence_ref)` records
which run/persona saw a state, supporting cross-run and cross-persona comparison (FR-020, and
the future permission-matrix use case named in `tech-stack.md`, not built here).

**Merge/split**: every fingerprint merge or split decision is written to the decision log
(FR-021), not silently applied.

## Transition (Edge)

Table `edges`.

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) | |
| `from_state`, `to_state` | string (state id) | |
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
| `id` | string (uuid) | |
| `state_id` | string | |
| `fields_json` | JSON | Per field: name, type, required, constraints, options, validation messages — FR-011 |
| `evidence_ref`, `confidence` | — | Required, Principle II |

Forms are recorded, never submitted (FR-011); there is no `submitted` state in this model.

## API Call

Table `network_calls`.

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) | |
| `edge_id` | string \| null | Null when observed passively on state load rather than tied to one action |
| `method` | string | |
| `url_template` | string | Same route-templating rules as page routes (FR-012) |
| `status` | integer | |
| `req_schema`, `res_schema` | JSON | Shape only — no PII payloads (FR-012, FR-014) |
| `console_errors` | JSON[] | Captured alongside |

**Constraint**: FR-025 — this table only ever holds calls *observed being made by the
portal's own pages*; the crawler itself never calls the portal's API directly.

## Frontier Item

Table `frontier`.

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) | |
| `run_id`, `state_id` | string | |
| `action_json` | JSON | Same shape as an edge's action descriptor |
| `safety_class` | string | |
| `status` | `"skipped_unsafe" \| "out_of_scope" \| "denylisted" \| "budget_reached" \| "unreachable"` | FR-010 |
| `reason` | string | Human-readable, references the specific rule/cap that applied (FR-010, FR-021) |

**Open item for `db-admin` (task T014)**: `get_next_frontier_item` and resume (FR-020) need
the server to persist not-yet-processed frontier entries (pending queue, priority, visited
set) as well as skipped ones. The status enum above only covers skipped items; db-admin decides
whether to add a `pending` status, a separate queue table, or both, and updates this document.

## Open Question

Table `open_questions`.

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) | |
| `text` | string | e.g. "why is this button disabled for guests?" |
| `about_ref` | string | State/edge/form id it concerns |
| `status` | `"open" \| "addressed"` | Addressed only by a later BA action, out of scope here |

## Rule Candidate

Table `rule_candidates`. A flagged inference the crawler may emit (FR-002, constitution
Principle III); never a fact.

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) | |
| `run_id` | string | |
| `text` | string | e.g. "guests appear to see max 24 results per page" |
| `about_ref` | string | State/edge/form id; the server copies that record's `evidence_ref` |
| `evidence_ref` | string | Required, Principle II |
| `confidence` | `"inferred"` | Forced by the server; the agent cannot set it |

## Evidence

Not a table — a filesystem convention: `data/evidence/<sha256>.<ext>` (masked ARIA snapshot
JSON, network shape record). Screenshots are NOT stored in this feature (research §9), content-addressed so identical evidence is stored once.
Every `evidence_ref` field above stores this path/hash. PII masking (FR-014) happens before
the file is written. Layout and lifecycle owned by the `db-admin` subagent
(`.claude/agents/db-admin.md`); see `data/README.md`.

## Cross-cutting validation rules

- No record (State, Transition, Form, API Call) may be written without both `confidence` and
  `evidence_ref` populated — enforced in the `mcp-server` write tools, not just by convention
  (Principle II, FR-003).
- `safety_class` on a Transition is always computed by the `safety` package, never supplied
  by the agent as free text (FR-004).
- A Run's `config_snapshot` always reflects the fully resolved (post-`extends`,
  ceiling-applied) config, so two runs can be diffed even if the source files change later
  (FR-018, FR-020).
