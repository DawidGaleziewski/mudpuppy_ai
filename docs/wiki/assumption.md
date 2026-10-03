---
title: Assumption
glossary: [assumption]
citations:
  - source: "ISO/IEC/IEEE 29148, Systems and software engineering — Life cycle processes — Requirements engineering"
    edition: "2018"
    section: "Software requirements specification content: assumptions and dependencies"
    url: https://standards.ieee.org/ieee/29148/6937/
    checked_on: 2026-10-03
changed_in: R-22
changed_on: 2026-10-03
---

# Assumption

## What it is

An assumption is something treated as true without proof so that work can continue. Every analysis
makes some; the risk is in making them silently. Writing an assumption down turns a hidden guess
into a visible item that someone can confirm or correct. If it turns out to be false, you can find
every requirement that relied on it.

ISO/IEC/IEEE 29148 lists assumptions and dependencies as part of a software requirements
specification for this reason: the requirements are only valid as long as those assumptions hold.

## How Pathfinder uses it

The BA agent writes `ASM` records in pass 7 (synthesis) for things it could not observe but needs to
state to make the documentation coherent, typically about what happens after a form is sent or
behind the scenes. Assumptions carry the confidence `inferred` or `needs_confirmation`, never
`observed`, and are meant to be reviewed by someone who knows the business.

Example: ASM-002 "Contact enquiries are answered by phone or e-mail".

Related: [Assumption (ASM)](../glossary/README.md#assumption),
[Confidence](../glossary/README.md#confidence).
