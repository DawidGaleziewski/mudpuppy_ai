# Spec 028: Relations to screens (R-51)

Branch `feature/028-r51-r39-r33-relations-access` · Created 2026-10-15 · Status: Built

The branch carries three roadmap items at the owner's request (2026-10-15: "merge these into one
branch and do all of them"): R-51 here, R-39 round 4 (spec 025 FR-014, FR-015) and R-33 P2
(spec 024 P2). Each keeps its tasks in its own spec.

**Input**: owner decisions 2026-10-15 on the rating page and in chat:

- spec 025 F-05: "allow `glossary_term appears_on screen`" (about 10 of 12 `RELATION_NOT_ALLOWED`
  refusals in the 2026-10-14 reference trial were this guess);
- spec 025 F-15: "allow the relation (process → screen)", in R-51 with the glossary one (the
  traces session tried `process depends_on screen` and `use_case contains screen`).

Not decided, so not built: R-51's original intent "this assumption is about that rule" (an
assumption → business rule link) and `use_case → screen` (memory `dont-widen-removals`).

## Requirements

- **FR-001**: `appears_on` also allows `glossary_term → screen` (a term appears on the screens that
  show it).
- **FR-002**: `contains` also allows `process → screen` (a process contains the screens its steps
  pass through). An existing type is reused, so the store's `doc_relations` CHECK is unchanged.
- **FR-003**: The store refuses and accepts exactly what `RELATION_RULES` does (migration 0019
  recreates the two triggers; the exhaustive drift test covers it). The down deletes the rows of the
  two new triples (lossy, as 0014's down).
- **FR-004**: The SRS export lists a screen's terms ("Terms shown") and processes ("Processes
  through this screen") apart from its data items.
- **FR-005**: The `ba-practice` skill tells the BA to use both (pass 3: a process contains its
  screens in step order; glossary: a term appears on its screens). The write contract text is
  generated from `RELATION_RULES`, so the tool description and refusals follow.

## Success criteria

- **SC-001**: For every (from kind, type, to kind) the store and `isAllowed` agree (drift test).
- **SC-002**: The next reference-insurer trial (spec 025 T017) shows no `glossary_term appears_on
  screen` or `process … screen` refusals.
