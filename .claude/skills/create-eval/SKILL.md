---
name: create-eval
description: How to build or extend an eval in Pathfinder the same way everywhere — Anthropic's eval terms (G-33), the evals/ folder layout (tasks, prompts, harness, graders by kind, results), naming, kinds of task (map, trace, live site), writing ground truth in YAML (G-34), live-site safety, and the rules for graders, trials, conditions and baselines. Use when creating an eval for any app or agent (e.g. the chat agent), adding a task, a ground truth, a grader or an LLM judge, running or promoting trials, or restructuring eval code. Not for deterministic tests or gates (those are tests, not evals).
---

# Create an eval

The reference implementation is `apps/crawler/evals/` (read its `README.md` first). A new eval
copies its shape; a difference needs a reason written in the new eval's README. The order of work
(what to decide on paper before any code) is `learning/10-writing-evals.md`; writing ground truth
is `learning/11-writing-ground-truth.md`.

## 1. Terms (G-33)

Use Anthropic's vocabulary ("Demystifying evals for AI agents") in code, docs and messages:

| Term | Meaning | Here |
|---|---|---|
| Task | One test: defined inputs and success criteria | An entry in `SUITE`, named by its portal id |
| Evaluation suite | The set of tasks | `SUITE` in `tasks.ts` |
| Trial | One attempt at a task; outputs vary, so run several | One `pnpm eval` run, one result file |
| Grader | Logic that scores one aspect: code-based, model-based (LLM judge) or human | `graders/<kind>/` |
| Transcript | The full record of a trial: outputs, tool calls, reasoning | The agents' CLI session files |
| Outcome | The final state of the environment after the trial | The workspace store and documentation |
| Evaluation harness | The code that runs evals end to end | The `evals/` folder |
| Agent harness | What lets the model act as an agent | MCP servers, Claude Code |
| Reference solution | A known working output that passes all graders | Hand-made, proves graders work |

Ours, kept on purpose: *ground truth* (facts the graders compare against), *baseline* (the trial
chosen as the standard) and *tolerance* (allowed drop). Domain terms of the system under test
(crawl run, state, frontier, persona) are not eval terms. A new concept takes Anthropic's name when
one exists; coin a term only when they have none.

## 2. Folder layout

At the root of the app or package the eval measures: `apps/<app>/evals/`, never under `scripts/`
or inside a sub-package.

```
evals/
  README.md        terminology, layout, graders table, kinds of task, where data lives, known gaps
  index.ts         entry: parse config → preflight → task → dry run or runTrial(); reads top to bottom
  config.ts        parseArgs (strict: unknown flags are errors) into one EvalConfig; USAGE
  failures.ts      die (before the trial), EvalAbort + abort (inside it, so `finally` cleans up)
  tasks.ts         EvalTask, TraceSpec, SUITE, taskFor(), loadGroundTruth(): the suite as data
  ground-truth/    <task>.yaml for systems we don't own (G-34)
  prompts.ts       PROMPTS: what each agent is asked (map, trace, BA); the *how* stays in the
                   agent definitions and skills
  queries.ts       named read-only store queries, one function per question
  results.ts       TrialRecord, buildResult(), saveResult(), promote, comparability warnings
  harness/         index.ts + one file per concern: workspace, <environment>-server, agent,
                   cost, preflight
  graders/
    index.ts       grade() and what index.ts needs
    grade.ts       grade(): runs every grader over one finished trial
    code/          code-based graders, one file per thing graded
    model/         model-based graders (LLM judge): the mechanism + judges/<id>.ts, one per judge
    human/         human labels and review flows: labels.ts + labels/<judge>.yaml
  tests/           unit tests of every pure module (fast tier)
```

Keep all three grader folders even when empty, so the kinds are visible.

## 3. Naming

- Files name their concern (G-05): `docs-coverage.ts`, `crawl-coverage.ts`, `process-trace.ts`,
  `leaks.ts`, `run-checks.ts`; never `utils.ts`/`helpers.ts`.
- Types and values: `EvalConfig`, `EvalTask`, `TraceSpec`, `SUITE`, `taskFor`, `TrialRecord`,
  `Grades`, `GradeInput`. Functions: `runTrial()`, `grade()`, goal graders `score<Thing>()`,
  guardrails `sweep<Thing>()` or `<thing>Checks()`, queries named by the question
  (`pendingFrontierCount`, `traceStepRoutes`).
- Result fields: `scores.<category> = { matched, total, pct }` (e.g. `crawl_screens`,
  `trace_steps`, docs categories), `overclaims`, `checks.<name>` (booleans or counts, e.g.
  `crawler_completed`, `trace_goal_reached`, `password_hits`), `conditions.<name>`.
- A task is named by its portal id; its results go to `data/evals/<task>/`, its ground truth to
  `<task>.yaml` (or `ground-truth.yaml` next to a portal we own).
- An anonymous persona used by an eval is named `guest`: crawl coverage treats any other name as
  logged in (known gap, see the reference README).
- No nested ternaries (lint `no-nested-ternary`): choices between tasks are data in `tasks.ts`.
- No module-level globals besides constants: pass `EvalConfig` (and the task, the trial's
  `startedAt`) down.
- Folders that hide internals export through `index.ts` (G-12).

## 4. Kinds of task

| Kind | In `tasks.ts` | The agent does | Extra grading |
|---|---|---|---|
| Map (default) | no `trace` | maps the whole portal | — |
| Map with process traces | `processTraces: [{ processId, name, goal }]` | maps, then traces each listed process (guest only; `--no-process-traces` skips) | `process_trace_steps`, `process_traces_goal_reached`; condition `process_traces` |
| Trace | `trace: { processId, name, goal }` | walks one named process toward the goal (trace mode) | `trace_steps` (the ground-truth process's `steps` reached in order), `trace_goal_reached` |
| Live site | no `server` | as above, on a site we don't own; nothing starts locally | — (see §6) |

A trace task's ground-truth process must list its `steps` (routes in order); a test checks this.

## 5. Ground truth (G-34)

- **YAML, never JSON**, starting with a comment naming the portal and the source of the facts. Read
  with `readGroundTruth()` (`@pathfinder/docs`), validated by the `GroundTruth` schema.
- **Where**: next to the system when we own it (its self-check tests read it there); in
  `evals/ground-truth/<task>.yaml` when we don't. `tasks.ts` names the path either way.
- **Written by a person, not from agent output.** The person writes notes (fact, `how_i_know`,
  `who_sees`, `counts_when`, `unsure:`); the schema file is produced from them. Agent output may be
  a starting point only for a site we don't own, and only after every item is checked by hand.
- **Unsure items are left out** of the schema file until confirmed; say so in its header.
- **Conditions of the facts**: `today` (the date checked) and `locale` (the language they hold
  for). The persona used by the task must run in the same locale (`locale:` in the persona), or
  the trial measures a different site.
- **Evidence**: screenshots or other files next to the notes, named in `how_i_know`.
- **Reference solution**: for at least one task, a hand-made output that should score ~100 %. If it
  doesn't, the grader or the ground truth is wrong, not the agent.

## 6. Live sites (a production system we don't own)

Before the first trial, all of these, in the portal config (`portals/<id>/portal.yaml`) and
persona:

- `max_action_class: read` on the portal environment **and** the persona (only look).
- `allowed_domains` lists exact hosts, not a whole domain; small `max_states` / `max_steps` /
  `max_run_time_minutes`; `requests_per_second: 1`; a user agent that says what it is.
- `robots: respect`; read robots.txt yourself and note what it disallows on the task's path.
- Denylist login, account creation and edit paths.
- The owner signs `compliance` (`robots_checked_on`, `terms_reviewed_on`, `terms_reviewed_by`).
  Preflight no longer enforces it; it is our gate, and Claude never signs it on the owner's behalf
  without being told to.
- Run `--crawler-only` unless the BA is part of the question.

## 7. Graders

- **Three groups**: goal (score against ground truth), guardrails (must stay 0, listed in
  `HARD_ZERO_CHECKS`, block promotion), diagnostics (explain why a score moved).
- **Code-based first.** Add a model-based grader only for a category where you showed code gives
  wrong answers, and trust it only after it agrees with human labels on a held-out set; keep those
  labels in `graders/human/`. One narrow yes/no question per judge call, with a reason.
- Grade the **outcome** (what the store holds at the end), not the path the agent took, except a
  trace's steps, which are the outcome of a trace task.
- A grader with an empty denominator scores 0, never 100 %.

### Adding a judge (model-based grader, spec 017)

The mechanism lives in `apps/crawler/evals/graders/model/`; only the judge is new:

1. `graders/model/judges/<id>.ts` exporting `defineJudge({ id, category, question, pass, fail,
   examples, selectPairs })` (`specs/017-llm-judge/contracts/judge-definition.md`), and one line
   in `JUDGES` (`judges/index.ts`).
2. `pnpm eval:draw <id> --portal <p> --store <path>` → `graders/human/labels/<id>.yaml`; the
   owner labels it (pass/fail + one sentence), adding `hand-made` pairs for tricky cases.
3. `pnpm eval:calibrate <id> --split dev`, read every disagreement, refine the wording or a label,
   repeat; then once `--split test`. Calibrated = TPR and TNR ≥ 0.9 on `test` for the current
   wording (changing the wording or model makes it uncalibrated again).

Rules: one narrow yes/no question per call about one (item, record) pair; `fail` covers "not
clearly stated"; `selectPairs` is pure, deterministic, and looser than the code matcher if the
judge is to find false fails (whole words, not substrings); examples come from `dev` labels,
never `test`; the judge sees only the item and the record. Judges run in `pnpm eval` (off with
`--no-judges`), their scores sit in `judges`, never in `scores`, and never gate a baseline. Never
in `pnpm test`; their pure parts are unit-tested on saved CLI outputs.
- Graders that need an agent that did not run (the BA under `--crawler-only`) are skipped, not
  scored 0.

## 8. Trials, conditions and baselines

- Each trial runs in a **fresh, isolated workspace**; never the developer's store unless asked
  (`--in-place`).
- **No result on an outage**: an API or rate-limit error aborts the trial; running out of the
  eval's own budget is a fair end and is recorded.
- **Conditions**: record whatever makes trials comparable in `conditions` (session timeout,
  `crawler_only`, …) and warn when the baseline's differ. Old results without a condition mean
  the default.
- `--dry-run` exercises everything up to the first paid call (workspace, vault, ground truth).
- Run several trials before trusting a score; set `tolerances.json` from their spread.
- **Baseline** = a copy of the trial chosen as the standard, not the latest one. `--promote` does
  it for the trial just run (refused when the crawler did not complete or a guardrail is above 0;
  the old baseline moves to `history/`). Promoting an earlier trial: copy its file to
  `baseline.json` after the same checks; the trial file stays.
- **Re-baseline** when the conditions change (prompt, agent definition, persona, locale, model,
  crawler-only): delete or replace the baseline instead of comparing across the change.
- Result files and baselines are committed; each records the `git_sha` it ran on, so commit before
  a trial.
- The paid trial is never part of `pnpm test`; its pure parts are unit-tested in `evals/tests/`
  (queries against the migrated schema, config parsing, cost, graders, results and promotion).

## 9. Wiring and checks

- Script entry `"eval": "tsx evals/index.ts"` in the app's `package.json`; add `evals` to the
  root `tsconfig.json` `include` and `evals/tests/**/*.test.ts` to a fast Vitest project.
- Run the app's commit checks (CLAUDE.md "Verification Before Commit"); a change to a shared
  schema in `gates` also needs the slow tier.
- When restructuring an existing eval: lock behaviour first (G-29): save the `--dry-run` and
  usage outputs, and compare grader output old vs new on a stored trial's data.
- Update the app's `CLAUDE.md` layout line, the eval's `README.md` and the glossary entries
  (`eval`, `eval-task`, `eval-trial`, `grader`) in the same commit (G-30).

## 10. New eval checklist

1. On paper first (`learning/10-writing-evals.md` steps 0–4): success in words, tasks, ground
   truth, graders.
2. Copy the layout above; fill `tasks.ts`, the ground truth and `prompts.ts` first.
3. Harness: workspace, environment server (or none for a live site), agent runner, cost.
4. Code-based graders, then `grade.ts`; model or human graders only when §7 allows.
5. `results.ts` on the gates schema; tests; `--dry-run`.
6. Validate the eval itself: the reference solution scores ~100 %, a bad output scores low.
7. A few real trials; set tolerances; promote a typical one as the baseline.
