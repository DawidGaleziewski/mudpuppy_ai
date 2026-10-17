# Session dump 2026-10-17: spec 034 phase 9 done, next = BA eval troubleshooting

Branch `feature/034-known-screen-export-navigation`, last commit e0b8aac, pushed, in sync.
NOT merged (stop before merge: no changelog, merge or tag until the owner says).
Untracked and to be left alone: `user_input/outputing_decent_docs/mock_docs/` (the owner's copy of
the approved export zip, plus 10 stale images step-7..11 from the first export).

## Done in this session (phase 9, tasks.md T038–T042)

- T038 (0f1a198): the owner-approved export of PROC-001 kept byte for byte in
  `apps/crawler/evals/reference-solutions/reference-insurer/PROC-001/` (out of prettier); roadmap
  R-73 "Crawler and export fixes from the first real export" (F-11..F-17).
- T039–T041 (9e78e80): ground truth gains per-field native messages, P01 `actions` and `apis`, the
  portal's `noise`; grader `evals/graders/code/export-quality.ts` (export_steps, export_fields,
  export_validation, export_actions, export_apis; must-be-0 export_extra_steps,
  export_action_strays, export_noise_leaked); the eval runs a probe scan of the calculator after the
  map (`--no-probe-scan`), the P01 trace chooses AC; glossary `export-quality-score`.
- T042 (e0b8aac): live trial `data/evals/reference-insurer/2026-10-17T20-12-16-690Z.json`, not
  promoted. Export scores equal the approved export (steps 100, fields 92.9, validation 58.3,
  actions 100, calls 100). BA side regressed: fields 18.5 (baseline 100), constraints 15.4 (98),
  processes 0 (80), `ba_session_completed` no. Cost $4.97, ~19 min.

## Owner decisions (2026-10-17, end of session)

1. **F-20** (traces BA session stops: `start_session` warns the trace runs are not grouped into
   processes; `ba.md` says stop on that warning, R-70): **test it the way we use it**. The eval
   harness groups each trace run under its ground-truth process before the traces BA session (what
   the owner does on Scans ▸ By process). Also fix the traces prompt ("these trace runs only"),
   which contradicts update mode: the map session already wrote PROC-001..004.
2. **F-21** (the map BA session, now over map + probe run, documented much less): **run the eval
   several times** (with and without `--no-probe-scan`), gather information, get to the bottom of
   it. Extra troubleshooting utilities may be added. Solve it; if not solvable, save everything
   gathered in a root folder `troubleshooting_logs/` (session transcripts, tool-call counts,
   evidence sizes, which records were written, scores per trial, hypotheses tested).
   Ideas to check: the probe run's evidence size vs the session budget/timeout, how many tool calls
   the session made and where it stopped, the BA transcript (CLI session files), whether the
   `ba(portal, runId, probeRunId)` prompt in `evals/prompts.ts` dilutes the task.

The owner said "don't start yet": nothing of this is started.

## Other open items (unchanged)

- F-18: PII (`jan.kowalski@example.com`, `601 234 567`) in `res_sample`, `map-run.e2e` fails every
  time; from T023; conflicts with "no masking in test environments"; blocks the merge; owner to
  choose scrub vs change the test.
- F-19: map golden e2e gets an extra `limiter_wait` span.
- F-14: gates LO-02/LO-32/LO-44 fail in the full slow tier, pass alone (flaky under load).
- Still open: F-01, F-02, F-09, F-11..F-13, T021 gate cases, the owner's mock ratings.

## Running processes at the end

- Dashboard on 8765 (background shell, PID 2748250) and the reference portal on 4011 (PID 2730930),
  both started for the owner. Stop by explicit PID only; check for orphaned pathfinder/Chromium.

## Rules in force

Live runs on test portals only; kill only printed own PIDs; edit tracked files with Edit/Write, not
scripts; commit per task group with task IDs after the checks; slow tier before changes to gates,
crawler runtime or crawler src; agent briefs forbid git stash/checkout/reset.
