# Implementation Plan: LLM judge mechanism

**Branch**: `feature/017-r47-llm-judge` | **Date**: 2026-10-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/017-llm-judge/spec.md`

## Summary

A model-based grader mechanism (G-33) for the evaluation harness: a judge is a declaration
(question, pass/fail, few-shot examples, a code selector of (ground-truth item, record) pairs);
the runner asks headless Claude one pair per call, isolated from the owner's and the project's
configuration, and stores each verdict with its reason beside, not inside, the code scores.
Around it: a pair drawer that writes YAML label files for the owner, a calibration command
(3 runs, TPR/TNR, flip rate, disagreements), an isolation check, and one small example judge
(glossary terms). The real judges, starting with rules, are the owner's (research R6, R11).

## Technical Context

**Language/Version**: TypeScript (strict), Node 22+ (owner's machine: Node 24), run with `tsx`

**Primary Dependencies**: Claude Code CLI 2.1.288 (`claude -p`, existing); `zod`, `yaml` (added
to `apps/crawler` devDependencies; both already used in the workspace); `@pathfinder/docs`
(`loadEvalInput`, `EvalRecord`, `normalise`, `readGroundTruth`), `@pathfinder/store`,
`@pathfinder/gates` (`EvalResult`)

**Storage**: no DB change. Label files `apps/crawler/evals/graders/human/labels/<judge>.yaml`
(committed; moved there in T029 to follow the create-eval skill);
calibration and store reports `data/evals/judges/<judge>/*.json`; trial results gain `judges`
and `workspace` (`data/evals/<portal>/*.json`)

**Testing**: Vitest, `repo` project (`evals/tests/`), fast tier, no model calls; `packages/gates`
tests for the `EvalResult` change (slow tier before that commit, CLAUDE.md)

**Target Platform**: the owner's Linux/WSL2 machine, subscription login

**Project Type**: evaluation harness inside `apps/crawler` (operator CLI scripts)

**Performance Goals**: 20 pairs × 3 runs calibrated in < 10 min (SC-004): 4 calls in parallel,
~5 s each

**Constraints**: no API key; no tools/MCP/user or project config in judge calls (FR-005); code
scores and their comparison unchanged (FR-007); judges never in `pnpm test`

**Scale/Scope**: ~10–40 pairs per judge per portal; one example judge; ~12 new source files,
each well under G-01/G-02 limits

## Constitution Check

| Principle | Status | Note |
| --- | --- | --- |
| I. Observed vs intent | n/a | grades documentation, records nothing in it |
| II. Evidence and traceability | pass | every verdict keeps pair id (record key + revision), reason, judge version, model, CLI version |
| III. Role separation | pass | the judge is a grader, not an agent; it never writes records; the BA and crawler are untouched |
| IV. Replay before promotion | n/a | |
| V. Safety-first exploration | pass | no browsing; record content goes only to the model the agents already use (same subscription) |
| VI. Human in the loop | pass | the owner's labels are the reference; a judge counts only once calibrated against them |
| VII. Deterministic core | pass, see R12 | `evaluate()` and the code scores stay deterministic and remain the regression gate; the judge is an eval grader in the harness, which already runs non-deterministic agents outside `pnpm test`; every deterministic part of the mechanism is a pure function with fixture tests |
| Tech constraints (Node/TS, pnpm, Zod at boundaries) | pass | Zod for label files, reports, model answers and `EvalResult` |
| G-07 layers | pass | `evals/` is an app-level folder above all packages; only `@pathfinder/gates` (layer 4) gains schema fields |
| G-24 typed errors | pass | login and isolation failures are typed (`JudgeSetupError` with a code) and printed plainly |
| G-33 / G-34 | pass | model-based grader, human labels, trials; label files in YAML |

Re-check after Phase 1 design: unchanged, no violations; Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/017-llm-judge/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md, findings.md
├── contracts/commands.md          # eval, eval:judge, eval:draw, eval:calibrate, eval:judge-check
├── contracts/judge-definition.md  # what the owner writes per judge
├── checklists/requirements.md
└── tasks.md                       # /speckit-tasks
```

### Source Code

```text
apps/crawler/
├── package.json                          # + scripts eval:judge, eval:draw, eval:calibrate, eval:judge-check; + zod, yaml
├── evals/
│   ├── config.ts                         # + --no-judges
│   ├── index.ts                          # judge step after grade(); workspace into the result
│   ├── results.ts                        # judges + workspace into EvalResult
│   ├── judge.ts                          # entry: pnpm eval:judge (existing store)
│   ├── draw.ts                           # entry: pnpm eval:draw
│   ├── calibrate.ts                      # entry: pnpm eval:calibrate
│   ├── judge-check.ts                    # entry: pnpm eval:judge-check
│   ├── graders/model/
│   │   ├── index.ts                      # public surface of the model-based graders
│   │   ├── definition.ts                 # JudgeDefinition, JudgeExample, Pair types; version hash
│   │   ├── selectors.ts                  # helpers for selectPairs (ofKind, citingRoute, screenRoute, recordText)
│   │   ├── prompt.ts                     # system prompt frame + user message for one pair (pure)
│   │   ├── answer.ts                     # verdict JSON schema; parse stream-json output → verdict, usage, init (pure)
│   │   ├── login.ts                      # token file lookup and validation, linked-login fallback
│   │   ├── call.ts                       # one isolated claude -p call (temp config + cwd, env scrub, timeout)
│   │   ├── run.ts                        # a judge over pairs: pool of 4, retry once, verdicts + cost
│   │   ├── score.ts                      # covered/total, counts, JudgeRun summary (pure)
│   │   ├── calibration.ts                # 2×2, TPR, TNR, flip rate, majority, disagreements (pure)
│   │   ├── isolation.ts                  # init event → check results (pure) + forbidden names from disk
│   │   ├── reports.ts                    # save/read calibration reports; calibrated? (FR-011)
│   │   ├── judge-step.ts                 # the trial's judge step (after grade())
│   │   └── judges/
│   │       ├── index.ts                  # JUDGES list
│   │       └── glossary-terms.ts         # the example judge
│   ├── graders/human/
│   │   ├── labels.ts                     # label file schema, read/write YAML, merge, hash split (pure + fs)
│   │   └── labels/glossary-terms.yaml    # drawn by the mechanism, labelled by the owner
│   └── tests/
│       ├── judge-answer.test.ts, judge-prompt.test.ts, judge-login.test.ts,
│       ├── judge-calibration.test.ts, judge-isolation.test.ts, judge-score.test.ts,
│       ├── judge-glossary-terms.test.ts, labels.test.ts
│       └── fixtures/judge/               # saved stream-json outputs (pass, fail, unknown, garbage, 401, init leak)
└── packages/gates/src/eval.ts            # EvalResult: + workspace?, + judges? (strict); comparisonMarkdown prints judges
```

Docs touched: `apps/crawler/evals/README.md` (graders table, commands, labels), `apps/crawler/CLAUDE.md`
(evals line), `.claude/skills/create-eval/SKILL.md` (adding a judge), `learning/05-llm-as-judge.md`
(points to the mechanism and the commands; exercises unchanged), glossary entries at close-out.

**Structure Decision**: everything stays in the existing evaluation harness (`apps/crawler/evals/`),
in the `graders/model/` and `graders/human/` folders the README already reserves, with one entry
file per command next to `index.ts`, as the current harness does. The only package change is the
`EvalResult` schema in `@pathfinder/gates`.

## Phases (for /speckit-tasks)

1. **Foundation**: deps and scripts; `definition.ts`, `answer.ts`, `prompt.ts`, `score.ts` with
   tests and fixtures.
2. **Calling the model (US1 core, FR-005)**: `login.ts`, `call.ts`, `isolation.ts`,
   `judge-check.ts`; run the isolation check for real once (SC-007).
3. **Example judge + labels (US2, US4)**: `selectors.ts`, `judges/glossary-terms.ts`,
   `labels.ts`, `draw.ts`; draw from the main store; hand the file to the owner.
4. **Calibration (US3)**: `calibration.ts`, `reports.ts`, `calibrate.ts`. Real calibration waits
   for the owner's labels.
5. **In a trial (US1)**: `EvalResult` fields (slow tier), `run.ts`, `--no-judges`, the judge step
   in `index.ts`, `judge.ts` for existing stores; `--dry-run` reports the judge login.
6. **Docs and close-out**: README, CLAUDE.md, create-eval skill, learning/05 pointer, findings,
   glossary, code review, changelog.

Owner hand-work in between: label the example judge's pairs (after phase 3); later, the rules
judge and its labels (not part of this item's tasks; it unblocks R-46).

## Complexity Tracking

None.
