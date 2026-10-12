# Contract: BA tools (pathfinder-ba server) — spec 019 changes

## `get_run_evidence` — new kinds

### `kind: "page_visits"`

Page of visits of the run, ordered by `created_at`. Item:

```json
{ "id": "…", "state_id": "…", "via": "action", "edge_id": "…",
  "url": "http://127.0.0.1:4100/legacy/bank/wyciag.do;jsessionid=AB12?konto=7&typ=M&okres=2026-09&tryb=podglad",
  "hops": [ { "url": "…/menu.do;jsessionid=AB12", "kind": "start" },
            { "url": "…/wyciag.do;jsessionid=AB12?…", "kind": "http", "status": 302 } ] }
```

`defaults`: `{ "via": "action", "hops": [] }` (fields equal to the default are omitted, as for the
other kinds); `edge_id` omitted when null.

### `kind: "parameters"`

One item per state the run visited: the `ParameterInventory` (data-model.md) restricted to this
run's visits. `values` capped at 20, `entry_urls` at 50 (with `entry_urls_more: n`).

## `create_record` — description

The description ends with a generated block (from Zod + `RELATION_RULES`, never hand-written):

```
Content per kind (required unless marked ?):
screen: title, purpose, route_templates[string], elements[{role, label_verbatim}], entry_points[string], summary?
use_case: title, primary_actor, preconditions[string], trigger, main_flow[{n:number, actor_or_system, text}], alternate_flows[[{n, actor_or_system, text}]], exception_flows[[…]], postconditions[string]
…
Relations (from type to): capability contains process|screen; use_case describes process; …
```

## Error answers

`SCHEMA_INVALID` (create/revise) gains `expected`: the kind's line above.

```json
{ "error": { "code": "SCHEMA_INVALID", "kind": "screen",
  "message": "content.elements.0: expected object, received string",
  "expected": "screen: title, purpose, route_templates[string], elements[{role, label_verbatim}], …" } }
```

`RELATION_NOT_ALLOWED` gains `allowed_from_kind`: every relation the source kind may assert.

```json
{ "error": { "code": "RELATION_NOT_ALLOWED", "from_kind": "capability", "type": "appears_on",
  "to_kind": "screen", "allowed": ["data_item appears_on screen"],
  "allowed_from_kind": ["capability contains process|screen", "capability uses_term glossary_term",
                        "capability depends_on capability"] } }
```

## Evidence targets

`evidence[].target_kind` accepts `page_visit` (`target_id` = visit id). `data_item.seen_in[].kind`
accepts `page_visit`.
