# Quickstart: validating the LLM judge mechanism (R-47)

Run in `apps/crawler`. Commands and outputs: `contracts/commands.md`; shapes: `data-model.md`.

## Validation status (close-out 2026-10-11, R-47 paused by the owner)

- [x] 1. Unit tests: fast and slow tier green; `pnpm test` (everything) green at close-out.
- [x] 2. Isolation: `eval:judge-check` 7/7 ok, 1029 input tokens, exit 0.
- [x] 3. Draw: 11 pairs drawn, a re-run adds 0. The owner labelled 10 of them. Claude added 32
  `hand-made` pairs, still unlabelled (T017 open).
- [ ] 4. Calibrate: a dev smoke only (4 pairs, TPR 1, no fails labelled yet); the real dev
  rounds and the one test run wait for the owner's labels (T022–T024).
- [ ] 5. In a trial: `eval:judge` on the main store done; the full trial and `--no-judges` were
  not run (agent tokens; T030).
- [ ] 6. Second judge: the owner's, later (T036).

## Prerequisites

- Claude Code logged in (`claude` works). Optional: the judge's own token in
  `~/.config/pathfinder/judge-token` (one line, no quotes, mode 600); without it the judge uses
  the linked login.
- The main store holds reference-insurer documentation (`data/db/sandbox.sqlite`).

## 1. Unit tests (no model calls, fast tier)

`pnpm typecheck && pnpm lint && pnpm test:fast` — covers verdict parsing, the version hash,
the example selector, label merge and split, agreement maths, login lookup (with
`test-key-not-real`), and the isolation verdict over saved init-event fixtures. Because
`packages/gates` changes (`EvalResult`), also `pnpm test:slow` before that commit.

## 2. Isolation (SC-007)

`pnpm eval:judge-check` → every check `ok`, tools `StructuredOutput` only, login source named,
exit 0.

## 3. Draw pairs and label (US2; the owner)

`pnpm eval:draw glossary-terms --portal reference-insurer --store ../../data/db/sandbox.sqlite`
→ `evals/graders/human/labels/glossary-terms.yaml` with pairs, about half `dev`, half `test`. Running it again
prints `added 0`. The owner fills `label` and `why`, adding `hand-made` pairs for tricky cases.

## 4. Calibrate (US3, SC-004, SC-005)

`pnpm eval:calibrate glossary-terms --split dev` → table, TPR, TNR, flip rate, disagreements, a
report under `data/evals/judges/glossary-terms/`, in under 10 minutes for 20 pairs. After tuning,
once `--split test`; the numbers go into `findings.md` whatever they are.

## 5. In a trial (US1, SC-002, SC-003)

- `pnpm eval reference-insurer` → the result JSON has `workspace` and a `judges` entry with a
  verdict for every pair (errors counted).
- `pnpm eval reference-insurer --no-judges` → no `judges` section, no judge calls; `scores`,
  `checks` and the comparison are as before.
- Without a new trial: `pnpm eval:judge reference-insurer --store ../../data/db/sandbox.sqlite`
  prints the judge next to the code matcher per term.

## 6. Second judge (SC-001; the owner, later)

The owner adds `judges/rules.ts` and one line in `JUDGES`, then steps 3–5 with
`--judge rules`; no other file changes.
