# Spec 055: a scan's sections in React (R-96, step 6)

**Branch:** `feature/055-r96-scan-tabs` · **Owner (2026-10-23):** "Proceed work as long as you can
without my help"; the order stays one step at a time, all htmx pages to React first. Step 5 put
the scan page and its Graph tab in React; this step moves eight of its other sections. Trace (the
span tree with the agent's context) and Process (a trace run's diagram) are the next step.

## What this step builds

- **FR-001 The API**, one typed route per section under `/api/scans/{id}/` (`web/api_scan.py`
  over `queries_app_scan_tabs.py`), every status mapped by the one status map, every timestamp
  as stored, JSON shown pretty-printed as text, 404 for an unknown scan:
  - `states`: the screens observed (picture, title, route, confidence, stabilization, cluster,
    evidence, observed at);
  - `actions` (`safety_class`, `allowed`, `cursor`): the counts by safety class and decision,
    one page of actions (name, role, safety class, decision and skip reason, top locator, link);
  - `frontier` (`status`, `cursor`): the counts by status, one page of items;
  - `forms`: the forms with their fields (name, type, required) or their raw JSON;
  - `network` (`cursor`): one page of call shapes (method and URL template, status, request and
    response shapes, console errors);
  - `robots`: the robots.txt policies;
  - `decisions` (`kind`, `rule`, `cursor`): the groups by kind and rule, one page of entries;
  - `docs` (`cursor`): the records whose latest revision cites the scan, with what they cite.
  A paged section answers `{items, total, next_cursor}`; the filters' options come with it.
- **FR-002 The pages** `/app/scans/:scan/:tab`: the scan's head stays; the tab nav marks the
  section shown; each section is a plate with its count, its filters (a change asks the API at
  once; the filters and the cursor are in the address), its table, its empty state and First /
  Next for a paged one. Graph stays the default (`/app/scans/:scan`). Trace and Process still link
  to the htmx page.
- **FR-003 The design system** gains `Disclosure` (`sy-disclosure`: a summary that opens a body)
  and `Code` (`sy-code`: preformatted text, a JSON shape), each with a story and a test.

## Not in this step

- Trace and Process (step 7); the screen page `/states/{id}` the rows link to (htmx until its
  step); evidence other than pictures stays a path, as on the htmx page.

## Validation

- [x] `pnpm typecheck && pnpm lint && pnpm test` in `apps/web` (57 tests: the tab nav's links,
      each section's table, a filter and Next asked of the API, the empty states, an unknown
      section opening on the graph, Disclosure); `pnpm build`; `pnpm build-storybook`.
- [x] Dashboard: ruff and the whole suite; `tests/test_api_scan_tabs.py` (shapes, statuses mapped,
      paging at the page size, filters with nonsense values, 404 for each section).
- [x] `pnpm --dir apps/dashboard ui:check` at 1280 and 390 px on every section of two local-dev
      scans (proving-ground-shop-local, 698 actions; reference-insurer-local with citing records):
      all pass. Found on the way: the counts above the actions ran together in one line; each is a
      chip now.
- Glossary: no new term (the sections keep the htmx page's words).

## Close-out review: feature/055-r96-scan-tabs (2026-10-23)

Files within G-01; routers import only `queries` and `deps` (G-13, G-15); no `className`, `style`,
`any` or suppressions in pages; LAYOUT.md updated; route and page tests exist.

| # | File:line | Guideline | Finding | Change | Size | Outcome |
|---|---|---|---|---|---|---|
| 1 | `Disclosure.tsx` | G-05, skill "Add a component" | `Code` shared Disclosure's file and had no story. | `components/Code.tsx` with `Code.stories.tsx` | small | fixed |
| 2 | `apps/web/CLAUDE.md` Layout | G-30 | `SectionPaging.tsx`, `api-scan-tabs.ts` not listed. | One line added | small | fixed |
| 3 | `ScanLists.tsx` docs cites | skill rule 6 | A cite of the Process tab linked to `/app/scans/{id}/process`, which shows Graph. | One `scanTabHref` (`src/app/scanLinks.ts`) for the tab nav and the cites; a test | small | fixed |
| 4 | `web/api_scan_tabs.py` `actions`, `decisions` | G-04, dashboard notes | Six loose query parameters (PLR0913). | `ActionsQuery`, `DecisionsQuery` models | small | fixed |
| 5 | `ScanLists.tsx` `EvidenceRef` | G-05 | A shared component in a page file. | Moved to `src/app/EvidenceRef.tsx` | small | fixed |
