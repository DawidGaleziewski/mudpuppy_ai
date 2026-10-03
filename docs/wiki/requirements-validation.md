---
title: Requirements review and validation
glossary: [review]
citations:
  - source: "IREB, Glossary of Requirements Engineering Terminology (Martin Glinz)"
    edition: "Version 2.2.0 (2025)"
    section: "Validation; Review"
    url: https://cpre.ireb.org/en/downloads-and-resources/downloads
    checked_on: 2026-10-03
    quote: "An evaluation of a work product by an individual or a group in order to find problems or suggest improvements."
  - source: "IIBA, A Guide to the Business Analysis Body of Knowledge (BABOK Guide)"
    edition: "v3 (2015)"
    section: "10.37 Reviews (members only)"
    url: https://www.iiba.org/knowledgehub/business-analysis-body-of-knowledge-babok-guide/10-techniques/10-37-reviews/
    checked_on: 2026-10-03
changed_in: R-22
changed_on: 2026-10-03
---

# Requirements review and validation

## What it is

**Validation** asks whether the documented requirements match what the stakeholders actually need:
in short, whether the right requirements were written. A **review** is the usual way to do it: one
or more people read a work product to find problems or suggest improvements, and record what they
decided.

Validation is different from verification, which checks that the system (or a document) meets its
requirements. Validation checks the requirements themselves.

## How Pathfinder uses it

The BA agent writes everything as `draft`. Only a person can change that: in the Docs tab a
reviewer confirms, rejects (with a reason) or comments on one specific revision. The record's
status follows from those reviews by code; neither the agent nor the dashboard sets it directly.
Rejections and comments go back to the BA agent as feedback in its next session. For Pathfinder,
validation also has a second meaning: the reference portal's ground truth lets us measure how close
the BA's documentation is to the known answer.

Related: [Review](../glossary/README.md#review),
[Record status](../glossary/README.md#record-status),
[Revision](../glossary/README.md#revision).
