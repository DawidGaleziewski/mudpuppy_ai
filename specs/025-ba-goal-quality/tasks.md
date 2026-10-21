# Tasks: BA goal quality (spec 025, R-39)

Plan: small enough to need none beyond spec.md (one grader fix, a guidance change, a
measurement). Model tags per memory `model-split-per-task`.

- [x] T001 [opus] grader: `screen_region` and `page_visit` evidence resolve to their state's route (`packages/docs/src/evaluate.ts`); test in `packages/docs/tests/evaluate.test.ts`; re-grade the 2026-10-12 reference store (rules 4 → 8/16)
- [x] T002 [opus] BA guidance FR-002/FR-003 in `.claude/skills/ba-practice` (SKILL.md pass 4 and `references/business-rules.md`). As built: v1 in pass 4 + the reference; v2 adds the check to pass 7 (synthesis) after run 1 showed no field-limit rule
- [x] T003 [opus] two reference-insurer evals; results and the re-graded baseline in `findings.md`; roadmap R-39 (processes decision to the owner). Rules 31.3 % → 56.3 % (v1) → 68.8 % (v2); findings F-04, F-05
- [x] T004 [opus] close-out: code-reviewer, suites, changelog, merge, tag, export

## Round 2: process scoring (owner decisions 2026-10-14)

- [x] T005 [opus] FR-005 `processes_map` in `packages/docs/src/evaluate.ts` + tests; re-grade the 2026-10-14T07-08 store (SC-003)
- [x] T006 [sonnet] FR-008 neutral rule examples in `ba-practice/references/business-rules.md`
- [x] T007 [opus] FR-006/FR-007 process traces in the eval: tasks, config flag, index, prompts, grade, results, gates schema; tests; README
- [x] T008 [opus] FR-009 one reference-insurer trial with traces; findings (F-11: processes 80 %, fields dropped → T010/T011)
- [x] T010 [opus] FR-010 data-item completeness in `ba-practice/SKILL.md` passes 5 and 7
- [x] T011 [opus] second reference-insurer trial with traces and FR-010; F-12 (processes 80 % again; BA writes less, owner decides a/b/c)
- [x] T009 [opus] close-out: code-reviewer, suites, glossary, changelog, merge, tag, export

## Round 3: split BA sessions, neutral guidance, new baseline (owner decisions 2026-10-14 evening)

- [x] T012 [opus] FR-011 split BA sessions in the eval: prompts (`ba`, `baTraces`), index, `analysisSessions` query, grade (both sessions completed), results + gates schema (`ba_traces_session`, `outcomes.ba_traces`); tests; README
- [x] T013 [sonnet] FR-012 neutral examples for the F-08 quotes in `ba-practice` (SKILL.md, business-rules, requirements-writing, use-cases, record-kinds, glossary); SC-006 search
- [x] T014 [opus] FR-013 reference-insurer trial with split sessions and neutral guidance; findings; promote if SC-005 holds (else a second trial, then promote the better one and say why)
- [x] T015 [opus] close-out: code-reviewer, suites, glossary, changelog, merge, tag, export

## Round 4: proving-ground quotes, relations to screens (owner decisions 2026-10-15)

Branch `feature/028-r51-r39-r33-relations-access` (with spec 028 and spec 024 P2).

- [x] T016 [haiku] FR-014 library-domain examples in the `ba-practice` SKILL.md URL section and the legacy-obstacles line; SC-007 search over every suite ground truth
- [x] T017 [opus] FR-015 reference-insurer trial with split sessions after R-51 and T016; findings (SC-008, spec 028 SC-002); baseline not promoted without the owner
- [x] T018 [opus] close-out with the branch
