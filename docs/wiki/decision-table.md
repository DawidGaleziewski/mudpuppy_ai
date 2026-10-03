---
title: Decision table
glossary: [decision-table]
citations:
  - source: "IREB, Glossary of Requirements Engineering Terminology (Martin Glinz)"
    edition: "Version 2.2.0 (2025)"
    section: "Decision table"
    url: https://cpre.ireb.org/en/downloads-and-resources/downloads
    checked_on: 2026-10-03
    quote: "A tabular representation of a complex decision, specifying which actions to perform for the possible combinations of condition values."
  - source: "IIBA, A Guide to the Business Analysis Body of Knowledge (BABOK Guide)"
    edition: "v3 (2015)"
    section: "10.17 Decision Modelling (members only)"
    url: https://www.iiba.org/knowledgehub/business-analysis-body-of-knowledge-babok-guide/10-techniques/10-17-decision-modelling/
    checked_on: 2026-10-03
changed_in: R-22
changed_on: 2026-10-03
---

# Decision table

## What it is

A decision table writes a rule with several inputs as a grid. Condition columns hold the inputs
("if"), result columns hold what happens ("then"), and each row is one combination. Reading down
the rows you can see at once whether a combination is missing or two rows contradict each other,
which prose hides.

Decision tables are one form of decision modelling: describing how a repeatable business decision
is made, separately from the process that uses it.

## How Pathfinder uses it

A business rule record can include a decision table; the Docs tab shows its columns as "if …" and
"then …". The BA agent uses one when the observed behaviour depends on more than one input, for
example which fields become required depending on an option chosen earlier in a form. Rows that
were not observed are left out or marked, never filled in by guessing.

Related: [Decision table](../glossary/README.md#decision-table),
[Business rule](business-rule.md).
