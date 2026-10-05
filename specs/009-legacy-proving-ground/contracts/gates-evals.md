# Contract: quality gates (tier 1) and evals (tier 2)

## Tier 1: `@pathfinder/gates` (`apps/crawler/packages/gates`)

Runs inside `pnpm test` (it is a vitest project) and alone with
`pnpm vitest run --project gates`.

```ts
gate(id: string, title: string, fn: () => Promise<void>, opts?: { timeout?: number }): void
// id: "LO-13" (catalogue) or "F-10@004" / "F-12@008" (finding@spec)
```

- `globalSetup`: build the web apps if stale; start the estate on 4200/4201 with
  `--session-timeout 20 --cms-delay-ms 150 --seed-users <fixture>`; wait for health; refuse when
  something already serves 4200. As built: each `gateServer()` gets its own in-memory store and a
  throwaway vault holding the fixture users (`test-password-not-real`); finding gates that need
  the reference portal start it themselves on a free port. `gap()` marks a known gap (expected to
  fail; a gap that passes fails the run until it is promoted to `gate()`).
- Reporter: writes `data/gates/report.json`:

```json
{ "generated_at": "…", "cases": [{ "id": "LO-13", "title": "…", "result": "pass", "ms": 812 }],
  "uncovered": ["LO-40"], "summary": { "pass": 47, "fail": 0, "uncovered": 1 } }
```

- Cases registered with `{ slow: true }` (real waits: LO-32, LO-35) are skipped by `pnpm test` and
  reported as `skipped_slow`; `pnpm test:slow` (`PATHFINDER_SLOW_GATES=1`) runs the whole gate set
  including them, for a nightly run.

- `coverage.test.ts` fails when an `in scope` catalogue id or a `gate`-mapped finding has no
  `gate(...)` registration.

## Eval-case index: `apps/crawler/packages/gates/eval-cases.yaml`

```yaml
- id: F-10@004
  title: Map mode presses submit buttons when the persona allows it
  tier: not_testable          # gate | eval | not_testable
  reason: superseded by constitution 2.0.0 (submitting off production is intended)
- id: F-06@004
  title: Agent stopped with a non-empty frontier
  tier: eval
  check: frontier_empty_at_finish   # eval check name
```

Every finding heading in spec 004 `goal-run-findings.md` and spec 008 `findings.md` appears once
(the coverage test checks it).

## Tier 2: `pnpm eval`

```text
pnpm eval <portal> [--persona <id>] [--budget-usd <n>=5] [--model <m>] [--promote] [--dry-run]
```

Steps:

1. Preflight: `claude --version`; no running `pathfinder`/`pathfinder-ba` server on this
   store; the estate is up (it is started if the portal starts with `proving-ground-`).
2. Crawler: `claude -p <prompt> --output-format json --mcp-config .mcp.json
   --max-budget-usd <n>`.
3. BA: the same with the BA prompt and the new run id.
4. Score: `docs:evaluate` (JSON).
5. Write `data/evals/<portal>/<UTC timestamp>.json`, then compare it with
   `data/evals/<portal>/baseline.json`.

Result JSON (Zod `EvalResult`):

```json
{ "portal_id": "…", "persona_id": "…", "started_at": "…", "git_sha": "…",
  "runs": { "crawler": "<run id>", "ba_session": "<id>" },
  "cost": { "usd": 1.92, "input_tokens": 0, "output_tokens": 0, "duration_ms": 0 },
  "scores": { "screens": { "recall": 0.9, "precision": 1 }, "obstacles": { … } },
  "checks": { "frontier_empty_at_finish": true, "handoffs": 1, "relogins": 1 } }
```

Comparison: per category, `recall` and `precision` may drop by at most `tolerance` (default
0.05, set per portal in `data/evals/<portal>/tolerances.json`). Each check must not flip from
true to false. Output: a Markdown table on stdout. The exit code is 1 on a regression, 0 otherwise.
`--promote` moves the old baseline to `history/<timestamp>.json` and writes the new one.
