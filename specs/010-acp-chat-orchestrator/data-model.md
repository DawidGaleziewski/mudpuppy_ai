# Data Model: Guided Chat Orchestrator

Follows the `sqlite-conventions` skill (STRICT tables, text ids, ISO timestamps, JSON text fields). Migration: `data/migrations/0008_chat_orchestrator.{up,down}.sql` (snapshot in `data/schema/schema.sql`; Zod in `apps/crawler/packages/core/src/schemas/{chat-conversation,workflow-step,process-scope,amendment}.ts`, Zod wins on divergence). The portal column is named `portal_id`, as in every other table. These tables are not Layer B evidence records, so the Principle II rule (`evidence_ref` and `confidence` NOT NULL with a CHECK on the enum) does not apply; integrity here is enum CHECKs, JSON validity CHECKs and the amendment status CHECKs. All five carry `portal_id` (`chat_messages` joins via its conversation) and are in the portal-data partition (`portal:export`, `portal:delete`). All writes come from `@pathfinder/chat` through Zod schemas; the dashboard reads read-only and needs one read model per table (drift test).

## chat_conversations

id (UUIDv7), portal_id (nullable until chosen), goal (text), acp_session_id (nullable), persona_draft (JSON, no secrets), status (`active|closed`), created_at, updated_at.

## chat_messages

id, conversation_id, seq, role (`user|assistant|system|tool`), content (text), tool_name (nullable), error_ref (nullable), created_at. Credentials are never stored here (form path bypasses chat).

## workflow_steps

id, conversation_id, portal_id, step (`scan|map|narrow|document|amend`), status (`todo|pending|in_progress|done|failed|stopped`; `stopped` added by migration 0010, spec 011 F-04), run_id / session_id (nullable links), error_ref (nullable), started_at, finished_at, updated_at. State transitions: todo -> pending -> in_progress -> done|failed|stopped; failed|stopped -> pending on retry or resume. `stopped` = the BA stopped the run on purpose ([stop], [stop scan]); no error reference.

## process_scopes

id, conversation_id, portal_id, process_name, persona, start_state_id, end_state_id, selected_state_ids (JSON), comments (JSON: state_id -> text), source (`agent_proposal|ba_description`), created_at.

## amendments

id (UUIDv7), key (`AMD-nnn`, `UNIQUE(portal_id, key)`; this is the human-facing amendment id, as `doc_records.key`; `reapplied_as`/`reapplies` hold row ids), portal_id, scope_id (nullable), target_kind (`state|evidence|wireframe_element`), target_id, kind (`note|element_ref|attachment`), text (nullable), attachment_sha256 (nullable), attachment_name (nullable), author, created_at, withdrawn_at (nullable). Never joined into Layer B records; export renders them in their own chapter.

Added fields (fresh-run behaviour): `status` (`active|superseded|dismissed|withdrawn`, default `active`; replaces the `withdrawn_at`-only model, keep `withdrawn_at` as the time), `anchor_fingerprint` (fingerprint of the state when written), `anchor_route_template`, `anchor_element` (JSON: role, accessible name, wireframe element id; nullable), `superseded_by_run` (run id, nullable), `superseded_reason` (`state_replaced|element_changed|element_removed`, nullable) plus `superseded_detail` (short text), `superseded_at`, `dismissed_at`, `reapplied_as` (amendment id of the new active copy, nullable), `reapplies` (original id for the copy, nullable). Transitions: `active -> superseded` (set by code after a BA-started run); `superseded -> dismissed`; `superseded -> reapplied` (original keeps `superseded`, `reapplied_as` filled, new row `active`); `active -> withdrawn`. Superseded rows are never deleted.

`anchor_element` JSON: `{ key, role, name, roleIndex }` (key = element key = wireframe shape id; roleIndex = position among same-role elements). Final matching rule: research.md R8b (confirmed in T011); summary below.

Change rule (pure function `amendmentImpact` in `packages/workflow`): for each active amendment, take the run's observed states. No state with the amendment's route template: unchanged (active). Same route template observed but no state with `anchor_fingerprint`: `state_replaced`. State still observed and `anchor_element` set: element missing, or role or accessible name differs: `element_changed`/`element_removed`. Otherwise active.

## runs: owner columns (migration 0009, F-14, T040)

`owner_id` (UUIDv7 of the pathfinder server instance, new on every server start) and `owner_pid` (its process id), both NULL for runs recorded before 0009. `start_run` writes them on a new run and on a resume (the resuming server takes the run over). On start a server interrupts only `running` runs that are orphaned: no owner, an owner process that is gone, or an earlier instance under its own pid. On shutdown it interrupts only its own. Known limit: a pid reused by an unrelated process after a reboot keeps an orphaned run `running` until the BA stops it ("Stop scan").

## Error reference (file, not a table)

JSON line in `data/logs/chat/YYYY-MM-DD.jsonl`: `ref`, `time`, `conversation_id`, `step`, `where`, `message`, `detail` (redacted). Retention 30 days.

## Indexes

chat_messages(conversation_id, seq); workflow_steps(conversation_id, step); amendments(portal_id, target_kind, target_id); amendments(portal_id, status). Implemented as `UNIQUE(conversation_id, seq)` on chat_messages (the unique key is the index) and plain indexes for the rest; the only other implicit index is `UNIQUE(portal_id, key)` on amendments, needed to allocate `AMD-nnn`. Status CHECKs: `superseded` requires `superseded_at` and `superseded_reason`, `dismissed` requires `dismissed_at`, `withdrawn` requires `withdrawn_at`; a `note` requires `text`, an `attachment` requires `attachment_sha256` and `attachment_name`.
