# Spec 032: Every state of a form — same-URL steps, form probes, owner-reviewed suite (R-69 (1)–(3))

Branch `feature/032-r69-form-states-and-map-graph` · Created 2026-10-16 · Status: done (merged 2026-10-17)
2026-10-17, waiting for the owner's answers (`session_dump/`) before close-out and merge

**Input**: the owner, 2026-10-16 (`user_input/graph_handler/1_readme.md`): "When we do multiple runs
for map … we will for example only go through a form but not record nothing beyond happy path. The
map won't try to i.e. enter wrong data, use different radio buttons etc. … Some actions (like radio
button) may push us in completely different process. Also validation is an important part of such
legacy forms. And we do not record that. We also do not record technical issues. Once recording
happy path we should try i.e. blocking a http request and recording what happens (error page)."
Sources: roadmap row R-69 (1)–(3); the owner's design package
`user_input/graph_handler/mudpuppy-salvage-yard (2).zip`, `docs/11-map-runs.md` §1 (terms), §3
(form probing), §3.5, §9 (probe, outcome rows), FE-M04, FE-M05, FE-M06, FE-M13; screen
`13-screen-states`. Where the design and the owner's answers differ, the answers win.

## Owner decisions (2026-10-16, decided, not open)

| Id | Decision |
|---|---|
| D-1 | Form probes are a catalogue of repeatable tries per control, in the style of the fix plugins: written once, tested, parametrised per portal. The crawler runs them in map runs **after** the happy path and tags each resulting state with its probe |
| D-2 | After the scan the BA proposes a full probe suite per form; **the owner reviews it in Review before it runs**; it runs as R-64 `traces.yaml` variants (deterministic, no LLM choices) |
| O-M1 | Technical probes (block a request, answer it with HTTP 500, delay it, go offline) are **simulated in the crawler's own browser**, never sent to the server, and run **wherever the environment's action limit allows submitting forms, production included**. This overrides the design's "off on production by default". Submitting probes respect the environment's action limit and the safety classes |
| O-M2 | A captcha or one-time code makes the outcome `blocked`; the run moves on, it never asks mid-run |
| O-M3 | Valid test data lives in the persona (`test_data` section, Settings ▸ Personas). A missing value is asked for once in chat, the way credentials are |
| O-M4 | Budget: at most **12 probes per form step and 60 per run**, both overridable in the portal file |
| O-M5 | Recheck runs need no approval (they only look). Recheck itself belongs to the later branch |
| D-3 | (2026-10-17, answer to question 3) Probing runs **only when asked**: "we should try to map the portal first and see what it has. Once we have it marked we can then start probing it." Things to probe are marked in a special colour (design: the marker tag of a person's mark), screens whose probes are missing show it, and each form step may be marked for probing (US5) |
| Scope | This spec covers R-69 (1)–(3). R-69 (4) BA reconciliation, R-69 (5) the graph page with marks, and R-66 (replay, resume, retry path) go on a second branch |

## Problem

A map run walks a form along its happy path only. Three things are lost:

1. **Steps on one URL.** A React multi-step form renders step 1, 2 and 3 on the same URL. The state
   fingerprint is the route template plus a structural similarity cluster. Steps that share most of
   their layout, and a step with an error message added, can land in one state. Then they are never
   seen as separate states.
2. **Everything off the happy path.** Wrong data, empty required fields, other radio options and
   technical failures are never tried. On legacy forms validation is a core part of the behaviour.
   One radio option can lead into a different process.
3. **No repeatable suite.** What one map run happened to try cannot be run again the same way.

## User stories

### US1 Same-URL form steps and error states are separate states (R-69 (1), FE-M04) — P1

A spike first answers how a same-URL step, and the same step showing validation errors, are told
apart from each other and from a mere content change. R-50 (screen identity) is input to it, not
decided by it. The chosen rule is then built.

1. **Given** a three-step form rendered on one URL, **when** a map run walks it, **then** three
   states are recorded, numbered per route ("step 1", "step 2", "step 3"), each with its own
   evidence.
2. **Given** step 2 shown with validation messages after a refused submit, **then** that is a
   separate state of step 2 (kind `validation`), not a new step and not merged into step 2.
3. **Given** a listing page that differs only by item content between visits, **then** it still
   merges as today (no growth in states on existing gates and reference stores beyond the cases
   above).
4. The spike's result (the signals tried, which worked, the cases that stay ambiguous) is written
   to `specs/032-form-states-probes/research.md` before the rule is built.

### US2 The crawler probes each form step after the happy path (R-69 (2), FE-M05, FE-M06) — P1

1. **Given** a form step reached on the happy path, **when** the map run is in a probing phase,
   **then** the crawler can try probes from the catalogue on that step: all required fields empty;
   each required field empty, one at a time; wrong format per typed field (e-mail, date, number,
   postal code, pattern); boundaries (max length + 1, below min, above max); each option of a
   radio, select or checkbox that changes visible fields or the next state (`branch`, explored one
   level, deeper within budget); block the request the step sends; answer it with HTTP 500; delay
   it 30 s; go offline at submit.
2. **Then** every resulting state is recorded with its evidence (screenshot, network, messages),
   tagged with the probe and an **outcome kind**: `next`, `branch`, `validation`, `technical`,
   `temporary` or `blocked`. Outcomes that reach a state already recorded reuse it (deduplicated by
   fingerprint).
3. **Given** a validation outcome, **then** each message is recorded with the field it attaches to,
   including browser-native messages.
4. **Given** a branch outcome that leads to a screen not seen before, **then** it is flagged
   "possible new process".
5. **Given** an environment whose action limit does not allow submitting forms, **then** no probe
   that submits runs, and technical probes do not run either (O-M1). **Given** an action whose
   safety class is not allowed, **then** it is recorded as `blocked`, never probed.
6. **Given** a captcha or a one-time code on the step, **then** the outcome is `blocked` and the run
   continues (O-M2).
7. **Given** the budget (12 per step, 60 per run, or the portal file's values), **then** the crawler
   never exceeds it, and the run summary lists the probes it skipped for budget.
8. **Given** the happy path needs a value (a valid postal code, a policy number), **then** it comes
   from the persona's `test_data`; a missing value is asked for once in chat (O-M3).
9. Each probe in the catalogue is defined once, with a summary, its parameters and a scar or
   proving-ground case that proves it, the way fix plugins are.

### US3 The BA proposes a probe suite, the owner reviews it, it runs deterministically (R-69 (3)) — P2

1. **Given** a finished map run with form steps, **when** the BA documents the portal, **then** it
   proposes one probe suite per form: the list of variants (probe, step, inputs, expected outcome
   kind), built from what the run recorded.
2. **Given** a proposed suite, **then** it appears in Review as an open item, and **it does not run
   until the owner approves it**. Before approving, the owner can drop variants, change what each
   expects, edit their steps (values, dropped and added steps) and add variants copied from
   others (owner answer 2026-10-17); Save keeps the suite open.
3. **Given** an approved suite, **then** it is written as variants of that form's trace in
   `portals/<id>/traces.yaml`, and the trace driver runs one run per variant with no LLM choices.
   The runs are tagged so they group with their trace (R-64).
4. **Given** the same approved suite run twice against an unchanged portal, **then** each variant
   gives the same outcome kind both times.

### US4 Probe outcomes reach the documentation as candidates (FE-M13) — P2

1. **Given** probe outcomes in a run, **when** the BA documents the form, **then** validation
   messages become business-rule candidates, branches become process-variant candidates, and
   technical states become error-handling / NFR candidates. All are marked inferred, need
   confirmation, and cite the outcome evidence.
2. **Given** a step for which only technical or temporary outcomes were ever observed, **then** the
   step is not documented as an error page (design §7.5 rule 3, the part needed before R-69 (4)).

### US5 Probing only when asked: Probe marks and a "Probe forms" scan (D-3, FE-M03 and FE-M10 in part) — P1

1. **Given** a map scan, **then** the crawler presses each form's submit or Next once with test
   values (the happy path) and never probes; `probe_form` in a plain scan is refused
   (`PROBE_NOT_ASKED`).
2. **Given** a form step recorded on a screen, **when** the BA presses "Mark for probing" on that
   screen's page, **then** the step carries a **Probe** mark (the marker tag of a person's mark,
   colour guide "A person marked a map node for the next scan"). It stays until a probe scan has
   probed the step, or until the BA removes it.
3. **Given** the Screens list, **then** every form step shows whether it is marked for probing,
   probed (with the number of outcomes) or not probed yet; the page head counts them.
4. **Given** Probe marks on a portal, **when** the BA asks the assistant to probe the marked forms,
   **then** a "Probe forms" scan starts: the crawler goes to each marked step (opening its page and
   pressing on with test values), probes it, and finishes without draining the frontier. A probe
   scan with no marks is refused before it starts and names what to do.
5. **Given** a probe scan, **then** `probe_form` on a step that is not marked is refused
   (`STEP_NOT_MARKED`); a marked step that was probed to the end (or came out `blocked`) has its
   mark used by that run.
6. The mark is stored in the shape the design's `mark` entity has (kind, target, by, used by
   run), so R-69 (5) and R-66 add the other kinds (Start here, Focus, Retry, Recheck, Skip) without
   a new table.

## Requirements

- **FR-001** A same-URL step and a validation state of a step are recorded as separate states,
  using the rule chosen in the spike (US1).
- **FR-002** States on one route carry a step number. States off the happy path carry their kind
  (`validation`, `technical`, …).
- **FR-003** A probe catalogue exists, with each probe defined once and parametrised (US2.9).
- **FR-004** The crawler runs probes only after the happy path of that step, in probe scans
  (FR-014), within
  the per-step and per-run budget from the portal file (defaults 12 and 60).
- **FR-005** Every probe outcome is recorded with the probe, the outcome kind, the resulting
  state, the messages with their fields, the HTTP status where there is one, and the evidence.
- **FR-006** Technical probes are browser-side simulations only, and run wherever the environment
  allows submitting forms, production included. Submitting probes obey the action limit and the
  safety classes.
- **FR-007** Captchas and one-time codes give `blocked` without stopping the run.
- **FR-008** Personas hold an optional `test_data` section (the former `trace_inputs`, renamed
  everywhere by the owner's answer of 2026-10-17). A missing value is requested once in chat and
  kept (`save_test_data`).
- **FR-009** The BA proposes one probe suite per form after a scan. It waits in Review until the
  owner approves it, and an approved suite becomes trace variants.
- **FR-010** Approved suites run deterministically through the trace driver, one run per variant,
  grouped with the trace.
- **FR-011** Probe outcomes give the BA inferred rule, process-variant and NFR candidates linked
  to evidence. An error-only step is never documented as the step.
- **FR-012** Persisted structure added for this (probe, outcome kind, step number, suite) goes
  through db-admin, with a reversible migration and the data-model docs kept in sync.
- **FR-014** Map scans never probe. Probing happens only in a "Probe forms" scan, and only on
  form steps a person marked for probing (D-3, US5).
- **FR-015** A Probe mark is kept per portal and form step until a probe scan uses it or a
  person removes it. The dashboard shows it as the marker tag of a person's mark; it only reads,
  and the chat service writes the mark.
- **FR-016** The Screens list and the screen page show each form step's probe coverage: marked,
  probed (outcome count) or not probed.
- **FR-013** Before any dashboard UI task, the `mudpuppy-salvage-ui` skill is refreshed from the
  owner's package (it lacks `10-processes.md` and `11-map-runs.md`; its 02–09 are older).

## Success criteria

- **SC-001** On a proving-ground form with three steps on one URL, a map run records three step
  states plus at least one validation state per step that has required fields. Every existing gate
  stays green.
- **SC-002** On that form, a probing run records at least one outcome of each kind `validation`,
  `branch` and `technical`, each with evidence and its probe. No run exceeds its budget.
- **SC-003** With an action limit that does not allow submitting, zero submitting or technical
  probes run (gate).
- **SC-004** An approved suite run twice gives the same outcome kind per variant both times. An
  unapproved suite never runs.
- **SC-005** The reference BA, run on the probing run, produces at least one rule candidate from a
  validation message and one variant candidate from a branch. Both cite outcome evidence, and no
  step is documented as an error page.

## Key entities

- **Probe**: a defined variation of an action (kind, target field or request, parameters).
- **Outcome**: what one action or probe produced: resulting state, outcome kind, probe, messages,
  HTTP status, evidence, run.
- **Step state**: a state with its route, step number and kind (`main`, `validation`,
  `technical`, …).
- **Probe suite**: the BA's proposal per form (variants of probe, step, inputs and expected
  outcome kind), with a review status. Approved, it is written to `traces.yaml`.
- **Persona test data**: named valid values per persona.

## Edge cases

- A radio option that opens a different process: explore one level, flag it, and do not follow it
  further than the budget allows.
- A probe whose submit actually succeeds (the server accepts wrong data): record `next` with the
  probe tag. That is a finding for the BA, not an error.
- A technical probe that changes nothing visible: record `technical` with "no visible reaction".
- A form that changes between the happy path and the probes (a session that expired): the outcome
  is `temporary`, not `validation`.
- A step reached only once, by a path that cannot be repeated in the same run: the probes for it
  are skipped and listed. Reaching it again by replay is R-66.
- Browser-native validation messages that are never in the DOM text: they are read and recorded
  all the same (design §3.3: "Zaznacz jedną z tych opcji.").

## Assumptions

- The crawler stays one non-deterministic LLM agent. The catalogue, the probe execution and the
  recording are deterministic tools it calls. It chooses which probes to try within the budget,
  and the suite run is the deterministic path.
- Probes are tried from the point the happy path reached in the same run. Starting a probe from a
  checkpoint by replay is R-66.
- The proving ground gets the forms the gates need (steps on one URL, browser-native validation, a
  branching radio, a request that can be blocked).
- R-50 stays open. The spike may propose an identity signal for form steps, but it does not decide
  URL-parameter identity.
- Token cost of probing found here goes to R-24, not fixed in place.
- No dashboard graph in this spec. Review gets the suite item, and the screen-states view (screen
  13) is limited to what reviewing a suite needs.
