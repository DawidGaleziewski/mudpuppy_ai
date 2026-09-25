# Contract: Operator Commands for Documentation

Run from `apps/crawler/` with pnpm, like `portal:export`. Not MCP tools: no agent can review,
export or audit. All take `--env <env>` (default `production`, DB `data/db/<env>.sqlite`).

## `pnpm docs:review` (R-15)

Used by the dashboard (subprocess) and by hand. Input: one JSON object on stdin, or flags.

```json
{ "portal_id": "reference-insurer", "key": "REQ-007", "rev_no": 3,
  "action": "confirm" | "reject" | "comment", "text": "…", "reviewer": "Jane Doe" }
```

Flags equivalent: `--portal --key --rev --action --text --reviewer`. Extra: `--cancel-followup
<FUP-key> --reviewer <name> --text <reason>` sets a follow-up `cancelled`.

- Validates with Zod; `reviewer` required and non-empty; `text` required for `reject`/`comment`.
- `confirm`/`reject` only on the latest revision whose status is `draft` → else exit 2 with
  `STALE_REVISION` (details: latest rev and status). `comment` allowed on any revision.
- One transaction: insert `doc_reviews`, apply the status engine, update `doc_records` denormalised
  columns.
- Output (stdout, one JSON line): `{ "ok": true, "review_id", "key", "rev_no", "status" }` or
  `{ "ok": false, "error": { "code", "message", ... } }`. Exit 0 ok, 2 refused, 1 unexpected.
- Time budget: < 3 s on the dashboard's machine (dominated by process start).

## `pnpm docs:export <portal> [--confirmed-only] [--out <dir>]` (R-16)

See [srs-export.md](srs-export.md). Read-only on the DB. Writes a `portal_data_log` row with
`action = export` and `target` = the out dir. Exit 1 if the portal has no doc records.

## `pnpm docs:audit [<portal>]` (R-13)

Read-only integrity check (SC-001, SC-002): every revision has ≥ 1 link; every link resolves to an
existing row of the right portal (and its `run_id` matches); every `observed` revision passes the
observed rule; every non-draft revision status is explained by a review; denormalised
`doc_records` columns match revisions; every `followup` record has a `followup_tasks` row. Prints a
JSON report; exit 1 on any finding. Also run by the test suite on every fixture store.

## `pnpm docs:evaluate <portal> --ground-truth <file>` (R-16)

Scores documentation against a ground truth. See [ground-truth.md](ground-truth.md). Read-only.
