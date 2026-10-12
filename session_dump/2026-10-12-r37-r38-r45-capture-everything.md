# Session dump 2026-10-12: R-37 + R-38 + R-45 on one branch (spec 019)

Branch `feature/019-r45-r37-r38-capture-everything`, pushed. Not merged: merging to master waits
for the owner.

## Done (committed)

- T001–T002 SDD docs (`af14b7d`); T003–T006 foundations (`1984e8a`); T007–T011 capture, hops,
  client-redirect wait, gates LO-21..LO-24 (`cc7ed57`); T014–T021 inventory, BA kinds, export,
  generated record shapes, refusal grader (`f101841`); T024–T026 dashboard stores and "Reached
  under" (`6e2ab21`); T012–T013, T022–T023 frame mounts LO-53, statement LO-52, glossary
  (`d7dcb12`); T028 evals + fixes F-07/F-09 (`0e46abe`); T029–T030 review, package notes,
  roadmap, changelog, monotonic step clock F-11 (`9c8a154`).
- Evals (one trial each, `data/evals/*/2026-10-1*`): bank 12/13 crawl, refusals 4 %; insurer 5/6,
  7 %; shop 4/6, 12 %; reference 17/17, 12 %. Not promoted (findings F-08, F-10).

## Open

- Merge to master + tag + branch deletion: owner's go-ahead.
- Findings open: F-08 (bank crawler agent stopped early), F-10 (12 % refusals = guessed relations;
  BA merges form fields), F-11 residual load flakes (trace phase sum, golden twice in 18 loop runs).
- A second reference trial would confirm the F-09 skill fix (`route_templates` path-only).

## Questions for the owner

See the closing message of the session (also in spec 019 Assumptions).
