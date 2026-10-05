# Specification Analysis Report: spec 009 after implementation (2026-10-05, T045)

Read-only cross-check of spec.md, plan.md, tasks.md, contracts/ and the built code. The
resolutions in the last column were applied afterwards as part of T045 (docs only), unless they
say "open".

| ID | Category | Severity | Location(s) | Summary | Resolution |
|----|----------|----------|-------------|---------|------------|
| I1 | Inconsistency | MEDIUM | contracts/login-tool.md:46 | The contract names decision-log kinds `login`/`relogin`/`handoff`; `decision_log.kind` has a DB CHECK, so the build logs `kind = note` with `rule` = `login`, `relogin`, `handoff:captcha` (data-model.md already says so) | Contract updated to the as-built rules |
| I2 | Inconsistency | MEDIUM | contracts/login-tool.md:43, research.md §6, FR-019 | Contract: tracing paused during fill and submit. Built: no Playwright trace at all for runs with vault credentials (decision `pw_trace:off_with_credentials`), because re-login happens inside other calls' chunks | Resolved in the review session: the user chose a masked trace (FR-019a); built as a paused chunk around every login (`pw_trace:login_masked`) and a gate that searches the trace zips |
| I3 | Coverage | HIGH | FR-023, SC-006 | The gate suite takes about 4.6 min (78 cases + 35 self-checks), above the 3-minute budget; the cost is real waits (LO-32 session expiry ~21 s, SSE pages hitting the stabilizer ceiling, LO-35's four fresh browsers) | Resolved in the review session (F-14): the cost was the configs' 5 req/s politeness limit and SSE pages; F-06 fixed, gates run at 20 req/s, slow cases moved to `pnpm test:slow`. `pnpm test` gates 2m05s, full set 2m38s |
| I4 | Inconsistency | LOW | contracts/gates-evals.md:14-15, research.md §8 | Contract: global setup starts the reference portal on 4210, session timeout 5 s, one vault for all. Built: reference portal started per test on a free port, timeout 20 s (F-06), a throwaway vault per gate server | Contract and research updated |
| I5 | Inconsistency | LOW | contracts/ground-truth-v2.md:51-60 | Self-check is said to live in `apps/proving-ground` and to check obstacle markers on pages. Built: `pnpm gt:check` in apps/crawler (Playwright lives there); markers are written for BA records, so check 4 is "obstacle ids are in scope in the catalogue" | Contract updated (tasks.md T019 already says so) |
| I6 | Underspecification | MEDIUM | FR-022, contracts/login-tool.md "CAPTCHA hand-off" | "Actions inside the CAPTCHA container are issued with allowed: false, skip_reason captcha_handoff" is not built. Nothing issues such actions today (the widget's controls live in a cross-origin iframe and have no roles), so no behaviour is missing, but the guard is untested | Open: noted as a known limitation; a gate needs a same-origin widget with roles |
| I7 | Underspecification | LOW | contracts/estate.md (bank rules), FR-004 | The "after 22:00 → next working day" rule reads the time from a request header `X-PG-Clock-Time` (default 12:00) that the UI never sends; only tests reach it | Contract note added |
| C1 | Coverage | HIGH | SC-004, SC-005, SC-007 | Not verified yet. Two capped evals ran ($3 per agent): the crawler was cut off by the budget (F-12), so no baseline was promoted | Open: needs larger eval budgets, user's call |
| C2 | Coverage | MEDIUM | FR-008, docs/legacy-obstacles.md | LO-49 is only partly reproduced (no PESEL/NIP form); LO-41 has no screen; LO-44 ticks the exchange rate, not the balance | Recorded in the catalogue cells ("not yet" parts) |
| C3 | Coverage | MEDIUM | US6 gates | 20 known gaps are Pathfinder behaviours the estate exposes that the crawler does not handle yet (div buttons LO-10/18/34/08, placeholder-only fields LO-11, iframes/frames LO-02/04, session id in templates LO-24, pop-ups LO-27, classic POST LO-43, A/B clusters LO-35, interstitial merge LO-23, map-mode field actions LO-48/47, and 7 finding gaps). Spec 009 builds the gates, not the fixes | Open: proposed as a follow-up roadmap item |
| D1 | Constitution | LOW | Principle V "Traces and screenshots are stored as recorded" | Turning Playwright traces off for credential runs is not a masking decision and keeps the principle (nothing is masked; one optional debug artefact is not made); screenshots are kept | No change |

**Coverage summary** (FR → tasks → built):

| Requirement | Tasks | Built | Notes |
|---|---|---|---|
| FR-001 to FR-007 | T001–T016 | yes | smoke walk 15/15 |
| FR-008 | T014–T021 | partly | C2 |
| FR-009 | T005 | yes | answer only in PNG pixels (pytest) |
| FR-010, FR-011 | T017–T020 | yes | 35 self-checks pass |
| FR-012 | T007, T009–T013 | yes | Console tokens in the shell; shop uses its own light palette (subagent choice) |
| FR-013 | catalogue | yes | |
| FR-014 to FR-017 | T022–T024, T027 | yes | |
| FR-018 to FR-020 | T026, T028–T030 | yes | I2 |
| FR-021 | T024, T025 | yes | users generated 2026-10-05 |
| FR-022 | T031 | partly | I6 |
| FR-023, FR-024 | T033–T039 | yes, over budget | I3 |
| FR-025 | T036 | yes | 41 findings indexed |
| FR-026 to FR-029 | T040–T043 | yes | C1 |

**Metrics**: 29 functional requirements; 47 tasks (T043, T045 sign-off steps and T047 open);
coverage 100% by tasks, 27/29 fully built (FR-008, FR-022 partly); ambiguities 0; duplications 0;
critical issues 0.

**Next actions**: user decisions on I3 (gate budget), C1 (eval budget and baselines), C3 (follow-up
item for the known gaps), I2 (Playwright traces with credentials).
