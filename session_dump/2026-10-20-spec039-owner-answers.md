# Session dump 2026-10-20: R-81 owner answers and roadmap freeze

Short session, no code changed. Previous state: `2026-10-19-spec039-session-summary.md`.

## State

- Branch `feature/039-r81-mudpuppy-2-portal-model`, last commit ad6bcba. Not merged, not pushed.
- Commits this session: 552f11c (roadmap freeze, decisions, tasks T081, T082, T110–T115),
  ad6bcba (T116).
- Untracked: `user_input/MudPuppyRebrand/mudpuppy-salvage-yard (3).zip` (the designer's package,
  owner's input; not committed by Claude).
- Tasks: 28 of 56 done. The branch is not ready to merge; the owner wants **all of 2.0 finished on
  this branch**, then merge as v2.0.0.

## Roadmap freeze (owner)

Only R-81 is worked on until it merges. Every other open item is `frozen until R-81` (note at the
top of `roadmap.md`). After the merge, **R-86 roadmap review comes first**.
New items: R-82 (τ, decided), R-83 (rename pathfinder-ai → MudPuppy, after R-81), R-84 (revisit
the R-77 process guidance), R-85 (revisit τ acceptance), R-86 (roadmap review).

## The 8 owner questions: all answered

| # | Answer | Task |
|---|---|---|
| 1 Constitution 6.0.0 | confirmed | — |
| 2 F-06 table names | rename to the design's: `edges` → `transitions`, `page_visits` → `observations`, everywhere, all green | T110 |
| 3 F-02 fingerprint v2 | fingerprint rules become per-portal profiles in portal YAML (`fingerprint: { use, profiles }`, like `fixes`), profile recorded per observation, re-fingerprint + compare commands, menu-change scenario | T111–T114 |
| 4 R-77 | owner accepted proposal (1) guidance, (2) eval check, (3) marked trigger step; revisit in R-84 | T076, T081, T082 |
| 5 UX designer | delivered `user_input/MudPuppyRebrand/` (v2 screens `v2-01`…`v2-16`, `docs/12-v2-ux.md`, fixtures, updated skill); check against `ux-requirements.md` first. Also `mudpuppy.md`: rename to MudPuppy + logo/favicon → R-83 (GitHub repo can simply be renamed; it redirects) | T100 |
| 6 F-20 run name | design naming: driver runs `mode = 'probe'`, one path = a "replay"; spec 032's marked-step probing renamed "form probing" | T116 |
| 7 F-28 calibrated τ | a person accepts it; one τ per portal and fingerprint profile; profile's `cluster_threshold` is the default; revisit R-85 | T115 |
| 8 F-26/F-27 | accepted | — |

Owner naming rule: **use the design's names; only when the same term would mean two things, rename
the other side.**

## Next session: planned order

1. T110 table rename, T116 run naming (both renames first, together).
2. T111–T114 fingerprint profiles, T115 τ acceptance.
3. Rest of M5 (T038, T055, T064, T070, T073–T082), M6 (T090), M1/M2 gates (T023, T042).
4. T100 designer's pages (`frontend-dev`, `mudpuppy-salvage-ui`).
5. Close-out T101–T104: glossary, code-reviewer, full suites + three reference-insurer trials,
   export-fork export, changelog, squash-merge, tag `v2.0.0`.

Then R-86 (roadmap review), then R-83 (rename).
