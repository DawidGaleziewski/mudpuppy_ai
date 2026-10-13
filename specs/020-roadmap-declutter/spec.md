# Spec 020: Roadmap declutter — the small items that need no owner decision (R-52)

Branch `feature/020-r52-roadmap-declutter` · Created 2026-10-12 · Status: done, merged
2026-10-13 (v1.0.21). Success criteria: SC-001–SC-003, SC-005–SC-008 met; SC-004 met as
revised (LO-08 and F-04@020 gates; LO-27 for script-written windows stays a gap, findings F-04)

**Input**: user, 2026-10-12: "Out of all these tasks, are there tasks that are a bit minor and can
be done now without any decision on my end? Can we make them one collective feature branch and
start making them through the night? Just to declutter the roadmap a bit." The list was proposed in
the same session and taken without changes. Sources: roadmap rows R-19, R-35, R-36, R-40, R-07/R-10
(T074), R-47; `specs/014-eval-baselines/findings.md` (F-03, F-04),
`specs/009-legacy-proving-ground/findings.md` (F-16), `specs/008-screenshots-wireframes/findings.md`
(F-12), `specs/004-ba-documentation/goal-run-findings.md` (F-05, F-14, F-16),
`specs/015-crawler-hardening/findings.md` (F-19), `specs/009-legacy-proving-ground/gap-ranking.md`
(LO-08, LO-27).

## Problem

The roadmap carries a tail of small, well-understood fixes spread over five items. Each one is too
small to open a branch for, so they stay open and make the roadmap look busier than it is:

- **Evals are fragile to run** (R-40). The pure eval tests never run in the fast tier, so a broken
  check is only seen in the slow tier. The classification of an agent run's outcome (success, budget
  end, API error, usage limit) decides whether a result may be promoted, yet it has no unit tests and
  the result does not record it per agent. A server left over from an earlier run on the eval ports
  is silently reused, so an eval can measure the wrong build.
- **Small correctness slips** (R-36). A highlight crop around a radio or checkbox cuts off its label;
  a stored action keeps its first allow/refuse decision even when it is re-issued with another one;
  revising a BA record loses its citations to runs outside the current session.
- **Two crawler gaps whose cause is known** (R-35). A missing CMS key (LO-08) can now be reached,
  since R-28 made role-less "buttons" clickable, but its gate still says it cannot. A pop-up window
  opened by `window.open` (LO-27) is never observed. Trace runs are cut off by the map's depth
  budget (F-14). Two ground-truth screens (insurer S08, bank S11) are never reached and nobody has
  looked at why (F-19).
- **Large diagrams cannot be read** (R-19). A big process or state map is drawn to fit its box and
  becomes too small to read; there is no way to zoom in or move around.
- **Stale entries** (R-07/R-10, R-47). The safety review pass of the first build (T074) was never
  ticked, and the R-47 row still says "Next" although its owner paused it on 2026-10-11.

## User stories

### US1 Evals are safe to run and their outcome is trusted (R-40) — priority P1

A developer runs an eval, or a chain of evals, overnight.

**Acceptance scenarios**

1. **Given** a change to an eval check or comparison, **when** the fast test tier runs, **then** the
   pure eval tests run in it (they no longer need the slow tier).
2. **Given** an agent run that ended in success, at its budget, with an API error, or on a usage or
   rate limit, **when** the eval classifies it, **then** each case gets its own outcome, the outcome
   is stored in the result per agent (crawler, BA), and only success and budget end can be promoted.
3. **Given** a chain of evals, **when** one ends on a usage limit, **then** the chain stops and says
   which evals did not run; evals never run in parallel.
4. **Given** a process the eval did not start is listening on one of the eval ports, **when** the
   eval starts, **then** it refuses with the port and the process, and does not reuse it.
5. **Given** an eval finished or was interrupted, **when** it cleans up, **then** every server it
   started is stopped together with its children, and the ports are checked free.

### US2 Small correctness fixes (R-36 part) — priority P2

1. **Given** a highlight that cites one or more radios or checkboxes, **when** the crop is made,
   **then** it contains each control's visible label (F-12@008).
2. **Given** an action stored with one decision (e.g. refused for depth), **when** it is issued
   again with another decision, **then** the stored decision and reason follow the latest one
   (F-05@004).
3. **Given** a BA record citing run A, **when** it is revised in a session over run B only, **then**
   the revision keeps run A's evidence links and adds run B's (F-16@004).

### US3 Crawler gaps with a known cause (R-35 part) — priority P2

1. **Given** the proving-ground shop cart with an item in it, **when** the crawler observes it,
   **then** the raw CMS key is recorded as the page shows it, and the LO-08 gate passes (LO-08).
2. **Given** a link or button that opens a pop-up window at a URL, **when** the crawler acts on it,
   **then** the pop-up is closed, the crawler carries on in the opener, and the pop-up's URL is
   queued so the run visits its screen (LO-27 part; a window written by script has no URL and
   stays a known gap, findings F-04).
3. **Given** a trace run of a process longer than the portal's map depth, **when** the agent follows
   it, **then** the depth budget does not cut it off; the trace is bounded by its own step budget
   (F-14@004).
4. **Given** the insurer S08 and bank S11 screens, **when** their reachability is analysed, **then**
   the finding records why the crawler never reaches them, and a clear-cut cause is fixed (F-19@015).

### US4 Large diagrams can be zoomed and moved (R-19) — priority P2

A BA reads a large state or process map in the dashboard.

1. **Given** any diagram in the dashboard, **when** the reader scrolls with the wheel or pinches,
   **then** it zooms around the pointer; dragging moves it.
2. **Given** a zoomed diagram, **when** the reader presses "fit" (or "reset"), **then** it returns to
   the whole diagram; buttons for zoom in and out are available without a wheel or touch.
3. **Given** a diagram re-drawn by a live update, **then** pan and zoom keep working on it.

### US5 Stale entries are closed (T074, R-47) — priority P3

1. **Given** the crawler code today, **when** the safety review pass runs, **then** it confirms (or
   lists as findings) that no browser action or portal request bypasses the action and request
   gates, that the crawler agent's tool list matches the lockdown test, and that no other server or
   agent file gives the crawler direct browser access (T074's static half; its live bypass-attempt
   run stays open).
2. **Given** the roadmap, **then** R-47 reads "paused", and R-19, R-35, R-36 and R-40 list only what
   remains after this feature.

## Edge cases

- A pop-up that never loads, or opens a page out of scope: the crawler records the refusal or
  timeout on the action and stays in the opener; an out-of-scope pop-up is closed without reading.
- Several pop-ups from one action: each is recorded, all are closed.
- A pop-up that closes itself before it is read: the action records that a window opened and closed.
- A highlight citing a radio whose label is far away (a table cell): the crop grows to the label,
  limited to the containing group; if no label is found, today's crop stays.
- An eval port held by a process the eval started earlier in the same chain: that one is allowed.
- A diagram smaller than its box: zoom still works; "fit" shows it at its natural size.
- A revision that cites a target already cited from an older run: both links stay (one per run).

## Functional requirements

- **FR-001** The pure eval tests run in the fast test tier.
- **FR-002** An agent run's outcome is classified as one of: success, budget end, API error, usage
  or rate limit; the classification has unit tests for each case and is stored per agent in the eval
  result. Only success and budget end are promotable.
- **FR-003** A chain of evals runs one eval at a time and stops on a usage or rate limit, naming the
  evals not run.
- **FR-004** An eval refuses to start while any of its ports (4010, 4100, 4101) is held by a process
  it did not start, naming the port and process.
- **FR-005** An eval's cleanup stops every server it started together with its child processes and
  verifies its ports are free, reporting any still held.
- **FR-006** A highlight crop includes the visible labels of cited radios and checkboxes.
- **FR-007** A re-issued action's stored decision and reason are the latest ones.
- **FR-008** A revised BA record carries over the previous revision's evidence links to runs outside
  the session.
- **FR-009** The LO-08 gate drives the shop to a cart with an item and passes.
- **FR-010** A pop-up window opened by an action at a URL is closed and its URL queued as a
  frontier item one level below the action's page; scope and robots checks apply to it like any
  page; the run continues in the opener. A trace only notes it.
- **FR-011** Trace runs are not refused for map depth; their step budget bounds them.
- **FR-012** The F-19 finding records why S08 and S11 are not reached; a clear-cut cause is fixed,
  anything else is moved to R-35 with the analysis.
- **FR-013** Every diagram in the dashboard can be zoomed (wheel, pinch, buttons), moved by
  dragging, and fit back; this survives live re-draws. No new third-party library.
- **FR-014** The static safety review of T074 is redone and its result recorded; T074's live
  bypass-attempt run with the crawler agent needs a session with the agent and stays open.
- **FR-015** The roadmap shows R-52 and the remaining scope of R-19, R-35, R-36 and R-40; R-47 reads
  paused.

## Key entities

- **Eval result**: gains an outcome per agent (crawler, BA).
- **Action**: its stored decision follows the latest issue.
- **Record revision**: inherits the previous revision's evidence links.
- **State reached by a pop-up**: an ordinary state, linked by a transition from the opening action.

## Success criteria

- **SC-001** The fast tier runs the eval check and comparison tests (seen in its output).
- **SC-002** Each of the four run outcomes has a passing unit test; a usage-limit outcome is never
  promoted.
- **SC-003** An eval started with a foreign server on 4010 refuses within a second and names it; after
  an eval no started server is left listening.
- **SC-004** The gate LO-08 changes from known gap to passing gate; a new gate (F-04@020) proves
  pop-ups with a URL are queued and visited; LO-27 (script-written window) stays a known gap.
- **SC-005** A trace of a process one step longer than the map depth reaches its goal (test).
- **SC-006** A radio-group highlight shows the labels in full (golden test on the proving ground).
- **SC-007** A large dashboard diagram can be read at 200 % zoom and fit back with one press.
- **SC-008** The roadmap's open list loses R-19 and R-40 and shrinks R-35 and R-36.

## Assumptions

- No owner decision is needed for any item; where a choice exists the default below is taken and
  listed in the close-out.
- **Pop-ups (LO-27)**: the pop-up's URL is read and its window closed; in map mode the crawler then
  opens that URL in its own tab (through the same gates as `navigate`), so the action's edge leads
  to the pop-up's screen, recorded like any page. The opener is reached again the usual way when
  the next action belongs to it (the crawler re-opens an action's page before acting). In a trace,
  the pop-up is only reported, since a trace must not leave its page. No new agent tool.
- **Trace depth (F-14)**: trace runs ignore `max_depth` (the finding's first fix idea); `max_steps`
  still bounds them. Map runs are unchanged.
- **Pan and zoom (R-19)**: a small script of our own over the rendered diagram's SVG (its
  `viewBox`), not a vendored library: the candidate (svg-pan-zoom) is unmaintained and the need is
  small. No new build step.
- **Radio/checkbox crops (F-12@008)**: the layout records only the control's own box, and its label
  is part of the control's accessible name, so the region's box is widened to the right by an
  estimate of the label's width from that name (bounded by the page); this works on the layouts
  already recorded. No re-capture.
- **Outside citations (F-16@004)**: links of the previous revision to runs outside the session are
  carried over; links to the session's own runs are what the BA sends (it may drop them).
- **Eval outcomes**: stored in the existing result file; no schema change to the crawl DB.
- Evals are not re-run to new baselines in this feature: the fixes do not change grading.

## Out of scope

- R-35: the frontier stopping rule for lists and pagination (F-17@015), parameter-only links as
  frontier items (F-08@019, goes with R-50), A/B variants per session (LO-35, needs a choice on how
  variants merge).
- R-36: LO-47 (client/server validation disagree), LO-48 (cascading fields), F-13@004 (lenient rule
  match; the finding says it needs a decision, and the R-47 LLM judge may replace the rule matcher).
- T059 and T073 (need a supervised live run), every must-have and to-discuss item.
