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
  **Credentials** (since spec 009, `0007_credentials`): the `credentials` table holds encrypted
  test-user credentials per portal and environment (AES-256-GCM ciphertext, nonce, key id). It is
  written only by the vault (`@pathfinder/vault`), never exported (`portal:export`), never shown in
  the dashboard and not removed by `portal:delete`. Values are never stored or logged in plaintext.
  **Chat orchestrator** (since spec 010, `0008_chat_orchestrator`): `chat_conversations`,
  `chat_messages`, `workflow_steps`, `process_scopes` and `amendments`. Written only by
  `@pathfinder/chat`, read-only for the dashboard. They are not Layer A or B and not evidence
  records (no `evidence_ref`/`confidence`); amendments are never joined into Layer B records. All
  carry `portal_id` (`chat_messages` via its conversation), so `portal:export` and `portal:delete`
  include them. Chat error logs are files in `logs/chat/` (JSONL, 30-day retention), not tables.
  Shapes: `specs/010-acp-chat-orchestrator/data-model.md`.
  **Screens and amendment revisions** (since spec 022, `0015_screens`, `0016_amendment_revisions`): `screens`
  (one per portal, route template and cluster; each `states` row is an observed revision of its screen via
  `screen_id` + `screen_rev`), `amendment_revisions` (append-only history of an amendment; `amendments` keeps the
  head, `rev` and `screen_id`; status `superseded` became `needs_reanchor`). Shapes:
  `specs/022-salvage-redesign/data-model.md`.
  **Chat proposals** (since spec 022, `0017_chat_proposals`): `chat_proposals` — changes the chat assistant
  proposes and a person applies or discards; written only by `@pathfinder/chat`, read-only for the dashboard,
  in the portal export/delete partition.
  **BA processes** (since spec 022, `0018_ba_processes`): `ba_processes`, `ba_process_revisions`, `process_variants`,
  `process_variant_revisions`, `process_drafts`, `process_live`, `grouping_suggestions`, `change_spec_revisions` —
  the BA's cut of the portal, written only by `@pathfinder/chat`; `process_scopes` were migrated in. In the
  portal export/delete partition.
- `evidence/` — content-addressed (`sha256`) evidence blobs: ARIA snapshots, robots.txt
  policies and trace payloads too large for their column, referenced by `evidence_ref` columns;
  since spec 008 also state screenshots (`.png`, unmasked), layouts (`.json`: element keys and
  boxes) and derived wireframes (`.svg`, `.excalidraw`), referenced by `states.screenshot_ref`,
  `states.layout_ref` and `state_wireframes`.
  Network call shapes are stored in `network_calls` columns, not here. Generated, not source
  (git-ignored).
- `exports/` — operator exports (git-ignored): `portal:export` copies everything one portal
  gathered; `docs:export` writes a portal's SRS (`<portal>-<env>-srs/`: Markdown chapters,
  Mermaid diagrams, traceability matrix, `records.json`, replaced on each run); `docs:evaluate
  --out` writes a ground-truth evaluation report (JSON + Markdown).
- `gates/` — `report.json`, written by every `pnpm test` run in `apps/crawler` (spec 009): one
  result per quality gate, plus the catalogue entries that have no gate. Generated, not source
  (git-ignored).
- `evals/<portal>/` — tier-2 eval results (spec 009, `pnpm eval`): one `<timestamp>.json` per
  run, `baseline.json` (the result new runs are compared with), `history/` (older baselines) and
  `tolerances.json` (allowed score drops). Committed, so regressions show in review. Baselines
  since 2026-10-08 (spec 014): `reference-insurer` (guest), `proving-ground-shop` (guest),
  `proving-ground-bank` (client, run with `--session-timeout 20`), `proving-ground-insurer`
  (client); verdicts in `specs/014-eval-baselines/criteria.md`.
- `traces/` — raw per-call Playwright trace zips at `traces/<portal>/<run_id>/<seq>-<tool>.zip`,
  referenced by `trace_spans.pw_trace_path`; unlike `evidence/` these are not content-addressed and
  are never scrubbed, so viewing them is local-only (`npx playwright show-trace <path>`, never
  served by the dashboard). Generated, not source (git-ignored).

See `.specify/memory/constitution.md` (Technical Constraints, Principle II, Principle VII) for
the rules this layout enforces, and the active feature's `specs/<feature>/data-model.md` /
`specs/<feature>/contracts/` for the entities currently backed by this schema.
