# Feature Specification: BA Documentation

**Feature Branch**: `feature/004-r13-ba-documentation`

**Created**: 2026-09-26

**Status**: Draft

**Input**: User description: "Now I want to build BA subagent. I want a process for creating
documentation out of our runs. Requirements etc. So if needed whole portal could be recreated. We
already should have requirements how we want to do it and create it, best practices for BA etc.
[…] I would also like to read the documentation created by BA in our new UI. So probably new tab.
Relations to runs on which evidence it was built etc."

## Context

Specs 001–003 produced a read-only crawler that records Layer A of the data model (the mechanical UI
state graph: runs, states, edges, actions, forms, network call shapes, frontier, decision log,
open questions, rule candidates) and a dashboard that shows those records. Nothing yet produces
Layer B, the semantic documentation that is the product's actual deliverable (constitution: "Layer
B is the BA deliverable and Layer A is its evidence").

The constitution already fixes how the BA works (Principles I, II, III, VI) and
`user_input/raw_idea/agents/ba.md` describes what an expert BA produces when documenting an existing
system (as-is analysis, BABOK, ISO/IEC/IEEE 29148 SRS outline, a layered multi-pass pipeline). This
feature turns that into a working role, a place to keep its output, a way for a human to review it,
and an export that another team or agent could use to re-create the portal.

Two gaps must close for the documentation to cover processes. The crawler only has `map` mode, so
there are no ordered process recordings yet, so the feature also adds crawler `trace` mode. Second,
nothing can yet tell whether documentation is *good enough to re-create the portal*. Real portals
(liveinsurer) are only a test bed: we cannot know their full truth, so they cannot measure the BA. The
feature therefore adds a local **reference portal** whose screens, fields, rules and processes are
known and written down as ground truth, and an evaluation that scores the BA's output against it.

Decisions taken with the user on 2026-09-26:

| # | Decision |
|---|---|
| D1 | Scope is a full as-is SRS, processes included (not a minimal slice). |
| D2 | The documentation store is the source of truth; the Markdown/diagram SRS is rendered from it. |
| D3 | The Docs tab lets a human confirm, reject and comment on drafts (needs a constitution amendment, see FR-040). |
| D4 | Living records: stable ids, every revision kept, each revision linked to its exact evidence and so to its runs. |
| D5 | Crawler `trace` mode is in scope; on a production portal a trace stops at the first mutating action. |
| D6 | Documentation is in English; portal UI labels, field names and domain terms are quoted verbatim in the portal's language, with English definitions. |
| D7 | One spec, four roadmap items: R-13 (store, BA tools, BA agent on map evidence, reference portal), R-14 (trace mode and processes), R-15 (Docs tab with review), R-16 (SRS export and goal evaluation). |
| D8 | Whether the BA achieves its goal is measured, not assumed: a reference portal with a ground-truth manifest, and a deterministic evaluation of the BA's output against it. Existing liveinsurer data is irrelevant to acceptance. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - BA documents a portal from recorded evidence (Priority: P1) — R-13

The operator asks the BA agent to document a portal (e.g. the reference portal). The BA opens an analysis
session, names the crawl runs it will read, and works in passes that mirror BA practice:
inventory (screens, entry points, forms, API shapes) → capability map → business rules → data
dictionary and glossary → observable NFRs → synthesis. Every record it writes (capability, screen,
requirement, business rule, glossary term, data item, NFR, assumption, open question) carries a
confidence label and at least one link to recorded evidence. Where it lacks evidence it does not
guess: it records an open question for a human or a follow-up task for the crawler ("check what the
quote form shows when the postcode is invalid"). It never browses.

**Why this priority**: It is the core ask: documentation out of our runs. It already produces value
on today's map evidence, before trace mode or UI exist.

**Independent Test**: Run the BA agent against a fixture store holding one completed map run of the
reference portal. Check that it produces at least an inventory, draft requirements, glossary terms
and open questions; that every record has a confidence label and resolvable evidence; that attempts
to write a record without evidence, or with a confidence of `observed` on an unsupported claim type,
are refused; and that the BA had no browsing tools.

**Acceptance Scenarios**:

1. **Given** a completed map run with states, forms and network call shapes, **When** the BA runs an
   analysis session on it, **Then** a session record lists that run as input and every record
   created in the session links to evidence belonging to that run.
2. **Given** the BA tries to save a requirement with no evidence link, **When** the write is
   submitted, **Then** it is refused with an error naming the missing evidence and nothing is stored.
3. **Given** the BA needs behaviour that was not recorded (e.g. the result of submitting a form),
   **When** it cannot cite evidence, **Then** it records a crawler follow-up task and/or an open
   question instead of a requirement, and the gap appears in the session summary.
4. **Given** a portal whose UI is in Polish, **When** the BA writes a glossary term, **Then** the term
   is stored verbatim as shown (e.g. "Kalkulator OC/AC") with an English definition.
5. **Given** a second analysis session on the same portal after a new run, **When** the BA changes a
   requirement, **Then** the requirement keeps its id (e.g. `REQ-007`), a new revision is stored,
   and the previous revision and its evidence stay readable.

---

### User Story 2 - Read the documentation and trace it to its evidence (Priority: P1) — R-15

The operator opens a new **Docs** tab in the dashboard and picks a portal. They see the
documentation arranged as an SRS: introduction and scope, capability map, screens, processes and
use cases, functional requirements with acceptance criteria, business rules, data dictionary,
glossary, NFRs, assumptions, open questions, crawler follow-ups, and a traceability matrix. Each
record shows its id, status (draft, confirmed, rejected, superseded), confidence and a short
evidence list. From any record they can open its evidence (the state, form, network call shape,
action or process step it cites) and from there the run it came from, which is the existing run
detail page. They can see a record's revision history and which analysis session wrote each
revision.

**Why this priority**: The user asked to read BA output in the UI and to see which runs it was built
on. Without it the documentation is only readable through raw queries.

**Independent Test**: Start the dashboard against a fixture store with Layer B records, open the
Docs tab and check that every record shown matches the store, that every evidence link resolves to
the correct Layer A record and run, and that a record with two revisions shows both.

**Acceptance Scenarios**:

1. **Given** a portal with draft requirements, **When** the operator opens Docs → Requirements,
   **Then** each requirement shows id, title, statement, acceptance criteria, status, confidence and
   the number of evidence links.
2. **Given** a requirement citing a form observed in run R, **When** the operator follows the
   evidence link, **Then** they see the form record and a link to run R's detail page.
3. **Given** a portal with no BA records, **When** the operator opens Docs, **Then** an empty state
   explains that no analysis has been run for this portal and how to start one.
4. **Given** new BA records are written while the Docs tab is open, **When** they are committed,
   **Then** the tab updates without a manual reload, as the rest of the dashboard does.

---

### User Story 3 - Review drafts: confirm, reject, comment (Priority: P2) — R-15

A human BA reviews draft records in the Docs tab. For each draft they can confirm it, reject it
with a reason, or leave a comment. The decision is stored as a review record (who, when, what,
which revision). The record's status changes only as the deterministic result of that review
record: a confirmation promotes exactly the revision that was reviewed. If the BA agent later
revises a confirmed record, the new revision starts again as draft and the confirmed revision stays
visible. The BA agent reads comments and rejections in its next session and responds by revising,
withdrawing, or adding an open question.

**Why this priority**: Constitution Principle VI: requirements become `confirmed` only through
explicit human approval, and only confirmed requirements may later drive acceptance tests. It
depends on Story 2's view.

**Independent Test**: With a fixture draft requirement, confirm it through the Docs tab, check the
review record and the promoted status; reject another with a reason and check it is shown to the
BA agent's next session through its tools.

**Acceptance Scenarios**:

1. **Given** a draft revision, **When** a reviewer confirms it, **Then** a review record is stored and
   that revision's status becomes `confirmed`.
2. **Given** a confirmed record, **When** the BA agent stores a new revision, **Then** the new revision
   is `draft`, the record shows "confirmed revision N, draft revision N+1 pending review".
3. **Given** a reviewer rejects a draft without a reason, **When** they submit, **Then** the rejection
   is refused and asks for a reason.
4. **Given** the BA agent itself, **When** it tries to set any status other than draft, **Then** the
   write is refused (agents never promote status).
5. **Given** a reviewer tries to confirm a revision that is no longer the latest, **When** they
   submit, **Then** the action is refused and the latest revision is shown instead.

---

### User Story 4 - Crawler traces a named process (Priority: P2) — R-14

The operator asks the crawler to trace one named process for a persona, e.g. "get a car insurance
quote" as a guest. The crawler records it as ordered steps: intent, action, state before and after,
network calls, observed outcomes and evidence. On a production portal every action still goes
through the safety gates; the trace stops before the first action classified mutating, destructive
or external-side-effect, marks the rest of the process `not observable`, and records an open
question describing what was not observed. The process is stored at status `recorded` (never
verified by the crawler). The BA can then build use cases and process maps on these steps and may
ask for more traces via follow-up tasks.

**Why this priority**: Processes and use cases (D1) cannot be evidence-backed without it. It is
independent of the UI stories and builds on the existing map runtime and safety gates.

**Independent Test**: Trace a quote process against the local reference portal configured as
`environment: sandbox` and check that all steps to confirmation are recorded; repeat with it
configured as `production` and check that the trace stops at the submit action with a
`not observable` remainder and an open question, and that no mutating request was sent.

**Acceptance Scenarios**:

1. **Given** a sandbox portal, **When** the crawler traces a named process, **Then** a trace run and a
   process record at status `recorded` with ordered steps are stored, each step linked to its
   states, action and network calls.
2. **Given** a production portal, **When** the next step is a mutating action, **Then** the crawler
   does not perform it, the process is stored with `boundary_reached` and a `not observable`
   remainder, and an open question is recorded.
3. **Given** a crawler follow-up task written by the BA, **When** the operator starts a trace for it,
   **Then** the resulting run is linked to the task and the task shows as done (or blocked, with the
   reason).

---

### User Story 5 - Export the SRS to re-create the portal (Priority: P3) — R-16

The operator exports a portal's documentation to a folder of Markdown files with Mermaid diagrams
(capability map, process maps, state diagrams, entity diagram), structured along an ISO/IEC/IEEE
29148-style SRS outline, plus a machine-readable copy of the same records. Every statement keeps
its id, confidence and evidence references, and a traceability matrix links requirement → evidence
→ run. The export can be filtered to confirmed records only or include drafts (clearly marked).
A section lists what could not be observed and the open questions, so a team re-creating the
portal knows exactly what is still unknown.

**Why this priority**: It is the final handoff ("so if needed whole portal could be recreated"),
but it only renders what Stories 1–4 already store.

**Independent Test**: Export a fixture portal and check the files against a golden copy; check every
id and evidence reference in the Markdown exists in the store; check that exporting twice from the
same store produces byte-identical output.

**Acceptance Scenarios**:

1. **Given** a portal with confirmed and draft records, **When** the operator exports with "confirmed
   only", **Then** no draft or rejected record appears in the output.
2. **Given** the same store, **When** exported twice, **Then** the output is identical (deterministic
   and diffable).
3. **Given** records with `needs_confirmation` confidence or `not observable` flags, **When**
   exported, **Then** they are visibly marked and also listed in the "Unknowns" section.

---

### User Story 6 - Know whether the documentation is enough to re-create the portal (Priority: P2) — R-16

The operator runs the whole pipeline on the reference portal (crawler map, traces the BA asks for,
BA sessions) and then evaluates the documentation against the portal's ground truth. The report
says how much of the portal the documentation covers (screens, form fields and their constraints,
business rules, processes, domain terms), lists every ground-truth item that is missing, and lists
every place where the documentation claims more certainty than the evidence allows (e.g. a rule
that cannot be seen as a guest documented as `observed`). The operator uses the report to improve
the BA's guidance and the crawler, and re-runs it to see the effect.

**Why this priority**: It is the only direct measure of the product goal ("so if needed the whole
portal could be recreated"). Structural checks prove the docs are traceable, not that they are
complete or honest.

**Independent Test**: Evaluate a hand-built fixture set of records against a small ground truth and
check each score, missing item and over-claim; then run the full pipeline on the reference portal and
check the scores meet SC-008.

**Acceptance Scenarios**:

1. **Given** documentation that covers 9 of 10 ground-truth screens, **When** evaluated, **Then** the
   screen score is 90% and the missing screen is named.
2. **Given** a ground-truth rule marked "not observable as guest" and a BA record claiming it as
   `observed`, **When** evaluated, **Then** it is reported as an over-claim.
3. **Given** scores below the configured thresholds, **When** evaluated, **Then** the command reports
   failure, so it can gate a pipeline run.
4. **Given** the same store and ground truth, **When** evaluated twice, **Then** the reports are
   identical.

---

### Edge Cases

- Evidence disappears: a run's records are removed or its evidence file is missing. The Docs tab
  shows the link as broken, the record is flagged for BA attention, and the export lists it; the
  record is never silently dropped.
- Contradictory evidence: two runs show different behaviour for the same screen (e.g. an A/B
  variant or a changed page). The BA records both, links both, and raises an open question rather
  than picking one.
- Duplicate concepts: two glossary candidates for the same concept ("klient", "ubezpieczający").
  The BA links them as synonyms with one preferred term; a reviewer can reject the merge.
- A requirement based only on `inferred` or `needs_confirmation` evidence may be stored as draft but
  never as `observed`; the store refuses an `observed` label unless at least one linked evidence item
  is itself observed.
- Two reviewers act on the same revision at once: the first decision wins; the second is refused as
  stale and shown the current state.
- A trace hits a CAPTCHA or block: the run stops as today (Principle V), the partial process is kept
  at `recorded` with the stop reason, and the BA sees it as incomplete.
- A follow-up task is impossible on production (it needs a mutating action): it is marked blocked
  with the safety rule that blocks it, not retried.
- The BA session is interrupted mid-way: records already written stay (each is valid on its own);
  the session is marked interrupted and can be resumed or closed.
- PII: evidence is already scrubbed before storage; the BA must not copy raw user data into prose,
  and the export includes only scrubbed evidence references.

## Requirements *(mandatory)*

### Functional Requirements

**Documentation store and records (R-13)**

- **FR-001**: The system MUST store BA documentation (Layer B) as structured records of these kinds:
  capability, screen, process, process step, use case, functional requirement, non-functional
  requirement, business rule, glossary term, data item (entity/field), assumption, open question
  (the BA's own; crawler questions stay run-bound and are linked), crawler follow-up task, and
  analysis session.
- **FR-002**: Every documentation record MUST have a stable, human-readable id unique per portal and
  kind (e.g. `CAP-003`, `SCR-012`, `PROC-002`, `UC-004`, `REQ-017`, `NFR-002`, `BR-009`, `GL-021`,
  `DI-030`, `ASM-004`, `FUP-006`), assigned by the system, never by the agent.
- **FR-003**: Every change to a record MUST create a new revision; earlier revisions MUST remain
  readable and MUST NOT be altered.
- **FR-004**: Every revision MUST carry a confidence label (`observed`, `inferred`,
  `needs_confirmation`) and at least one evidence link; a revision without evidence MUST be refused.
  A behaviour that cannot be observed MUST be recorded with a `not observable` flag and a linked
  open question, never guessed.
- **FR-005**: An evidence link MUST point to a specific recorded item: a state, edge, action, form,
  network call shape, process step, rule candidate, open question, or another documentation
  record. Through that item, every revision MUST be traceable to the run(s) it came from.
- **FR-006**: The system MUST refuse a revision labelled `observed` unless at least one of its
  evidence links points to a Layer A record itself labelled observed.
- **FR-007**: Records MUST be linkable to each other with typed relations sufficient for the SRS and
  traceability matrix, at least: capability contains process; process has steps; use case describes
  process; requirement refines use case or capability; requirement enforces business rule; screen
  belongs to capability; data item appears on screen or in network call; glossary term is used by
  any record; synonym-of between glossary terms; persona performs process.
- **FR-008**: Each record kind MUST have the structured fields BA practice expects, at least:
  - use case: primary actor (persona), preconditions, trigger, main flow, alternate flows,
    exception flows, postconditions;
  - functional requirement: statement ("The system shall…"), rationale (flagged if not observed),
    acceptance criteria as Given/When/Then, priority (MoSCoW, default unset until reviewed);
  - business rule: statement, rule type (constraint, computation, inference, action enabler), and a
    decision table where the rule is conditional;
  - data item: name as shown in the portal, English name, type, constraints observed (required,
    format, length, allowed values), where seen;
  - glossary term: term verbatim in portal language, language code, English definition, synonyms;
  - NFR: category (performance, security, accessibility, availability, compliance, usability,
    localisation), statement, measured value where observed;
  - crawler follow-up task: question to answer, suggested mode (map/trace), target (URL or process),
    persona, reason, status (open, done, blocked, cancelled), linked run once done.
- **FR-009**: Prose fields MUST be in English; any portal UI label, field name, message or domain
  term MUST be quoted verbatim in the portal's language.

**BA agent and its tools (R-13)**

- **FR-010**: A BA subagent MUST be defined with access only to documentation tools: reading Layer A
  evidence and Layer B records, writing Layer B records through validated tools, and writing
  follow-up tasks and open questions. It MUST have no browser, shell, raw database or file-write
  tools.
- **FR-011**: The BA MUST work inside an analysis session that records the portal, the input runs it
  read, start and end times, what it created or revised, and a summary with open gaps. A session
  MUST be resumable after interruption.
- **FR-012**: The BA's procedure MUST follow the layered pipeline: (1) inventory, (2) capability map,
  (3) process and use-case deep dives (when trace evidence exists), (4) business rules, (5) data
  dictionary and glossary, (6) observable NFRs, (7) synthesis (scope, overview, gaps and questions).
  Each pass MUST be recorded in the session.
- **FR-013**: The BA MUST read and respond to reviewer comments and rejections on its records at the
  start of each session (revise, withdraw with reason, or raise an open question).
- **FR-014**: The BA's knowledge of good practice (as-is analysis, requirement quality attributes:
  unambiguous, complete, consistent, verifiable; rule-vs-requirement distinction; Cockburn use
  cases; decision tables; ubiquitous language; "state what you could not see") MUST be available to
  it as a reusable skill derived from `user_input/raw_idea/agents/ba.md`.
- **FR-015**: Tools MUST validate every write against the record schemas and reject invalid ones with
  a machine-readable error the agent can act on; agents MUST NOT invent ids or set statuses.

**Crawler trace mode (R-14)**

- **FR-020**: The crawler MUST support a `trace` mode that records one named process for one persona
  as ordered steps: order, intent, action performed, state before, state after, network calls,
  observed outcomes, candidate locators, evidence, confidence.
- **FR-021**: All existing safety rules MUST apply unchanged in trace mode. On a production portal the
  trace MUST stop before the first action classified mutating, destructive or
  external-side-effect; the process MUST record `boundary_reached`, a `not observable` remainder,
  and an open question describing what was not observed.
- **FR-022**: A traced process MUST be stored at status `recorded`; the crawler MUST NOT set any
  later status.
- **FR-023**: A trace run MAY be started from a BA follow-up task; the run MUST be linked to that
  task, and the task status MUST be updated from the run outcome by deterministic code.
- **FR-024**: Trace mode MUST be testable end to end against the local reference portal with both
  a sandbox and a production configuration.

**Docs tab and review (R-15)**

- **FR-030**: The dashboard MUST add a Docs tab per portal showing the documentation in SRS order
  (introduction/scope, capabilities, screens, processes and use cases, functional requirements,
  business rules, data dictionary, glossary, NFRs, assumptions, open questions, follow-up tasks,
  traceability matrix).
- **FR-031**: Every record view MUST show id, title, status, confidence, current revision number, the
  analysis session that wrote it, and its evidence links; each evidence link MUST open the Layer A
  record and link on to its run's detail page.
- **FR-032**: Every record MUST have a revision history view showing each revision's content,
  confidence, evidence, session and review decisions.
- **FR-033**: Run detail pages MUST show which documentation records cite evidence from that run
  (reverse traceability).
- **FR-034**: The Docs tab MUST be filterable by record kind, status, confidence, and "has open
  question / not observable".
- **FR-035**: Process maps and state diagrams MUST be rendered as diagrams in the Docs tab.
- **FR-036**: The Docs tab MUST update live when records or reviews change, like the rest of the
  dashboard.
- **FR-037**: A reviewer MUST be able to confirm a draft revision, reject it with a mandatory reason,
  or comment on any revision. Each action MUST store a review record (reviewer name, time, action,
  revision, text).
- **FR-038**: A record's status MUST change only as the deterministic result of a review record:
  confirm → `confirmed` for exactly that revision; reject → `rejected`. A later revision by the BA
  MUST start as `draft`. Review actions on a stale revision MUST be refused.
- **FR-039**: The reviewer's identity MUST be recorded; since the dashboard is a local operator tool
  with no login, the reviewer name comes from local configuration and MUST be set before review
  actions are enabled.
- **FR-040**: The constitution MUST be amended (MINOR bump) to allow the dashboard a narrow write
  path limited to review records, using the same schemas and migrations as every other writer; all
  other dashboard access stays read-only.

**SRS export (R-16)**

- **FR-050**: The system MUST export a portal's documentation to a folder of Markdown files with
  Mermaid diagrams, organised by an ISO/IEC/IEEE 29148-style SRS outline, plus a machine-readable
  copy of the same records.
- **FR-051**: The export MUST offer "confirmed only" and "all, drafts marked" modes.
- **FR-052**: Every exported statement MUST keep its id, status, confidence and evidence references;
  the export MUST include a traceability matrix (requirement → use case/rule → evidence → run) and
  an "Unknowns" section (not observable behaviour, open questions, blocked follow-ups).
- **FR-053**: Export MUST be deterministic: the same store produces byte-identical output.
- **FR-054**: The export MUST NOT include raw evidence files or unscrubbed data, only references.

**Reference portal and goal evaluation (R-13, R-16)**

- **FR-060**: The project MUST include a runnable local reference portal (insurer-like, Polish UI) with
  known content: at least 10 screens, 3 forms with at least 15 fields in total including required
  fields, format and range validations, at least 10 business rules of mixed types (validation,
  computation, eligibility, UI enablement), at least 3 multi-step processes of which at least one ends
  in a data-changing submit, a login-only area, and domain terms. It MUST be resettable to the same
  state and deterministic (no randomness, fixed dates).
- **FR-061**: The reference portal MUST ship a machine-readable ground truth listing its screens,
  forms and fields with constraints, business rules (with where they show and whether a guest can
  observe them), processes with their steps, and glossary terms. An automated check MUST keep the
  ground truth consistent with what the portal actually serves.
- **FR-062**: The reference portal MUST be configured as a portal with a guest persona so the crawler
  and BA use it exactly like any other portal; nothing in the crawler or BA code may know it by name.
- **FR-063**: The system MUST evaluate a portal's documentation against a ground truth and report,
  per category (screens, fields, field constraints, business rules, processes, glossary terms), the
  share of ground-truth items documented, the missing items, and over-claims (documentation more
  certain than the ground truth allows). Matching MUST be deterministic and documented.
- **FR-064**: The evaluation MUST accept minimum scores and report failure when any is not met.

### Key Entities

- **Analysis Session**: one BA pass over a portal; input runs, passes completed, records
  created/revised, summary, status (running, completed, interrupted).
- **Documentation Record**: a stable-id item of one kind (capability, screen, process, process step,
  use case, requirement, NFR, business rule, glossary term, data item, assumption, follow-up task);
  holds its current status and points to its revisions.
- **Revision**: an immutable version of a record's content; confidence, not-observable flag, session
  that wrote it, evidence links, status (draft, confirmed, rejected, superseded).
- **Evidence Link**: revision → one Layer A item (state, edge, action, form, network call shape,
  process step, rule candidate, open question) or another record; the path to runs.
- **Record Relation**: typed edge between records (contains, has_step, describes, refines, enforces,
  appears_on, uses_term, synonym_of, performs).
- **Process / Process Step**: recorded by trace mode (Layer A/B boundary): named process, persona,
  run, status `recorded`, `boundary_reached`; ordered steps with states, action, network calls,
  outcomes, evidence.
- **Review**: a human decision on one revision: confirm, reject (reason), comment; reviewer and time.
- **Crawler Follow-up Task**: a BA request for more evidence; status and linked run.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of stored documentation revisions have a confidence label and at least one
  evidence link that resolves to an existing recorded item and a run (checked by an automated audit).
- **SC-002**: 0 documentation records have a status other than draft unless a matching human review
  record exists.
- **SC-003**: From any requirement in the Docs tab, the operator reaches the run it came from in at
  most 2 clicks; from any run, the records citing it are listed on the run page.
- **SC-004**: On the reference portal, one BA session over one map run and one trace run produces
  every SRS section listed in FR-030 with at least one record each (or an explicit "nothing observed"
  note), and every section gap appears as an open question or follow-up task.
- **SC-005**: On a production-configured trace, 0 mutating, destructive or external-side-effect
  requests reach the portal.
- **SC-006**: A reviewer can confirm or reject a draft in under 30 seconds from opening it.
- **SC-007**: Exporting the same store twice produces identical files; every id and evidence
  reference in the export exists in the store.
- **SC-008**: On the reference portal, after one map run, the traces the BA requests and at most three
  BA sessions, the documentation covers at least 90% of guest-visible screens, 90% of form fields,
  80% of field constraints, 70% of guest-observable business rules, 100% of processes (documented, or
  flagged as not observable beyond a boundary), and 80% of glossary terms, with 0 over-claims.
- **SC-009**: Every ground-truth rule a guest cannot observe is either absent from the documentation
  or recorded as `needs_confirmation`/`not observable`, never as `observed`.

## Assumptions

- Single local operator/reviewer environment, as for the dashboard; no multi-user auth. The reviewer
  name is configured locally (FR-039).
- The BA is an LLM subagent run in Claude Code like the crawler; its model and budget are set in its
  definition. It reaches the store only through the documentation tools of the existing MCP server
  (constitution: agents access the DB only through MCP).
- Open questions come from two sources shown as one log: the crawler's run-bound questions (kept as
  they are) and the BA's own questions, which are documentation records so they get ids, revisions
  and review. The BA marks a crawler question addressed by citing it from the record that answers it.
- NFRs are limited to what is observable from recorded evidence (e.g. response status patterns,
  robots policy, accessibility of labels, languages offered); everything else is listed as not
  observable.
- Acceptance of every story is demonstrated on the reference portal. Existing liveinsurer data is a test
  bed only; it is not needed, not migrated specially, and may be deleted with `portal:delete`.
- The SC-008 thresholds are starting targets; if the first full run falls short, the gap analysis
  drives changes to the BA guidance or the crawler, not a silent lowering of thresholds (any change
  is recorded in the roadmap notes).
- Process discovery by the crawler itself (proposing which processes exist) is out of scope; the BA
  proposes processes from map evidence and asks for traces via follow-up tasks.
- QA test generation, replay verification and statuses beyond `confirmed` (`tested`,
  `replay_verified`, `documented`) are out of scope; the store must not block adding them later.
- Gap analysis (as-is vs. to-be), BRD business goals and stakeholder/RACI content are out of scope
  because they are not observable; the export has a placeholder section that says so.
