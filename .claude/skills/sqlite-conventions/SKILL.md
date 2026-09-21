---
name: sqlite-conventions
description: Pathfinder's SQLite conventions and storage-engine policy — PRAGMAs, STRICT tables, ids, timestamps, JSON fields, index rules, migration hygiene, and when a second store (Postgres, vector DB, FTS) is justified. Use when writing or reviewing a migration or schema, choosing an index, or answering "SQLite or something else?" for embeddings, search or concurrency.
---

# SQLite conventions

SQLite plus content-addressed filesystem evidence covers Pathfinder today: one writer per run, read-heavy
afterwards. These files hold the project-specific rules; the constitution
(`.specify/memory/constitution.md`) stays the authority when they conflict.

Read only the file that matches your task:

- Writing or reviewing a migration, table, column or index → `references/house-rules.md`
- Anyone proposing Postgres, a vector DB, full-text search, or concurrent writers →
  `references/storage-engine-policy.md`

Every schema change ships as: a reversible migration in `data/migrations/`, a regenerated
`data/schema/` snapshot, and matching updates to the owning `specs/<feature>/data-model.md` and
`contracts/`. A change missing any of the three is unfinished.
