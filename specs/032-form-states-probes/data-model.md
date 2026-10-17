# Data model 032

All of it goes through db-admin (G-16): reversible migrations, Zod schemas in the owning model
package, `data/schema/schema.sql` regenerated, dashboard read models where the dashboard reads.

Built as migrations `0022_form_steps` (`form_steps`, the two `states` columns) and
`0023_probe_outcomes_and_suites` (`probe_outcomes`, `probe_suites`). Zod row schemas: `FormStepRow`,
`ProbeOutcomeRow`, `ProbeSuiteRow` and the enums `StateKind`, `OutcomeKind`, `ProbeGroup`, `ProbeFault`
in `apps/crawler/packages/core/src/schemas/probe.ts` (`State` in `state.ts` gains the two columns);
Kysely types in `store/src/db-types.ts`; dashboard read models in `models.py`; all three tables are in
`PORTAL_TABLES` (export and delete). The JSON columns (`*_json`) are parsed arrays/objects in Zod and
TEXT in the table. Indexes added: `ix_probe_outcomes_run`, `ix_probe_outcomes_form_step`,
`ix_probe_suites_portal_status`; none on `form_steps` beyond its UNIQUE.

## `form_steps` (new)

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | UUIDv7 |
| portal_id | TEXT NOT NULL | |
| route_template | TEXT NOT NULL | |
| step_index | INTEGER NOT NULL ≥ 1 | numbered per (portal, route) in first-seen order |
| form_name | TEXT | the form's accessible name, when it has one |
| controls_json | TEXT NOT NULL JSON array | sorted `role\|name` of the step's controls (the union of what was seen) |
| label | TEXT NOT NULL | display label: the first heading inside or above the form, else `step N` |
| first_seen_run | TEXT NOT NULL → runs | |
| created_at | TEXT NOT NULL | |

Unique (portal_id, route_template, step_index).

## `states` (two columns, ALTER TABLE)

| Column | Type | Notes |
|---|---|---|
| form_step_id | TEXT → form_steps, NULL | NULL: not a form step (no controls) or recorded before this migration |
| state_kind | TEXT NOT NULL DEFAULT 'main' | CHECK in (`main`, `validation`, `technical`) |

## `probe_outcomes` (new)

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | UUIDv7 |
| run_id | TEXT NOT NULL → runs | |
| from_state_id | TEXT NOT NULL → states | the happy-path state of the step the probe started on |
| form_step_id | TEXT → form_steps | |
| probe_id | TEXT NOT NULL | catalogue id, e.g. `required-empty-one` |
| probe_group | TEXT NOT NULL | CHECK in (`validation`, `branch`, `technical`) |
| target | TEXT | the field label, option label or request, as the probe reports it |
| inputs_json | TEXT NOT NULL JSON array | the label steps the probe typed and pressed (masked when the portal scrubs PII) |
| path_json | TEXT NOT NULL JSON object | `{ start_url, steps: [{name, kind, value?}] }`: how the step was reached in this run (the suite's base) |
| fault | TEXT | CHECK in (`block_request`, `http_500`, `delay`, `offline`) or NULL |
| outcome_kind | TEXT NOT NULL | CHECK in (`next`, `branch`, `validation`, `technical`, `temporary`, `blocked`) |
| to_state_id | TEXT → states | NULL when blocked before any page |
| accepted | INTEGER NOT NULL DEFAULT 0 | 1: a validation probe the form accepted |
| possible_new_process | INTEGER NOT NULL DEFAULT 0 | 1: a branch to a screen not seen before |
| messages_json | TEXT NOT NULL JSON array | `[{field, text, source: dom\|native}]` |
| http_status | INTEGER | the faulted or answered request's status, when there is one |
| reason | TEXT | why blocked or skipped, in plain words |
| evidence_ref | TEXT NOT NULL | the resulting state's snapshot evidence (or the step's, when nothing changed) |
| edge_id | TEXT → edges | the edge the probe's submit produced |
| created_at | TEXT NOT NULL | |

Index (run_id), (form_step_id).

## `probe_suites` (new)

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | UUIDv7 |
| portal_id | TEXT NOT NULL | |
| run_id | TEXT NOT NULL → runs | the probing run it was built from |
| form_step_id | TEXT → form_steps | the form's first step |
| trace_json | TEXT NOT NULL JSON object | one `TraceSpecEntry` (the `traces.yaml` shape) with the proposed variants |
| notes_json | TEXT NOT NULL JSON array | per variant: `{variant, probe_outcome_id, why}` |
| status | TEXT NOT NULL DEFAULT 'open' | CHECK in (`open`, `approved`, `dismissed`) |
| approved_json | TEXT | the trace as approved (after dropped variants and changed expectations) |
| replaced_json | TEXT | the `traces.yaml` entry it replaced, when one had the same id |
| decided_by, decided_at | TEXT | set when approved or dismissed |
| created_at | TEXT NOT NULL | |

CHECK (status = 'open' OR decided_at IS NOT NULL); CHECK (status <> 'approved' OR
approved_json IS NOT NULL). Index (portal_id, status).

## `marks` (new; migration `0024_marks`)

A person's instruction on a map target for the next scan (US5, FR-014..FR-016). Only kind `probe` is
written in this spec; the other kinds are for R-69 (5) and R-66. Zod: `MarkRow`, `MarkKind`,
`MarkTargetKind` (`core/src/schemas/probe.ts`); Kysely `MarksTable`; dashboard `Mark`; in
`PORTAL_TABLES` (deleted first, it references `runs`).

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | UUIDv7 |
| portal_id | TEXT NOT NULL | CHECK length > 0 |
| kind | TEXT NOT NULL | CHECK in (`start`, `focus`, `probe`, `retry`, `recheck`, `skip`) |
| target_kind | TEXT NOT NULL | CHECK in (`form_step`, `state`, `edge`) |
| target_id | TEXT NOT NULL | CHECK length > 0; no FK, polymorphic by `target_kind` |
| created_by | TEXT NOT NULL | the person (reviewer name); CHECK length > 0 |
| created_at | TEXT NOT NULL | |
| used_by_run_id | TEXT → runs | set when a scan used the mark |
| used_at | TEXT | set together with `used_by_run_id` |

CHECK ((used_by_run_id IS NULL) = (used_at IS NULL)). Partial UNIQUE index `ux_marks_open` on
(portal_id, kind, target_kind, target_id) WHERE used_by_run_id IS NULL: one open mark per target and
kind. Removing an open mark deletes its row; a used mark stays as history.

## Config (no table)

- `portal.yaml`: `probes: { per_step: 12, per_run: 60 }` (`per_run: 0` turns probing off).
- persona: `test_data` (label → synthetic value; the former `trace_inputs`, renamed 2026-10-17).
- `traces.yaml`: `TraceVariant.fault` and `expect` += `technical_error`, `branch`.
