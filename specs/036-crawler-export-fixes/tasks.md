# Tasks 036 (R-73)

- [x] T001 [opus] FR-001 monotonic clock for every wait (clock.ts, tracker, condition wait, stabilizer, mounts, client redirect, wait-for-mount), tests with a jumping wall clock (the new test hangs on the old code) (e6b09ab)
- [x] T002 [sonnet] FR-005 the three browser files 20× in the fast tier; findings (`mounts`, `stabilizer`, `trusted-ca` together: 20 of 20 runs green, 26 tests each, after T001 and the clock fix)
- [x] T003 [opus] FR-004 a request that already had a response is not an error (a 204's aborted empty body); the unread-answer stall did not reproduce (F-02); scar SC-21 + gate (fails without the fix)
- [x] T004 [sonnet] FR-003 hidden controls left out of forms; scar SC-22 + gate (fails without the fix) (759f44c)
- [x] T005 [opus] FR-007 a radio group is one field with options; test on the "Zakres" markup (596de9c)
- [x] T006 [opus] FR-002 Chromium's error page (`chrome-error://`, path `/`) after a blocked submit keeps the submitting page's route and is a technical state; scar SC-23 + gate (fails without the fix); offline on page loads logged as F-03
- [x] T007 [sonnet] FR-006 export steps start at the process's start screen (2ae46cd)
- [x] T008 [opus] FR-008 probe limits: budget 24 per step and 120 per run (owner 2026-10-18, ed21249); a probes test shows 24 covers both limits of every number box and the postcode format of the reference calculator (12 skipped 5 tries, both "Pojemność silnika" limits among them)
- [x] T009 [opus] close-out: reference trial (`2026-10-18T10-48-21-331Z`, no regression: extra steps 0, strays 0, fields 100 %, validation 83.3 %, F-04), slow tier, code review (3 findings, all fixed), findings, roadmap (R-73 done, R-76 leftovers), glossary (budget figures; no new terms), changelog
