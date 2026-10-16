# Tasks: battle-tested scars (spec 030)

Plan: none beyond spec.md; each group is a scar (reproduced in scar-maker) and its fix. Model tags
per memory `model-split-per-task`; overnight, everything done inline by Opus. Order follows the
roadmap priority; anything blocked moves to the end (owner, 2026-10-15).

## R-56 scar-maker

- [x] T001 [opus] `apps/scar-maker/` Node server (two loopback hosts, dev 4300 / gate 4400), `scars.yaml`, `CLAUDE.md`, README, root workspace entry, unit tests of the catalogue
- [x] T002 [opus] gates: `SC-nn` ids, scar-maker started by the gate global setup, scars in the uncovered report; `portals/scar-maker/portal.yaml` + guest persona

## R-57 clicks and classification

- [x] T010 [opus] SC-01 one-big-form: anchors do not inherit the form's method (C-2); gate
- [x] T011 [opus] SC-02 XHR 403 does not stop the run (C-1); gate
- [x] T012 [opus] SC-03 `javascript:` postback "Next" link does not crash (C-7); gate
- [x] T013 [opus] SC-04 select by visible label (C-5); gate
- [x] T014 [opus] SC-05 German submit labels (GC-14): per-locale keywords; gate
- [x] T015 [opus] SC-06 re-rendering tile list, slow tile (C-3/C-4); gate or gap

## Owner additions (2026-10-15, mid-run)

- [x] T016 [opus] SC-17 intermittent error pages: some visits of scar pages answer a transient error page (500 / "service temporarily unavailable" / an error page served with 200) at random-but-seeded moments; the crawler retries or records the error as transient, the map keeps the real screens, and the BA can still document the screens from the good visits (error visits never become screens of their own nor replace a good one); gate + eval check
- [x] T017 [opus] SC-18 multi-step form wizard: 3 steps with Back and Next, several validators per step (required, format, length, cross-field), a Next/Submit button that stays disabled until the step is valid, a final submit step with a success page or an error page; the trace records every validation state (each error message), passes all validators, goes back and forward, and reaches the success page; gate (+ R-64 trace driver later)

## R-58 frontier

- [x] T020 [opus] SC-07 `javascript:window.open` popup + hidden items: retire unactionable items, `finish_run` completes with the remainder (GC-15/16/18); gate

## R-59 fix-plugins

- [x] T030 [opus] `__name` shim in hook `inPage` (FR-033)
- [x] T031 [opus] `@pathfinder/fix-plugins` package, `fixes:` in the portal schema, runner wiring
- [x] T032 [opus] plugins seed-cookie (SC-08), expand-collapsed (SC-09, SC-10 default-open guard), wait-for-mount (SC-11), detect-stack; gates

## R-60 evidence when ready

- [x] T040 [opus] render warnings for failed stylesheets/scripts (SC-12, GC-13); gate
- [x] T041 [opus] condition wait primitive (FR-040); used by login (the form, the verdict). Not yet in navigate/act/mounts (see findings F-10)

## R-61 environments

- [x] T050 [opus] no default env; declared environments guard; env in results (SC-13)

## R-62 login

- [x] T060 [opus] C-6 bound inputs (SC-14), late SPA login form (SC-15), multi-hop cross-host login (SC-16), `pending`
- [x] T061 [opus] static-file rate budget

## R-63 network

- [x] T070 [opus] `network.proxy` + doctor registry (SC-13 with a real forward proxy and egress allowlist; `pnpm portal:doctor`)

## Later items started overnight (owner: "then the other suggestions")

- [x] T080 [opus] R-64 trace driver: `traces.yaml` schema (variants, stubs), `driveTrace`, `pnpm portal:trace`, in-process client (`openLocalClient`), scar-maker catalogue; gate (SC-18 second case)
- [x] T081 [opus] R-65 (1) narrow warning on `start_session`, (3) run selection (interrupted traces) in the BA agent and skill, (4) quality flags in `docs:audit` (`steps_uncited`, `no_requirements`, `duplicate_screen_route`)
- [ ] T082 [opus] R-65 (2) doc record ↔ reconciled process cross-link and the rename of the two "processes" pages (needs the owner: D-9 naming), (5) `api_endpoint` record kind (schema change via db-admin)
- [ ] T083 [opus] R-66 map from a known screen (resume-from-node)

## Close-out

- [ ] T090 [opus] scar-maker eval task + baseline: task, ground truth, two crawler-only trials (34.8 % with a ground-truth slip, 54.3 % after the fix, $0.8 each); not promoted while F-16 (numbered sections collapse to `/:param`) is open
- [x] T099 [opus] code-reviewer, suites, glossary, roadmap, changelog, session dump; merged 2026-10-16 (owner: "merge, leave all rest of decisions for later"), v1.0.33
