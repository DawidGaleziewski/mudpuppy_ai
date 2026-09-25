# Specification Quality Checklist: Dashboard UI

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-25
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- The user's input names the stack (FastAPI, Pydantic, uv, htmx). The spec keeps it out of the
  requirements and records it only in the Input line; the stack is fixed in plan.md.
- "Updated live when we push changes" had two readings; both are covered (FR-008, FR-014) and the
  choice is recorded under Assumptions rather than as a clarification.

## Implementation verification (2026-09-26)

**T024, frontend-dev dry run.** `.claude/agents/frontend-dev.md` only registers when a Claude
Code session starts, so the dry run used a general-purpose agent told to follow that file as its
instructions (read-only). Asked how it would add an "Open questions" tab, it:
- loaded skill `revamp-dashboard` and `pathfinder-console.md`
- reused `m.region`, `m.filter_form`, `m.pager`, `m.empty`, `_page` and `_grouped`
- kept status in text, added no tokens and no animations
- planned query and route tests first
- ended with the scorecard

It found 7 gaps in the docs. All are addressed in the "Recipes" section of `pathfinder-console.md`
(adding a section, approving labels, loading, screenshots and contrast, hand-offs) and in one new
rule in the agent file. The README it found empty was being written while it ran.

**T028, quickstart scenarios** (real store `production.sqlite`, plus scratch, empty and missing
stores):

1. Overview: liveinsurer, 9 runs (`[INT.]` 7, `[STOP]` 2, both with their reCAPTCHA warning), 561
   actions allowed and 39 skipped. Pass.
2. Run detail: all 7 sections render with counts; states show `observed` and their evidence
   reference. Pass.
3. Filters: runs by status in a browser. The region swaps, the URL becomes `?status=running`, and
   the filter survives a reload (`test_decisions_filter_survives_reload`). Pass after a fix: an
   empty `portal=` from the "any" option had filtered on `""` (regression test
   `test_empty_form_values_mean_any`).
4. Live update: a run inserted into the scratch store appeared after **1.3 s** without a reload,
   with the live dot, and the summary counted it. Pass.
5. Connection lost: the stale banner shows when the server stops, and clears **1.9 s** after it
   comes back. Pass.
6. Dev reload: the page reloads **3.3 s** after a template edit. Pass after a fix: uvicorn waited
   forever for open SSE streams, so `timeout_graceful_shutdown=1` was added.
7. Read-only: sha256 of `production.sqlite`, `-wal` and `-shm` is identical before and after 127
   page and fragment requests plus an event stream; `tests/test_readonly.py` passes. Pass.
8. Empty and missing store: designed states render (`screenshots/empty-1280.png`,
   `store-missing-768.png`); `/healthz` returns 503 for a missing store. Pass.
9. Frontend agent: the file exists, `lint_agent.py` reports no errors, and it points to
   `revamp-dashboard`. Pass. It becomes delegable after a session restart.
