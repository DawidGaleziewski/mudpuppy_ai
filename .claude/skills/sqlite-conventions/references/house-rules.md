# SQLite house rules

Contents: Connection setup · Tables and types · Integrity · Indexes · Migrations · Concurrency · Operations

## Connection setup (every connection, including the migration runner)
- `PRAGMA journal_mode=WAL` — readers don't block the single writer; fits read-heavy analysis after a run.
- `PRAGMA foreign_keys=ON` — off by default and per-connection, so a forgotten setup silently disables FKs.
- `PRAGMA busy_timeout=5000` — a momentary writer lock should wait, not surface as a hard failure.

## Tables and types
- Use `STRICT` tables so SQLite enforces the types the Zod schema already promises.
- Ids are server-generated (task T016, `apps/crawler/packages/core/src/ids.ts`); no API accepts client-chosen ids. For
  high-insert tables (`states`, `edges`, `network_calls`) prefer a time-ordered id (UUIDv7/ULID) for index
  locality unless a natural key such as `states.fingerprint` is already the unique identity.
- Timestamps are UTC and use one representation project-wide (ISO 8601 text or epoch integer). If
  `data-model.md` doesn't fix it, choose once and record the choice in `data/schema/`.
- Genuinely document-shaped fields (`action_json`, `config_snapshot`, `edge.error`) stay JSON validated by
  Zod; don't normalise them into columns for its own sake. `network_calls.req_schema`/`res_schema` hold
  shape only, never payloads that could contain PII (FR-012, FR-014).

## Integrity (Principle II lives in the schema)
- `evidence_ref` and `confidence` are `NOT NULL` on State, Edge and Form, with a `CHECK` on the
  confidence enum. A record without evidence must be impossible to insert, not merely discouraged.
- Cross-table invariants use `FOREIGN KEY` and `CHECK` (an edge references existing states); app-only
  discipline is not enough.
- The Zod schema and the table must never diverge; Zod is the source of truth.

## Indexes
- Add an index only for a query in `specs/<feature>/contracts/mcp-tools.md` (for example
  `get_known_states` filtering on `portal_id` + `cluster_id`). Every extra index taxes writes on a
  single-writer file DB.

## Migrations
- Additive and reversible (`up` and `down`) over big rewrites; the schema is still volatile.
- One file per change under `data/migrations/`; nobody edits a live DB by hand.
- Keep denormalisation minimal until a measured read pattern needs it.

## Concurrency
- One writer per run is SQLite's sweet spot. If the orchestrator begins running concurrent jobs against
  one DB file, flag it before it shows up as `SQLITE_BUSY`; first try serialising writes through one
  process, and only then consider another engine (see `storage-engine-policy.md`).

## Operations
- Recommend `PRAGMA integrity_check` and occasional `VACUUM` where write patterns cause bloat.
- Once runs produce data worth keeping, back up with the SQLite online backup API or Litestream.
- Scale is not the trigger: SQLite handles millions of rows; revisit for concurrent writers or
  multi-machine access.
