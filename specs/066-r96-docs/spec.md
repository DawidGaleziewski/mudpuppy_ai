# Spec 066: Docs in React, part 1: the portal's documentation (R-96, step 17)

**Branch:** `feature/066-r96-docs` · **Owner (2026-10-23):** "Ok proceed I am going out keep on
working at it by yourself as much as you can". The htmx Docs (`web/docs.py`, `views_docs.py`,
spec 004 R-15, FR-030) move to the React console in two steps: this one the portal's
documentation as an SRS (its sections, the overview, every section's records); spec 067 one
record and the BA's sessions. Read over the same read model (`queries_docs`, `diagrams`).

## What this step builds

- **FR-001 The documentation** (`queries_app_docs.py`, `GET /api/portals/{p}/docs`): the SRS
  sections in order with their record counts and the one shown; the records' status mix
  (`status_out("doc", …)`); for the overview, the sections' counts and the latest analysis
  sessions (status mapped); for any other section, its records (key, title, kind, status,
  confidence, revision, summary, not observable, follow-up status and why it is blocked, the
  confirmed revision when older), filtered by kind, status, confidence and flag and paged by
  cursor (`list_records`), the traceability matrix's evidence, scans and linked records, and the
  capability map or screen navigation diagram (Mermaid source from `diagrams`).
- **FR-002 The page** `/app/portals/:portal/docs` (`?section=…&kind=…&status=…&confidence=…&flag=…
  &cursor=…&page=…`): the section index beside the section; the filters apply on a button; First
  and Next; Docs in the menu under Portal model. A record opens on the htmx record page (with
  `list`, its Prev / Next) until spec 067.

## Not in this step (spec 067)

- One record (header, content by kind, evidence pictures, process variants, revisions, review)
  and an analysis session; the htmx Docs portals list (the console's Portals page lists portals).

## Validation

- [x] `pnpm typecheck && pnpm lint && pnpm test` in `apps/web` (126 tests; `tests/docs.test.tsx`:
      the overview with index, sessions and the current section, a section's records with notes
      and record links, filters on the button and never on a select change, the traceability
      matrix, nothing documented and filters matching nothing); `pnpm build`; `pnpm build-storybook`.
- [x] Dashboard: ruff; `tests/test_api_docs.py` (overview, a section with filters and record
      links, unknown filter values ignored, traceability, both diagrams, cursor pages, unknown
      portal); the whole suite.
- [x] `pnpm --dir apps/dashboard ui:check` at 1280 and 390 px on the overview, screens,
      processes and traceability (local-dev, reference-insurer-local, 134 records): all pass.

## Close-out review: feature/066-r96-docs (2026-10-23)

Every changed file under 400 lines (longest new function `_records`, about 28 lines); nothing new
in the complexity or lint reports; `api_docs.py` imports no router and has no SQL (G-13, G-15);
the file maps name the new files (G-30); `Docs.tsx` composes only, filters apply on a button,
statuses come from the API.

| # | File:line | Guideline | Finding | Change | Size | Outcome |
|---|---|---|---|---|---|---|
| – | – | – | None | None | – | – |

Summary: 0 findings.
