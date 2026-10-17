# Data model: Known screens, export, navigation (spec 034)

One migration, `0027_checkpoints_directed_runs` (reversible; through db-admin). Source of the why: spec.md
FR-001, FR-003, FR-012, decisions A-1, A-3, A-9.

## New table `checkpoints` (FR-001, A-1)

The recorded way back to a state: one per (run, state), the shortest way the run took. The app overwrites the
row when it finds a shorter one (and bumps `updated_at`).

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUIDv7 |
| `run_id` | TEXT NOT NULL | FK `runs(id)` |
| `state_id` | TEXT NOT NULL | FK `states(id)` |
| `start_url` | TEXT NOT NULL | the URL of the last navigate before the steps; CHECK non-empty |
| `steps_json` | TEXT NOT NULL | JSON array (CHECK `json_valid` and `json_type = 'array'`); `[]` = the state opens directly by URL |
| `created_at`, `updated_at` | TEXT NOT NULL | UTC ISO 8601 with milliseconds |

`UNIQUE (run_id, state_id)`. Index `ix_checkpoints_state (state_id)`: the replay looks up "a checkpoint for this
state, any run of this portal" (`go_to_state`, FR-001). Portal partition: through `run_id` (no `portal_id`);
`portal:export` and `portal:delete` carry it (`checkpoints`, deleted before `states` and `runs`).

Each item of `steps_json` (Zod `CheckpointStep`, `@pathfinder/core` `schemas/checkpoint.ts`):
`{ action_id, value (string|null), fills?: [{ name, kind, value? }], to_state }`; `to_state` is the state id
expected after the step (a different state on replay means the way is broken).

## `runs`: three nullable columns (FR-003, A-3)

| Column | Notes |
|---|---|
| `run_type` | CHECK `NULL` or `full`, `continue`, `focused`, `recheck`, `retry`, `probe`, `trace`; `NULL` = a plain run as before (full map or trace by `mode`) |
| `parent_run_id` | FK `runs(id)`; the run a directed run continues or retries |
| `plan_json` | CHECK `NULL` or `json_valid`; the plan it came from: start state ids, skip targets, depth, variation, target edge, marks used |

Index `ix_runs_parent (parent_run_id)`: the recovery screen lists the attempts and continuations of a run.
Down rebuilds `runs` without the three columns, keeping every other column, CHECK and row.

## `network_calls`: two nullable columns (FR-012, A-9)

`req_sample`, `res_sample`: a masked sample body, CHECK `length(...) <= 4096` when not NULL, recorded only
outside production (the app decides; NULL otherwise). Shape columns (`req_schema`, `res_schema`) are unchanged.

## Where each shape lives

| Shape | Zod | Kysely type | Dashboard model |
|---|---|---|---|
| `checkpoints` | `CheckpointRow` (core) | `CheckpointsTable` | `Checkpoint` |
| `runs` columns | `Run`, `RunType` (core) | `RunsTable` | `Run` |
| `network_calls` columns | `NetworkCall` (core) | `NetworkCallsTable` | `NetworkCall` |
