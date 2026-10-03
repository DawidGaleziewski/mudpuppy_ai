---
title: Data dictionary
glossary: [data-item]
citations:
  - source: "IIBA, A Guide to the Business Analysis Body of Knowledge (BABOK Guide)"
    edition: "v3 (2015)"
    section: "10.12 Data Dictionary (members only)"
    url: https://www.iiba.org/knowledgehub/business-analysis-body-of-knowledge-babok-guide/10-techniques/10-12-data-dictionary/
    checked_on: 2026-10-03
changed_in: R-22
changed_on: 2026-10-03
---

# Data dictionary

## What it is

A data dictionary lists every piece of data a system handles, with a standard description of each:
its name, what it means, its type and format, allowed values, whether it is required, and where it
is used. It gives everyone one agreed definition per data element, so "date of birth" or "policy
number" means the same thing on every screen and in every rule.

It complements a [glossary](glossary.md): the glossary explains business words, the data dictionary
defines the data that carries them.

## How Pathfinder uses it

In pass 5 the BA agent writes one `DI` record per form field or data element. The name is kept
exactly as the portal shows it (`name_verbatim`), and the constraints are the observed ones:
required or not, pattern, length, options. `seen_in` lists the screens and forms where it appears,
and business rules that constrain it are linked to it. The Docs tab shows them under "Data
dictionary".

Example: DI-015 "Telefon", type tel, not required, pattern `\+?[0-9 ]{9,15}`.

Related: [Data item (DI)](../glossary/README.md#data-item), [Business rule](business-rule.md),
[Glossary](glossary.md).
