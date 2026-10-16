# Evals

`pnpm eval <portal>` (run in `apps/crawler`) runs **one trial of one task**: the real crawler and
BA agents run headless against the task's portal, and the graders score the outcome against that
portal's ground truth. It spends real tokens, so it is never part of `pnpm test`. `--dry-run`
checks the setup for free.

## Running several (spec 020, R-40)

- **One at a time.** Evals share the account's usage quota with each other and with the Claude Code
  session that starts them, so a second `pnpm eval` refuses while one runs (a lock file in the
  temp folder holds the running eval's pid; a lock left by a dead process is taken over).
- **Own portal server.** The eval starts the portal's server itself and refuses when one of its
  ports (4010 reference portal; 4100 and 4101 the proving-ground estate; 4300 and 4302 scar-maker,
  spec 030: its task is a crawler-only map of the scars, `pnpm eval scar-maker --crawler-only`) is already held, naming
  the process: stop it first. Afterwards it stops the server's whole process group and checks the
  ports are free.
- **Outcome per agent.** Each agent session ends in `success`, `budget_end` (the eval's own
  budget), `api_error` or `usage_limit`. Only the first two write a result; they are stored as
  `outcomes` in it.
- **Exit codes**: 0 ok, 1 regression against the baseline, 2 bad input, preflight or an API
  error, 3 usage limit. Chain evals with `&&` so the chain stops on anything but 0:
  `pnpm eval proving-ground-bank && pnpm eval proving-ground-insurer`.

## Terminology

We use Anthropic's eval vocabulary
([Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents));
guideline G-33 makes it the rule for new code. This folder is the reference layout; the
`create-eval` skill (`.claude/skills/create-eval/`) is how to build the next eval the same way.

| Term               | Meaning                                                             | Here                                                            |
| ------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------- |
| Task               | One test: defined inputs and success criteria                       | A portal in `tasks.ts` (with its persona from the command line) |
| Evaluation suite   | A set of tasks                                                      | `SUITE` in `tasks.ts`                                           |
| Trial              | One attempt at a task; run several, outputs vary                    | One `pnpm eval` run, one JSON file in `data/evals/<portal>/`    |
| Grader             | Logic that scores one aspect of performance                         | `graders/` (code-based, model-based, human)                     |
| Transcript         | The full record of a trial: outputs, tool calls, reasoning          | The two `claude` session transcripts                            |
| Outcome            | The final state of the environment after a trial                    | The workspace store and documentation                           |
| Evaluation harness | Runs evals end to end                                               | This folder                                                     |
| Agent harness      | What lets a model act as an agent                                   | The `pathfinder` MCP servers + Claude Code                      |
| Reference solution | A known working output that passes all graders                      | None yet                                                        |
| Ground truth       | (our term, kept) Facts about the portal the graders compare against | Next to each portal, see below                                  |

Not eval terms, so they keep their crawler meaning: _crawl run_ (`runs` table), _state_,
_frontier_. _Baseline_ and _tolerance_ are our regression-check terms.

## Layout

| Part          | Question                                             | File         |
| ------------- | ---------------------------------------------------- | ------------ |
| Entry         | What happens, in order?                              | `index.ts`   |
| Settings      | Which portal, persona, budget, flags?                | `config.ts`  |
| Tasks (suite) | Which portals, where is their ground truth?          | `tasks.ts`   |
| Prompts       | What task does each agent get?                       | `prompts.ts` |
| Harness       | Clean workspace, portal server, agent sessions, cost | `harness/`   |
| Graders       | What is scored, grouped by kind                      | `graders/`   |
| Store queries | What the graders ask the store                       | `queries.ts` |
| Results       | Save, compare with the baseline, promote             | `results.ts` |

## Graders

Grouped the way Anthropic groups them; `graders/grade.ts` runs them all over one finished trial.

| Kind        | Judges by                                                                                                    | Folder           | Today                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------ | ---------------- | ---------------------------------------------------- |
| Code-based  | Exact matching, counting, rules: fast, free, repeatable                                                      | `graders/code/`  | all graders                                          |
| Model-based | A second model call answers one narrow question (LLM as judge); trusted only once it agrees with hand labels | `graders/model/` | the judge mechanism and `glossary-terms` (spec 017)  |
| Human       | A person labels or reviews; also how a model grader is calibrated                                            | `graders/human/` | label files for the judges (`graders/human/labels/`) |

What the code-based graders measure:

- **Goal**: `docs-coverage.ts` (BA documentation vs ground truth, plus overclaims; skipped with
  `--crawler-only`), `crawl-coverage.ts` (ground-truth screens the crawler reached) and, for a
  trace task or a map task's process traces, `process-trace.ts` (the process's steps reached in
  order, and whether the crawler reported the goal reached).
- **Guardrails**, must stay 0: `leaks.ts` (portal passwords in any output) and `widget_actions`
  in `run-checks.ts`.
- **Diagnostics**, explain why a score moved: the rest of `run-checks.ts`, and `ba-writes.ts`
  (the BA's `create_record`/`revise_record`/`withdraw_record` calls the server refused, from the
  transcripts, by error code; checks `ba_write_calls`, `ba_write_refused`, `ba_write_refused_pct`,
  `ba_relation_refused`, spec 019), and `ba-shapes.ts` (record-shape mistakes the trials caught:
  `route_templates_with_query`, `data_items_joined` — a data item holding two or more ground-truth
  field labels — `rules_on_screens_pct`, rules linked to a screen with `applies_on`, and
  `data_items_code_names`, data items named by the input's code name such as `rok_produkcji`
  instead of its label, spec 031).

### Judges (model-based graders, spec 017)

A judge asks headless Claude one narrow question per (ground-truth item, record) pair and gets
`pass`, `fail` or `unknown` with a one-sentence reason. Each call is isolated: no tools, no MCP
servers, a fresh config folder and an empty working folder, so nothing of your or the project's
Claude setup reaches it. Judge scores go in the result's `judges` section, beside the code scores,
and are never compared with the baseline. A judge counts only once **calibrated**: its newest
`test` calibration for its current wording agrees with the owner's labels at TPR and TNR ≥ 0.9.

| Command                                                  | What it does                                                                   | Cost             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------- |
| `pnpm eval:judge-check`                                  | One judge call; checks nothing of your setup was loaded                        | 1 call           |
| `pnpm eval:draw <judge> --portal <p> --store <path>`     | Draws the judge's pairs into `graders/human/labels/<judge>.yaml` for labelling | free             |
| `pnpm eval:calibrate <judge> --split dev\|test`          | Judges every labelled pair 3×: table, TPR, TNR, flip rate, disagreements       | 3 calls per pair |
| `pnpm eval:judge <portal> --store <path> [--judge <id>]` | Judges an existing store; code matcher and judge side by side                  | 1 call per pair  |
| `pnpm eval <portal>`                                     | Runs the judges after the code graders; `--no-judges` turns them off           | 1 call per pair  |

- Login: the token from `claude setup-token` in `~/.config/pathfinder/judge-token` (one line,
  no quotes, mode 600; or `PATHFINDER_JUDGE_TOKEN_FILE`), else your Claude login, linked. Never
  export `CLAUDE_CODE_OAUTH_TOKEN` in your shell: it would replace every Claude session's login.
- Adding a judge: its file in `graders/model/judges/` and one line in `judges/index.ts`
  (`specs/017-llm-judge/contracts/judge-definition.md`; the `create-eval` skill, section 7).
- Calibration reports and store reports: `data/evals/judges/<judge>/`.

Where things live outside this folder:

- Ground truth (YAML, G-34) stays next to its portal: `packages/reference-portal/ground-truth.yaml`
  and `apps/proving-ground/ground-truth/*.yaml` (their self-check tests read them there). A site
  we don't own has its ground truth here, in `ground-truth/` (e.g. `wikipedia.yaml`).
- Results, `baseline.json` and `tolerances.json`: `data/evals/<portal>/` (generated output).
- The scoring functions shared with the gates: `@pathfinder/gates` (`eval.ts`, `eval-checks.ts`)
  and `evaluate()` in `@pathfinder/docs`.
- How the agents behave: `.claude/agents/crawler.md`, `ba.md` and the `ba-practice` skill.

To add a task: give the portal a ground truth, then add a line to `SUITE` in `tasks.ts`.

Kinds of task:

- **Map** (default): the crawler maps the whole portal; graded on screens reached and the BA's docs.
  A map task may list `processTraces` (spec 025): after the map the crawler traces each listed
  ground-truth process (guest persona only). The BA then works in two sessions (spec 025 F-12):
  first over the map run with the same prompt as a map-only trial, so its scores stay comparable,
  then over the trace runs only, writing just processes and use cases, so `processes` (trace
  evidence) can score. The result records both (`runs.ba_traces_session`, `outcomes.ba_traces`),
  and `ba_session_completed` needs both completed. Graded as `process_trace_steps` (steps summed
  over the traces) and the check `process_traces_goal_reached`; the result records the trace runs
  and the condition `process_traces`, and a baseline with a different count is not comparable.
  `--no-process-traces` skips them. Example: `reference-insurer` (P01–P04). `processes_map` scores
  processes from map evidence alone, so it means the same with or without traces.
- **Trace** (`trace:` in `tasks.ts`): the crawler walks one named process toward a goal; also graded
  on that process's `steps` in the ground truth. Example: `wikipedia`.
- **Live site** (no `server:`): nothing is started locally. Keep the portal config read-only with a
  narrow scope, and run it `--crawler-only` unless the BA is part of the question.

Known gap: crawl coverage treats every persona not named `guest` as logged in, so an anonymous
persona with another name (e.g. `guest-reader`) is graded on logged-in screens.
