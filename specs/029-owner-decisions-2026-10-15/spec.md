# Spec 029: Owner decisions of 2026-10-15 on the v1.0.31 questions

Branch `feature/029-owner-decisions-2026-10-15` · Created 2026-10-15 · Status: Built

**Input**: the owner's answers to the seven questions of
`session_dump/2026-10-15-overnight-r51-r39-r33p2.md` ("1. yes 2. allow, but mark assumptions with a
mark so they can be checked 3. yes 4. yes i think 5. yes 6. review 7. they should"), with two
follow-ups answered in chat: the mark is "a Review item until checked" and "review" means
"measure first".

| # | Decision | Built |
|---|---|---|
| 1 | Promote the 2026-10-15 reference trial as the baseline | FR-001 |
| 2 | Allow `assumption depends_on business_rule` and `use_case depends_on business_rule`; every assumption is checked: a Review item until confirmed | FR-002, FR-003 |
| 3 | Name `glossary_term appears_on screen` in the BA guidance's pass 5 | FR-004 |
| 4 | "Explained" stays a citation rule (spec 024 F-11) | recorded |
| 5 | Side by side keeps pairing by role and place (spec 024 F-12) | recorded |
| 6 | Measure the Review nav count on a big store first; cache only if slow | FR-005 |
| 7 | Links to things named by a per-portal key name their portal | FR-006 |

## Requirements

- **FR-001**: `data/evals/reference-insurer/baseline.json` = trial `2026-10-15T18-28-26-019Z`; the
  old baseline in `history/` (what `promote()` does; the trial ran without `--promote`).
- **FR-002**: `depends_on` also allows `assumption → business_rule` and `use_case → business_rule`
  (migration 0020, triggers only; `RELATION_RULES`; drift and down tests). The BA guidance names it.
- **FR-003**: Assumptions are their own Review group, "Assumptions to check", until a reviewer
  confirms them (the same confirm / reject / comment as records; they leave "Records to confirm").
  A record page marks an unconfirmed assumption that points to it "To check"; the SRS export lists
  "Assumptions resting on this" on the record, "— to check" until confirmed.
- **FR-004**: `ba-practice` SKILL.md pass 5: a glossary term relates to each screen that shows it
  with `appears_on`.
- **FR-005**: A `perf` test times `queries_review.count()` on 300 screens × 5 personas.
- **FR-006**: `Ctx.url` adds `portal=` to links to `/processes/…` and to Review links that select an
  item, when a portal is chosen.
