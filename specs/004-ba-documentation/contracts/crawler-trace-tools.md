# Contract: Crawler Tool Changes for Trace Mode (R-14)

Extends [spec 001 mcp-tools](../../001-crawler-map-mode/contracts/mcp-tools.md) and
[spec 002 changes](../../002-portal-agnostic-safety/contracts/mcp-tools.md). The crawler agent's
tool list is unchanged; inputs gain optional fields. Map-mode behaviour is unchanged (existing tests
stay green).

## `start_run`

New inputs:

| Field | Type | Notes |
|---|---|---|
| `mode` | `'map' \| 'trace'` | default `'map'` |
| `process` | `{ name, goal }` | required when `mode = 'trace'`, forbidden otherwise (`SCHEMA_INVALID`) |
| `followup_key` | string | optional, trace only; must be an `open` `FUP` record of the portal (`UNKNOWN_REF` otherwise); sets it `in_progress` with this run |

Trace runs create a `processes` row (`status = recorded`). No frontier is seeded; `get_next_frontier_item`
returns `null` in trace mode. The output carries the portal's `base_url`, where the trace starts.

## `navigate`, `act`

| Field | Type | Notes |
|---|---|---|
| `intent` | string (≤ 200) | required in trace mode (`SCHEMA_INVALID` if missing), ignored in map mode |
| `value` | string (≤ 500) | `act` only, only for `fill`/`select` actions; PII-checked (`PII_SUSPECTED`); an e-mail on a reserved test TLD (`.invalid`, `.test`, `.example`) counts as synthetic and is accepted |

In trace mode the state's action list also contains fillable controls (`fill`, `check`, `select`;
safety class `read`) with their label and, when the persona declares one, the
`trace_inputs[<label>]` value to use as `suggested_value` (what to type, not the field's content).
Every executed call appends one `process_steps` row and the result gains `step: { ord, outcomes[] }`.
A click that changes nothing visible records "No visible change after the step" and one
"Browser validation on <field>: <message>" per field whose browser validation message is set.

### Boundary (production or any ceiling below the action's class)

When the action gate refuses an `act` **because of its safety class** in a trace run:

- the process gets `outcome = boundary_reached`, `boundary_action_id`, `not_observable` text;
- a crawler open question is added about that action;
- the run ends `completed`; a linked follow-up becomes `blocked` with the rule;
- the tool returns error `TRACE_BOUNDARY_REACHED` with `{ process_id, steps, action: {role, name,
  safety_class}, rule }`. The agent must stop and report.

Robots, denylist and scope refusals stay `ACTION_REFUSED` (the trace may continue another way only
through actions the server offers).

## `finish_run`

In trace mode: input `outcome` (`goal_reached` \| `abandoned`, required) and `observed_result`
(facts only, ≤ 1000). No `FRONTIER_NOT_EMPTY` check. A linked follow-up becomes `done` for
`goal_reached`, `blocked` ("abandoned: <observed_result>") otherwise.

## Error codes

Adds `TRACE_BOUNDARY_REACHED`.

## Persona config

`personas/<portal>/.../<persona>.yaml` may declare `trace_inputs: { "<label verbatim>": "<synthetic
value>" }`. Values must be synthetic; the persona loader runs the PII scrubber on them and refuses
the persona (`CONFIG_INVALID`) if any value would change.
