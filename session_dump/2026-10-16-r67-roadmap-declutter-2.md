# Session dump 2026-10-16/17: R-67 roadmap declutter 2 (spec 031)

Owner: "declutter the roadmap. Merge all smaller and maybe some larger tasks into one branch task
and start doing. Work as long as possible." Branch `feature/031-r67-roadmap-declutter`
(spec 031). **Not merged**: the merge waits for the owner.

## Done (commits on the branch)

- 6104306 spec, tasks, findings, roadmap row R-67
- eeecbb8 T001–T002 hooks: `no-script-edits` catches heredoc/cd/Python writes (unittest cases),
  prettier PostToolUse hook works, review tests run on `apps/crawler/scripts/` changes
- 684c98f T003–T004 act crash test, doctor CONNECT probe
- 801fc49 T005–T006 hook body under tsx (e2e), gate F-08@030, spec 030 findings indexed
- 003b2ed T007 GC-10
- 52a1cb1 T008–T009 dashboard header environment, stray-server callout
- afbbe46 T010–T011 guard mutation 73 → 96 %, `network.ca_file`, doctor `tls.ca-file`
- d3d55c0 T014, T016 link counts fold (non-zero only), `data_items_code_names`
- 837c6c1 T017–T018 trace grouping suggestion, flowchart per variant
- (last commit) T012, T013, T015, T019 (deferred), T020–T023: autofill labels/masks, S05 gate,
  S07 known gap, the shared wait in settle and mounts, four refactors, roadmap, glossary,
  changelog

Slow tier: green on afbbe46 (worktree); the run on the final tree is in the last commit message.

## Calls Claude made (owner to confirm or reverse)

1. **Link counts (T014)**: the proposal said "drop trailing counts"; that would have undone the
   owner's F-04@026 rule ("Koszyk (1)" ≠ "Koszyk (0)"). Built instead: zero stays apart, non-zero
   counts fold. Findings F-07.
2. **Trace grouping (T017)**: `portal:trace` writes an open grouping *suggestion*, not a process
   (Pathfinder only proposes). The BA accepts it in Processes.
3. **Shared wait defaults**: settle quiet = 10 s (as before), hard = 30 s; mount quiet = 3 s
   (above LO-53's 1.5 s silent mount), hard = `mfe_wait_ms`. An app silent for more than 3 s
   before mounting needs `timeouts.mfe_quiet_ms`.
4. **CA trust (T011)**: Chromium trusts the CA by key only when the proxy presents it (no
   `certutil` here, and installing it is a machine change). The doctor says which certificate to
   put in the file.
5. **Deferred refactors**: four of the 13 done in this branch (open decision 7 asked whether to
   make a new item; dropping commit T023's part reverses it).

## Not done / blocked

- **T019 LO-27** script-written pop-ups: needs a second-page observation path in the pipeline
  (findings F-09); stays a gap in R-35.
- **T013 S07**: the real cause is a screen that differs when loaded by URL vs reached by a click
  (findings F-11); needs R-66's reach-by-navigation. Known gap F-11@031.
- **T015**: no code, by design (findings F-12).
- Remaining deferred guideline findings: listed in tasks T023.
- Close-out: code-reviewer run and its findings, the full `pnpm test` and every app's suite are
  in the last commit / below.

## Close-out

- Slow tier on the final code: e2e 56, gates 152, perf green. test:fast green after the review.
  chat (255 + 3 browser e2e), workflow (29), scar-maker (7), proving-ground backend green;
  dashboard: the suite ran in every commit hook.
- code-reviewer: 12 findings, 4 fixed (5e5cc56), 6 deferred, 2 rejected (findings, close-out
  review table).
- **Not pushed, not merged.** See F-13: my commits took another session's staged and edited files
  (your `user_input/` files incl. a 7.4 MB zip, the transit-zones discussion, spec 030's spec.md,
  roadmap R-68/R-69/R-66/R-62/decision 1). Decide keep or drop before the merge.

## For the owner

- Another session recorded owner decisions on "graph_handler" (memory
  `graph-handler-decisions.md`: transit zones learned and recorded, replay to node). Those touch
  R-62 Q3 and R-66; this branch did not act on them.
- The open decisions under [battle-tested-scar] are unchanged except 7 (partly done).
