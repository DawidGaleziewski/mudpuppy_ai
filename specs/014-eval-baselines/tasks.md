# Tasks: Eval baselines and gap ranking (spec 014, R-29)

**Input**: `specs/014-eval-baselines/` (spec.md, plan.md). Branch `feature/014-r29-eval-baselines`.

**Model tags**: `[opus]` judgment, runs, verdicts, reviews; `[sonnet]` code-touching but well
specified; `[haiku]` text edits from an exact list. Sonnet/Haiku run as background subagents from
a brief naming the exact files; they never stash, checkout, reset, add or commit. Opus reviews,
runs the checks and commits per group.

**Rules**: Edit tool only, re-read after editing; log every bug or slip in `findings.md` with a
test/eval idea; no crawler/BA/agent change (FR-005).

## Phase 1: Setup

- [x] T001 [opus] Branch, spec, plan, tasks; `.specify/feature.json` → `specs/014-eval-baselines`.
- [x] T002 [haiku] `findings.md` (shape of spec 013's), roadmap R-29 → `in progress` with the
  spec link.

## Phase 2: US1 eval measures

- [x] T003 [sonnet] [US1] `packages/gates/src/eval-checks.ts`: `crawlScreens(gt, routes,
  persona)`, `passwordHits(places, secrets)`, `widgetActions(actionJsons)` (pure, D1–D4), exported
  from `index.ts`; `tests/eval-checks.test.ts`.
- [x] T004 [sonnet] [US1] `eval.ts`: optional `conditions`, optional session ids in `runs`
  (FR-002); `password_hits`/`widget_actions` > 0 are regressions without a baseline (FR-003, D6);
  cases in `eval-compare.test.ts`.
- [x] T005 [opus] [US1] `scripts/eval-run.ts`: gather the inputs (states' route templates, edges'
  action JSON, the vault passwords, the export, the transcripts), `--session-timeout` (D5), record
  session ids; split helpers to `scripts/eval/` if over 400 lines. (As built: helpers in
  `scripts/eval/{workspace,estate,sweep}.ts`; the sweep covers every password of the portal;
  F-01 preflight fix, F-02 server stop.)
- [x] T006 [opus] Review T003–T005, fast tier, `pnpm eval <portal> --dry-run` for all four,
  commit T001–T006.

## Phase 3: US2 baselines

- [x] T007 [opus] [US2] `pnpm eval reference-insurer --budget-usd 8 --promote --force-promote`;
  port/process check after (D8); findings.
- [x] T008 [opus] [US2] Same for `proving-ground-shop --persona guest`.
- [x] T009 [opus] [US2] Same for `proving-ground-bank --persona client --session-timeout 20`.
- [x] T010 [opus] [US2] Same for `proving-ground-insurer --persona client`. (As built: the first
  round of reference and bank was withdrawn, F-04; insurer re-run after the crawler fix F-08;
  shop crawl score corrected by hand, F-06. Baselines: 31ad568, 0188c02, 7ebfa43.)
- [x] T011 [haiku] [US2] `tolerances.json` per portal (5 per score, the values from T013 once
  known) and the `data/README.md` evals section lists the four baselines. (Done inline by Opus:
  the values came out of the T013 comparison.)
- [x] T012 [opus] Commit baselines T007–T011.
- [x] T013 [opus] [US2] Second eval per portal, same flags without `--promote`; compare; tolerances
  per D7; findings for every regression. (Crawl identical; BA variance on small totals widened
  shop constraints/fields/obstacles, bank obstacles, reference fields/constraints/rules, insurer
  terms; see criteria.md.)
- [x] T014 [opus] Commit T013.

## Phase 4: US3 criteria

- [x] T015 [opus] [US3] `criteria.md`: SC-003, SC-004, SC-005, SC-007 verdicts with result files;
  tick spec 009's open criteria in its spec/tasks notes.

## Phase 5: US4 gap ranking (blocked: user ratings)

- [x] T016 [opus] [US4] Read the `ratings` collection, write
  `specs/009-legacy-proving-ground/gap-ranking.md`.
- [x] T017 [haiku] [US4] R-28 text in `roadmap.md` lists the gaps in the ranked order. (As
  built: the user pasted the ratings into the session (the page's collection stayed empty); R-28
  holds "now", new R-35 "next", R-36 "later"; LO-24 reversed into R-37, LO-23 into R-38; plus
  R-39 BA goal quality, R-40 eval robustness, R-41 roadmap review and a Priorities section,
  user request 2026-10-08. Done inline by Opus: the edits needed judgment.)

## Phase 6: Close-out

- [x] T018 [opus] `code-reviewer` agent on the branch (G-31); fix or defer. (4 findings: 3 fixed,
  1 deferred; table in findings.md.)
- [x] T019 [haiku] Roadmap R-29 → done text, glossary sync (terms: crawl coverage score,
  password sweep if added), session dump.
- [x] T020 [opus] Full test close-out, changelog, user sign-off, merge. (Close-out green
  2026-10-09: crawler `pnpm test` 1677 passed, chat 222, workflow 27, dashboard and
  proving-ground pytest; changelog written; signed off 2026-10-09, squash-merged, tag v1.0.13.)
