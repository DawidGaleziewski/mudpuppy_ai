---
name: create-eval
description: How to build or extend an eval in Pathfinder the same way everywhere — Anthropic's eval terms (G-33), the evals/ folder layout (tasks, prompts, harness, graders by kind, results), naming, where ground truth and results live, and the rules for graders, trials and baselines. Use when creating an eval for any app or agent (e.g. the chat agent), adding a task, a grader or an LLM judge, or restructuring eval code. Not for deterministic tests or gates (those are tests, not evals).
---

# Create an eval

The reference implementation is `apps/crawler/evals/` (read its `README.md` first). A new eval
copies its shape; a difference needs a reason written in the new eval's README.

## 1. Terms (G-33)

Use Anthropic's vocabulary ("Demystifying evals for AI agents") in code, docs and messages:

| Term | Meaning |
|---|---|
| Task | One test: defined inputs and success criteria |
| Evaluation suite | The set of tasks (`SUITE`) |
| Trial | One attempt at a task; outputs vary, so run several |
| Grader | Logic that scores one aspect: code-based, model-based (LLM as judge) or human |
| Transcript | The full record of a trial: outputs, tool calls, reasoning |
| Outcome | The final state of the environment after the trial |
| Evaluation harness | The code that runs evals end to end (the `evals/` folder) |
| Agent harness | What lets the model act as an agent (MCP servers, Claude Code) |
| Reference solution | A known working output that passes all graders |

Ours, kept on purpose: *ground truth* (facts the graders compare against), *baseline* and
*tolerance* (regression check). Domain terms of the system under test (crawl run, state, frontier)
are not eval terms. A new concept takes Anthropic's name when one exists.

## 2. Folder layout

At the root of the app or package the eval measures: `apps/<app>/evals/`, never under `scripts/`
or inside a sub-package.

```
evals/
  README.md        terminology, layout, graders table, where ground truth and results live
  index.ts         entry: parse config → preflight → task → dry run or one trial; reads top to bottom
  config.ts        parseArgs (strict: unknown flags are errors) into one EvalConfig; USAGE
  failures.ts      die (before the trial), EvalAbort + abort (inside it, so `finally` cleans up)
  tasks.ts         EvalTask, SUITE, taskFor(), loadGroundTruth(): the suite as data; a task may
                   omit `server` (live site) and add `trace` (walk one named process, graded on
                   its ground-truth `steps`)
  ground-truth/    ground truth of systems we don't own (YAML, G-34)
  prompts.ts       PROMPTS: what each agent is asked; the *how* stays in agent definitions/skills
  queries.ts       named read-only store queries, one function per question
  results.ts       TrialRecord, buildResult(), saveResult(), promote
  harness/         index.ts + one file per concern: workspace, <environment>-server, agent, cost, preflight
  graders/
    index.ts       grade() and what index.ts needs
    grade.ts       grade(): runs every grader over one finished trial
    code/          code-based graders, one file per thing graded
    model/         model-based graders (LLM as judge); `.gitkeep` while empty
    human/         human labels and review flows; `.gitkeep` while empty
  tests/           unit tests of every pure module (fast tier)
```

Keep all three grader folders even when empty, so the kinds are visible.

## 3. Naming

- Files name their concern (G-05): `docs-coverage.ts`, `crawl-coverage.ts`, `leaks.ts`,
  `run-checks.ts`; never `utils.ts`/`helpers.ts`.
- Types and values: `EvalConfig`, `EvalTask`, `SUITE`, `taskFor`, `TrialRecord`, `Grades`,
  `GradeInput`. Functions: `runTrial()`, `grade()`, goal graders `score<Thing>()`, guardrails
  `sweep<Thing>()` or `<thing>Checks()`, queries named by the question (`pendingFrontierCount`).
- Result fields: `scores.<category> = { matched, total, pct }`, `overclaims`, `checks.<name>`.
- No nested ternaries (lint `no-nested-ternary`): choices between tasks are data in `tasks.ts`.
- No module-level globals besides constants: pass `EvalConfig` (and a trial context) down.
- Folders that hide internals export through `index.ts` (G-12).

## 4. Where data lives

- **Ground truth** is YAML (G-34), read with `readGroundTruth()` from `@pathfinder/docs` and
  validated by the `GroundTruth` schema: next to the system it describes when we own it (its
  self-check tests read it there), e.g. `apps/proving-ground/ground-truth/*.yaml`. For a system we
  do not own (a live portal), in `evals/ground-truth/<task>.yaml`. Either way `tasks.ts` names
  the path. How to write one: `learning/11-writing-ground-truth.md`.
- **Results** (generated, never in the code folder): `data/evals/<task>/<timestamp>.json` per
  trial, `baseline.json`, `tolerances.json` (allowed drop in points per category), `history/`.
- Reuse the result schema and comparison from `@pathfinder/gates` (`EvalResult`, `compareEval`,
  `Tolerances`, `HARD_ZERO_CHECKS`); do not copy them. A shared eval package only once a second
  eval needs more than that (rule of three).

## 5. Rules for trials and graders

- **Graders in three groups**: goal (score against ground truth), guardrails (must stay 0, listed
  in `HARD_ZERO_CHECKS`, block promotion), diagnostics (explain why a score moved).
- **Code-based first.** Add a model-based grader only for a category where you showed code gives
  wrong answers, and trust it only after it agrees with human labels on a held-out set; keep those
  labels in `graders/human/`. One narrow yes/no question per judge call, with a reason.
- Each trial runs in a **fresh, isolated workspace**; never the developer's store unless asked
  (`--in-place`).
- **No result on an outage**: an API or rate-limit error aborts the trial; running out of the
  eval's own budget is a fair end and is recorded.
- Record what makes trials comparable in `conditions` (timeouts, model) and warn when the
  baseline's differ.
- `--dry-run` exercises everything up to the first paid call (workspace, vault, ground truth).
- The paid trial is never part of `pnpm test`; its pure parts are unit-tested in `evals/tests/`
  (queries against the migrated schema, config parsing, cost, results and promotion).

## 6. Wiring and checks

- Script entry `"eval": "tsx evals/index.ts"` in the app's `package.json`; add `evals` to the
  root `tsconfig.json` `include` and `evals/tests/**/*.test.ts` to a fast Vitest project.
- Run the app's commit checks (CLAUDE.md "Verification Before Commit").
- When restructuring an existing eval: lock behaviour first (G-29) — save the `--dry-run` and
  usage outputs, and compare grader output old vs new on a stored trial's data.
- Update the app's `CLAUDE.md` layout line and the eval's `README.md` in the same commit (G-30).

## 7. New eval checklist

1. Name the tasks and their success criteria; write or locate the ground truth.
2. Copy the layout above; fill `tasks.ts` and `prompts.ts` first.
3. Harness: workspace, environment server, agent runner, cost.
4. Code-based graders, then `grade.ts`; model or human graders only when §5 allows.
5. `results.ts` on the gates schema; tests; `--dry-run`; one real trial; promote a baseline.
