# Session dump 2026-10-10: R-28 closed, roadmap frozen, R-46 hands-on learning started

Branch now: `feature/016-r46-hands-on-learning` (from master `ed40fa4`, no own commits yet).

## Done this session

- **R-28 closed** (spec 015). T037–T041 done:
  - Verdicts in `specs/015-crawler-hardening/findings.md`: SC-003 partly met (shop 4/6, F-17 → R-35); the other five met.
  - Full test run green: crawler 1,738 tests, slow tier 56 e2e + 139 gates, plus chat, workflow, dashboard and proving-ground backend.
  - `code-reviewer`: 7 findings; 1 fixed (`actionBody` in `enqueue.ts`), 6 existing debt, deferred.
  - Changelog entry written; R-28 marked done in the roadmap.
- **Merged and pushed:** squash `fb2ca88`, F-24 `9192eeb` tagged **v1.0.14**, user's licensing notes `5410894` as a separate commit; all pushed to origin.
- **Decisions by the user:**
  - Keep the bank baseline promoted with BA terms 0 (F-16).
  - The shop gap stays in R-35.
  - Leftovers go to the new **R-45**: micro-frontend mounts inside iframes, BA write refusals, dashboard eval stores in the switcher.
- **New findings:**
  - F-20: the BA's write calls are refused about 40% of the time (72 calls → 42 records), and it isn't new.
  - F-21: the dashboard shows a portal as empty when its data is in an eval workspace.
  - F-22: Claude miscounted BA records and misdiagnosed the empty dashboard.
  - F-23: Claude used `sed -i` three times.
  - F-24: a dashboard review test failed once in the pre-commit hook (flaky).
- **Roadmap:**
  - R-46 "hands-on learning" added (`6ffcc01`).
  - **Roadmap frozen except R-46** until the user lifts it (`ed40fa4`).

## Not done / pending

- `6ffcc01` and `ed40fa4` are on local master and **not pushed**.
- The branch `feature/015-r28-crawler-hardening` still exists, locally and on origin. The user left it as is.
- The other Claude Code session (pts/2, started 2026-10-09 22:51) still runs its own `pathfinder` MCP servers. They aren't orphans; they stop when that terminal closes.
- Eval workspaces in `/tmp/pf-eval-*` are still there. The bank one used on the dashboard is `/tmp/pf-eval-proving-ground-bank-k2wFCh` (open it with `uv run pathfinder-dashboard --data-dir <ws>/data --port 8766`). They go away on reboot.

## R-46 rules (memory: r46-hands-on-learning, roadmap-freeze)

- Claude explains and pairs; the user does the hands-on exercises.
- Improvements go in small commits, one per change, so they can be cherry-picked to master at the end.
- No spec, no squash merge.

## Next session: pick one to start with

1. `learning/01-evals-basics.md`: evals vs tests, and where `pnpm test`, the gates and `pnpm eval` fit.
2. Exercise 3.1: run one eval five times and write down the spread (noise).
3. Exercise 4.1: why `processes` is 0% in every eval.
4. A walk through one real crawler step on the bank run: `navigate`, settle, mount wait, frames, clickables, frontier.

Open suggestion: write down a "freeze exit" checklist in R-46. The user should be able to explain, without notes, one crawler step, how an eval scores a run and how noisy it is, and why BA writes get refused.
