# Tasks: BA goal quality (spec 025, R-39)

Plan: small enough to need none beyond spec.md (one grader fix, a guidance change, a
measurement). Model tags per memory `model-split-per-task`.

- [x] T001 [opus] grader: `screen_region` and `page_visit` evidence resolve to their state's route (`packages/docs/src/evaluate.ts`); test in `packages/docs/tests/evaluate.test.ts`; re-grade the 2026-10-12 reference store (rules 4 → 8/16)
- [x] T002 [opus] BA guidance FR-002/FR-003 in `.claude/skills/ba-practice` (SKILL.md pass 4 and `references/business-rules.md`); export-fork gets it with the export. As built: v1 in pass 4 + the reference; v2 adds the check to pass 7 (synthesis) after run 1 showed no field-limit rule
- [x] T003 [opus] two reference-insurer evals; results and the re-graded baseline in `findings.md`; roadmap R-39 (processes decision to the owner). Rules 31.3 % → 56.3 % (v1) → 68.8 % (v2); findings F-04, F-05
- [x] T004 [opus] close-out: code-reviewer, suites, changelog, merge, tag, export
