# ADR-0005: SQLite store with content-addressed evidence files

- **Status:** Accepted
- **Date:** 2026-09-20 (constitution 1.1.0, Technical Constraints ▸ Storage)

## Context

MudPuppy runs locally. A crawl has one writer per run and is read heavily afterwards (BA agent,
dashboard, export). Evidence (ARIA snapshots, screenshots, network shapes, traces) is large and
binary; records about it are relational.

## Decision

- **SQLite** through `better-sqlite3` with Kysely (`@mudpuppy/store`), one database file per
  environment under `data/db/<environment>.sqlite`, WAL mode, `foreign_keys=ON`,
  `busy_timeout` set by the connection.
- **Evidence on the filesystem** under content-addressed names (`<sha256>.<ext>` in
  `data/evidence/`), referenced from SQLite by that name.
- **Reversible migrations**: `data/migrations/NNNN_name.up.sql` + `.down.sql`, each applied in one
  transaction; `data/schema/schema.sql` is a generated snapshot, never edited by hand.
- **House rules** (skill `sqlite-conventions`): server-generated UUIDv7 text ids, ISO 8601 UTC
  timestamps with milliseconds, JSON in `TEXT` guarded by `json_valid`, CHECK-constrained enums,
  `STRICT` tables so SQLite enforces the types the Zod schema promises. Human keys (`REQ-017`,
  `H-0001`) sit beside ids where people cite them.
- **Zod is the single source of truth** for agent output, MCP inputs and DB writes. A new table
  or column goes through the `db-admin` agent: Zod schema, reversible migration, regenerated
  snapshot, and a dashboard read model checked by a drift test (G-16).
- Postgres or a graph DB needs a documented justification; the storage-engine policy names the
  first choices for later needs (`sqlite-vec` for embeddings, FTS5 for search, serialising writes
  through one process before considering Postgres).

## Consequences

- Good: no server to run; WAL readers never block the writer, so the dashboard can read a live
  crawl through a read-only connection ([ADR-0007](0007-read-only-dashboard-writes-through-typescript.md)).
- Good: the schema is checked from both languages (Zod on write; Python read models against the
  migrations).
- Bad: the design assumes one writer; several processes writing one store would need a change.
- Bad: early Layer B tables used polymorphic targets without foreign keys (resolved by the writing
  tool and re-checked by `docs:audit`); 2.0 replaced them with `entity_refs`.

## Alternatives considered

- Postgres or a graph DB: allowed only with a documented justification. For Layer B a graph DB was
  rejected because recursive CTEs suffice at this scale (spec 004 research §3).
- One table per record kind: rejected (a migration each time the BA template grows; duplicated
  revision logic).
- Markdown files as the truth: rejected by the user (spec 004, D2).

## Sources

- `.specify/memory/constitution.md` Technical Constraints ▸ Storage, Schemas, Agent interface
- `specs/001-crawler-map-mode/plan.md` (Storage), `research.md` §9 (content-addressed evidence)
- `data/schema/README.md` (Conventions)
- `.claude/skills/sqlite-conventions/SKILL.md`, `references/house-rules.md`,
  `references/storage-engine-policy.md`
- `specs/004-ba-documentation/research.md` §3–§4
- `specs/039-mudpuppy-2-portal-model/spec.md` D-2, `design.md` §17
- `docs/code-guidelines.md` G-16; `CHANGELOG.md` R-04 (reversible migration 0001)
