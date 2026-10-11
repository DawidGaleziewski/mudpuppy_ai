# Contract: commands (R-47)

All run in `apps/crawler`. Exit codes follow `pnpm eval`: 0 ok, 1 a check failed (regression,
isolation leak, bar not met is **not** an error), 2 bad input, setup or login problem.
None of them is part of `pnpm test`.

## `pnpm eval <portal> [...] [--no-judges]` (changed)

- After the code graders, when the BA ran (not `--crawler-only`) and `--no-judges` is absent,
  every judge in `JUDGES` whose `category` has items in the task's ground truth runs over the
  trial's store.
- Prints one line per judge: `judge glossary-terms (v3f2a9c1d0b7e, uncalibrated): 8/10 terms,
  pass 9 · fail 3 · unknown 1 · error 0, $0.06`.
- Writes `judges` and `workspace` into the result JSON (data-model.md). `scores`, `overclaims`,
  `checks`, `cost` and the baseline comparison are unchanged by judges.
- `--dry-run` also resolves the judge login (no model call) and reports which source it would
  use.
- A judge login problem (token file present but malformed or rejected) exits 2 before any
  agent runs when detected in the preflight, or ends the judge step with the error and no
  `judges` section (the trial result is still written) when detected later.

## `pnpm eval:judge <portal> --store <path> [--judge <id>]` (new)

Runs judges over an existing store without a new trial (the owner's exercise 5.3: compare the code
matcher and the judge on past runs). Prints the same lines as above plus, per item, the code
matcher's verdict next to the judge's covered/not covered. Writes nothing to the store; writes a
JSON report to `data/evals/judges/<id>/<timestamp>-store.json`.

## `pnpm eval:draw <judge-id> --portal <portal> --store <path> [--store <path> ...]` (new)

Draws the judge's pairs from each store into `evals/graders/human/labels/<judge-id>.yaml`: keeps every
existing pair as it is, appends new ones with an empty `label` and `why` and a hash-based
`split`. Prints `added N, kept M, dev D / test T, labelled L`, and when fewer than 40 pairs exist,
how many are missing and the hint to draw from another store or add `hand-made` pairs.

## `pnpm eval:calibrate <judge-id> --split dev|test` (new)

Judges every labelled pair of the split 3 times, prints the 2×2 table, TPR, TNR, flip rate and
every disagreement (owner's `why`, the judge's three reasons), and saves the report
(data-model.md). Refuses (exit 2) when a `test` pair is one of the judge's few-shot examples.
On `--split test` for a version that already has a `test` report: runs, and prints that the
test set was used again for this wording. Exit 0 whether or not the bar is met; the printed
line says `calibrated: yes|no (bar 0.90/0.90)`.

## `pnpm eval:judge-check` (new)

The isolation check (FR-005a): one real judge call with a fixed tiny pair; prints each check
(data-model.md, Isolation check result), the model id, the Claude Code version and the login
source. Exit 1 when any check fails, 2 on a login problem.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `PATHFINDER_JUDGE_TOKEN_FILE` | `~/.config/pathfinder/judge-token` | the judge's `claude setup-token` token; absent file → linked `~/.claude/.credentials.json` |
