---
title: Use case
glossary: [use-case]
citations:
  - source: "IREB, Glossary of Requirements Engineering Terminology (Martin Glinz)"
    edition: "Version 2.2.0 (2025)"
    section: "Use case; Scenario"
    url: https://cpre.ireb.org/en/downloads-and-resources/downloads
    checked_on: 2026-10-03
    quote: "A set of possible interactions between external actors and a system that provide a benefit for the actor(s) involved."
  - source: "IIBA, A Guide to the Business Analysis Body of Knowledge (BABOK Guide)"
    edition: "v3 (2015)"
    section: "10.47 Use Cases and Scenarios (members only)"
    url: https://www.iiba.org/knowledgehub/business-analysis-body-of-knowledge-babok-guide/10-techniques/10-47-use-cases-and-scenarios/
    checked_on: 2026-10-03
changed_in: R-22
changed_on: 2026-10-03
---

# Use case

## What it is

A use case describes one goal of one actor (a person or another system) and how the system helps
reach it, from the actor's point of view. It has a **main success scenario**, the steps when
everything goes well, plus **extensions**: alternative paths and the ways it can fail. A scenario is
one concrete path through it.

Use cases are good at showing behaviour in context: not just "the form validates the phone number",
but where in the journey that happens and what the user does next. The written style Pathfinder
follows (goal, actor, trigger, numbered steps, extensions) comes from Alistair Cockburn's work on
use cases.

## How Pathfinder uses it

In pass 3 the BA agent writes `UC` records from traced processes: the persona is the actor, the
trace's steps become the main scenario, and validation messages or refused actions seen in other
traces become extensions. Each step cites the trace step it came from. If a path was never traced,
it is not invented; the BA asks for it with a follow-up task.

Example: UC-001 "Guest calculates an OC/AC premium".

Related: [Use case (UC)](../glossary/README.md#use-case),
[As-is process modelling](process-modelling-as-is.md), [Acceptance criteria](acceptance-criteria.md).
