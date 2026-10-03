---
title: As-is process modelling
glossary: [process-record, as-is-documentation]
citations:
  - source: "IREB, Glossary of Requirements Engineering Terminology (Martin Glinz)"
    edition: "Version 2.2.0 (2025)"
    section: "Process; Process model"
    url: https://cpre.ireb.org/en/downloads-and-resources/downloads
    checked_on: 2026-10-03
    quote: "A model describing a process or a set of related processes."
  - source: "IIBA, A Guide to the Business Analysis Body of Knowledge (BABOK Guide)"
    edition: "v3 (2015)"
    section: "10.35 Process Modelling; 10.34 Process Analysis (members only)"
    url: https://www.iiba.org/knowledgehub/business-analysis-body-of-knowledge-babok-guide/10-techniques/10-35-process-modelling/
    checked_on: 2026-10-03
changed_in: R-22
changed_on: 2026-10-03
---

# As-is process modelling

## What it is

A process is a set of activities done in a given order to reach an outcome. A process model
describes one: who takes part, what triggers it, the steps and decisions, and what it produces.

**As-is** modelling describes how a process works today; **to-be** modelling describes how it should
work after a change. Keeping them separate matters: an as-is model is a record of facts, and mixing
in improvements makes it unreliable as a basis for rebuilding or comparing.

## How Pathfinder uses it

Pathfinder only does as-is work. Trace runs record how a process runs on the live portal, step by
step; in pass 3 the BA agent turns each trace into a `PROC` record (goal, persona, trigger, steps,
outcome) and a [use case](use-case.md). It also states how much of the process was actually observed
(`observed_extent`, for example "up to the submit boundary"), so nobody reads a partial trace as the
whole process. The Docs tab draws processes as diagrams.

Example: PROC-001 "Calculate an OC/AC premium".

Related: [Process (PROC)](../glossary/README.md#process-record),
[As-is documentation](../glossary/README.md#as-is-documentation),
[Process (trace mode)](../glossary/README.md#trace-process).
