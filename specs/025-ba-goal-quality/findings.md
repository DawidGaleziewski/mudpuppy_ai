# Findings: spec 025 (R-39 BA goal quality)

Each finding has a test or eval idea (memory `log-every-bug-for-evals`).

## F-01 The grader ignored screen-region and page-visit evidence, 2026-10-14

- **What**: `loadEvalInput` gave no route for `screen_region` (spec 008) and `page_visit`
  (spec 019) links; rules citing only them never met their anchor screen. Rules 4 → 8/16 on the
  re-graded 2026-10-12 reference store once fixed (T001).
- **Cause**: evidence kinds added after the grader (spec 004) without a grader case.
- **Test**: `packages/docs/tests/evaluate-evidence-routes.test.ts`. Idea: a test that fails when
  `EvidenceTargetKind` gains a kind `routesFor` does not handle (or marks as routeless on purpose).

## F-02 The BA guidance quotes the reference portal's own rules (eval contamination), 2026-10-14

- **What**: `.claude/skills/ba-practice/references/business-rules.md` explains the rule types
  with the reference-insurer's ground-truth rules: "Rok produkcji" not earlier than 1990 (R03),
  "not eligible for AC" over 15 years (R07), the claim-free discount. The BA is graded on that
  portal, so its instructions contain answers. Not removed (owner decides; memory
  `dont-widen-removals`); the guidance added by T002 uses neutral examples.
- **Eval idea**: a check that no ground-truth label or claim marker appears in the BA's prompt
  or skills (string search in `evals/preflight`).

## F-03 Processes cannot score on a map-only eval, 2026-10-14

- **What**: see spec.md "Processes 0 %": the grader needs trace evidence, the suite never traces.
  Owner decision A/B/C.
- **Eval idea**: preflight warns when a ground truth has processes and the task has no trace.

## F-04 Measurement: reference-insurer, 2026-10-14 (T003)

| Run | Guidance | Rules | Constraints | Fields | Screens / terms | Processes | Refused writes | Cost |
|---|---|---|---|---|---|---|---|---|
| 2026-10-12 baseline (promoted) | before | 31.3 % | 83.7 % | 88.5 % | 100 / 100 | 0 | – | – |
| 2026-10-12 store re-graded (T001) | before | 50 % (8/16) | 100 % | 100 % | 100 / 100 | 0 | – | – |
| 2026-10-14T06-54 | v1 (FR-002/003 in pass 4) | 56.3 % (9/16) | 98 % | 100 % | 100 / 100 | 0 | 4 % | $3.94 |
| 2026-10-14T07-08 | v2 (+ synthesis check) | **68.8 % (11/16)** | 95.9 % | 100 % | 100 / 100 | 0 | 18 % | $4.06 |

- SC-001 met (re-grade 8/16, nothing else changed); SC-002 met (11/16 ≥ 10, no category below
  its tolerance, "No regression" both runs, 0 over-claims).
- Still missing in v2: R02 postcode format, R03 production-year range (still only data-item
  constraints), R05 engine factor (needs samples), R13 departure ≥ today, R16 (label not quoted).
  Two runs only; the BA varies by up to 25 points (spec 014), so the v1 → v2 step is indicative.
- Baseline not promoted (`--promote` is the owner's call; a promotion would also fix the grader
  change into the baseline).
- **Eval idea**: score the median of three BA runs (R-40 suggestion) before promoting.

## F-05 Refused relations rose in v2 (glossary term → screen), 2026-10-14

- **What**: run v2 had 21 of 116 writes refused (18 %, run v1 4 %): 10 × `glossary_term
  appears_on screen` (only `data_item appears_on screen` is allowed) and 4 × `business_rule
  depends_on open_question`. The BA retried without them; records were written. Not caused by
  the T002 text (it names no relation); BA run-to-run variance.
- **Next**: owner decision with R-51 (relation vocabulary): allow `glossary_term appears_on
  screen` (terms are seen on screens) or say "terms link to screens through data items" in
  `record-kinds.md`.
- **Eval idea**: `ba_relation_refused` tolerance in the eval checks.

## F-06 A test user's correct rule was flagged as an over-claim, 2026-10-14

- **What**: bank eval 2026-10-14T07-43 (persona `client`) reported 2 over-claims, a regression:
  `BR-003` documents the statement parameters (`typ`, `okres`, `tryb`) with a decision table, which
  matches R08/R09 (`guest_observable: false`, anchored on S14, actor `bank-client`). The record
  is right: a logged-in client sees S14.
- **Cause**: SC-009 counts every not-guest-observable rule documented as observed; it predates
  actors (spec 009 v2). F-01's fix let the record's page-visit evidence reach S14, so the match,
  and the flag, appeared.
- **Fix** (follow-up branch): a rule anchored on a screen of a non-guest actor is not counted as an
  over-claim (it must cite that screen to match). Re-graded: bank 0 over-claims, reference
  unchanged. Test in `evaluate.test.ts`.
- **Eval idea**: score such rules in a `logged_in_rules` category instead of only not flagging
  them (owner: part of the process/score decisions).

## F-07 Proving-ground evals with the v2 guidance, 2026-10-14

| Portal (persona) | Result | BA scores vs baseline | Crawl | Cost |
|---|---|---|---|---|
| bank (client) | `2026-10-14T07-43-42-635Z` | rules 100 = 100, terms 0 → 10, screens 50 =; over-claims 2 → 0 after F-06 | 92.3 % crawl screens, completed | $3.81 |
| insurer (client) | `2026-10-14T08-04-23-822Z` | terms 30 → 50, rules 0 =, screens 50 =; no regression | crawl screens 66.7 → 100 | $4.19 |
| shop (guest) | `2026-10-14T08-23-45-925Z` | rules 0 → 50, fields 33.3 → 73.3, screens 33.3 → 66.7, constraints 8.7 → 13 | crawler not completed, frontier not empty (budget; F-17@015, R-35) | $5.79 |

- The proving grounds have few guest-observable rules and field constraints the BA reaches; the
  insurer's rules stay 0 (its rules sit on screens the crawl reached; not analysed tonight).
- Shop's crawler regressions are the known frontier flood (R-35 decision), not the BA.

## Close-out review (code-reviewer, G-31), 2026-10-14

No guideline findings (evaluate.ts cases, the new fast-tier test, docs CLAUDE.md need no
update); checks green.

Follow-up branch (F-06): one finding, deferred: G-02/G-03 `evaluate()` is about 214 lines (limit
80), over the limit before this branch (+6 lines here). Split the evaluator into one helper per
category (`computeOverclaims`, process, rule, term matchers) as its own refactor (with the
R-39 process-scoring decision, which touches the same code).
