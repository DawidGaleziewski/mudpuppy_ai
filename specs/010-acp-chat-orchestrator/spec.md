# Feature Specification: Guided Chat Orchestrator (R-30)

**Feature Branch**: `feature/010-r30-acp-chat-orchestrator`

**Created**: 2026-10-05

**Status**: Done (phase 1), signed off 2026-10-07; T038's remaining real-agent pass moved to roadmap R-32; squash-merged with R-31 (tag v1.0.10)

**Input**: User description: "Phase 1 of `user_input/raw_idea/acp_chat_and_easy_interface/readme.md`: an orchestrator chatbot that enforces the workflow, helps create personas, narrows a portal to one process, produces as-is requirements documentation plus to-be amendments, with an interactive dashboard chat window, a step tracker, error reference ids pointing to local logs, and the MudPuppy gif while the chatbot works."

## Context

Today a BA who wants documentation must know which of many skills and agents to call and in which order (scan a portal, map, trace, document, export). Even the project owner loses track of where a portal stands. This feature adds one guided entry point: a chat in the dashboard that knows the state of every portal, offers only the valid next steps, and shows progress. The chat can run the existing workflow; it cannot change the harness itself (agents, skills, code, configuration, safety rules). Harness changes stay a developer task in the shell.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ask what I can do and scan a portal (Priority: P1)

A BA opens the chat in the dashboard and asks what they can do. The chat explains the available functions in plain language and, because no portal has been scanned yet, offers to scan one. It collects what a scan needs: the portal URL, test-user credentials and a persona. If the BA has no persona, the chat helps create one in conversation. The BA confirms and the scan starts.

**Why this priority**: This is the first thing every new BA does and the smallest slice that proves the chat replaces "which skill do I call".

**Independent Test**: With an empty workspace, open the chat, ask "what can I do?", provide URL, credentials and persona, and see a scan start and finish (or fail with a reference id), without invoking any skill or agent by hand.

**Acceptance Scenarios**:

1. **Given** no portal has been scanned, **When** the BA asks what they can do, **Then** the chat lists the functions in plain language and proposes scanning a portal as the next step.
2. **Given** the BA wants to scan, **When** URL, test-user credentials or persona are missing, **Then** the chat asks only for the missing items and does not start the scan until all are present.
3. **Given** the BA has no persona, **When** they ask for help, **Then** the chat walks through creating one and saves it for reuse by later scans.
4. **Given** all inputs are confirmed, **When** the BA approves, **Then** the scan starts, the step tracker shows it in progress, and the MudPuppy animation plays while it runs.
5. **Given** the BA types credentials in the chat, **Then** they are stored through the existing credential vault and never repeated back in clear text in the chat or logs.

---

### User Story 2 - See where I am and what comes next (Priority: P1)

At any time the BA can see a step tracker for the current portal and goal: each step is shown as to do, pending, in progress, done or failed. When a portal has already been scanned, the chat opens by proposing the valid next moves (continue the scan, map processes, produce documentation) instead of asking an open question. Steps that are not yet valid are refused with an explanation of what is missing.

**Why this priority**: The core problem is being lost in the workflow; the tracker and next-step proposals are the direct fix.

**Independent Test**: Scan a portal, reload the dashboard, and confirm the chat and tracker reflect the real state and offer only valid next steps.

**Acceptance Scenarios**:

1. **Given** a portal scanned in an earlier session, **When** the BA opens the chat, **Then** it proposes continuing, mapping processes or producing documentation, based on what is recorded.
2. **Given** the BA asks for documentation of a portal with no scan, **When** the chat evaluates the request, **Then** it explains the scan is missing and offers it instead of starting documentation.
3. **Given** a step fails, **Then** the tracker shows it as failed with a reference id (see User Story 5) and the chat says what the BA can do next.
4. **Given** the page is reloaded mid-work, **Then** the tracker and the conversation come back as they were, and running work continues to show live progress.

---

### User Story 3 - Narrow to one process and document it as-is (Priority: P2)

Real portals are too big to document whole. The BA describes the process they care about (for example "getting a car insurance quote"). The chat proposes candidate processes found in the mapped data. The BA picks one and then sets where it starts and where it ends from a checkbox-style list of mapped states, each shown with its screen. The BA can add comments. The chat resolves open gaps (which persona, which start state, which end state) by asking. The result is documentation scoped to that process: requirements readable by stakeholders and structured so another agent can use them as the as-is reference.

**Why this priority**: This is the main value delivery for the BA but depends on scanning and the tracker.

**Independent Test**: On a mapped reference portal, describe a process, pick start and end states from the list, and receive scoped as-is documentation whose records cite only evidence inside that scope.

**Acceptance Scenarios**:

1. **Given** a mapped portal, **When** the BA describes a process, **Then** the chat proposes candidate processes with the states each would involve.
2. **Given** a chosen process, **When** the BA ticks a start and an end state in the list, **Then** the list shows each state with its screen and accepts a free-text comment per selection.
3. **Given** start, end or persona is missing, **When** the BA asks for documentation, **Then** the chat asks for exactly the missing items.
4. **Given** all gaps are closed, **When** the BA confirms, **Then** documentation for that process is produced in the existing documentation formats (human-readable and machine-readable) and limited to the chosen scope.

---

### User Story 4 - Chat stays inside its fence (Priority: P2)

The chat refuses requests to change the harness (edit agents, skills, safety rules, code or configuration, bypass gates) and tells the BA this is done from the shell by a developer. It performs only the workflow actions defined for BAs.

**Why this priority**: The tool is handed to non-developers; safety rules from the constitution must not be reachable from the chat.

**Independent Test**: Ask the chat to change a safety rule, edit an agent file, or disable a gate; it refuses and nothing on disk changes.

**Acceptance Scenarios**:

1. **Given** a request to modify an agent, skill, rule file or code, **Then** the chat declines, explains where such changes are made, and changes nothing.
2. **Given** a request that the existing safety gates refuse (for example a production write), **Then** the refusal is passed on to the BA unchanged and not worked around.

---

### User Story 5 - Visible errors with a reference id (Priority: P2)

When anything goes wrong (crawler, permissions, login, the chat itself), the chat shows a clear error with a reference id. The same id identifies an entry in a local log folder holding the technical detail, so a developer can find the cause and add a fix.

**Why this priority**: Developers need failures to be traceable to improve crawler and permissions; BAs need to know it is not their fault.

**Independent Test**: Force a failure (for example an unreachable URL); the chat shows an error with an id, and the log folder holds one entry with that id and the technical detail.

**Acceptance Scenarios**:

1. **Given** a step fails, **Then** the chat shows a plain-language message and a reference id, and the tracker marks the step failed.
2. **Given** a reference id, **When** a developer searches the log folder, **Then** exactly one entry matches and contains the failing step, time and technical detail.
3. **Given** a log entry, **Then** it never contains credentials.

---

### User Story 6 - Amend the as-is state to express to-be changes (Priority: P3)

In the documentation, the BA can attach an amendment to a state, its evidence screenshot or its wireframe: a text note ("this button should now look like this"), a pointer to a wireframe element, a new element drawn on the wireframe, or an attached file. Amendments are kept separate from observed facts, so the as-is reference stays intact and the to-be changes are clearly marked in the export for the consuming agent.

**Why this priority**: High value for the stated end goal (as-is plus delta) but needs the P1/P2 flow first; drawing is the largest part.

**Independent Test**: On a documented process, add a text amendment and an attached file to a state and confirm the export lists them as to-be changes next to the unchanged as-is records.

**Acceptance Scenarios**:

1. **Given** a state with a wireframe, **When** the BA adds an amendment referencing an element, **Then** the amendment is stored with author, time and target and shown beside the as-is content.
2. **Given** amendments exist, **When** documentation is exported, **Then** amendments appear in a distinct section and in the machine-readable output, never mixed into observed facts.
3. **Given** an amendment is edited or removed, **Then** the as-is records are unchanged.
4. **Given** amendments on a state or on one of its screen elements, **When** a fresh crawl run (started by the BA) changes that state or element, **Then** those amendments are marked superseded with the reason, the run and the time, and are not deleted.
5. **Given** superseded amendments, **When** the BA opens the "Superseded amendments" view, **Then** each is shown with its original text, target, reason and run, and the BA can re-apply it to the current state or element, or dismiss it.
6. **Given** a fresh run that does not touch an amendment's state, **Then** the amendment stays active.

---

### Edge Cases

- The BA closes the browser during a scan: work continues or is paused safely, and the chat and tracker show the true state on return.
- Two portals are in progress: the chat asks which one is meant before acting.
- A scan is refused by a safety gate (environment guard, robots rules, an action above the limit): the chat shows the reason and offers allowed alternatives.
- The BA gives the wrong credentials: login failure is reported with a reference id, credentials can be corrected without restarting the conversation.
- A CAPTCHA appears: the chat uses the existing human hand-off and tells the BA what to do.
- The BA's description matches no mapped process: the chat says so and offers a trace or a broader scan instead of inventing one.
- The agent behind the chat is unavailable or times out: the chat shows an error with a reference id and the workflow stays resumable.
- A fresh run replaces a state or element that carries amendments: they become superseded, never silently lost or silently kept as valid; the BA decides when to run fresh crawls and is told which amendments were affected when the run ends.
- Log folder is not writable: the error is still shown in the chat, flagged as not logged.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The dashboard MUST provide an interactive chat window in which the BA converses with one orchestrator agent.
- **FR-002**: The orchestrator MUST know the recorded state of each portal (scanned or not, mapped processes, documentation present) and offer only the next steps valid for that state.
- **FR-003**: The orchestrator MUST explain, on request, what the BA can do and how, in plain language.
- **FR-004**: The orchestrator MUST be able to start a portal scan once it has a URL, test-user credentials and a persona, and MUST ask only for what is missing.
- **FR-005**: The orchestrator MUST help the BA create a persona in conversation and save it for reuse.
- **FR-006**: Credentials entered in the chat MUST be stored through the existing credential vault and MUST NOT appear in clear text in the chat history, tracker or logs.
- **FR-007**: For a scanned portal the orchestrator MUST propose continuing, mapping processes or producing documentation.
- **FR-008**: The orchestrator MUST NOT modify the harness (agents, skills, rule files, configuration, code) and MUST refuse such requests with an explanation; it MUST NOT bypass or weaken any existing safety gate.
- **FR-009**: The dashboard MUST show a step tracker for the current portal and goal with the statuses to do, pending, in progress, done and failed, updated live. (Spec 011 adds stopped: the BA stopped the step's run on purpose; it can be resumed.)
- **FR-010**: The chat and tracker MUST state clearly what the system is doing at any moment, and the MudPuppy animation (`user_input/raw_idea/acp_chat_and_easy_interface/mudpuppy-comic (1).gif`) MUST play while long-running work such as a scan is in progress.
- **FR-011**: Every error shown to the BA MUST carry a unique reference id, and the technical detail MUST be written to a local log folder under that id.
- **FR-012**: Log entries MUST NOT contain credentials or session secrets.
- **FR-013**: The orchestrator MUST let the BA describe a process in words and propose candidate processes from mapped data.
- **FR-014**: The dashboard MUST present mapped states, each with its screen, as a checkbox-style list from which the BA picks the start and end of a process, with a free-text comment per selection.
- **FR-015**: The orchestrator MUST identify unresolved scope items (persona, start state, end state) and ask for them before producing documentation.
- **FR-016**: Documentation for a chosen process MUST be scoped to that process, readable by stakeholders, and available in a machine-readable form that another agent can use as the as-is reference.
- **FR-017**: The BA MUST be able to attach amendments to states, evidence or wireframes: text notes, references to wireframe elements, and attached files.
- **FR-018**: Amendments MUST be stored separately from observed facts, with author, time and target, and MUST be marked as to-be in every export.
- **FR-021**: When a fresh crawl run changes a state or the screen element an amendment targets, the system MUST mark that amendment superseded, recording the reason, the superseding run and the time, and MUST NOT delete it. A state or element counts as changed when (a) the run observed the same route template but the state's fingerprint differs from the one the amendment was written against, or (b) the state is still observed but the targeted element is absent or its role or accessible name differs. A state the run did not observe leaves its amendments active.
- **FR-022**: The dashboard MUST provide a separate "Superseded amendments" view listing every superseded amendment with its text, target, reason, superseding run and time, where the BA can re-apply it (to a chosen current state or element, creating a new active amendment that links back to the original) or dismiss it.
- **FR-023**: Superseded and dismissed amendments MUST be left out of the to-be chapter of the export and listed in a separate appendix and in the machine-readable output with their status, so the consuming agent can see what was dropped and why.
- **FR-019**: Conversation and tracker state MUST survive a page reload and a dashboard restart.
- **FR-020**: All safety behaviour of the constitution in force (since 4.0.0, spec 011: each environment's action limit, robots rules unless the portal ignores them, rate limits, environment guard, CAPTCHA hand-off) MUST apply unchanged to actions started from the chat. A scan from the chat is read-only unless the BA allows more for that scan (spec 011 FR-013).

### Out of Scope (phase 1) and future

- Drawing new shapes freehand on wireframes inside the dashboard (phase 1 covers text notes, element references and attachments; drawing is a later phase).
- Orchestrating test generation, QA hand-off or any workflow beyond scan, map, trace, document.
- Multiple simultaneous BAs, accounts, roles or permissions inside the dashboard.
- Letting the chat edit the harness (explicitly never; shell only).
- Replacing the existing agents, skills and MCP servers; the chat orchestrates them.

### Key Entities

- **Conversation**: the BA's chat history with the orchestrator, tied to a portal and goal, resumable.
- **Workflow Step**: a named stage (for example scan, map, narrow process, document) with a status of to do, pending, in progress, done or failed, and a link to its error if failed.
- **Error Reference**: unique id, short BA-facing message, and a local log entry with technical detail.
- **Process Scope**: the chosen process, persona, start state, end state, per-selection comments and the proposal it came from.
- **Amendment**: a to-be note, element reference or attachment attached to a state, evidence or wireframe, with author and time, kept apart from observed facts. Status: active, superseded (a fresh run changed its target; reason, run and time kept), dismissed, or withdrawn.
- **Persona draft**: the persona being built in conversation until saved.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A BA who has never used the tool starts a first scan from the chat in under 5 minutes without invoking any skill or agent by hand.
- **SC-002**: In a test of 10 requests to change the harness (edit agent, skill, rule, code, disable a gate), 10 are refused and 0 files change.
- **SC-003**: For every induced failure, the chat shows a reference id and exactly one log entry with that id exists; across all logs from tests, 0 entries contain a credential.
- **SC-004**: At any moment during a run, the tracker status of each step matches the real state of the work, verified on a scripted run including a failure and a page reload.
- **SC-005**: On the reference portal, a BA narrows to one process and receives scoped documentation in under 10 minutes of chat time, and 100% of its records cite evidence within the chosen scope.
- **SC-006**: In a hands-on review, the owner can state the current step and the next valid action for a portal within 10 seconds of opening the dashboard.
- **SC-007**: An exported documentation set with amendments keeps all as-is records byte-identical to an export without amendments, and lists every amendment in a separate section.

- **SC-008**: On a scripted portal change (one state replaced, one element renamed, one state untouched), 100% of affected amendments become superseded with reason and run, 0 are deleted, and the untouched state's amendments stay active.

## Assumptions

- A fresh crawl run may override amendments; the BA decides when to run one (the chat never starts a fresh run on its own).
- Layout: the chat service is its own app `apps/chat`; the workflow derivation is a shared package `packages/workflow`.
- Users are BAs working locally, one at a time, on the existing dashboard (`apps/dashboard`); no authentication is added.
- The orchestrator reuses the existing crawler, BA agent, MCP servers, credential vault and export; it adds guidance and a UI, not new crawling or analysis capabilities.
- Test-user credentials are stored in the existing credential vault (R-26) and personas in the existing persona files; the chat does not introduce a second store.
- Environment rules come from the constitution in force; this spec adds none. (Written under 2.x, when production was read-only; since 4.0.0, spec 011, each environment has a limit the BA sets and a chat scan is read-only unless the BA allows more.)
- The log folder is `data/logs/chat/` (see Clarifications), local and developer-readable.
- The animation file is used as supplied.
- The transport between dashboard and agent is ACP (see Clarifications); the plan owns the details, this spec describes behaviour only.

## Clarifications

### Session 2026-10-05

- Q: Transport between dashboard and agent? -> A: Agent Client Protocol (the idea's "APC" is ACP). The dashboard backend is an ACP client to a Claude Code ACP agent.
- Q: Are amendments and wireframe drawing in phase 1? -> A: Text notes, wireframe element references and attachments are in; drawing on wireframes is deferred.
- Q: Where do personas and credentials live? -> A: Personas stay YAML in `personas/`. Credentials go only into the R-26 vault through a dashboard form and never pass through the model context (so FR-006 is met by construction; the chat shows a "credentials stored" confirmation, not the values).
- Q: Orchestrator runtime and fence? -> A: A new restricted `orchestrator` agent with an allowlist of workflow tools and no file-edit tools.
- Q (later, same day): Layout? -> A: chat service is its own app `apps/chat`; workflow derivation is the shared package `packages/workflow`; pnpm workspaces per CLAUDE.md.
- Q (later): Constitution? -> A: chat-service commands are covered by the `docs:review` precedent for now; accepted, to be confirmed by testing.
- Q (later): Amendments vs fresh runs? -> A: a fresh run may override amendments; the BA decides when to run one. Changed targets make amendments superseded (kept, with reason, run and time), shown in a "Superseded amendments" view where the BA re-applies or dismisses them; excluded from the to-be export chapter and listed in an appendix.
- Q (later): Root workspace file? -> A: allowed. One `pnpm-workspace.yaml` at the repo root covering `apps/*` and `packages/*` is accepted; it is workspace config, not a language manifest.
- Q: Error log location and retention? -> A (default, not asked): `data/logs/chat/`, one JSON line per error keyed by reference id, kept 30 days, outside git.
