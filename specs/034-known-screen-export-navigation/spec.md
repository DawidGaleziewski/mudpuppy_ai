# Feature Specification: Map from a known screen, rebuild-grade export, documentation that grows, navigation for larger portals (R-66, R-68, R-70, R-71)

**Feature Branch**: `feature/034-known-screen-export-navigation`

**Created**: 2026-10-17

**Status**: In progress

**Input**: the owner, 2026-10-17: "lets lump these together 68, 71, 70, 66. One branch." Roadmap rows
R-66 (map from a known screen), R-68 (rebuild-grade documentation export), R-70 (documentation
that grows instead of being recreated), R-71 (dashboard navigation for larger portals). Spec 027
(R-54) is merged into this branch as a draft: its downloads (US5, US6) move here by the owner's
answer (1) of 2026-10-16; its process editing (US1–US4) stays R-54.

## Owner decisions on record

- **D-1** One branch for all four items (2026-10-17).
- **D-2** R-68: mock exports first, for the owner to rate file by file; the rest is built
  meanwhile; the final file layout follows the rating (2026-10-17).
- **D-3** Stop before merge: the branch is pushed with the code review done; changelog, merge and
  tag wait for the owner (2026-10-17).
- **D-4** Real-agent runs only on the test portals (reference portal, proving ground, scar-maker)
  (2026-10-17).
- **D-5** R-66: the run reaches the chosen node by **replaying the recorded path**; a deep link only
  where a recorded visit showed the node opens directly (graph_handler, 2026-10-16).
- **D-6** R-66 owns the other marks (Start here, Focus, Retry, Recheck, Skip) and the Next scan plan
  (screen 14) (2026-10-17). Recheck needs no approval (O-M5).
- **D-7** R-68 answers of 2026-10-16: (1) R-68 owns all export (R-54 downloads move here);
  (2) the BA stores an EARS form on each requirement while documenting, the export only prints it;
  (3) business = business rules + capability and use-case goals, functional = requirements + NFRs,
  no schema change; (4) contracts: shapes plus sanitized sample values recorded in test
  environments, OpenAPI from the shapes, examples per attempt; (5) the dashboard shows a process
  in the export's layout, one tab per file; (6) wireframes are SVG in `images/` with a field table
  under each (label, type, required, validation, options, value source); (7) "logic in code" is
  pseudo-code of observed rules; (8) a whole-portal export is a portal folder (README, process
  index, shared glossary, shared APIs) with one folder per process.
- **D-8** R-70 (4) (FTS5, sqlite-vec) only on a trigger: out of scope.
- **D-9** The dashboard writes nothing itself; writes go through the chat service (spec 022, 033).

## Decisions made for the owner (owner away; open questions at the end)

- **A-1** **Checkpoints are stored.** A map run keeps no typed values on its edges (only traces
  do), so a recipe cannot be rebuilt from edges alone. Every run now stores, per state, the
  shortest way it reached it (`checkpoints`: start URL, steps with action and value, the expected
  state after each step). Runs from before this branch fall back to a recipe rebuilt from
  `page_visits` and `edges`, with values from the persona's `test_data`.
- **A-2** **Replay is server-side**, one tool call (`go_to_state`), not the agent clicking along:
  it is deterministic, costs one turn, and checks each step's state (design §4 "replay is
  checked"). Pages passed on the way are recorded as usual (fresh evidence) but their actions are
  not queued; the frontier starts at the target.
- **A-3** **A directed scan is a new run** with a type and a parent: `full`, `continue`, `focused`,
  `recheck`, `retry` (plus the existing `probe` and `trace`). The type, parent run, plan and
  variation live on the run row (`run_type`, `parent_run_id`, `plan_json`). Attempts on a path are
  the `retry` runs that name that edge; no attempts table.
- **A-4** **Depth counts from the start node** in a directed scan (design §5 "within depth N from
  there"), so a focused scan is not fenced by paths and the login redirect is not cut off
  (R-66 row: "`focus`/`urls.allowed` also fence out the login redirect").
- **A-5** **Marks on screens are set on one state** of the screen (the state the inspector shows);
  the replay goes to that state. Skip on an edge excludes that action; Skip on a state excludes
  every action that leads to it and the state's own actions.
- **A-6** **Run grouping (R-70 (1))** is computed on read, never stored: a process (a BA `PROC`
  record or a workspace process) owns a run when the run walked at least two of its screens, or
  when it is a trace of that process; error and technical states never count toward overlap. Runs
  owned by no process are "unassigned". Unassigned runs that share at least half their screens
  are proposed as one new group.
- **A-7** **Regression guard (R-70 (3))**: `change_note` is already required on every revision,
  so the guard asks for something more specific: a revision that drops evidence links the
  previous revision had, or flow steps of a use case, is refused unless it lists them in
  `dropped` with a reason. A process record whose only cited states are error or technical
  states is refused on create and revise.
- **A-8** **R-71 page size 25** replaces the setting's 50 on every list page; one shared pager
  (offset based, filters kept in the links). Prev / Next on a detail page come from the list's
  query string carried in the link (`?from=<list path and query>`), so the neighbour is computed
  with the same filter and order.
- **A-9** **R-68 contracts' sample payloads** are recorded only for environments whose kind is not
  `production`, after the existing PII masking, truncated to 4 KB per body; production keeps
  shapes only.
- **A-10** **Export generator** builds on `@pathfinder/docs` (`exportSrs` model and renderers) as
  spec 027 FR-006 asked; one generator serves the CLI and the dashboard (the dashboard calls the
  CLI, as it is read-only and Python).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start a scan from a recorded screen (R-66, Priority: P1)

The owner marks a screen deep in a process "Start here" on the map and starts a focused scan; the
crawler replays the recorded path to that screen and explores from there, instead of mapping the
portal from the start page again.

**Acceptance Scenarios**:

1. **Given** a screen observed in an earlier scan, **When** the owner marks it Start here and
   starts a Focused scan with depth 2, **Then** the new run reaches the screen by replay (one
   tool call), its frontier holds only that screen's actions, and nothing beyond depth 2 from it
   is visited.
2. **Given** a screen that a recorded visit opened directly by URL, **Then** the replay is one
   navigate (deep link); otherwise it is the recorded steps from the last navigate.
3. **Given** a replay step lands on a different state, **Then** the tool stops with
   `REPLAY_DIVERGED` (expected and seen state, step number) and the run ends with that warning.
4. **Given** a persona that logs in, **Then** the replay passes the login like a normal scan
   (re-login and redirects are not fenced out).
5. A screen reachable only by UI navigation is reached by navigation, never by a deep link that
   lands on an error page (the deep link is used only when a recorded visit proved it).

### User Story 2 - Resume a stopped scan, retry one path (R-66, Priority: P1)

**Acceptance Scenarios**:

1. **Given** a scan that stopped on a form (crawler error, `stopped_warning` or `interrupted`),
   **When** the owner chooses Resume, **Then** a new run linked as "continues <id>" replays to
   the last good state before the failure and carries over the stopped run's pending frontier.
2. **Given** a failed action (an edge with an error), **When** the owner chooses Retry this path
   with a variation (wait longer, other input, do not submit), **Then** a `retry` run replays to
   the state before it and repeats only that action; the attempt and its result are listed on the
   path; when it passes the path is solved and the owner can continue the frontier from there.
3. **Given** Skip on the failed action, **Then** the next scans leave it out.
4. The stopped scan's page (screen 15) shows where and why it stopped, the failure class with its
   default, Resume / Retry this path / Skip it, and the attempts so far.

### User Story 3 - Marks and the Next scan plan (R-66, Priority: P1)

**Acceptance Scenarios**:

1. **Given** the map inspector of a screen, **Then** the owner can set Start here, Focus, Retry
   (failed screens), Recheck and Skip besides Probe; marks show as tags on the nodes and collect
   in the Next scan plan tray.
2. **Given** open marks, **When** the owner opens Plan next scan (screen 14), **Then** it offers
   the scan types, prefills the start points from the marks with their replay recipe ("replays 3
   steps from /start" or "opens by URL"), lists the excluded Skip marks, and starts the scan
   through the chat service; nothing runs until Start scan.
3. Marks a scan used are closed when it finishes (`used_by_run_id`). A Recheck scan only replays
   and records the current state of each Recheck-marked screen.

### User Story 4 - Mock exports to rate (R-68, Priority: P1)

**Acceptance Scenarios**:

1. **Given** the branch, **Then** `specs/034-…/mocks/` holds a mock process folder (README,
   PROCESS_STEPS, BUSINESS_REQUIREMENTS, FUNCTIONAL_REQUIREMENTS, GAPS, EARS, CONTRACTS, images/)
   and a mock portal folder, shaped by what MudPuppy records, with made-up data.
2. **Given** a rating page, **Then** the owner rates each file and section (useful / not / change)
   and the answers can be copied back as text.

### User Story 5 - Export a process, every process, or the portal (R-68, Priority: P1)

**Acceptance Scenarios**:

1. **Given** a documented process (a `PROC` record or a workspace process), **When** the BA
   exports it, **Then** a folder with the D-7 files is written: steps in walking order (resolved
   from the record's evidence, spec 027 FR-010), per step its states (happy, validation, technical,
   loading) with screenshots, an SVG wireframe and a field table, its requirements; requirements
   split business / functional by kind; EARS from the stored EARS forms; contracts with the API
   calls per step, shapes, OpenAPI and samples; gaps from assumptions, open questions, follow-ups
   and unknowns; pseudo-code of observed rules.
2. **Given** a portal, **When** the BA exports everything, **Then** a portal folder holds a README
   (overview, process index), the shared glossary and shared APIs, and one folder per process.
3. Same store, same choice → byte-identical files (no wall-clock time in the content).
4. **Given** the dashboard, **Then** a process opens in the export's layout (one tab per file) and
   offers the download as a zip.

### User Story 6 - The BA stores EARS forms and the crawler records sample payloads (R-68, Priority: P2)

1. **Given** a requirement or NFR the BA writes, **Then** it may carry `ears` (pattern and text);
   the BA guidance asks for it on every requirement; the export prints it, never derives it.
2. **Given** a scan in a non-production environment, **Then** each API call keeps a masked,
   truncated request and response sample beside its shapes.

### User Story 7 - Documentation that grows (R-70, Priority: P1)

**Acceptance Scenarios**:

1. **Given** a portal with many runs, **Then** the dashboard lists which runs belong to which
   process and which are unassigned, with proposed groups for the unassigned ones.
2. **Given** a documented process, **When** the BA calls `open_process_update`, **Then** it gets
   the process's records at their latest revisions, its runs from the grouping, and the states and
   edges of those runs that no record cites yet (the difference to document).
3. **Given** a revision that drops evidence links or use-case steps without listing them,
   **Then** `revise_record` refuses it with the list of what it would drop.
4. **Given** a process record whose only cited states are error or technical states, **Then** it
   is refused.

### User Story 8 - Navigation for larger portals (R-71, Priority: P1)

**Acceptance Scenarios**:

1. **Given** a list page (screens, states, records, runs, review items, processes, questions),
   **Then** it shows 25 items per page with Previous / Next and the total; filters and search run
   over all items.
2. **Given** a detail page opened from a list, **Then** "← Prev" and "Next →" move to the
   neighbour in that list (same filter and order).
3. The data store picker sits in the header next to the portal picker.
4. The picker lists only the stores with runs for the current portal; switching the portal
   selects the first store in that list when the current store has nothing for it.

### Edge Cases

- A state with no checkpoint and no page visit (seen only through login): the replay refuses with
  `NO_PATH` and the plan page says "no recorded way to this screen".
- A replay through a step whose action is now refused by the safety gate: refused, not skipped.
- A Start here mark on a screen of another persona's scan: the replay uses a checkpoint of the
  chosen persona when one exists, else refuses with `NO_PATH` for that persona.
- Two directed scans at once: refused as today (one crawler per portal).
- A page beyond the last list page: the last page is shown.
- An export of a process with no screenshots: steps carry "no picture" lines, not broken links.
- A portal with no process records: the portal export still writes README, glossary and APIs and
  says no process is documented.

## Requirements *(mandatory)*

### Functional Requirements

R-66

- **FR-001** Every run stores a checkpoint per state it reached by navigate or act: start URL,
  steps (action descriptor, value, fills), and the state expected after each step; the shortest
  per run and state is kept (migration `checkpoints`).
- **FR-002** `go_to_state` (crawler tool): replays the best recipe for a state (the run's persona;
  a direct-open visit first, then the shortest checkpoint, then a rebuilt recipe), checks each
  step's state, records the pages passed without queuing their actions, and queues the target's
  actions at depth 0. Errors: `NO_PATH`, `REPLAY_DIVERGED`, `ACTION_REFUSED`.
- **FR-003** `start_run` accepts `run_type` (`continue`, `focused`, `recheck`, `retry`), `plan`
  (start state ids, skip targets, depth, variation, target edge), and `parent_run_id`; it returns
  the start points the agent must reach with `go_to_state`. `continue` copies the parent's pending
  frontier.
- **FR-004** Skip marks exclude their targets from every scan of the portal while open: matching
  frontier items are settled `denylisted` with the reason "skip mark".
- **FR-005** Directed runs limit depth from the start state (A-4).
- **FR-006** A `retry` run repeats only the target edge's action with the variation; its result
  (passed when the action reached a state without error) is the attempt's result.
- **FR-007** Marks: the chat service accepts all six kinds on their allowed targets (design §6) and
  removes open ones; the map inspector sets them; the Next scan plan tray lists them.
- **FR-008** Plan next scan page (screen 14) and stopped-scan recovery (screen 15) start scans
  through the chat service (`request_scan` with `run_type` and `plan`).
- **FR-009** The chat orchestrator's crawler briefs cover each run type (reach the start points
  with `go_to_state`, then the type's procedure).

R-68

- **FR-010** Mock export folders and a rating page (US4).
- **FR-011** `RequirementContent` and `NfrContent` gain optional `ears: { pattern, text }`
  (pattern: ubiquitous, event, state, unwanted, optional, complex); BA guidance and record-kind
  text updated.
- **FR-012** `network_calls` gains `req_sample` and `res_sample` (masked, ≤ 4 KB, NULL on
  production) (migration).
- **FR-013** One shared step resolver for a process (PROC evidence: trace steps, else chained edges
  from the trigger screen; workspace process: A's latest revision), used by the export and the
  dashboard.
- **FR-014** Process export generator (folder per D-7) and portal export (D-7 (8)) in
  `@pathfinder/docs`; CLI `pnpm docs:process-export <portal> [<process key>|--all|--portal]
  [--out <dir>]`; byte-identical for the same store.
- **FR-015** Dashboard: a process (Docs PROC page and Processes page) shows the export layout as
  tabs and downloads it as a zip.
- **FR-016** An export eval task: code-based graders over the generated folder (every step has a
  picture or a "no picture" line, every requirement appears once, every API call of the process
  is in CONTRACTS, EARS present for requirements that have it) on the reference portal.

R-70

- **FR-017** Run grouping (A-6) as a read model in the dashboard (`queries_run_groups.py`) and in
  the BA server (`services/ba/run-groups.ts`), both checked against one JSON fixture.
- **FR-018** Dashboard: Docs ▸ Runs by process (groups, unassigned runs, proposed groups).
- **FR-019** BA tool `open_process_update` (G-14).
- **FR-020** `revise_record` regression guard and the error-only process guard (A-7); the BA
  guidance names them.

R-71

- **FR-021** One pager helper (25 per page) on the list pages; totals shown; filters and search
  over all items.
- **FR-022** Prev / Next on screen, state, record and review item pages from the `from` list.
- **FR-023** Store picker in the header; it lists the stores with runs for the current portal
  (the current store always included); a portal switch moves to the first such store when the
  current one has no runs for it.

### Key Entities

- **Checkpoint**: run, state, start URL, steps, recorded at; the way back to a state.
- **Directed run**: a run with `run_type`, `parent_run_id`, `plan_json`.
- **Mark** (exists): now all six kinds.
- **Run group**: computed; process key → runs, plus unassigned runs and proposed groups.
- **Process export**: a folder of Markdown files, `images/`, `openapi.yaml`, `process.json`.

## Success Criteria *(mandatory)*

- **SC-001** On the reference portal, a focused scan from the quote summary screen reaches it by
  replay in one tool call and visits nothing outside depth 2 from it.
- **SC-002** A scan stopped on a form resumes from the state before the failure, not from the
  start page.
- **SC-003** The mock exports and the rating page exist before any other R-68 code is merged.
- **SC-004** The process export of the reference insurer's quote process passes the export eval
  graders.
- **SC-005** A revision that would drop evidence without listing it is refused (unit test and
  gate).
- **SC-006** Every list page renders at most 25 rows; on a 300-screen store the Screens page
  renders in under 1 s.

## Assumptions

- The reference portal and the proving ground are the test portals for live runs (D-4).
- `PATHFINDER_ENV=sandbox` for live runs.

## Open questions for the owner

Collected in `findings.md` and the session dump at the end of the run.
