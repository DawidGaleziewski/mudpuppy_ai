# /data

All data-related files for Pathfinder AI live here. Owned by the `db-admin` subagent
(`.claude/agents/db-admin.md`) — route schema, migration and storage-layout changes through it
rather than editing this folder ad hoc.

- `migrations/` — versioned, ordered, reversible SQLite migrations (source of truth for the
  DB's shape; tracked in git).
- `schema/` — a canonical, always-current snapshot of the schema (e.g. DBML or a generated
  ERD/markdown doc), regenerated with every migration (tracked in git).
- `db/` — actual SQLite database files, one per environment/run context. Generated artifacts,
  not source (git-ignored).
- `evidence/` — content-addressed (`sha256`) evidence blobs: ARIA snapshots,
  network shape records referenced by `evidence_ref` columns. Generated, not source
  (git-ignored).

See `.specify/memory/constitution.md` (Technical Constraints, Principle II, Principle VII) for
the rules this layout enforces, and the active feature's `specs/<feature>/data-model.md` /
`specs/<feature>/contracts/` for the entities currently backed by this schema.
