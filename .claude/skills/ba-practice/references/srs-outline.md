# SRS outline (what the documentation must let a team rebuild)

Adapted from ISO/IEC/IEEE 29148 for as-is documentation. The export renders these chapters from your
records; an empty chapter is a gap to explain in the session gaps.

1. Introduction — purpose, scope (observed area), personas, sources (runs). Business goals and
   stakeholders are **not observable**: leave them to `open_question`s.
2. Capabilities — `capability` + contained processes and screens.
3. Screens — `screen`: every page and meaningful UI state, route templates, elements, data shown,
   navigation between screens.
4. Processes and use cases — `process` + `use_case`.
5. Functional requirements — `requirement` with Given/When/Then.
6. Business rules — `business_rule`, decision tables.
7. Data dictionary — `data_item` per field, constraints; entities when fields group.
8. Glossary — `glossary_term`.
9. Non-functional — `nfr` (measured only).
10. Assumptions and questions — `assumption`, `open_question`.
11. Unknowns — everything `not_observable`/`needs_confirmation`, blocked follow-ups.
12. Traceability — generated from your evidence links.

Completeness check before `finish_session`: every screen seen in states has a `screen`; every form
field has a `data_item`; every visible constraint is in a `data_item` and a `business_rule`; every
entry point to a flow has a `process` or a `followup`; every domain term has a `glossary_term`.
