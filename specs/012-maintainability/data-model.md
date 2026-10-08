# Data model: Maintainability (R-34)

R-34 adds no database tables and changes no migration. Its "entities" are files and command
outputs that agents and the developer read. Formats are in `contracts/`.

## Test tier

| Field | Fast | Slow | All |
| --- | --- | --- | --- |
| Command | `pnpm test:fast` | `pnpm test:slow` | `pnpm test` |
| Runs | tests affected by uncommitted changes, without `*.e2e.test.ts` and the `gates` project | `*.e2e.test.ts` files and the `gates` project | everything |
| Widened to the whole fast tier when | a `forceRerunTriggers` file changed | — | — |
| Trigger | commit hook (crawler changes) | close-out; tasks that touch the pipeline, gates harness or proving ground | close-out (merge check) |

Rule: a task is not done until the tier its change belongs to is green; a feature is not merged
until `pnpm test` (all) and the dashboard/chat suites are green.

## Code guideline

`docs/code-guidelines.md`, one entry per accepted item:

- `id` (`G-01`…), `rule` (one sentence), `why`, `checked by` (`lint:<rule>`, `test:<file>`,
  `reviewer`, `by hand`), `rating` (accepted / amended, with the user's note).
- Rejected items stay only in `guideline-review.md` with the reason.

## Agent notes

One `CLAUDE.md` per workspace package and app (template: `contracts/agent-notes.md`): purpose,
layer, public API (what `index` exports and who uses it), invariants, where to add things, tests
and their tier, links to the spec(s) that shaped it. At most ~60 lines.

## Layer and boundary rule

`apps/crawler/layers.json`: layers in order (kernel, models, store, features, servers) with the
packages in each and the allowed dependency direction (downward only, plus explicit exceptions with
a reason). The boundary test reports `layer rule: <pkg> (<layer>) may not depend on <dep>
(<layer>)` (contracts/layers.md).

## Lint baseline

`specs/012-maintainability/lint-baseline.md`: date, commit, per package the counts of each warning
rule, `pnpm lint` wall time before/after typed lint.

## Golden behaviour lock

Snapshot per scenario (map run, trace run on the mock portals): states (route template,
fingerprint level 1, evidence ref shape), edges (from, to, action role/name, safety class, allowed,
skip reason), decision-log entries (kind, rule, reason) in order, span tree (normalised as
`trace-normalise.ts` does). Stored as Vitest snapshots next to the test; changing it requires a
written reason in the commit.

## Review finding

`contracts/review-report.md`: id, file:line, guideline id, what, suggested change, size
(`small` = fixed in the close-out, `large` = follow-up), outcome (`fixed`, `deferred`, `rejected`
with reason).

## Mutation report

`data/mutation/<tool>/<date>/` HTML + JSON (gitignored); summary line per run appended to
`specs/012-maintainability/findings.md` for the first run: package, mutants, killed, survived,
timeout, score.
