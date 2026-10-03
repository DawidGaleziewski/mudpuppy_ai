---
title: Glossary (as a BA deliverable)
glossary: [glossary-term]
citations:
  - source: "IREB, Glossary of Requirements Engineering Terminology (Martin Glinz)"
    edition: "Version 2.2.0 (2025)"
    section: "Glossary"
    url: https://cpre.ireb.org/en/downloads-and-resources/downloads
    checked_on: 2026-10-03
    quote: "A collection of definitions of terms that are relevant in some domain."
  - source: "IIBA, A Guide to the Business Analysis Body of Knowledge (BABOK Guide)"
    edition: "v3 (2015)"
    section: "10.23 Glossary (members only)"
    url: https://www.iiba.org/knowledgehub/business-analysis-body-of-knowledge-babok-guide/10-techniques/10-23-glossary/
    checked_on: 2026-10-03
changed_in: R-22
changed_on: 2026-10-03
---

# Glossary (as a BA deliverable)

## What it is

A project glossary defines the words of the business domain so that everyone (business people,
analysts, developers, testers) uses them the same way. Each entry gives the term, its meaning, and
often synonyms, abbreviations and related terms. Misunderstood words are one of the most common
sources of wrong requirements, which is why a glossary is a standard BA deliverable.

## How Pathfinder uses it

In pass 5 the BA agent writes `GL` records for the portal's business terms, keeping each term
exactly as the portal writes it (for example "OC", "Składka") and linking records that use it
(`uses_term`) and synonyms (`synonym_of`).

That is a different glossary from the one you are reading from: the Pathfinder glossary explains
Pathfinder's own words (run, frontier, evidence). This wiki page is about the BA deliverable.

Example: GL-001 "OC".

Related: [Glossary term (GL)](../glossary/README.md#glossary-term),
[Data dictionary](data-dictionary.md).
