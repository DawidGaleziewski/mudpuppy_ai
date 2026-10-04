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
  Each store holds two layers. **Layer A** is what the crawler recorded (runs, states, edges,
  actions, forms, network call shapes, frontier, decisions, crawler questions, trace spans, and
  for trace runs `processes` + `process_steps`). **Layer B** is the BA agent's documentation,
  written only through the `pathfinder-ba` MCP tools and the `docs:review` command:
  `analysis_sessions` (+ `analysis_session_runs`), `doc_records` (one per keyed record such as
  `REQ-007`), `doc_revisions` (immutable content, confidence, status), `doc_evidence_links`
  (each revision → Layer A rows and runs), `doc_relations`, `doc_reviews` and `followup_tasks`.
  Shapes: `specs/004-ba-documentation/data-model.md`.
- `evidence/` — content-addressed (`sha256`) evidence blobs: ARIA snapshots, robots.txt
  policies and trace payloads too large for their column, referenced by `evidence_ref` columns.
  Network call shapes are stored in `network_calls` columns, not here. Generated, not source
  (git-ignored).
- `exports/` — operator exports (git-ignored): `portal:export` copies everything one portal
  gathered; `docs:export` writes a portal's SRS (`<portal>-<env>-srs/`: Markdown chapters,
  Mermaid diagrams, traceability matrix, `records.json`, replaced on each run); `docs:evaluate
  --out` writes a ground-truth evaluation report (JSON + Markdown).
- `traces/` — raw per-call Playwright trace zips at `traces/<portal>/<run_id>/<seq>-<tool>.zip`,
  referenced by `trace_spans.pw_trace_path`; unlike `evidence/` these are not content-addressed and
  are never scrubbed, so viewing them is local-only (`npx playwright show-trace <path>`, never
  served by the dashboard). Generated, not source (git-ignored).

See `.specify/memory/constitution.md` (Technical Constraints, Principle II, Principle VII) for
the rules this layout enforces, and the active feature's `specs/<feature>/data-model.md` /
`specs/<feature>/contracts/` for the entities currently backed by this schema.
