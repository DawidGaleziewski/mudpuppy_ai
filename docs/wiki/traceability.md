---
title: Traceability
glossary: [traceability, relations, evidence-link]
citations:
  - source: "IREB, Glossary of Requirements Engineering Terminology (Martin Glinz)"
    edition: "Version 2.2.0 (2025)"
    section: "Traceability"
    url: https://cpre.ireb.org/en/downloads-and-resources/downloads
    checked_on: 2026-10-03
    quote: "The ability to establish explicit relationships between related work products or items within work products."
  - source: "ISO/IEC/IEEE 29148, Systems and software engineering — Life cycle processes — Requirements engineering"
    edition: "2018"
    url: https://standards.ieee.org/ieee/29148/6937/
    checked_on: 2026-10-03
changed_in: R-22
changed_on: 2026-10-03
---

# Traceability

## What it is

Traceability means you can follow the links around a requirement: **backward** to where it came from
(a stakeholder, a document, an observation) and **forward** to what depends on it (design, code,
tests). With it you can answer "why is this here?", "what breaks if this changes?" and "is every
requirement tested?". A traceability matrix shows these links as a table.

## How Pathfinder uses it

Backward traceability is built into Pathfinder: every documentation record cites
[evidence](../glossary/README.md#evidence), and every piece of evidence belongs to a run, so any
statement can be followed back to what the crawler recorded. Forward traceability runs through
typed relations between records (a rule `enforces` a requirement, a data item `appears_on` a
screen) and, later, through test tags such as `@REQ-001`. The planned SRS export (R-16) adds a
traceability matrix.

Related: [Traceability](../glossary/README.md#traceability),
[Evidence link / cites](../glossary/README.md#evidence-link),
[Relations](../glossary/README.md#relations).
