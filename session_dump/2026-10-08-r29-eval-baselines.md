# Session dump: R-29 eval baselines (2026-10-08 → 09)

Branch `feature/014-r29-eval-baselines`, spec `specs/014-eval-baselines`.

## Done (committed)
- T001–T006: spec/plan/tasks; eval measures (crawl_screens, frontier_pending, password sweep incl.
  transcripts and export, widget_actions, --session-timeout); F-01 preflight, F-02 server stop.
- F-04: evals abort on agent API errors / usage limit (hit twice); first two baselines withdrawn.
- F-06: crawl_screens ignores route parameter names. F-08: crawler follows hash-route links
  (YAML-quoted `/url`), slow tier green.
- T007–T015: four baselines + second runs + tolerances; `criteria.md` (SC-003, SC-007 met;
  SC-004, SC-005 not met).
- T016/T017: gap ranking (user pasted it) → `gap-ranking.md`; R-28 reordered; R-35..R-41 and a
  Priorities section; R-39 and R-33 confirmed must have.
- T018/T019: code review (3 fixed, 1 deferred), glossary sync (2 terms), roadmap R-29 text.
- T020 part: full close-out green, changelog written.

## Open
- T020: user sign-off, then squash-merge to master, tag v1.0.13, delete the branch, R-29 → done.
- Not touched: `user_input/loose_ideas/readme.md`, `user_input/redesign/readme.md` (the user's
  own uncommitted edits).
