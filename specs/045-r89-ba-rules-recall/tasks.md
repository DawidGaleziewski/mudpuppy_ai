# Tasks: spec 045 (BA rules recall)

Plan: diagnose on the kept workspaces (free), build the server list and the guidance, then spend
the trial budget, then tighten the matcher and regrade.

- [X] T001 [opus] Regrade the six kept 2.0 trial workspaces offline; per-rule misses and where their evidence is (`findings.md` F-01)
- [X] T002 [opus] `services/ba/rule-pass-check.ts`: candidates from probe messages, validation alerts and form hints; warning after `rules` and `synthesis` (`sessions.ts` `passWarnings`)
- [X] T003 [sonnet] Unit test in `tests/ba-session.test.ts`; check on a copy of the latest trial store (18 candidates listed, F-01)
- [X] T004 [opus] Guidance: `ba-practice` passes 3, 4, 7; orchestrator grouping lines (R-78's fixes)
- [X] T005 [sonnet] Eval diagnostic `rules_constraint_only` (`graders/code/docs-coverage.ts`, `grade.ts`) + unit test
- [X] T006 [opus] R-80 (1): `textMessages` (`source: 'dom-text'`) in `runtime/pipeline/probe.ts`, schema enum, export wording; unit test; claim-wizard gate asserts the message
- [X] T007 [opus] Slow tier (runtime change), commit (two gate fixes: F-03@038's message stays on the page, F-18@032's filter text on the happy press)
- [X] T008 [opus] Trials within $20 (reference-insurer), grouping eval trials; findings F-02–F-05 ($18.71)
- [X] T009 [opus] F-13 stricter rule matcher (`claim_markers_all`), regrade kept workspaces, new baselines
- [ ] T010 [opus] Close-out: code review, roadmap (R-89, R-84, R-78, R-80, R-36), glossary, changelog, merge, push
