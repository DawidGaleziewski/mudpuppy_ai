# Data Model: Dashboard UI

No new persisted structure: no migration, no `db-admin` task. The dashboard reads the tables in
`data/schema/schema.sql` (through `0002_portal_workspaces`) and derives the view models below.

## Read models (`apps/dashboard/src/pathfinder_dashboard/models.py`)

One Pydantic model per table, field names and order identical to the columns; enums as `Literal`
matching the table CHECKs. JSON text columns are parsed to `dict | list` (`JsonValue`), falling
back to the raw string when parsing fails (spec edge case: unexpected shapes are shown, not dropped).
Guarded by `tests/test_models_schema.py` (research §4).

| Model | Table | Notes |
| --- | --- | --- |
| `Run` | `runs` | `status: Literal['running','completed','stopped_warning','interrupted']`; `config_snapshot`, `coverage` parsed JSON; derived `duration_ms` = `ended_at − started_at` (or `elapsed_ms` while running) |
| `State` | `states` | `confidence`, `stabilization` literals |
| `StateObservation` | `state_observations` | |
| `Action` | `actions` | `safety_class` literal, `allowed: bool`, `action_json` parsed |
| `Edge` | `edges` | `status`, `confidence`, `stabilization` literals; `error` parsed |
| `Form` | `forms` | `fields_json` parsed (list of `{name,type,required}` today) |
| `NetworkCall` | `network_calls` | `req_schema`, `res_schema`, `console_errors` parsed |
| `OpenQuestion` | `open_questions` | |
| `RuleCandidate` | `rule_candidates` | |
| `FrontierItem` | `frontier` | `status` literal (8 values) |
| `DecisionLogEntry` | `decision_log` | `kind` literal (6 values); `detail_json` parsed |
| `RobotsPolicy` | `robots_policies` | |
| `PortalDataLog` | `portal_data_log` | not shown in v1; mirrored so drift is caught |

## View models (derived, never stored)

- **`StoreInfo`**: `environment`, `path`, `exists`, `data_version`, `size_bytes`.
- **`PortalSummary`**: `portal_id`, `runs_by_status: dict[RunStatus, int]`, `last_run_at`,
  totals `states`, `actions_allowed`, `actions_skipped`, `forms`, `network_calls`,
  `open_questions_open`, `rule_candidates`. States are per portal (`states.portal_id`); the rest
  join through `runs.portal_id`.
- **`RunSummary`**: a `Run` plus counts per section (states observed, actions, frontier by status,
  forms, network calls, decisions by kind, robots policies, open questions, rule candidates).
- **`Page[T]`**: `items: list[T]`, `next_cursor: str | None` (keyset on `id`), `total: int`.
- **`DecisionGroup`**: `kind`, `rule`, `count`, `example_reason`.
- **`LiveEvent`**: `event: Literal['hello','store-changed']`, `boot_id`, `data_version`.

## Validation rules carried from the spec

- Confidence and `evidence_ref` travel with every model that has them and every template that shows
  that model renders both (FR-005).
- A `Run` in `stopped_warning` always has `warning` (table CHECK); the view shows it (FR-003).
- Status-to-label mapping lives in one place (`contracts/ui-conventions.md`), not in templates.
