# Tasks 037 (R-76, R-62 (5), R-55 (2))

- [x] T001 [opus] FR-007 S07: `reachState` replays the recorded path when the deep link misses the element; gate F-11@031 gap → gate (38f520a)
- [x] T002 [opus] FR-003 offline fault aborts the step request too; gate F-03@036 on SC-04 (failed before: no request to break) (4537165)
- [x] T003 [sonnet] FR-001 radio group label for native messages and probe targets; unit tests (0ac151c)
- [x] T004 [opus] FR-002 revealed fields probed from their branch (probes `revealedTries`, press `after` writes, queue); scar SC-24 + gate (failed before) (0ac151c, 637c694)
- [x] T005 [sonnet] ~~migration 0029 `transit_pages`~~ dropped: transit pages live on the landing visit's hops (plan D-1), optional `NavigationHop` fields, no migration (909fb66)
- [x] T006 [opus] FR-004 login scope exemption + learned transit hosts; gate: focused run logs in through SC-16 (failed before) (909fb66)
- [x] T007 [opus] FR-005 URL-only success waits out transit hosts; portal `scar-maker-sso-url` + gate (failed before) (909fb66)
- [x] T008 [opus] FR-006 keep and mark transit pages; login result and note; gate (909fb66)
- [x] T009 [opus] close-out: slow tier (green), reference trial (`2026-10-18T13-03-10-082Z`, validation 100 %, F-04/F-05 from the BA), code review (1 fixed, 2 deferred, 2 rejected), findings, roadmap (R-76, R-62, R-55 done), glossary, changelog; merge left to the owner
