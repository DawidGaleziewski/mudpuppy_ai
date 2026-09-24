# Contract: MCP Tool Changes

Extends [spec 001 mcp-tools](../../001-crawler-map-mode/contracts/mcp-tools.md). The agent's tool
list does not change (`agent-lockdown.test.ts` stays as is); only inputs are checked more
strictly and outputs carry more reasons.

## `start_run`

- **New behaviour**: after `preflight` and before the run row exists, the server fetches the base
  host's `robots.txt` ([robots.md](./robots.md)). On resume it fetches again.
- **New error**: `ROBOTS_UNAVAILABLE` — the base host's `robots.txt` was unreachable or 5xx.
  `message` names the URL and the failure. No run row, page or other request is made. Returned in
  under 5 s after the fetch timeout (SC-003).
- **Output**: unchanged shape; the run's `config_snapshot` gains `robots` and `rule_set`
  ([data-model.md](../data-model.md)).

## `navigate`, `act`

- **New refusal**: status `robots_disallowed`, `rule` = `robots:<directive line>` (for example
  `robots:Disallow: *cHash*`). Returned as `ACTION_REFUSED` with that rule, like other refusals.
- **Denylist refusals** can now carry `rule` = `url:<glob>` or `<alias>→<generic>` (for example
  `buy_now→purchase`).
- Rule ids in classifications and refusals are generic (`purchase`, `contact_or_message`,
  `reveal_contact`, `submit_request`) or portal-defined ids.

## `get_next_frontier_item`, frontier report, `finish_run`

- Frontier items and the report can have status `robots_disallowed`.
- `finish_run` coverage gains `robots: { hosts, refused_navigations, page_requests_blocked,
  page_requests_allowed }`.

## Recording services (server-internal)

- `record_state` looks up and creates states by `(portal_id, fingerprint)` of the run's portal.
  The fingerprint index a session starts with holds only that portal's states.
- `record_transition` derives the safety class with the run's rule set, not the built-in set.

## Error code list

Spec 001 codes plus `ROBOTS_UNAVAILABLE`.
