# Contract delta: BA MCP tools (`pathfinder-ba`)

Extends `specs/004-ba-documentation/contracts/ba-mcp-tools.md`. No new tool.

## `get_evidence` (target_kind `state`)

Adds the following to the response:

```json
{
  "screenshot": true,
  "elements": [
    { "key": "textbox \"Pojemność silnika\"", "role": "textbox", "name": "Pojemność silnika", "box": true }
  ],
  "elements_truncated": false
}
```

- `elements` is computed from the state's YAML snapshot (element key rule). `box` is true when
  the layout has a box for that key. When the state has no layout, every `box` is false and
  `screenshot` is false.
- The snapshot content and the 60 kB cap are unchanged. The element list is not counted
  against the cap.

## Evidence item (in `create_record` / `revise_record`)

```json
{ "target_kind": "screen_region", "target_id": "<state id>", "region": "textbox \"Pojemność silnika\"",
  "run_id": "<optional, as for state>", "note": "optional" }
```

- `region` is required for `screen_region` and refused for any other kind (`SCHEMA_INVALID`,
  field `region`).
- A `region` that is not one of the state's element keys is refused with `UNKNOWN_REF` (with `closest` in the error), and
  the message lists up to 10 closest keys.
- The state must be from a run of the session (same rule as `state`).
- The confidence contribution is the same as a `state` link (`observed`).

## Errors

The same codes as today. No new code.
