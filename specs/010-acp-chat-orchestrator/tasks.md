# Tasks: Guided Chat Orchestrator (R-30)

**Input**: `specs/010-acp-chat-orchestrator/` (spec, plan, research, data-model, contracts, quickstart)
**Format**: `- [ ] Txxx [model] [P?] [US?] description (path)`. `[P]` = can run in parallel (different files, no open dependency). Model tags: `[opus]` judgment and core design, `[sonnet]` mechanical. Commit per task group with the task ids.
**Gates before every commit**: `pnpm typecheck && pnpm lint && pnpm test` in `apps/crawler`, `apps/chat` and `packages/workflow`; `uv run ruff check && uv run pytest` in `apps/dashboard`. Do not edit with sed or Python scripts.
**Rule**: anything marked "to verify" in the plan is confirmed by T001 (ACP) or T011 (amendment matching) first; do not guess ACP APIs.
**Layout**: app `apps/chat`; shared package `packages/workflow`; pnpm workspaces per CLAUDE.md.

## Phase 1: Research and setup

- [x] T001 [opus] Research the ACP client library (TypeScript) and the Claude Code ACP adapter with Context7 docs: package names and versions, spawning the agent, session/prompt/update types, permission requests, how to select a named agent and pass a tool allowlist and MCP config. Write the confirmed facts into `research.md` (replace "to verify" in plan.md and contracts) and note the fallback decision for R2. Also confirm how `request_scan` runs the `crawler` and `ba` agents: as subagents of the orchestrator session, or as a separate ACP session started by the chat service (the latter is the fallback; it also lets T022 see their events). Blocks T012, T013, T016. (`specs/010-acp-chat-orchestrator/research.md`)
- [x] T002 [opus] Constitution reading: record in the plan and research that chat-service commands are covered by the `docs:review` precedent, "accepted, to be confirmed by testing"; add the confirming tests (the dashboard process opens the store read-only and every chat write goes through `apps/chat` with Zod) as part of T012/T030; if testing shows a gap, draft a MINOR amendment (2.1.0). Also record the reading of "no language manifest at the repo root" for the workspace wiring in T003. (`.specify/memory/constitution.md` only if amended)
- [x] T003 [sonnet] Workspace wiring for the new layout (governor agent): add one root `pnpm-workspace.yaml` covering `apps/*` and `packages/*` (user-approved 2026-10-05; workspace config only, no root `package.json` dependencies) so `apps/chat` (own app) and `packages/workflow` (shared) reuse `core`, `vault` and `docs` from the `apps/crawler` workspace; make `pnpm install`, typecheck, lint and test work for both; update CLAUDE.md or `docs/` only if the wiring needs a rule. (`pnpm-workspace` config, `apps/chat/package.json`, `packages/workflow/package.json`)
- [x] T004 [sonnet] [P] Scaffold `apps/chat` and `packages/workflow` (tsconfig strict, eslint, vitest, src and tests folders, README). Depends T003.
- [x] T005 [sonnet] [P] Copy `user_input/raw_idea/acp_chat_and_easy_interface/mudpuppy-comic (1).gif` to the dashboard static images with a clean file name; add `data/logs/` to `.gitignore`. (`apps/dashboard/src/pathfinder_dashboard/static/brand/mudpuppy-working.gif`)

## Phase 2: Foundational (blocks all stories)

- [x] T006 [sonnet] Migration for `chat_conversations`, `chat_messages`, `workflow_steps`, `process_scopes`, `amendments` (including status, anchor, superseded_by_run, superseded_reason, superseded_at, dismissed_at, reapplied_as, reapplies) plus Zod schemas, per `data-model.md` and the `sqlite-conventions` skill. Picked up by the `db-admin` agent. (`data/migrations/`, `apps/crawler/packages/core`)
- [x] T007 [sonnet] Regenerate `data/schema/schema.sql` and `README.md`; add the new tables to the portal-data partition so `portal:delete` and `portal:export` handle them; extend `data/README.md`. Picked up by `db-admin`. (depends T006)
- [x] T008 [sonnet] [P] Dashboard read models for the five tables and the schema-drift test. (depends T006) (`apps/dashboard`)
- [x] T009 [sonnet] [P] [US5] Error log module: `ERR-<ULID>` ids, one JSON line per error in `data/logs/chat/YYYY-MM-DD.jsonl`, redaction of secrets, 30-day sweep on start, lookup by ref; tests including fake credentials never appearing and a non-writable folder (flag "not logged"). (`apps/chat/src/error-log.ts`) Depends T004.
- [x] T010 [opus] [P] `packages/workflow`: pure function from recorded data (runs, states, sessions, records, scopes) to step statuses and valid next moves with "what is missing"; Vitest fixtures for no scan, scanned, mapped, scoped, failed. Depends T004.
- [x] T011 [opus] [P] [US6] `packages/workflow` `amendmentImpact`: pure function (amendments + observed states and elements of a fresh run) returning which amendments become superseded with reason; rules per `data-model.md`. First confirm against real recorded layout and wireframe data how a state's route template, fingerprint and an element's role and accessible name are read, then fix the exact matching and write it into `research.md`. Fixtures: state replaced, element renamed, element removed, state untouched, state not observed in a partial run. Depends T004.
- [x] T012 [opus] ACP client: start the agent process, create session, send prompts, map session updates to chat events (message chunks, tool calls, plan, errors), handle agent crash and timeout with error refs; tests against a fake ACP agent. Depends T001, T004. (`apps/chat/src/acp-client.ts`)
- [x] T013 [opus] Fence: permission handler that denies every tool or path outside the allowlist, plus a test list of at least 10 harness-change requests (edit agent, skill, rule file, code, config, gate bypass) that must be refused with no file changed. Depends T001, T004. (`apps/chat/src/fence.ts`)
- [x] T014 [sonnet] Chat service HTTP and SSE API per `contracts/chat-http-api.md`: conversations, messages persisted, event replay with `Last-Event-ID`, `healthz`; include the T002 confirming test that the dashboard writes nothing itself. Depends T006, T009, T012. (`apps/chat/src/api.ts`)

**Checkpoint**: service starts, talks to a fake ACP agent, persists and replays events.

## Phase 3: US1 - Ask what I can do and scan a portal (P1)

- [x] T015 [opus] [US1] `pathfinder-chat` MCP server with `workflow_state`, `save_persona` (Zod, refuses inline secrets, and a persona can only narrow the safety ceiling, never widen it) and `request_scan` (checks URL, persona, credential reference; hands off to the `crawler` per T001; passes gate refusals through). Depends T010, T013. (`apps/chat/src/mcp-chat.ts`)
- [x] T016 [opus] [US1] Orchestrator agent per `contracts/orchestrator-tools.md` (follow the `subagent-authoring` skill; plain-language voice; explains functions; never offers harness changes). Built as `apps/chat/agents/orchestrator.md`, the system prompt `apps/chat/src/session-config.ts` loads (not a Claude Code subagent); its MCP servers are set per chat session there, not in `.mcp.json`. Depends T001, T015.
- [x] T017 [sonnet] [P] [US1] `create-persona` skill: guides persona creation from questions, calls `save_persona`. (`.claude/skills/create-persona/`)
- [x] T018 [sonnet] [P] [US1] Credentials endpoint: stores through the R-26 vault, returns only `stored: true`; test that the value is absent from messages, logs and events. Depends T014. (`apps/chat`)
- [x] T019 [sonnet] [US1] Dashboard Chat page: window, message form, SSE proxy to the chat service, animation shown while a step is in progress, Console style per the `revamp-dashboard` skill. Depends T005, T008, T014. (`apps/dashboard`)
- [x] T020 [sonnet] [US1] Credentials form on the Chat page (posts server-side to the chat service, never through the chat input). Depends T018, T019.
- [x] T021 [opus] [US1] Scripted end-to-end test with a stub ACP agent: empty workspace, "what can I do", missing inputs asked one by one, scan requested only when complete. Depends T015, T019.

**Checkpoint**: US1 works with the stub agent; real-agent check happens in T038.

## Phase 4: US2 - Step tracker and next steps (P1)

- [x] T022 [opus] [US2] Step recorder: update `workflow_steps` from run, session and tool events, resume after reload or service restart, reconcile with recorded state via `@pathfinder/workflow`. Depends T010, T014.
- [x] T023 [sonnet] [US2] Tracker component and live fragment (to do, pending, in progress, done, failed) beside the chat; refreshes within 2 s. Depends T019, T022.
- [x] T024 [sonnet] [US2] Next-step proposals: opening message for a scanned portal (continue, map processes, documentation) from `workflow_state`; refusal text for invalid steps. Depends T015, T016.
- [x] T025 [sonnet] [US5] Error display: message plus `ERR-` id in chat and tracker, developer lookup view or endpoint, integration test that forces a failure (unreachable URL) and finds exactly one log line. Depends T009, T023.

**Checkpoint**: SC-003 and SC-004 testable.

## Phase 5: US3 - Narrow to one process and document as-is (P2)

- [x] T026 [opus] [US3] Tools `list_process_candidates`, `set_process_scope`, `request_documentation`; candidates come from Layer B processes and the state graph; BA agent invoked with the scope. Depends T015.
- [x] T027 [sonnet] [US3] State checklist view: mapped states with their screens, start and end pickers, per-selection comments, save scope through the chat service. Depends T019, T026.
- [x] T028 [opus] [US3] Scoped documentation: BA instructions/skill update and export filter so records cite only in-scope evidence; test on the reference portal (SC-005, 100% in scope). Depends T026.

## Phase 6: US4 - Fence acceptance (P2)

- [x] T029 [opus] [US4] Acceptance tests across the whole path: 10/10 harness-change requests refused with `git status` clean, gate refusals (production write, missing compliance) passed through unchanged. Depends T013, T015, T016. (Since constitution 4.0.0, spec 011, production may write up to its limit and the compliance gate is gone; the pass-through test now uses a refusal that remains: an action above the run's limit.)

## Phase 7: US6 - Amendments and fresh runs (P3)

- [x] T030 [sonnet] [US6] Amendment commands in the chat service (note, element reference with anchor fingerprint, route template and element role/name, attachment to evidence store by sha256, withdraw), validation of targets. Depends T014.
- [x] T031 [sonnet] [US6] Dashboard UI to add and list amendments on state, evidence and wireframe pages. Depends T019, T030.
- [x] T032 [opus] [US6] Post-run hook: when a BA-started run finishes, run `amendmentImpact` over the portal's active amendments and the run's observed states and elements, set `superseded` with reason, run and time in one transaction, and tell the BA in chat which amendments were affected (chat never starts a fresh run itself). Depends T011, T030, T022.
- [x] T033 [sonnet] [US6] Reapply and dismiss commands (`reapply` creates a new active amendment on a chosen current target linked by `reapplied_as`/`reapplies`; `dismiss`); dashboard "Superseded amendments" view listing text, target, reason, run and time with the two actions. Depends T031, T032.
- [x] T034 [opus] [US6] `docs:export`: separate to-be chapter with active amendments only; `appendix-superseded-amendments.md` and a `records.json` section for superseded and dismissed ones with status; test that as-is chapters are byte-identical with and without amendments (SC-007); scripted portal-change test for SC-008. Depends T030, T032.

## Phase 8: Polish and close-out

- [x] T035 [sonnet] Glossary entries (chat, orchestrator, workflow step, error reference, amendment, superseded amendment, process scope), sync with `uv run pathfinder-glossary --write`; update READMEs and `docs/` for starting the chat service and dashboard.
- [x] T036 [sonnet] Dashboard smoke test covers the new pages; run the full gates in all apps and packages; stop anything on ports 4200/4201 first.
- [x] T037 [sonnet] Document and test the T002 reading: store opened read-only by the dashboard, all chat writes via `apps/chat`; record the result in the plan's Constitution Check ("confirmed" or "gap: amendment drafted").
- [x] T038 [opus] Real-agent run of `quickstart.md` (needs T001 setup); log every bug or slip in `specs/010-acp-chat-orchestrator/findings.md` with test or eval ideas; token-cost problems go to R-24. Done for steps 1, 2, 4–6, 8 and stop/reset/resume/feed/map (F-10, F-13, F-17–F-22; spec 011 findings 2026-10-07); steps 3 (persona in conversation: current flow good enough), 7, 9–10 moved to roadmap R-32 because a full pass is costly (user, 2026-10-07).
- [x] T039 [sonnet] Run `speckit-analyze`, tick validation checkboxes, update roadmap and spec, then user sign-off and `po` close-out (changelog before merge). Signed off by the user 2026-10-07; squash-merged with R-31 (tag v1.0.10).

## Phase 9: Review follow-ups (user answers, 2026-10-06)

- [x] T040 [opus] Run ownership (F-14): migration 0009 adds `runs.owner_id` and `runs.owner_pid`; a pathfinder server claims the runs it starts or resumes, interrupts on start only runs whose owner process is gone, and on shutdown only its own; test with two servers on one store.
- [x] T041 [opus] Stop and resume a scan (F-13): `POST /runs/<id>/stop` in the chat service marks a running run `interrupted`; `stop_scan` tool for the orchestrator; "Stop scan" button in the tracker; `request_scan` takes `resume_run_id`; the step recorder follows the linked run, so a resumed run is tracked.
- [x] T042 [opus] Crawler stops early in the chat (F-13): "drain the frontier, the server decides what is a duplicate" goes into `.claude/agents/crawler.md` and the `request_scan` hand-off; R-24 entry P5 with the measured cost.
- [x] T043 [sonnet] Roadmap concerns: listing-page supersede rule (research R8b) and enforcing the "no harness edits" rule for subagents (F-07), both "later / nice to have".
- [x] T044 [sonnet] CLAUDE.md (root `pnpm install`, starting the chat service) and a BA how-to guide `docs/how-to-use.md` with screenshots.

- [x] T045 [opus] Found in the live check of T044 (F-17, F-19): background subagent launches are not the subagent's end (step recorder), a 10-minute start timeout, a new paragraph after tool calls, a truthful failure detail in `workflow_state`.

## Phase 10: BA review 2026-10-06 evening (F-22 items 1–3; item 4 is R-31)

- [x] T046 [opus] A dead run is never shown as live (F-22 4c): when the crawler subagent ends while its run is still `running`, the step recorder marks the run `interrupted` (same path as Stop scan) instead of only logging it; a turn with no update for 5 minutes shows "No activity for 5 min" with [stop] (F-22 4d). Tests with the fake agent.
- [x] T047 [opus] Progress data, read from the store so it survives a reload: per conversation, the phase (current step), counters (states found, frontier left, steps used / max, elapsed, last activity) and an activity feed (state visited, form found, action skipped with reason, network or navigation problem, open question), newest first, since a cursor. Dashboard query (read-only) plus a fragment endpoint. Tests on a recorded run.
- [x] T048 [sonnet] Chat UI for T047: counters line and activity feed under the working animation, polled with htmx while a turn or a run is active; the working indicator follows "turn active OR run running" (turn state from the chat service), so leaving and coming back shows the work still going. Depends T047.
- [x] T049 [sonnet] Live map in the chat side panel: the run's state graph (reuse `diagrams.py`), refreshed every few seconds while the run is running, new states and transitions highlighted, links to the state pages. Depends T047. Built as `live_map.py` (only the escaping helpers of `diagrams.py`, which is a golden-tested twin of the TS exporter): the discovery tree (the move that first reached each page; all moves were a hairball), left to right, natural size in a scroll box; pages seen in the last minute and the current page highlighted; the poll answers 204 while unchanged. No node links: Mermaid runs with `securityLevel: strict`; the activity feed links the pages.
- [x] T050 [opus] [stop] next to [send]: `POST /conversations/<id>/cancel` in the chat service cancels the assistant's turn and stops the conversation's running runs (T041 path); a system line in the history says what was stopped. Tests.
- [x] T051 [opus] [reset assistant]: `POST /conversations/<id>/reset` closes the ACP session and opens a fresh one; the first prompt of every new session carries the conversation's portal, the step summary and pending notices (also fixes F-18 and F-19). History stays visible with a "assistant context reset" line. Tests.
- [x] T052 [sonnet] Docs and glossary for T046–T051 (`docs/how-to-use.md` screenshots, glossary entries for activity feed, live map, reset assistant), findings updated; full gates.

## Dependencies and order

T001 and T002 first; T003 then T004; T005 beside them. Phase 2 blocks everything (T010 and T011 can start right after T004). US1 and US2 form the MVP; US3 after US2; US4 tests can start once T015/T016 exist; US6 after T014 and can run beside US3 (T032 needs T022 and T011). Opus tasks: T001, T002, T010, T011, T012, T013, T015, T016, T021, T022, T026, T028, T029, T032, T034, T038 (16). Sonnet: 23 (T003 is the governor task). Total 39.
