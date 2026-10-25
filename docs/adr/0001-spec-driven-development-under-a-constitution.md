# ADR-0001: Spec-driven development under a versioned constitution

- **Status:** Accepted
- **Date:** 2026-09-20 (constitution ratified)

## Context

MudPuppy is built feature by feature, mostly by Claude Code agents working from written rules.
The project needed one place that states the non-negotiable rules, and a fixed path from an idea
to merged code that records why each choice was made.

## Decision

- `.specify/memory/constitution.md` holds the product's principles (I–VII), technical constraints
  and quality gates. It "supersedes other practices in this repository". Amendments need a written
  proposal, a semantic version bump (MAJOR / MINOR / PATCH), an updated Sync Impact Report and
  propagation to affected specs, plans and agent definitions before merge.
- Work follows GitHub Spec Kit (`.specify/`, skills `speckit-*`): every roadmap item `R-xx` in
  `roadmap.md` gets a feature branch, then `spec.md`, `plan.md` and `tasks.md` under
  `specs/NNN-*/`, written with the `po` agent; open questions are clarified first. Research
  decisions go in `research.md` as Decision / Rationale / Alternatives considered.
- Every plan has a Constitution Check; a violation is justified in the plan's complexity-tracking
  section or corrected.
- Commits are made per completed task group and name the task ids. Before merge: the
  `code-reviewer` agent (G-31), validation checkboxes, roadmap/spec/glossary updates, then the
  `CHANGELOG.md` entry (one per closed roadmap item), then merge to `master`.
- An item is `done` only when every task in its range in `tasks.md` is ticked.

## Consequences

- Good: decisions are traceable. The constitution went from 1.0.0 to 6.0.1 with each change
  recorded next to the user decision that caused it, and most specs carry their rationale and
  rejected alternatives (the sources of these ADRs).
- Good: superseded rules are marked, not rewritten (spec 021 R8: older specs get a "superseded by
  spec 021" note; history is kept).
- Bad: older documents stay in the repo with outdated rules, so a reader must check the newest
  constitution version. For example the top-level `README.md` still describes the production guard
  removed in [ADR-0018](0018-no-production-guard-environment-is-a-label.md).
- Bad: overhead per feature (spec, plan, tasks, review, changelog) even for small items; the
  roadmap was decluttered twice (R-52, R-67) by bundling small items on one branch.

## Alternatives considered

None recorded in the sources.

## Sources

- `.specify/memory/constitution.md` (Governance; Development Workflow & Quality Gates; version
  footer: ratified 2026-09-20)
- `CLAUDE.md` (Feature Workflow (SDD))
- `roadmap.md` (header), `CHANGELOG.md` (header)
- `specs/021-remove-production-guard/research.md` R8
- `THIRD_PARTY_NOTICES.md` (GitHub Spec Kit, `.specify/`)
