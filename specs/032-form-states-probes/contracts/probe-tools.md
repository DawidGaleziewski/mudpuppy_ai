# Contracts 032: form probes, probe suites, test data

## `start_run` input `probe_marked` (US5, owner answer 3 of 2026-10-17)

`probe_marked: true` starts a probe run: a new map run (not with `resume_run_id` or mode `trace`:
`SCHEMA_INVALID`), kept in `config_snapshot.choices.probe`. The result adds `probe_marks[]`
`{mark_id, form_step_id, route, step_index, label, url}` (the portal's open Probe marks; `url`
from a page visit of the step, or null). No open mark: `NO_PROBE_MARKS`, before any row or
browser. `finish_run` of a probe run completes without draining the frontier.

## `probe_form` (crawler server `pathfinder`, probe runs only)

Input: `run_id`, `action_id` (the form step's submit or Next control, issued on a step the run
reached), optional `probes` (probe ids or groups `validation`, `branch`, `technical`), `rationale`.

The server:
0. Refuses `PROBE_NOT_ASKED` in a run started without `probe_marked`.
1. Gates the control like `act` and requires a run limit of at least `mutating`. Otherwise it
   records one `blocked` outcome and answers `blocked`. Then refuses `STEP_NOT_MARKED` when the
   control's form step has no open Probe mark.
2. Goes back to the step if the browser is elsewhere (in-run path, `replay` phase). It reads the
   fields and stops with `blocked` when one takes a one-time code (O-M2).
3. Presses once with the happy values (the persona's `test_data`, else autofill's test
   values), recorded as outcome `happy-path`. If the step refuses them, it answers
   `missing_test_data: [labels]` and probes nothing.
4. Plans tries from the catalogue (`@pathfinder/probes`) within the budget: `portal.probes`,
   `per_step` 12 and `per_run` 60 by default, shared round-robin. Each try is pressed, recorded and
   classified.
5. Stops after 40 s and returns `more: N`; the next call on the same `action_id` continues.
6. A call that ends without `more` (or a step blocked by a one-time code) uses the step's mark
   (`marks.used_by_run_id`). `missing_test_data`, a run limit block or an empty budget leave it
   open.

Result (compact):
- `form_step` `{id, step_index, label}`;
- `outcomes[]` `{probe, key, target, outcome_kind, to_state, messages (≤ 3 texts), accepted?,
  possible_new_process?}`;
- `skipped[]` (with reasons: budget, "no request to break", replay diverged);
- `missing_test_data?`, `blocked?`, `more?`;
- `budget` `{per_step, per_run, used_in_run}`.

Errors:
- `SCHEMA_INVALID`: unknown probes, a trace run, or a control that submits no form;
- `UNKNOWN_ACTION`;
- `RUN_STOPPED`.

`REPLAY_DIVERGED` and `NO_PATH` never reach the agent: they end the step's tries and are listed in
`skipped`.

Outcome kinds and rules: plan decision 7. Rows: `probe_outcomes` (data-model.md). Trace events:
`probe` and `replay` phases; `probe_outcome`, `form_step` and `replay_diverged` events
(`specs/005-…/contracts/trace-spans.md`).

## `act` input `fault` (trace runs only)

`fault`: `block_request` | `http_500` | `delay` | `offline`. It breaks the request this action
sends, in the browser only: the first page load, or a script call that is not a GET, to the page's
own origin. While the fault is armed, error pages are not re-opened. In a map run it is refused
with `SCHEMA_INVALID`. `pnpm portal:trace` passes a variant's `fault` on the variant's last step.

## Chat service: `POST | DELETE /portals/{portal}/marks` (US5)

Body: `{author, kind: 'probe', target_kind: 'form_step', target_id}`. Other kinds and targets are
for R-69 (5) and R-66 and answer 400 for now.
- POST: 404 for a form step not on this portal; 201 `{id, created: true}` for a new open mark,
  200 `{id, created: false}` when the step already has one (one open mark per target and kind).
- DELETE: deletes the open mark, `{removed: 0|1}`; a used mark stays as history.

The dashboard's screen page posts through `/states/{state_id}/probe-mark` (`action=mark|remove`),
with `PATHFINDER_REVIEWER` as the author.

## Chat tool `request_scan` input `probe_marked` (US5)

A "Probe forms" scan: refused `MISSING_INPUT` when no form step is marked (naming "Mark for
probing"), `INVALID` with `resume_run_id`, `process` or `allow_writes: false`. The crawler brief
starts `start_run` with `probe_marked true` and follows the crawler agent's "Probe forms"
procedure: no frontier, every mark probed until its result has no `more`, then `finish_run`.

## `propose_probe_suite` (BA server `pathfinder-ba`)

Input:
- `session_id` (a running session);
- `run_id`;
- `trace {id (slug), name, goal}`;
- `variants[] {id (slug), probe_outcome_id, why}`.

The server builds every variant from its outcome: the steps along the run's path, the try's label
steps, and its fault. It maps the expectation (`next` → `proceed`, `validation` →
`validation_error`, `technical` → `technical_error`, `branch` → `branch`) and refuses `temporary`
and `blocked` outcomes. The result is validated as a `TraceSpecEntry` and stored as an
`open` `probe_suites` row.

Answer: `{suite_id, status: 'open', variants, note}`.

Errors: `SESSION_NOT_ACTIVE`, `RUN_NOT_FOUND`, `UNKNOWN_REF` (an outcome not in the run),
`SCHEMA_INVALID`, `PII_SUSPECTED` (the name, goal or a `why`).

## Chat service: `POST /portals/{portal}/probe-suites/{id}/approve | dismiss`

Approve body: `{author, keep?: [variant ids], expect?: {variant id: expect}}`.
- The trace is written into `portals/<portal>/traces.yaml`, with comments kept.
- An entry with the same id is replaced and kept in `replaced_json`.
- The row becomes `approved`.

Status codes:
- 400: no variant kept, or a change that breaks the trace (e.g. `technical_error` without a fault);
- 404: unknown suite;
- 409: already decided, or the file would not load.

Edit body (owner 2026-10-17: variants and steps are edited in Review): `{author, trace}`.
- The whole edited trace is validated as a `TraceSpecEntry`.
- The trace id must stay the same, and variant ids must be unique.
- The suite stays `open`, and approving it later writes the edited trace.
- Status codes: 400 for an invalid trace, 404, 409 when the suite is already decided.

The dashboard's **Approve** saves the edit first, then approves.

Dismiss body: `{author}`. The dashboard's Review posts both through `/review/suites/{portal}/{id}`,
signed with `PATHFINDER_REVIEWER`.

## `save_test_data` (chat server `pathfinder-chat`)

Input: `portal`, `persona` (an existing file), `values` `{label: synthetic value}`. The values are
merged into the persona's `test_data` with comments kept. A value that looks like personal data,
or a persona that would no longer load, is refused and the file is restored. Refusals:
`MISSING_INPUT` (no such persona), `INVALID`.
