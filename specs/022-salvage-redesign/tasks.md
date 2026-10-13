# Tasks: spec 022 — Salvage Yard redesign with versioning (R-43 + R-44)

Model tags per task. Commit per group with the task ids. Each milestone ends with the fast
tiers green and an interim merge to master behind `UI_SALVAGE`.

## M1 — Foundation, shell, re-skin (interim merge 1)

### Group 1.1 Package and harness
- [ ] T001 [haiku] Commit the package under `docs/design/salvage-yard/` (without the duplicate `skill/` folder's references; keep `screens/`, `docs/`, `migration/`, `design-system/`, `brand/`, `wireframes/`, `screenshots/`)
- [ ] T002 [sonnet] Install `.claude/skills/mudpuppy-salvage-ui/` (DS_PATH `apps/dashboard/src/pathfinder_dashboard/static/salvage`, DESIGN_PKG `docs/design/salvage-yard`); merge the package's AGENTS.md rules into `apps/dashboard/CLAUDE.md`; `frontend-dev` agent points at the new skill; `revamp-dashboard` Console references marked deprecated (no deletion)
- [ ] T003 [sonnet] `find-old-styles.sh` as a dashboard test over `templates/salvage/` and `static/salvage/` (0 hits); baseline count over the old templates recorded in `specs/022-*/style-baseline.md`

### Group 1.2 Foundation behind the flag
- [ ] T004 [sonnet] Copy `design-system/css` + `fonts` + tag icon to `static/salvage/`; `ui_flag.py` (`PATHFINDER_UI_SALVAGE`: `all` | route names) with tests
- [ ] T005 [opus] `templates/salvage/base.html` (skeleton from `screens/*.html`: CSS order, `body.sy-ground`, skip link, `.sy-app`) and the render switch in `web/deps.py` (one base per page, never both)
- [ ] T006 [sonnet] `status_map.py` from `status-map.csv` (+ unit test over every backend status), Jinja `status`, `tag`, `note`, `utc` macros/filters

### Group 1.3 Shell
- [ ] T007 [opus] Header partial (wordmark `[MUD]PUPPY`, portal picker with explicit switch, search, assistant status, Ask, ?) and side nav (seven sections, Review count, data store in the nav footer); FE-N01–N04 tests
- [ ] T008 [sonnet] Keyboard: Ctrl/⌘ K, Ctrl/⌘ J, Esc (`static/salvage/js/shell.js`); redirects from old URLs (`/chat`, `/amendments/superseded`, `/activity`, …) to the section routes; FE-N05 test
- [ ] T009 [sonnet] Responsive shell (FE-N06) checked with screenshots at 1280/1023/390

### Group 1.4 Re-skin every page (Track 1), one commit per page
- [ ] T010 [sonnet] Overview → Home placeholder + "All portals" cards
- [ ] T011 [sonnet] Run detail (all tabs) → Scans ▸ scan detail
- [ ] T012 [sonnet] Docs (SRS sections, record pages)
- [ ] T013 [sonnet] Portal settings, new portal → Settings
- [ ] T014 [sonnet] State detail → Screens ▸ screen detail (restyle only; redesign in M4)
- [ ] T015 [sonnet] Activity, glossary, wiki, error and not-found pages
- [ ] T016 [sonnet] Screenshots (Playwright, reduced motion) at 1280 and 390 of every re-skinned page into `specs/022-*/screens/`; axe-core 0 serious/critical (vendored axe, a pytest-run script)

## M2 — Versioning backend, R-44 (interim merge 2)

- [ ] T017 [opus] research: screen identity (route template + cluster) against the reference and proving-ground stores; how many states collapse into how many screens; edge cases (route moved, cluster split) → `research.md`
- [ ] T018 [sonnet] (db-admin) migration: `screens`, `screen_revisions` + backfill; data-model.md, Zod/db-types, dashboard models drift test
- [ ] T019 [opus] crawler `record-state`: link each recorded state to its screen and revision; observation rows say which revision a run saw; tests + slow tier
- [ ] T020 [sonnet] (db-admin) migration: amendment revisions (append-only), `needs_reanchor` replaces `superseded`, carry-forward on a new screen revision; chat service `supersede.ts` → `reanchor.ts`; tests
- [ ] T021 [opus] Revision write path in the chat service: base-rev check (409 + latest), author = reviewer name, restore/withdraw as revisions; shared by amendments, processes, specs, proposals; tests
- [ ] T022 [sonnet] Dashboard read models: screen with revisions, revision strip, amendment history (`queries_revisions.py`) + tests

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
