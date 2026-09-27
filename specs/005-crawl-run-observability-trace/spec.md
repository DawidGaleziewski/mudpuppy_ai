# Feature Specification: Crawl Run Observability Trace

**Feature Branch**: `feature/005-r17-crawl-run-observability-trace`

**Created**: 2026-09-27 (revised 2026-09-27 after plan review)

**Status**: Draft

**Input**: User description: "R-17: Crawl run observability trace. A step-by-step, per-run technical
trace of the crawler's own machinery — distinct from R-14's business-process trace mode. It must
capture, inspectable per run: every MCP tool call with its inputs and outputs; every
safety/action-gate decision and every robots.txt/denylist decision; fingerprinting and
state-matching outcomes; frontier picks; obstacles encountered; timings; and errors. It should be
inspectable most naturally from the R-12 dashboard." Review addendum (user, 2026-09-27): "get as
much info from our observability [as we can]; it is deterministic and we can actually use it to
observe wtf is going on."

## Clarifications

### Session 2026-09-27 (plan review)

- Q: Capture Playwright's own trace (DOM snapshots, screenshots, network; not PII-scrubbed)? → A:
  always on for non-production portals; on production only with an explicit operator opt-in;
  stored locally, deleted with the portal, never exported.
- Q: Record why the agent chose each step? → A: `navigate`, `act` and `finish_run` require a short
  agent-stated `rationale`.
- Q: Import the crawler agent's own transcript? → A: yes, automatically when a crawler agent
  finishes, joined to the server trace by the tool-use id Claude Code sends with every call; also
  runnable by hand.
- Q: How much per-request browser detail? → A: notable requests individually (main-frame
  navigations, refused/aborted, redirects, error statuses, slow rate-limiter waits, requests still in
  flight when a page never stabilized) plus per-step aggregates; a verbose level records every
  request.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Replay a run step by step (Priority: P1)

A developer watching a run end (or stall, or stop) unexpectedly opens it and sees, in exact order,
every tool call the agent made, what it said it was trying to do, what the server did inside that
call phase by phase with timings, and what came back — without reading log files.

**Why this priority**: the minimum slice that makes a run explainable at all.

**Independent Test**: open a finished run in the dashboard; every tool call appears in order with its
agent-stated rationale, input, output, status, duration, and a breakdown into server phases whose
durations add up to the call's duration.

**Acceptance Scenarios**:

1. **Given** a finished map run, **When** its trace is opened, **Then** every tool call the server
   received is listed in arrival order with rationale, input, output, status and duration.
2. **Given** a `navigate` or `act` call, **When** it is expanded, **Then** it shows its server phases
   (gate check, page load, settle, observe, fingerprint, record, frontier update) each with its own
   duration and outcome.
3. **Given** a run interrupted mid-call (server killed), **When** its trace is opened, **Then** the
   interrupted call is shown as started-but-unfinished, and every earlier call is complete.
4. **Given** a tool call refused before any run existed (e.g. `start_run` rejected by the production
   guard), **When** the operator looks at recent server activity, **Then** that call is visible with
   its error, even though it belongs to no run.

---

### User Story 2 - Verify safety and compliance decisions (Priority: P1)

The person accountable for compliance proves, for one run, that every action-gate check, scope and
denylist check, robots.txt check, rate-limit wait and block detection fired, what it was given and
what it decided.

**Why this priority**: the safety layer is the highest-stakes component; this turns "we believe it
works" into "here is every decision it made in this run".

**Independent Test**: filter a run's trace to decisions only; each shows its input, verdict, rule and
reason, and the count equals the decisions the run made.

**Acceptance Scenarios**:

1. **Given** an action the gate refused, **When** the trace is opened, **Then** the refusal appears
   inside the `act` call that attempted it, with class, rule and reason.
2. **Given** a page request to a robots-disallowed URL, **When** the trace is opened, **Then** every
   such request appears (not only the first per URL pattern) with the rule and whether it was
   blocked or allowed-and-recorded.
3. **Given** a bot-protection block, **When** the trace is opened, **Then** the response that
   triggered it, the signature that matched, and the stop that followed are shown in order.

---

### User Story 3 - Understand what the agent was thinking (Priority: P2)

A developer wants to know why the agent went where it went: its stated rationale per step, its
visible messages between calls, how many tokens each turn cost, and any call it attempted that never
reached the server.

**Why this priority**: the crawler is one non-deterministic LLM agent; server facts alone show *what*
happened, not *why the agent chose it*.

**Independent Test**: after a crawler agent finishes, its transcript is imported automatically; the
trace interleaves the agent's messages and per-turn token usage with the server's calls, joined by
tool-use id, and flags any agent call with no matching server call.

**Acceptance Scenarios**:

1. **Given** a crawler agent that finished, **When** the run's trace is opened, **Then** each server
   call shows the agent turn that issued it, its token usage, and the agent's visible text before it.
2. **Given** an agent call rejected by Claude Code itself (never reached the server), **When** the
   trace is opened, **Then** it appears flagged "never reached server".
3. **Given** the import is run twice for the same transcript, **Then** the stored result is identical
   (idempotent).

---

### User Story 4 - Diagnose mapping and page behaviour (Priority: P2)

A developer investigating why two pages were merged (or split), why a page "never stabilized", or
why a frontier item was chosen sees the fingerprint decision with similarity and threshold, the
settle diagnostics (what was still moving: requests, DOM, animations), the frontier queue decision,
and — on non-production portals — can open the exact browser moment in Playwright's trace viewer.

**Why this priority**: diagnostic depth for improving map quality; US1/US2 already make a run
reviewable without it.

**Independent Test**: expand a step whose page never stabilized; the trace names the requests still in
flight at the deadline and whether DOM mutations or animations were still running; a link/command
opens that step's browser trace.

**Acceptance Scenarios**:

1. **Given** a page matched to a known state, **When** the step is expanded, **Then** it shows the
   fingerprint, the matched cluster, similarity and threshold, and whether the state was new.
2. **Given** a page that never stabilized, **When** the step is expanded, **Then** it shows the
   in-flight request patterns, time since last DOM mutation, and running animation count at timeout.
3. **Given** `get_next_frontier_item`, **When** expanded, **Then** it shows the chosen item, its
   priority and depth, how many items were pending, or why nothing was returned.
4. **Given** a non-production run, **When** a step is expanded, **Then** a browser trace for exactly
   that step can be opened.
5. **Given** an obstacle (cookie banner, popup) dismissed during a step, **Then** it appears in that
   step. (Only once obstacle handlers are wired into live sessions, R-07 T059.)

---

### User Story 5 - Spot problems in a long run at a glance (Priority: P3)

For a run of hundreds of steps, a developer sees a summary first: time per phase, slowest steps,
error and refusal counts, token totals, trace health (dropped entries), and a "problems only" filter.

**Independent Test**: open a 500-step run; the summary and first page render quickly; "problems
only" narrows to errors, refusals, never-stabilized pages, slow steps and unmatched agent calls.

**Acceptance Scenarios**:

1. **Given** a long run, **When** opened, **Then** a summary shows totals per phase and per outcome,
   the slowest steps, and token usage.
2. **Given** the "problems only" filter, **Then** only problem entries remain, in run order.

### Edge Cases

- Run with no trace (predates the feature, or failed before any call): explicit "no trace recorded"
  state, never an empty list that looks like "nothing happened".
- Trace write fails (disk full, lock): the crawl continues unaffected; the loss is counted and shown
  as trace health on the run.
- Tool-call input/output larger than the inline cap: stored as a scrubbed evidence file and linked.
- PII in inputs, outputs, rationale, agent text or request URLs: scrubbed before storage.
- Run resumed in a new server process: one continuous trace, ordered across both processes.
- Browser events outside any tool call (background polling between steps): attached to the run, not
  to a call, and shown as "between calls".
- Transcript not found or unreadable: import reports it; the server trace is unaffected.
- Runs predating this feature: no backfill.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST record, for every run started after this feature ships (any mode),
  every tool call the server receives with: tool name, scrubbed input, scrubbed output or error,
  status, start and end time, duration, the agent's tool-use id and agent id when the client sends
  them, and the agent-stated rationale.
- **FR-002**: Each browser-touching call MUST be broken into timed phases (gate check, page load,
  settle, observe, network drain, fingerprint, record state/forms/transition/API calls, action
  extraction, frontier update, run bookkeeping); the phases of a completed call MUST cover its
  duration with no unexplained gap larger than 5%.
- **FR-003**: The system MUST record every decision inside a call as an entry nested under it:
  action-gate and scope/denylist verdicts (with class, rule, reason), robots.txt checks, item-cap
  checks, fingerprint assignments (fingerprint, cluster, similarity, threshold, new or existing
  state), frontier enqueue/skip/pick decisions, block-detector verdicts and the resulting stop.
  Existing decision-log entries MUST be linked to the call they occurred in, not duplicated.
- **FR-004**: The system MUST record notable browser requests individually (main-frame
  navigations, refused/aborted, redirects, status ≥ 400, rate-limiter waits above a threshold,
  requests in flight when a page never stabilized) and all other requests as per-call aggregates
  (counts by type and outcome, total limiter wait); a verbose level MUST record every request.
- **FR-005**: For a page that never stabilized, the trace MUST record what was still active at the
  deadline: in-flight request patterns, time since last DOM mutation, running animations.
- **FR-006**: `navigate`, `act` and `finish_run` MUST require a rationale from the agent (1–300
  characters), stored masked and labelled as agent-stated; missing rationale is a schema error.
- **FR-007**: The system MUST import the crawler agent's transcript automatically when a crawler
  agent finishes, and on demand: each agent turn's visible text (masked), tool-use ids, model and
  token usage, joined to server calls by tool-use id; agent calls with no server call, and server
  calls with no agent turn, MUST be flagged. Import MUST be idempotent.
- **FR-008**: On non-production portals the system MUST capture a Playwright trace per tool call
  and link it from that call; on production portals only when the operator explicitly opts in for
  that server process. These files MUST be deleted with the portal's data and excluded from portal
  export.
- **FR-009**: Users MUST be able to view a run's trace in the dashboard as an ordered list of calls,
  each expandable into its phases, decisions, requests and agent context.
- **FR-010**: Users MUST be able to filter by entry kind, by status (ok / refused / error / stopped /
  unfinished), and a "problems only" view; filtering MUST keep run order.
- **FR-011**: Each run MUST show a summary: time per phase, counts by kind and status, slowest calls,
  token totals, and trace health (entries dropped, payloads truncated).
- **FR-012**: All trace text and JSON MUST pass the project's PII scrubber before storage; request
  URLs MUST be stored as route patterns plus a masked query shape, never raw.
- **FR-013**: Trace data MUST follow the portal data lifecycle (included in export except browser
  traces; removed on delete).
- **FR-014**: Trace capture MUST NOT change any crawl outcome: a trace failure never fails, delays
  beyond its own write, or alters a tool call; the agent cannot read or influence the trace (no new
  agent tool; the rationale is informational only).
- **FR-015**: Ordering MUST be total and reproducible: every entry has a position that orders it
  uniquely within its server process, and runs resumed in another process stay in order.
- **FR-016**: Tool calls received outside any run (unknown run id, rejected `start_run`) MUST be
  recorded and viewable as server activity.
- **FR-017**: The trace view MUST load incrementally and stay responsive for runs of at least 500
  calls and 20 000 entries.

### Key Entities

- **Span**: one timed unit of work — a tool call, a phase inside it, or a point-in-time event
  (decision, request, obstacle, error). Has a parent (call → phase → event), run (optional), order
  position, status, timing, scrubbed attributes, and an optional payload file.
- **Agent turn**: one message of the crawler agent's transcript: visible text, tool-use ids, model,
  tokens, time; joined to spans by tool-use id.
- **Browser trace file**: Playwright trace for one tool call on a non-production (or opted-in) run.
- **Run**: existing; gains a trace, a summary and trace health.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For any run, a developer identifies the call, phase and decision behind a given
  outcome from the dashboard alone, without opening a log file.
- **SC-002**: 100% of tool calls, gate decisions, robots checks and fingerprint assignments of a run
  appear in its trace; verified by comparing counts to the decision log and the agent transcript.
- **SC-003**: For 100% of completed browser-touching calls, phase durations sum to within 5% of the
  call duration.
- **SC-004**: 100% of an imported agent's tool calls are matched to server calls or explicitly
  flagged unmatched.
- **SC-005**: A run of 500 calls / 20 000 entries opens with summary and first page in under 1 s.
- **SC-006**: No PII from the scrubber's test corpus appears in any stored trace entry or agent turn.
- **SC-007**: Replaying the same scripted tool-call sequence against the local test portal with a
  fixed clock and id generator produces an identical trace (golden test).
- **SC-008**: Trace capture adds under 10% to a step's wall-clock time at the default level.

## Assumptions

- Audience is the existing dashboard audience (developers, BA); no new access control; the dashboard
  binds localhost only.
- Claude Code (≥ 2.1.283, verified) sends `claudecode/toolUseId` in each MCP call's metadata and
  stores subagent transcripts as JSONL with visible text, tool-use ids and usage; thinking content is
  not stored (signature only), which is why FR-006 asks for a rationale.
- Obstacle handlers are not yet wired into live sessions (R-07 T059); this feature records obstacle
  events once they exist but does not do that wiring.
- The BA server (R-13) is out of scope; its calls can reuse the same mechanism later.
- No backfill for earlier runs.
