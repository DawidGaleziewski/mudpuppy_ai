# Contract: Operator Scripts for Portal Data (FR-028)

Run from `apps/crawler/` with pnpm, like `audit:pii` and `stability`. Not MCP tools: the crawler
agent cannot export or delete.

## `pnpm portal:export <portal> [--env <env>] [--out <dir>]`

- `--env` defaults to `production` (the DB file `data/db/<env>.sqlite`).
- Writes `<out>` (default `data/exports/<portal>-<env>-<YYYYMMDDTHHMMSSZ>/`):
  - `manifest.json`: portal id, environment, export time, row counts per table, evidence file
    count, schema version (latest `schema_migrations` entry).
  - `<table>.ndjson` for every table in the partition map ([data-model.md](../data-model.md)).
  - `evidence/<sha256>.<ext>` for every file those rows reference.
- Read-only on the DB. Writes a `portal_data_log` row with `action = export`; the operator name
  is taken from `--operator` if given, else the OS user name.
- Exit 0 on success; 1 if the portal has no runs in that environment (nothing is written).

## `pnpm portal:delete <portal> --env <env> --operator "<name>" --yes`

- `--env`, `--operator` and `--yes` are required; without `--yes` it prints what would be deleted
  (row counts, evidence files to remove, evidence files kept because another portal uses them)
  and exits 0 without changing anything.
- Refuses (exit 1) while any run of that portal has `status = running`.
- Deletes in one transaction in the order from [data-model.md](../data-model.md), then removes the
  evidence files no remaining row references.
- Writes a `portal_data_log` row with `action = delete` and the counts; that row is kept.
- Does not touch `portals/<portal>/` or `personas/<portal>/`: configuration is in git and is
  removed, if at all, by a normal commit.
