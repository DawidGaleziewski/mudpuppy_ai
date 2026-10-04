# Software requirements specification: reference-insurer

As-is documentation of the portal `reference-insurer` (environment `sandbox`), rendered
from the Pathfinder documentation store. The outline is adapted from ISO/IEC/IEEE 29148 (SRS).

- **As of:** 2026-01-15T10:37:00.000Z
- **Mode:** all, drafts marked
- **Records:** 22

## Counts

| Kind | Draft | Confirmed | Total |
| --- | --- | --- | --- |
| Capabilities | 1 | 1 | 2 |
| Screens | 2 | 1 | 3 |
| Processes | 1 | 1 | 2 |
| Use cases | 1 | 0 | 1 |
| Functional requirements | 1 | 1 | 2 |
| Business rules | 2 | 0 | 2 |
| Data items | 2 | 1 | 3 |
| Glossary terms | 1 | 1 | 2 |
| Non-functional requirements | 0 | 1 | 1 |
| Assumptions | 1 | 0 | 1 |
| Open questions (BA) | 1 | 0 | 1 |
| Follow-up tasks | 1 | 1 | 2 |
| **Total** | 14 | 8 | 22 |

## Legend

Every statement starts with a line `**KEY** · rev N · status · confidence` and ends
with its evidence: the recorded item (kind and id), the run it came from (id, mode, date) and the
BA's note. Record keys are stable across revisions.

- Confidence `observed`: seen in the UI, network traffic or data during a run.
- Confidence `inferred`: a reasonable deduction from what was seen.
- Confidence `needs_confirmation`: business intent a person must confirm.
- Status `draft`: written by the BA, not yet reviewed; such statements carry a callout saying so.
- Status `confirmed`: a reviewer confirmed this revision.
- `not observable`: behaviour a crawl cannot see (backend jobs, e-mails, steps behind a safety
  boundary); listed again in [Unknowns](11-unknowns.md).

## Chapters

- [1. Introduction](01-introduction.md)
- [2. Capabilities](02-capabilities.md)
- [3. Screens](03-screens.md)
- [4. Processes and use cases](04-processes-and-use-cases.md)
- [5. Functional requirements](05-functional-requirements.md)
- [6. Business rules](06-business-rules.md)
- [7. Data dictionary](07-data-dictionary.md)
- [8. Glossary](08-glossary.md)
- [9. Non-functional requirements](09-non-functional.md)
- [10. Assumptions and open questions](10-assumptions-and-questions.md)
- [11. Unknowns](11-unknowns.md)
- [12. Traceability matrix](12-traceability.md)
- [Appendix: change log](appendix-change-log.md)
- [records.json](records.json): machine-readable copy of the same records
- `images/`: screenshots of the screens as first recorded (`screens/`), their wireframes
  (`wireframes/`, `.svg` plus an editable `.excalidraw` file for excalidraw.com or the
  Excalidraw VS Code extension) and crops with the elements a record cites outlined and
  numbered (`highlights/`)
