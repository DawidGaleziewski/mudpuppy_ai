---
title: Requirement
glossary: [requirement]
citations:
  - source: "IREB, Glossary of Requirements Engineering Terminology (Martin Glinz)"
    edition: "Version 2.2.0 (2025)"
    section: "Requirement"
    url: https://cpre.ireb.org/en/downloads-and-resources/downloads
    checked_on: 2026-10-03
    quote: "A capability or property that a system shall have."
  - source: "ISO/IEC/IEEE 29148, Systems and software engineering — Life cycle processes — Requirements engineering"
    edition: "2018"
    url: https://standards.ieee.org/ieee/29148/6937/
    checked_on: 2026-10-03
changed_in: R-22
changed_on: 2026-10-03
---

# Requirement

## What it is

A requirement says what a system must do or be. The word is used in three ways: a need someone
has, the capability the system should have to meet it, and the written statement of that
capability. In documentation the third meaning matters: a requirement is a sentence someone can
read, agree with and test.

A good requirement is about one thing, says it without ambiguity, can be checked (you can tell
whether a system meets it), and can be traced to where it came from. ISO/IEC/IEEE 29148 lists
characteristics like these for individual requirements and for a set of them.

Requirements are usually split into **functional** requirements (what the system does: results and
behaviour) and [non-functional requirements](non-functional-requirement.md) (qualities and
constraints).

## How Pathfinder uses it

Pathfinder documents an existing system, so its requirements describe behaviour that was
**observed** and that a rebuilt system must keep. The BA agent writes them as `REQ` records in
pass 4, each citing the evidence it came from and carrying
[acceptance criteria](acceptance-criteria.md). A requirement becomes `confirmed` only when a person
approves it in the Docs tab.

Related: [Requirement (REQ)](../glossary/README.md#requirement),
[Traceability](traceability.md), [Business rule](business-rule.md).
