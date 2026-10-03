---
title: Acceptance criteria
glossary: [acceptance-criteria]
citations:
  - source: "IREB, Glossary of Requirements Engineering Terminology (Martin Glinz)"
    edition: "Version 2.2.0 (2025)"
    section: "Acceptance criteria"
    url: https://cpre.ireb.org/en/downloads-and-resources/downloads
    checked_on: 2026-10-03
    quote: "The criteria that a work product must satisfy to be accepted by the stakeholders."
  - source: "IIBA, A Guide to the Business Analysis Body of Knowledge (BABOK Guide)"
    edition: "v3 (2015)"
    section: "10.1 Acceptance and Evaluation Criteria (members only)"
    url: https://www.iiba.org/knowledgehub/business-analysis-body-of-knowledge-babok-guide/10-techniques/10-1-acceptance-and-evaluation-criteria/
    checked_on: 2026-10-03
changed_in: R-22
changed_on: 2026-10-03
---

# Acceptance criteria

## What it is

Acceptance criteria are the conditions that let everyone agree a requirement is met. They turn a
requirement into checks: if all of them pass, the requirement is done. Good criteria are concrete,
observable and independent of how the system is built.

A common format is Given / When / Then: **given** a starting situation, **when** someone does
something, **then** the system responds in a stated way. Each criterion is one scenario, so the
set covers the normal case and the important exceptions.

## How Pathfinder uses it

Every `REQ` record carries acceptance criteria in Given / When / Then form, shown on the record page.
Because Pathfinder documents an existing portal, each criterion describes behaviour the crawler
actually recorded and cites it. Later, QA turns confirmed criteria into acceptance tests tagged with
the requirement key (for example `@REQ-001`).

Related: [Acceptance criteria](../glossary/README.md#acceptance-criteria),
[Requirement](requirement.md), [Use case](use-case.md).
