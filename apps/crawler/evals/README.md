# Evals

`pnpm eval <portal>` (run in `apps/crawler`) is **one** end-to-end eval: the real crawler and BA
agents run headless against a portal, and their output is scored against that portal's ground
truth. It spends real tokens, so it is never part of `pnpm test`. `--dry-run` checks the setup
for free.

| Part | Question | File |
|---|---|---|
| Entry | What happens, in order? | `index.ts` |
| Settings | Which portal, persona, budget, flags? | `config.ts` |
| Cases (dataset) | Which portals, where is their ground truth? | `cases.ts` |
| Prompts | What task does each agent get? | `prompts.ts` |
| Harness | Clean workspace, portal server, agent sessions, cost | `harness/` |
| Scorers | What is measured | `scorers/` |
| Store queries | What the scorers ask the store | `queries.ts` |
| Results | Save, compare with the baseline, promote | `results.ts` |

What the scorers measure:

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

To add a portal: give it a ground truth, then add a line to `CASES` in `cases.ts`.
