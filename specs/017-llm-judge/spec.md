# Feature Specification: LLM judge mechanism

**Feature Branch**: `feature/017-r47-llm-judge`

**Created**: 2026-10-10

**Status**: Mechanism built and merged (2026-10-11); calibration paused by the owner (T017, T022–T024 open)

**Roadmap**: R-47 (next, ahead of R-45; unblocks R-46)

**Input**: User description: "A model-based grader (G-33) that judges BA documentation records against
ground truth, following `learning/05-llm-as-judge.md`: one narrow question per call, pass/fail plus a
one-sentence reason, calibrated against the user's hand labels (dev/test split, TPR and TNR, three runs
for stability). Screens, fields and constraints stay code-graded." Refined by the user mid-spec
(2026-10-10): *"I would like to have the mechanism for making it. But I would like to implement the
[judges] by myself. You can implement one small one."*

## Clarifications

### Session 2026-10-11

- Q: Who builds what? → A: Claude builds the mechanism and one small example judge; the owner writes
  the real judges (rules first). "Deal."
- Q: Who labels the example judge's pairs? → A: The owner.
- Q: Which records does the rules judge see (looser than the code matcher)? → A: Deferred; the owner
  decides after labelling the example judge. Not blocking.
- Q: How is the model called, and isolated? → A: Light version: the Claude Code CLI on the owner's
  subscription, with a fresh config folder, an empty working folder and no tools; no container for now.
  The fresh config folder reuses the owner's existing login (a link to it, nothing else from their
  configuration), so the owner has nothing to set up; a separate long-lived token is the fallback only
  if that does not work.
- Best practices adopted from Anthropic's "Demystifying evals for AI agents": one isolated judge per
  dimension, an `unknown` answer, reason before verdict, calibration against human labels.

## Split of work

| Who | What |
| --- | --- |
| Claude | The **mechanism**: how a judge is declared, called, stored, wired into an eval trial and calibrated; how pairs are drawn from real eval outputs for labelling; the calibration report. Plus **one small example judge**, end to end, as the worked pattern. |
| The user | **The judges**: the question, pass/fail definitions and few-shot examples of each real judge (the rules judge first), the hand labels for each (about 40 pairs), and reading the disagreements. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Declare a judge and run it in an eval trial (Priority: P1)

The owner writes a new judge by adding one small declaration: which ground-truth category it judges,
the one-sentence question, what pass and fail mean, a few labelled examples, and how candidate records
are picked for each ground-truth item. Without touching the runner, the next eval trial asks the judge
about each (ground-truth item, candidate record) pair and stores every verdict with its reason next to the
code-graded scores.

**Why this priority**: it is the mechanism itself; without it there is nothing to calibrate or extend,
and R-46 stays paused.

**Independent Test**: with the example judge declared, run one eval trial on the reference portal; the
result contains, per ground-truth item of that category, the candidate records, each with a pass/fail and
a reason, and a judge score next to the unchanged code score.

**Acceptance Scenarios**:

1. **Given** a declared judge and a finished BA run, **When** the eval grades the trial, **Then** each
   (item, candidate) pair gets exactly one verdict (`pass` or `fail`) and a non-empty reason, and the
   item counts as covered by the judge when at least one candidate passes.
2. **Given** a category graded by both code and a judge, **When** the result is written, **Then** both
   scores appear side by side and the code score is identical to what it was before this feature.
3. **Given** the judge returns something that is not a valid verdict, **When** the pair is graded,
   **Then** the pair is recorded as an error with the raw answer, not as pass or fail, and the trial
   still finishes.
4. **Given** the owner runs an eval with judges switched off, **When** the trial is graded, **Then** no
   model call is made and the result is the same as today.

---

### User Story 2 - Draw pairs for labelling (Priority: P1)

The owner asks for a labelling set for a judge. The mechanism takes the pairs that judge would see from
one or more stored eval outputs, writes them to a label file with an empty verdict and reason per pair,
and assigns each pair to `dev` or `test`. The owner fills in pass/fail and one sentence each.

**Why this priority**: labels are what makes a judge trustworthy; the owner cannot write them without a
convenient set of real pairs.

**Independent Test**: on a stored reference-portal eval output, drawing pairs for the example judge
produces a label file the owner can fill in by hand, with the rule/item text and the record content
readable without opening the database.

**Acceptance Scenarios**:

1. **Given** stored eval outputs, **When** pairs are drawn for a judge, **Then** the label file lists each
   pair once with the item text, the record key and revision and the record's readable content, an empty
   verdict and reason, and a `dev`/`test` split of about half each.
2. **Given** a label file already partly filled in, **When** pairs are drawn again, **Then** existing
   labels are kept and only new pairs are added.
3. **Given** fewer candidate pairs than requested, **When** pairs are drawn, **Then** the file holds what
   exists and says how many more the owner needs to find (e.g. from another run).

---

### User Story 3 - Calibrate a judge against the labels (Priority: P1)

The owner runs calibration for a judge on its `dev` labels, reads every disagreement with the judge's
reason, improves the judge's wording or a label, and repeats. When satisfied, they run it once on `test`.
The report gives the agreement table, the true-positive rate (TPR) and the true-negative rate (TNR), and
the stability over three runs.

**Why this priority**: an uncalibrated judge adds noise; this is the part `learning/05` calls "the whole
difference".

**Independent Test**: with the example judge's labels, run calibration on `dev`; the report lists TPR,
TNR, the 2×2 table, every disagreement with both reasons, and the share of pairs whose verdict flipped
across three runs.

**Acceptance Scenarios**:

1. **Given** a labelled `dev` set, **When** calibration runs, **Then** each pair is judged three times and
   the report gives TPR, TNR, the 2×2 table on the majority verdict, the flip rate, and each disagreement
   with the owner's reason and the judge's reason.
2. **Given** the `test` split, **When** calibration runs on it, **Then** the run is recorded with the
   judge's wording version, so a later run on `test` with changed wording is reported as such (the test
   set is meant to be used once per wording).
3. **Given** a judge whose `test` TPR or TNR is below the bar (90 %), **When** an eval trial uses it,
   **Then** its score is marked as uncalibrated in the result.

---

### User Story 4 - One small example judge (Priority: P2)

Claude builds one small judge end to end with the mechanism, as the pattern the owner copies for the
rules judge: declaration, candidate picking, drawn labels, calibration report.

**Why this priority**: proves the mechanism on a real category and gives the owner a worked example;
the real judges are the owner's.

**Independent Test**: the example judge runs in a reference-portal trial and has a calibration report.

**Acceptance Scenarios**:

1. **Given** the example judge, **When** a reference-portal trial is graded, **Then** its verdicts and
   score appear in the result.
2. **Given** the example judge's label set, **When** it is calibrated, **Then** the report exists and its
   numbers are written in the spec findings, whatever they are.

### Edge Cases

- A ground-truth item has no candidate records: it is not covered, and no model call is made.
- A ground-truth item has many candidates (more than a set cap): the cap is applied in a stable order
  and the result says how many were skipped.
- The model is unavailable or the call fails or times out: the pair is an error, retried once, the trial
  still finishes and the result counts errors separately.
- A record was revised between the eval output and labelling: the label file pins the record revision;
  a pair whose revision no longer exists is reported, not silently re-judged.
- A label is missing a verdict or reason: calibration skips the pair and lists it.
- The portal content is from a live or client site: the judge sends record content to the model; the
  same rules as the agents already running on that content apply (no extra provider).
- Token cost: each trial reports the judge's calls and tokens, like the agent cost today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A judge MUST be declared in one place per judge with: an id, the ground-truth category, one
  narrow yes/no question, definitions of pass and fail, 0–5 labelled few-shot examples, and a candidate
  selector. Adding a judge MUST NOT require changes to the runner, the result writer or calibration.
- **FR-002**: The candidate selector MUST be code (deterministic): for each ground-truth item it picks the
  records the judge sees. The default selector for rule-like categories MUST be looser than the code
  matcher, so the judge can find records the code matcher misses (see Assumptions).
- **FR-003**: Each judge call MUST cover exactly one (ground-truth item, record) pair and MUST return a
  one-sentence reason followed by a verdict of `pass`, `fail` or `unknown` (not enough information), in
  a fixed, machine-checkable shape. `unknown` counts as not covered and is reported separately.
- **FR-004**: The judge instructions MUST tell the model to fail when the record does not clearly state
  the item (leniency defence) and MUST NOT ask for a scale or a comparison between records. The judge
  MUST see only the ground-truth item and the record, never the code score or the agent's transcript.
- **FR-005**: Judge calls MUST use no tools, no agents and no MCP servers, MUST run on the owner's Claude
  subscription, and MUST be isolated from the owner's and the project's Claude configuration: no user or
  project instructions, rules, memory, skills, agents, hooks or plugins, no default Claude Code system
  prompt, no saved session. The judge's own instructions are its whole system prompt.
- **FR-005a**: An isolation check MUST make one real judge call and fail when anything from FR-005 is
  loaded (tools, MCP servers, plugins, skills, agents). It is run by hand or before calibration, not in
  the deterministic test tiers.
- **FR-005b**: Every verdict and calibration report MUST record the model and the Claude Code version
  used, so a version change is visible.
- **FR-006**: An eval trial MUST run the declared judges after the code grading when judges are on, and
  MUST store every verdict with its reason, the record key and revision, the judge id and its wording
  version, and a per-judge score (covered / total) next to the code scores. Judges MUST be switchable
  off for a trial.
- **FR-007**: The code-graded scores MUST NOT change because of this feature.
- **FR-008**: Pairs that error (invalid answer, failed or timed-out call) MUST be retried once, then
  stored as errors with the raw answer and counted separately; they MUST NOT count as pass or fail.
- **FR-009**: The mechanism MUST draw labelling pairs for a judge from stored eval outputs into one label
  file per judge, in YAML (G-34), with item text, record key, revision and readable content, an empty
  verdict and reason, and a dev/test split. Re-drawing MUST keep existing labels.
- **FR-010**: Calibration MUST judge each labelled pair of the chosen split three times and report the
  2×2 table and TPR/TNR on the majority verdict, the flip rate, and every disagreement with both reasons.
  Reports MUST be stored with the date, judge id, wording version and split.
- **FR-011**: A judge MUST count as calibrated only when its latest `test` report for the current wording
  shows TPR ≥ 90 % and TNR ≥ 90 %; otherwise its trial scores MUST be marked uncalibrated.
- **FR-012**: Each trial MUST report the judge's model calls and tokens with the existing cost report.
- **FR-013**: Claude MUST deliver exactly one small example judge built with the mechanism, with its
  label set and calibration report. All other judges (the rules judge first) are the owner's.
- **FR-014**: The eval README and the `create-eval` skill MUST describe how to add a judge, draw labels
  and calibrate, in G-33 terms.

### Key Entities

- **Judge**: a model-based grader for one ground-truth category: id, question, pass/fail definitions,
  few-shot examples, candidate selector, wording version.
- **Pair**: one ground-truth item and one candidate record (key and revision).
- **Verdict**: pass, fail, unknown or error for one pair, with a reason, judge id, wording version,
  model and Claude Code version.
- **Label**: the owner's pass/fail and one-sentence reason for a pair, with its split (dev/test).
- **Calibration report**: one run of a judge on one split: 2×2 table, TPR, TNR, flip rate,
  disagreements, date, wording version.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The owner adds a second judge by writing only its declaration, one line in the judge
  list, and its labels; no other file changes, shown when the owner writes the rules judge.
- **SC-002**: With judges off, an eval trial's result equals today's for every task (code scores, cost,
  checks).
- **SC-003**: With the example judge on, a reference-portal trial stores a verdict and reason for 100 %
  of its pairs (errors counted, none silently dropped).
- **SC-004**: Drawing pairs for labelling and running calibration on 20 pairs × 3 runs each takes one
  command each and finishes in under 10 minutes.
- **SC-005**: The example judge has a stored `test` calibration report with TPR, TNR and flip rate; the
  numbers are written down whether or not they meet the 90 % bar.
- **SC-006**: The owner can resume R-46 (evals for existing bugs) using judges, confirmed by the owner.
- **SC-007**: The isolation check passes on the owner's machine: one judge call loads no tools, MCP
  servers, plugins, skills or agents.

## Assumptions

- **Example judge**: glossary terms. First built as "does this glossary record name the same portal
  term as the ground-truth term?" (the `learning/05` case "Autocasco" vs "Autocasco (AC)"); changed
  by the owner on 2026-10-11 (option B, F-08) to "does this glossary record define the ground-truth
  term with the meaning the portal gives it?", with the portal's own definition (`meaning`, from
  /slowniczek) added to each ground-truth term. It is small, its pairs are short, and it leaves the
  rules judge to the owner.
- **Labels**: the owner labels the example judge's pairs too (decided 2026-10-11), as the learning plan
  keeps labelling theirs.
- **Candidate selector for rules (when the owner writes it)**: deferred by the owner until after they
  label the example judge (2026-10-11). Open option: business rule and requirement records citing the
  rule's anchor screen, without the label and marker filter the code matcher uses (otherwise the judge
  could only remove false passes, never find false fails). It does not block this item: the mechanism
  takes any selector, and the example judge has its own.
- **Calling the model (decided 2026-10-11, light version)**: the judge is called through the Claude
  Code CLI already used by the eval harness, on the owner's subscription (no API key, no extra agent, no
  second provider). Cross-checking with another provider and running in a container are out of scope
  (container: later, only if the isolation check finds a leak).
- The default model is Sonnet; a judge declaration may name another.
- Over-claims and processes stay code-graded in this item; a judge for them is the owner's choice later.
- Judges run on the reference portal and proving-ground tasks; live-site tasks may use them, under the
  same content rules as their agents.
- Judges are not part of the deterministic test tiers (they are evals, not gates or tests); the
  mechanism's own code (selectors, parsing, TPR/TNR maths, label file handling) is unit-tested without
  model calls.
