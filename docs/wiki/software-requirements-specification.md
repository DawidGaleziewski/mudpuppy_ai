---
title: Software requirements specification (SRS)
glossary: [srs]
citations:
  - source: "IREB, Glossary of Requirements Engineering Terminology (Martin Glinz)"
    edition: "Version 2.2.0 (2025)"
    section: "Requirements specification; Software requirements specification"
    url: https://cpre.ireb.org/en/downloads-and-resources/downloads
    checked_on: 2026-10-03
    quote: "A requirements specification pertaining to a software system."
  - source: "ISO/IEC/IEEE 29148, Systems and software engineering — Life cycle processes — Requirements engineering"
    edition: "2018"
    section: "Information items: software requirements specification"
    url: https://standards.ieee.org/ieee/29148/6937/
    checked_on: 2026-10-03
changed_in: R-22
changed_on: 2026-10-03
---

# Software requirements specification (SRS)

## What it is

A requirements specification is an organised collection of requirements that meets agreed criteria;
an SRS is one for a software system. It is the document a team builds, tests and accepts against.
ISO/IEC/IEEE 29148 describes what an SRS contains (purpose, scope, the requirements themselves,
assumptions and dependencies, verification, supporting information) alongside related documents
for the business and stakeholder level.

## How Pathfinder uses it

Pathfinder's goal is documentation good enough to rebuild a portal from it alone, which is what an
SRS is for. The BA keeps requirements as small linked records rather than one long document, so they
can be reviewed and revised one by one. The planned SRS export (R-16) renders them into a single
document with chapters, diagrams, a traceability matrix and an Unknowns section, in a fixed and
repeatable form.

Related: [SRS](../glossary/README.md#srs), [Traceability](traceability.md),
[Requirement](requirement.md).
