# Tasks: spec 022 — Salvage Yard redesign with versioning (R-43 + R-44)

Model tags per task. Commit per group with the task ids. Each milestone ends with the fast
tiers green and an interim merge to master behind `UI_SALVAGE`.

## M1 — Foundation, shell, re-skin (interim merge 1)

### Group 1.1 Package and harness
- [x] T001 [haiku] Commit the package under `docs/design/salvage-yard/` (the whole package, plus the zip in `user_input/`)
- [x] T002 [sonnet] Install `.claude/skills/mudpuppy-salvage-ui/` (DS_PATH `apps/dashboard/src/pathfinder_dashboard/static/salvage`, DESIGN_PKG `docs/design/salvage-yard`); merge the package's AGENTS.md rules into `apps/dashboard/CLAUDE.md`; `frontend-dev` agent points at the new skill; `revamp-dashboard` Console references marked deprecated (no deletion)
- [x] T003 [sonnet] `find-old-styles.sh` as a dashboard test over `templates/salvage/`, `static/css/mp.css`, `static/js/shell.js` (0 hits; the app keeps its own copy of the script, the skill is not exported); baseline in `style-baseline.md`

### Group 1.2 Foundation behind the flag
- [x] T004 [sonnet] Copy `design-system/css` + `fonts` + tag icon to `static/salvage/`; `ui_flag.py` (`PATHFINDER_UI_SALVAGE`: `all` | page names) with tests
- [x] T005 [opus] `templates/salvage/base.html` and the render switch in `web/deps.py` (a page's `salvage/` twin when the flag covers it; one base per page, never both)
- [x] T006 [sonnet] `status_map.py` (one mapping; test over every stored run, frontier, decision and doc status), Salvage macros (`status`, `tag`, `note`, Console-compatible names); `when` is the UTC filter

### Group 1.3 Shell
- [x] T007 [opus] Header partial (wordmark `[MUD]PUPPY`, portal picker as a menu of links, search, assistant status fragment, Ask, ?) and side nav (seven sections from `nav.py`, Review count slot, data store in the nav footer); FE-N01, N03 tests
- [x] T008 [sonnet] Keyboard: Ctrl/⌘ K, Ctrl/⌘ J, Esc (`static/js/shell.js`), confirm dialogs. Redirects from old URLs move to M3/M4, when their new pages exist
- [x] T008a [sonnet] New Salvage-only pages the nav and header need: `/screens` (Screens list) and `/search` (screens, records, scans)
- [x] T009 [sonnet] Responsive shell (FE-N06) checked by `ui:check` at 1280 and 390

### Group 1.4 Re-skin every page (Track 1), one commit per page
- [x] T010 [sonnet] Overview → Home placeholder + "All portals" cards
- [x] T011 [sonnet] Run detail (all tabs) → Scans ▸ scan detail
- [x] T012 [sonnet] Docs (SRS sections, record pages, sessions)
- [x] T013 [sonnet] Portal settings (screen 11 environments, revoke dialog, Edit/Add prefill), new portal
- [x] T014 [sonnet] State detail → Screens ▸ screen detail (restyle only; redesign in M4)
- [x] T015 [sonnet] Activity, glossary, wiki, error and not-found pages. Chat and superseded amendments stay Console until M3 (Home) and M4 (Review) rebuild them
- [x] T016 [sonnet] `pnpm --dir apps/dashboard ui:check`: screenshots at 1280 and 390 (reduced motion), page scroll, one h1, ≤1 primary / intent, axe-core 0 serious/critical; all migrated pages pass

## M2 — Versioning backend, R-44 (interim merge 2)

- [x] T017 [opus] research: screen identity (route template + cluster) measured on the sandbox store → `research.md` R1
- [x] T018 [sonnet] (db-admin) migration 0015: `screens`, `states.screen_id/screen_rev` + backfill (no separate revisions table: the states are the revisions); data-model, Zod, db-types, dashboard models
- [x] T019 [opus] crawler `record-state`: new states get their screen and next revision number; which revision a scan saw comes from `state_observations`; tests (full `pnpm test` green apart from the F-06 timing flake)
- [x] T020 [sonnet] (db-admin) migration 0016: `amendment_revisions`, `needs_reanchor` replaces `superseded`; `amendmentOutcomes` (carry forward / re-anchor); chat `reanchor.ts` replaces `supersede.ts`; docs export; tests
- [x] T021 [opus] Revision write path in the chat service (`amendment-revisions.ts`): base-rev check (409 `STALE_REVISION` + latest), author = reviewer name, re-anchor in place, edit, restore, withdraw/dismiss as revisions, history route; tests
- [x] T022 [sonnet] Dashboard read models (`queries_revisions.py`): screen with revisions, revision strip on the screen page, revision tags on amendments; tests

## M3 — Chat first (interim merge 3)

- [ ] T023 [opus] Home (screen 01): assistant as main column, conversation picker, suggestions, scan line, Where this portal is, Needs you (D-17 rules), Processes summary
- [ ] T024 [opus] Drawer (screens 02–03): `aside.sy-drawer` on every page, This page / Whole yard, context tags per page type, the six states (empty, working, credential, applied, page changed, not running)
- [ ] T025 [opus] Chat service: message `context` payload; MCP chat tools `page_context`, `highlight_element`, `open_page`, `propose_change`; SSE events the drawer acts on; tests with the fake ACP agent
- [ ] T026 [sonnet] Proposals: stored as pending revisions; Apply → revision + Undo; stale proposal disabled; FE-A04 e2e
- [ ] T027 [sonnet] Credential request in chat with a vault field (FE-A05), value never echoed; DOM/log check
- [ ] T028 [sonnet] Chat down (FE-A06): drawer failure state with ERR reference; pages keep working

## M4 — Review, Scans, Settings, Screen detail (interim merge 4)

- [ ] T029 [sonnet] Review inbox (09): re-anchor, proposals, records to confirm, conflicts; counts; detail pane; nav count
- [ ] T030 [sonnet] Scans (10): live monitor (SSE, progressbar), history with what changed, Server activity tab, run detail tabs
- [ ] T031 [sonnet] Settings (11): environments table + form, Revoke dialog, credentials collapsed (FE-T02), personas, crawl rules, data store
- [ ] T032 [opus] Screen detail (08): revision strip, amendment pins and history, add amendment, re-anchor flow

## M5 — Processes workspace (interim merge 5)

- [ ] T033 [sonnet] (db-admin) migration: `ba_processes`, `process_variants`, `process_revisions`, `process_live`, `grouping_suggestions`, `change_spec_revisions`
- [ ] T034 [opus] Chat service: process write API (create from grouping, save variant revision, mark live, restore, dismiss suggestion) + MCP tools for the assistant to draft groupings
- [ ] T035 [opus] Processes list + groupings (04), "In no process", migration of saved process scopes (spec 010) into processes
- [ ] T036 [opus] To-be editing (05): variant switch, draft bar with autosave, step cards (add, remove, merge, annotate), inspector, Save as rN+1, Discard
- [ ] T037 [opus] Compare + change spec (06): step diff, generated editable spec sections, Export Markdown, Save to Docs
- [ ] T038 [sonnet] History + live per environment (07): timeline, revisions, Restore, Mark live, conflict notice + Rebase (FE-P05 two-session test)

## M6 — Clean-up and close-out

- [ ] T039 [sonnet] Remove Console CSS, JetBrains Mono, the old base and the flag; `find-old-styles.sh` = 0 over the app
- [ ] T040 [sonnet] Visual baselines from the app with fixture data (FE-Q11), compared with the package screenshots; axe on every screen; keyboard pass notes
- [ ] T041 [sonnet] how-to-use.md rewritten for the new IA; glossary entries (screen revision, variant, change spec, proposal, re-anchor, review inbox); glossary sync
- [ ] T042 [sonnet] Close-out: code-reviewer, roadmap R-43/R-44 rows, changelog, merge, tag, export-fork re-export (no dashboard there: check the leak list only)
