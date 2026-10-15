# Spec 025: BA goal quality (R-39)

Roadmap R-39 (must have, the user 2026-10-08): find why processes are never matched and raise
rules on the eval baselines. Overnight run 2026-10-14, autonomous (memory
`autonomous-overnight-work`): decision-free parts built, decisions proposed to the owner.

## Investigation (reference-insurer eval of 2026-10-12, store re-graded)

Baseline: screens 17/17, fields 26/26, constraints 49/49, terms 10/10, **rules 4/16**,
**processes 0/5**.

### Processes 0 % — the eval cannot score them (no BA defect)

The BA wrote five process records: four match the ground truth's guest processes, and the fifth
documents login instead of P05 (renewal behind a login). All are `observed_extent: map_only` and
cite map edges. The grader (`evaluate.ts`, spec 004 research §16) matches a process only through
**trace** evidence (`process` / `process_step` links covering the first and last routes) or a
boundary flag. The eval suite runs one guest **map** run per portal and never a trace, so the
score is 0 by construction on every portal.

Owner decision (not built): (A) the eval also traces the ground truth's processes (one crawler
trace per process: cost and time per eval grow), (B) the grader also accepts a `map_only`
process whose cited edges cover the first and last routes, reported as its own score
(`processes_map`) so the trace-based score keeps its meaning, or (C) both.

### Rules 4/16 → 8/16 — a grader bug (fixed here)

`loadEvalInput` resolved evidence to routes for state, form, action, edge, network call, rule
candidate, open question, process and process step, but not for `screen_region` (spec 008) or
`page_visit` (spec 019): both gave no route, so a rule citing only them never met its anchor
screen. Fixed: both resolve to their state's route. Re-graded, the same store scores rules 8/16
(R04, R06, R09, R14 now match), nothing else changes.

### The other 8 rules

| Rule | Why missed | Where it can be fixed |
|---|---|---|
| R02 postcode NN-NNN, R03 year 1990–now, R12 max 90 days, R13 departure ≥ today | the BA recorded them only as data-item constraints, never as a `business_rule` | BA guidance (FR-002) |
| R07 AC only < 15 years, R16 two different products | right rule, right screen, but the statement does not quote the anchor label ("OC + Autocasco (AC)", "Drugi produkt") | BA guidance (FR-003); lexical matcher limit, the R-47 rules judge is the long-term fix |
| R05 engine factor table | one sample only: the coefficients need more runs or a trace | crawler coverage (trace / variants), not the BA |
| R15 phone or e-mail | visible only when submitting the contact form without both | a trace with invalid input (R-36 area) |

## Requirements

- **FR-001** The grader resolves `screen_region` and `page_visit` evidence to their state's route.
- **FR-002** BA guidance: a business limit on a field (range, format, date order, maximum
  duration) is documented as a `business_rule` (`constraint`) citing the field's screen region,
  in addition to the data item's constraints.
- **FR-003** BA guidance: a rule's statement names the control it constrains by its exact label,
  quoted verbatim (as `name_verbatim` does for data items).
- **FR-004** Measure on the reference-insurer eval (two runs: the BA varies by up to 25 points)
  and record the result next to the re-graded baseline.

## Success criteria

- **SC-001** Re-grading the 2026-10-12 store: rules 8/16 with no other score change.
- **SC-002** Reference eval with FR-002/FR-003: rules ≥ 10/16 in at least one of two runs, no
  other category drops by more than the spec 014 tolerances.

## Out of scope (owner)

Process scoring (A/B/C above); loosening the rule matcher (R-47 judge); R05/R15 need crawler
traces.

## Round 2: process scoring (owner decisions 2026-10-14)

The owner chose **C (both)** for processes, and **neutral examples** for the contaminated rule
guidance (F-02). Branch `feature/025-r39-process-scoring`.

- **FR-005** (B) The grader adds a `processes_map` category beside `processes`: a ground-truth
  process matches a `process` record whose cited evidence of any kind (screens, edges, forms…)
  covers its first and last observable routes, or one that `processes` already matches. Scored
  whenever the ground truth has processes; default minimum 80 %. `processes` keeps its meaning
  (trace evidence or a boundary flag).
- **FR-006** (A) A map task may list `processTraces` (tasks.ts): after the map run the eval runs
  one crawler trace per entry (guest persona only), then the BA documents from the map run and
  every trace run. `--no-process-traces` skips them. The result records the trace runs, their
  outcomes and, as the condition `process_traces`, how many ran; the baseline comparison warns
  when that differs. Each trace's steps are scored as `process_trace_steps` (summed) and
  `process_traces_goal_reached` (count).
- **FR-007** reference-insurer lists P01–P04 (the guest processes; P05 is behind a login and
  scores through its boundary flag).
- **FR-008** `business-rules.md`: the R03 and R07 examples become neutral ones from a domain no
  eval portal has (a library). The other reference quotes in the BA guidance go to the owner
  (F-08).
- **FR-009** Measure one reference-insurer trial with traces; the baseline is not promoted
  (conditions changed, owner decision F-04 open).

- **SC-003** On the 2026-10-14T07-08 store (map only), `processes_map` ≥ 4/5 with `processes`
  unchanged at 0/5.
- **SC-004** A trial with traces scores `processes` ≥ 3/5.

- **FR-010** (after F-11) BA guidance: pass 5 writes a data item for every field of every form,
  checkboxes, selects and login fields included, also when a rule or process covers it; pass 7
  counts each form's fields against the data items. Measured by a second trial with traces.

## Round 3: split BA sessions, neutral guidance, new baseline (owner decisions 2026-10-14 evening)

- **FR-011** (F-12 c) A trial with process traces runs the BA twice: first over the map run with
  the map-only prompt (unchanged, so its scores compare with map-only baselines), then a second
  session over the trace runs only that writes `process` and `use_case` records and nothing else.
  The result records both sessions; `ba_session_completed` needs both completed.
- **FR-012** (F-08) The remaining reference-portal quotes in the BA guidance (`ba-practice`
  SKILL.md and references) become neutral examples from a domain no suite portal uses.
- **FR-013** (F-04) After FR-011 and FR-012, promote a reference-insurer trial with traces as the
  new baseline (`--promote`), with the scores and conditions written in the findings.

- **SC-005** A trial with split sessions scores `processes` ≥ 3/5 and its map-session categories
  (rules, fields, constraints, terms) within the old map-only baseline's tolerances.
- **SC-006** A string search of the `ba-practice` skill and `ba.md` finds none of the reference
  ground truth's rule anchor labels, graded terms or routes.

## Round 4: proving-ground quotes, relations to screens (owner decisions 2026-10-15)

On branch `feature/028-r51-r39-r33-relations-access` with R-51 (spec 028) and R-33 P2.

- **FR-014** (F-13) The URL section of `ba-practice` SKILL.md quotes no proving-ground route,
  parameter or label: legacy-shaped examples from the library domain instead (an `.asp` URL
  redirected to a hash route, a layout parameter, two parameters that matter together, a parameter
  carried along, a button without a role).
- **FR-015** (F-15, F-05) Measure the R-51 relations: one reference-insurer trial with split
  sessions on the branch.
- **SC-007** SC-006's search, widened to every suite ground truth (reference, proving-ground
  insurer, bank, shop, wikipedia), finds only generic words (CAPTCHA, E-mail, Model, "old URL").
- **SC-008** The FR-015 trial has no `glossary_term appears_on screen` or `process … screen`
  refusal and no category below the 2026-10-14 baseline's tolerances.
