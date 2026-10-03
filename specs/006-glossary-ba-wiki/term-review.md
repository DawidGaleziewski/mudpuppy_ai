# Term Review (2026-10-03)

The user rated 71 proposed terms on three scales: clear to them, needed in the glossary, and where
the explanation belongs. This file is the v1 scope of the glossary (spec FR-003). Draft
definitions shown during the review are not normative; the glossary entries are written in the
implementation and checked against the code.

Legend: **Must** / **Nice** = in v1. **Skip** = not in v1. Placement: **tooltip** (on hover or
focus of the label), **intro** (one always-visible line under the section heading).

## Pathfinder terms

| Term | Clear | Need | Place | Note |
|---|---|---|---|---|
| Run | yes | nice | intro | |
| Mode (map / trace) | yes | must | tooltip | |
| Environment (sandbox / production) | yes | nice | tooltip | |
| Persona | yes | must | tooltip | |
| State | yes | must | intro | |
| Fingerprint | yes | must | tooltip | |
| Cluster | yes | must | tooltip | |
| Settled / never stabilized | yes | must | tooltip | |
| Transition (edge) | yes | must | tooltip | |
| Accessible name | yes | nice | tooltip | |
| Role | yes | nice | tooltip | |
| Safety class | yes | must | tooltip | |
| Decision (allowed / skipped) | yes | nice | tooltip | |
| Top locator | yes | nice | tooltip | |
| Target | yes | must | tooltip | Rename the href column; two meanings of "Target" are confusing |
| Frontier | **no** | must | tooltip | Needs a longer explanation: what it is, where the word comes from |
| Priority / depth | yes | nice | tooltip | |
| Budget | yes | must | tooltip | |
| Scope / denylist | yes | must | tooltip | |
| Network call shape | yes | nice | tooltip | |
| Open question (crawler) | yes | nice | tooltip | |
| Rule candidate | yes | must | tooltip | |
| Evidence | yes | must | tooltip | Wants much more: exactly what evidence can hold, where it is stored, how the BA processes it |
| Process (trace mode) | yes | must | tooltip | |
| Step / intent / outcome | yes | must | tooltip | |
| Submit boundary | yes | must | tooltip | |
| Tool call / phase / span | yes | nice | tooltip | |
| Run-less calls | yes | must | tooltip | |
| p50 / p95 | yes | must | tooltip | |
| Follow-up task (FUP) | yes | must | tooltip | |
| Layer A / Layer B | yes | must | tooltip | |
| Analysis session | yes | nice | intro | |
| Pass | yes | nice | tooltip | |
| Gaps | yes | must | intro | |
| Record key | yes | must | tooltip | |
| Revision (Rev) | yes | must | tooltip | |
| Record status | yes | nice | tooltip | |
| Four-letter status codes | yes | must | tooltip | |
| Reference portal / ground truth | yes | must | tooltip | |

## BA terms

| Term | Clear | Need | Place |
|---|---|---|---|
| Confidence (observed / inferred / needs confirmation) | yes | must | tooltip |
| Documentation record | yes | must | tooltip |
| Evidence link / cites | yes | must | tooltip |
| Relations / linked records | yes | must | tooltip |
| Traceability | yes | must | tooltip |
| Review (confirm / reject / comment) | yes | must | tooltip |
| Capability (CAP) | yes | must | tooltip |
| Screen (SCR) | yes | nice | tooltip |
| Process (PROC) | yes | nice | tooltip |
| Use case (UC) | yes | nice | tooltip |
| Requirement (REQ) | yes | nice | tooltip |
| Non-functional requirement (NFR) | yes | must | tooltip |
| Acceptance criteria | yes | must | tooltip |
| Business rule (BR) | yes | must | tooltip |
| Decision table | yes | must | tooltip |
| Data item (DI) | yes | must | tooltip |
| Glossary term (GL) | yes | must | tooltip |
| Assumption (ASM) | yes | nice | tooltip |
| SRS | yes | must | tooltip |
| As-is documentation | yes | nice | tooltip |

## Skipped (not in v1)

Portal, route template, action, decision log, robots.txt policy / crawl delay, obstacle, form
(recorded), console errors, ARIA snapshot, run trace (debug), never reached server, open question
(OQ). They may be added later through the glossary-sync step if a reader asks for them.
