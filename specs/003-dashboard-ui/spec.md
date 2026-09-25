# Feature Specification: Dashboard UI

**Feature Branch**: `feature/003-r12-dashboard-ui`

**Created**: 2026-09-25

**Status**: Draft

**Input**: User description: "Before moving to BA I would like to implement UI. I have created a design system for this project: `user_input/ux-package` — use it to add a frontend developer and equip him with this skill so he knows how to implement new features. I want to implement a FastAPI backend, using Pydantic and uv. Frontend using light htmx and updated live when we push changes. I want to see some data we have noted so far on the dashboard."

## Context

Specs 001 and 002 produced a read-only crawler that records what it saw of a portal into the crawl
store: runs, states, actions and their safety classes, the frontier, forms, network call shapes,
robots.txt policies and the decision log. The first live runs against liveinsurer.example (2026-09-25) left
real records there: 9 runs, 1 state, 600 extracted actions, 6 forms, 9 network call shapes,
10 robots policies and 56 decision-log entries, two of them run-stopping CAPTCHA warnings.

Today the only way to look at that data is raw SQL. The operator cannot see at a glance which runs
stopped and why, what the crawler refused and under which rule, or how far a run got. Before the
BA agent (which will read the same records) is built, the operator needs a window onto them. The
window is also the first operator-facing UI, so it sets the house style and the way future UI
work is done: a design system and a frontend role that applies it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See what has been recorded so far (Priority: P1)

The operator opens the dashboard in a browser and sees an overview of every portal that has
records: how many runs, how they ended (completed, stopped with a warning, interrupted, still
running), and totals of states, actions, forms, network calls and open questions. Below it, a list
of runs, newest first, with portal, persona, mode, status, steps used, start time and duration. A
run that stopped with a warning shows the warning text in the list.

**Why this priority**: It is the whole ask ("I want to see some data we have noted so far") and on
its own replaces ad-hoc SQL for the most common question: "what happened on the last runs?"

**Independent Test**: Start the dashboard against the current crawl store and check that the
overview and runs list match counts taken directly from the store, including the 2 CAPTCHA
warnings on liveinsurer runs.

**Acceptance Scenarios**:

1. **Given** the crawl store holds 9 liveinsurer runs, **When** the operator opens the dashboard,
   **Then** the overview shows portal `liveinsurer` with 9 runs split by status, and the runs list shows
   all 9 newest first.
2. **Given** a run ended `stopped_warning`, **When** it is shown in the list, **Then** its status is
   conveyed by text (not colour alone) and its warning reason is visible.
3. **Given** the crawl store is empty, **When** the operator opens the dashboard, **Then** an empty
   state explains that no runs have been recorded yet and how to start one.

---

### User Story 2 - Inspect one run in detail (Priority: P2)

From the runs list the operator opens a run and sees what the crawler found and decided in it:
the states observed (title, route template, confidence), the actions extracted per state with
their safety class and whether they were allowed, the frontier by status (pending, done, skipped
as unsafe, denylisted, robots-disallowed, unreachable…), the forms and their fields, the network
call shapes, the robots.txt policies fetched, and the decision log (skip, refuse, merge, split,
warning, note) with the rule that applied. Every row that has evidence shows its evidence
reference so a claim can be traced back (Principle II).

**Why this priority**: The overview says *that* something happened; the detail says *why*. It is
what the operator needs to review a run's safety decisions and what the BA will later reason from.

**Independent Test**: Open the run with the most steps and check each section against the store:
counts per frontier status, decision log grouped by rule, each state's evidence reference.

**Acceptance Scenarios**:

1. **Given** a run with 600 frontier items, **When** the operator opens it, **Then** the frontier
   section shows counts per status and the decision log lists each entry with kind, rule and reason.
2. **Given** a state with `confidence = observed`, **When** it is shown, **Then** its confidence
   label and evidence reference are displayed next to it.
3. **Given** the operator filters the decision log by kind or rule, **When** a filter is applied,
   **Then** only matching entries are shown, without a full page reload.
4. **Given** a run id that does not exist, **When** the operator opens it, **Then** a not-found
   state is shown, not an error page.

---

### User Story 3 - Watch the data change live (Priority: P3)

While a crawl is running (or any new record is written), the open dashboard updates by itself:
new runs appear, a running run's status, step count and section counts change, and a run that
finishes switches status without the operator reloading. A running run is marked with a live
indicator. While developing the dashboard itself, a change to its code or templates is reflected
in the open browser without a manual restart.

**Why this priority**: The user asked for the view to be "updated live when we push changes".
Useful during a supervised live run (T059, T073, T074), but US1 and US2 already deliver value
with a manual refresh.

**Independent Test**: With the dashboard open, write a new run into a scratch copy of the store
and check that it appears within the stated latency with no reload.

**Acceptance Scenarios**:

1. **Given** the dashboard is open on the overview, **When** a new run is recorded, **Then** it
   appears in the runs list within 3 seconds without a page reload.
2. **Given** a run is `running`, **When** it is displayed, **Then** it carries a live indicator
   and its counts refresh as records are added.
3. **Given** the live connection drops, **When** it cannot reconnect, **Then** the page says the
   view may be stale and keeps showing the last data, and it resumes when the connection returns.

---

### User Story 4 - A frontend role that applies the design system (Priority: P4)

A developer (human or agent) asked to add or change a dashboard screen has a dedicated frontend
developer agent that knows the project's design system and methodology, so new screens follow
the same tokens, component rules, states and accessibility checks without re-deriving them.

**Why this priority**: The user asked for it explicitly; it keeps later UI work (BA views,
requirement review screens) consistent. It delivers no data view on its own.

**Independent Test**: Ask the frontend agent to describe how it would add a new "open questions"
panel; its answer uses the design system's tokens and component rules and the scorecard.

**Acceptance Scenarios**:

1. **Given** the project agents, **When** a dashboard UI task is delegated, **Then** a frontend
   developer agent exists whose instructions point to the design-system skill rather than
   repeating it.
2. **Given** the design-system skill, **When** the agent starts a UI task, **Then** it can load the
   methodology and the project's design system on demand.

### Edge Cases

- The crawl store is being written by a running crawler while the dashboard reads it: reads must
  never block or corrupt the writer, and a half-written run is shown as it is (status `running`).
- The crawl store file is missing or unreadable: the dashboard starts and shows an error state
  naming the path, instead of crashing.
- A run has thousands of actions or frontier items: lists are paginated or summarised; the page
  stays usable.
- JSON columns (action descriptors, form fields, config snapshot, detail) hold unexpected shapes:
  they are shown as formatted raw JSON, not dropped.
- Multiple portal workspaces exist (per-portal data, spec 002): the overview groups by portal and
  the operator can filter by portal.
- The config snapshot carries operator contact data (the User-Agent contact, the terms reviewer's
  name): the dashboard is for the local operator only and is not exposed beyond the local machine.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The dashboard MUST only read the crawl store; it MUST NOT create, change or delete any
  record, and MUST open the store in a way that cannot take a write lock.
- **FR-002**: The dashboard MUST show an overview per portal: number of runs by status, and totals
  of states, actions (allowed vs skipped), forms, network call shapes, open questions and rule
  candidates.
- **FR-003**: The dashboard MUST list runs newest first with portal, persona, mode, environment,
  status, steps used, start time, duration and, for stopped runs, the warning text; filterable by
  portal and status.
- **FR-004**: The dashboard MUST show a run detail view with sections for states, actions,
  frontier, forms, network calls, robots policies and decision log, each with its count.
- **FR-005**: Every displayed record that carries a confidence label or an evidence reference MUST
  show both (Principle II); `inferred` and `needs_confirmation` MUST be visually distinct from
  `observed` by text, not colour alone.
- **FR-006**: Large lists (actions, frontier, decision log) MUST be paginated or grouped so a run
  with 10 000 items renders in the same time as a small one.
- **FR-007**: The decision log MUST be filterable by kind and rule, and the frontier by status,
  updating in place without a full page reload.
- **FR-008**: The dashboard MUST push changes in the crawl store to open pages within 3 seconds,
  without the operator reloading, and MUST indicate when the live connection is lost.
- **FR-009**: A run in status `running` MUST carry a live indicator; no other element animates
  except as the design system allows.
- **FR-010**: Empty, loading, not-found and error states MUST be designed for every view.
- **FR-011**: The dashboard MUST follow the project design system (`revamp-dashboard` skill and its
  bundled Console system) for colour, type, spacing, status language and component states, and meet
  WCAG AA contrast and full keyboard reachability.
- **FR-012**: The dashboard MUST listen on the local machine only by default.
- **FR-013**: The project MUST have a frontend developer agent whose instructions reference the
  design-system skill, and the skill MUST be installed where project agents can load it.
- **FR-014**: The dashboard MUST be startable with a single documented command, and in development
  mode MUST reload the open page when its own code or templates change.
- **FR-015**: The data the dashboard reads MUST be validated against typed models mirroring the
  crawl store's schema, so a schema drift fails loudly in tests rather than silently in the UI.

### Key Entities

Read-only views over the existing crawl store (`data/schema/schema.sql`); no new entity is stored.

- **Portal summary**: a portal id with its run counts by status and record totals (derived).
- **Run**: one crawl run: portal, persona, mode, environment, status, warning, steps, timing.
- **State**: a recorded UI state: title, route template, cluster, confidence, evidence reference.
- **Action / frontier item**: a candidate action with its safety class, allowed flag, skip reason
  and frontier status.
- **Form, network call, robots policy**: recorded observations with evidence.
- **Decision log entry**: a skip, refuse, merge, split, warning or note, with the rule applied.
- **Store change marker**: a cheap signal that the store changed since the last look (derived).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The operator can answer "how did the last liveinsurer run end, and why?" in under 30
  seconds from opening the dashboard, with no SQL.
- **SC-002**: Every count shown on the overview and run detail matches a direct query of the store
  (verified by an automated test against a fixture store).
- **SC-003**: A new record written to the store is visible on an open page within 3 seconds.
- **SC-004**: The dashboard never changes the crawl store: the store's content hash is identical
  before and after a full test session, and a crawler run in parallel is not slowed or blocked.
- **SC-005**: Every page opens in under 1 second on the current store and on a synthetic store with
  10 000 frontier items.
- **SC-006**: The dashboard scores no "fail" on the design system's practices scorecard (token
  fidelity, states, accessibility, responsive, motion, performance), with any partial score
  explained.

## Assumptions

- "Updated live when we push changes" is read as both: changes to the recorded data appear live on
  open pages (US3), and during development code/template edits reload the page (FR-014).
- The dashboard is a local, single-operator tool; no authentication for v1 because it listens on
  the local machine only (FR-012). Remote access is out of scope.
- The dashboard is read-only. Editing records (confirming requirements, answering open questions)
  belongs to later features (BA, Principle VI) and is out of scope.
- The bundled Console design system in `user_input/ux-package` is the project's design system; the
  product adds its own name, mark and entity-to-accent mapping as that system instructs.
- The Python backend is an addition next to the Node/TypeScript crawler, never on the crawler's
  runtime path, per the constitution's Python tooling constraint.
