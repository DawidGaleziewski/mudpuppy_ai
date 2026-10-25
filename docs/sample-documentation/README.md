# Software requirements specification: mudpuppy-dashboard-local

> **A sample of MudPuppy's output: its own console, documented by itself.** On 2026-10-25 the
> crawler agent mapped a throwaway copy of the MudPuppy console (one guest map run, 44 recorded
> states), and the BA agent, which never browses, wrote these records from that evidence alone.
> Nothing here was edited by hand or reviewed: every record is a **draft**, as a reviewer would
> first see it. The copy ran without the chat service and on a read-only store, so assistant
> answers and saves were never observed; those are listed as open questions and unknowns rather
> than guessed. The data visible inside the screenshots belongs to the bundled fake insurer
> (`reference-insurer-local`); one local file path on the Settings screenshot (SCR-030) was
> blanked before publishing. Regenerate with `pnpm --dir apps/crawler docs:export
> mudpuppy-dashboard-local --env local-dev --out docs/sample-documentation`.

As-is documentation of the portal `mudpuppy-dashboard-local` (environment `local-dev`), rendered
from the MudPuppy documentation store. The outline is adapted from ISO/IEC/IEEE 29148 (SRS).

- **As of:** 2026-10-25T23:26:23.944Z
- **Mode:** all, drafts marked
- **Records:** 273

## Counts

| Kind | Draft | Confirmed | Total |
| --- | --- | --- | --- |
| Capabilities | 10 | 0 | 10 |
| Screens | 31 | 0 | 31 |
| Processes | 8 | 0 | 8 |
| Use cases | 0 | 0 | 0 |
| Functional requirements | 2 | 0 | 2 |
| Business rules | 37 | 0 | 37 |
| Data items | 80 | 0 | 80 |
| API endpoints | 43 | 0 | 43 |
| Glossary terms | 38 | 0 | 38 |
| Non-functional requirements | 6 | 0 | 6 |
| Assumptions | 2 | 0 | 2 |
| Open questions (BA) | 7 | 0 | 7 |
| Follow-up tasks | 9 | 0 | 9 |
| **Total** | 273 | 0 | 273 |

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
