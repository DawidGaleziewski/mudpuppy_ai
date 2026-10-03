---
title: Non-functional requirement
glossary: [nfr]
citations:
  - source: "IREB, Glossary of Requirements Engineering Terminology (Martin Glinz)"
    edition: "Version 2.2.0 (2025)"
    section: "Non-functional requirement; Quality requirement"
    url: https://cpre.ireb.org/en/downloads-and-resources/downloads
    checked_on: 2026-10-03
    quote: "A quality requirement or a constraint."
  - source: "IIBA, A Guide to the Business Analysis Body of Knowledge (BABOK Guide)"
    edition: "v3 (2015)"
    section: "10.30 Non-Functional Requirements Analysis (members only)"
    url: https://www.iiba.org/knowledgehub/business-analysis-body-of-knowledge-babok-guide/10-techniques/10-30-non-functional-requirements-analysis/
    checked_on: 2026-10-03
changed_in: R-22
changed_on: 2026-10-03
---

# Non-functional requirement

## What it is

A non-functional requirement describes how well the system must work or what limits it must
respect, rather than what it does. IREB splits it into two kinds: **quality requirements**
(performance, reliability, usability, accessibility, security and similar) and **constraints**
(limits on the solution, such as a required technology or a law it must follow).

They are easy to forget because nobody asks for them until they fail, and hard to write well
because "fast" or "easy to use" cannot be tested. A useful NFR names a measure: a response time,
an accessibility standard, a number of broken links.

## How Pathfinder uses it

Pathfinder can only measure what a browser sees from outside. The BA agent writes `NFR` records in
pass 6 only for qualities it actually measured: status codes, console errors, labelled controls,
robots.txt policy, broken internal links. Everything else (load, security, back-office reliability)
goes to the session's gaps instead of being guessed.

Example from the reference portal: NFR-004 "No broken internal navigation for a guest".

Related: [Non-functional requirement (NFR)](../glossary/README.md#nfr),
[Requirement](requirement.md).
