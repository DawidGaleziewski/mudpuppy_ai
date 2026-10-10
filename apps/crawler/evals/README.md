# Evals

`pnpm eval <portal>` (run in `apps/crawler`) runs **one trial of one task**: the real crawler and
BA agents run headless against the task's portal, and the graders score the outcome against that
portal's ground truth. It spends real tokens, so it is never part of `pnpm test`. `--dry-run`
checks the setup for free.

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

| Kind        | Judges by                                                                                                    | Folder           | Today                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------ | ---------------- | -------------------------------------------- |
| Code-based  | Exact matching, counting, rules: fast, free, repeatable                                                      | `graders/code/`  | all graders                                  |
| Model-based | A second model call answers one narrow question (LLM as judge); trusted only once it agrees with hand labels | `graders/model/` | none yet (see `learning/05-llm-as-judge.md`) |
| Human       | A person labels or reviews; also how a model grader is calibrated                                            | `graders/human/` | none yet                                     |

What the code-based graders measure:

- **Goal**: `docs-coverage.ts` (BA documentation vs ground truth, plus overclaims) and
  `crawl-coverage.ts` (ground-truth screens the crawler reached).
- **Guardrails**, must stay 0: `leaks.ts` (portal passwords in any output) and `widget_actions`
  in `run-checks.ts`.
- **Diagnostics**, explain why a score moved: the rest of `run-checks.ts`.

Where things live outside this folder:

- Ground truth stays next to its portal: `packages/reference-portal/ground-truth.json` and
  `apps/proving-ground/ground-truth/*.json` (their self-check tests read them there).
- Results, `baseline.json` and `tolerances.json`: `data/evals/<portal>/` (generated output).
- The scoring functions shared with the gates: `@pathfinder/gates` (`eval.ts`, `eval-checks.ts`)
  and `evaluate()` in `@pathfinder/docs`.
- How the agents behave: `.claude/agents/crawler.md`, `ba.md` and the `ba-practice` skill.

To add a task: give the portal a ground truth, then add a line to `SUITE` in `tasks.ts`.
