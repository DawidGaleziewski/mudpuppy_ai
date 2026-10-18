# Findings: Processes, as-is first (spec 027, R-54)

Built 2026-10-18 while the owner was away ("go with dashboard items"); decisions taken by default
are listed for review.

## For the owner

- **D-1 Defaults for the three open questions** (spec.md): the stage control is in the process
  page's "As-is documentation" plate; archived processes' screens count as in no process,
  also for the assistant's grouping inputs; the SRS export stays without pictures.
- **D-2 Over the design package:** A is editable by screens (PR-03 said only scans) and the stage
  is a signed choice (PR-14 said derived). Both follow the owner's 2026-10-14 words in the spec;
  `docs/design/salvage-yard/…/10-processes.md` still states the old rules.
- **D-3 "Sign off A rN" again** while already `as_is_documented` writes another `stage` revision
  with the same stage (so the notice clears). Alternative: a dedicated `sign_off` change kind.
- **D-1 to D-3 confirmed by the owner 2026-10-18** (all kept as built). `10-processes.md` (design
  package, skill copies) updated: PR-03, PR-14, PR-15, section 4 lifecycle, roles, 6.4, 6.5, data model.

## Close-out review (code-reviewer, 2026-10-18)

| # | File | Guideline | Finding | Outcome |
|---|---|---|---|---|
| 1 | apps/chat/CLAUDE.md | G-30 | Spec 027 modules and routes missing from the notes | fixed |
| 2 | apps/crawler/packages/store/src/db-types.ts | G-01 / G-06 | 777 lines (limit 400), +6 here | deferred: split the table types by group as its own item |
| 3 | apps/chat/src/main.ts `main()` | G-02 | 84 lines (limit 80), one line changed here | rejected: on master already |

Note: `apps/chat/src/process-service.ts` is at 395 of 400 counted lines; the next addition splits it.

## Bugs and slips (with test / eval ideas)

- **F-01 Stabilizer browser tests fail one random test per run on this machine** (WSL,
  `apps/crawler/packages/crawler/tests/stabilizer.test.ts`; seen in `pnpm test:fast` and alone,
  each run a different test: CSS animation, EventSource, poll quiet limit, timeouts). Untouched
  by this branch (no crawler runtime change). The close-out `pnpm test` had 6 failures of the same
  kind (pipeline golden: every state `never_stabilized`; gates ground-truth S01, login-settle
  F-08, SC-11, SC-18, SC-19); 4 passed alone. A clean master worktree on the same machine fails
  the stabilizer file at random and the pipeline golden with the same `never_stabilized` diff,
  so it is the machine (Chromium settle timing on WSL today), not this branch. Test idea: mark
  the wall-clock ones `perf`-like (alone, after the rest), or widen their budgets under load;
  look at why pages stopped settling (a Chromium or Playwright update?). **Cause found
  2026-10-18:** the wall clock jumping ±6 s (spec 036 F-01); fixed on the machine, code fix in R-73.
- **F-02 The chat service cannot run on a copy of a store**: `apps/chat/src/main.ts` opens
  `<repo>/data/db/<env>.sqlite` and migrates it on start, so checking a branch with a new
  migration in the browser would migrate the owner's real store before the merge. The browser
  check of this branch used the dashboard alone on a migrated copy (`PATHFINDER_DATA_DIR`).
  Idea: honour `PATHFINDER_DATA_DIR` in the chat service as the dashboard does.
- **F-03 UI-check full-page screenshots show lazy thumbnails blank** (`loading="lazy"` images
  below the first viewport are not fetched before the shot). Only the screenshot; a browser
  loads them on scroll. Idea: the UI check scrolls once before the shot, or turns lazy loading
  off for the capture.
- **F-04 Step ids after an edit of A**: the first version reused a removed step's id (`s4`) for
  a newly added screen, which would pair it with the old step in History and Compare; new ids
  now come after every id the variant ever used (`usedStepIds`). Test: `processes.test.ts`
  "edits A".
