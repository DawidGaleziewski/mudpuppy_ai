---
title: Business rule
glossary: [business-rule]
citations:
  - source: "IIBA, A Guide to the Business Analysis Body of Knowledge (BABOK Guide)"
    edition: "v3 (2015)"
    section: "10.9 Business Rules Analysis (members only)"
    url: https://www.iiba.org/knowledgehub/business-analysis-body-of-knowledge-babok-guide/10-techniques/10-9-business-rules-analysis/
    checked_on: 2026-10-03
changed_in: R-22
changed_on: 2026-10-03
---

# Business rule

## What it is

A business rule is a policy the organisation applies, independent of any screen or process: who may
buy what, which values are allowed, what must be true before something happens. Rules belong to the
business, not to the software; the software only enforces them.

Business-rules analysis keeps rules separate from the processes and screens that use them, so each
rule is stated once, in plain language, and every place that applies it points back to it. When a
rule changes, you then know everything it affects. Some rules define or constrain (what is
allowed), others decide an outcome from several inputs; the latter are often written as a
[decision table](decision-table.md).

## How Pathfinder uses it

In pass 4 the BA agent writes `BR` records from what the crawler observed: required fields, input
patterns and lengths, disabled controls, validation messages, refused actions, and the crawler's
rule candidates. Each rule is linked to the data items and screens it affects (`enforces`,
`appears_on`). From the outside, Pathfinder can see what a rule does but not why it exists, so the
intent is marked `needs_confirmation`.

Example: BR-012 "Contact form: required fields, lengths and formats".

Related: [Business rule (BR)](../glossary/README.md#business-rule),
[Rule candidate](../glossary/README.md#rule-candidate), [Data dictionary](data-dictionary.md).
