# Spec 067: Docs in React, part 2: one record and a session (R-96, step 18)

**Branch:** `feature/067-r96-docs-record` · **Owner (2026-10-23):** "Ok proceed I am going out
keep on working at it by yourself as much as you can". Spec 066 moved the portal's documentation;
this step moves one record and one analysis session, so Docs lives in React whole (but the htmx
Docs portals list, which the console's Portals page replaces).

## What this step builds

- **FR-001 One record** (`queries_app_doc.py`, `GET /api/portals/{p}/docs/{key}?rev=&list=`): its
  status, confidence, not observed, follow-up status and why it is blocked; the revision shown
  of the latest, the confirmed revision, the change and its note, the session that wrote it; the
  content of the revision as blocks (`queries_app_doc_content.py`: a sentence, facts, a table,
  preformatted text, or the raw JSON for an unknown kind or shape, as the htmx
  `partials/docs/content.html` renders each kind); a process's map per traced variant; the screens
  it cites with this revision's regions; the evidence (each target linked: a record, a rule, a
  recorded screen, the scan section at the target), relations in and out (an assumption a rule
  rests on "To check"), every revision with its reviews; the review panel (on the latest
  revision; only a draft is confirmed or rejected); Prev / Next in the Docs list it was opened
  from (`neighbours.ordered_list`); for a process record its documentation export and the
  workspace process it opened.
- **FR-002 One analysis session** (`queries_app_doc_session.py`,
  `GET /api/portals/{p}/docs/sessions/{id}?cursor=`): its status, times and summary, the scans it
  read, the passes it completed, the records it created or revised (paged), the gaps it reported.
- **FR-003 The writes:** the review through the existing `…/review/records/{key}` (confirm,
  reject with a reason, comment); Open in Processes (`POST …/processes/from-record`, the chat
  service's `processes/from-record`, signed); each asks first.
- **FR-004 The pages** `/app/portals/:portal/docs/:key` and `/app/portals/:portal/docs/sessions/:id`;
  the Docs list's records and sessions open them; `Shot` draws several numbered marks.

## Validation

- [x] `pnpm typecheck && pnpm lint && pnpm test` in `apps/web` (133 tests; `tests/doc-record.test.tsx`:
      content blocks with `lang`, evidence, relations, revisions, a reviewer's note, Prev / Next;
      Confirm asked then sent; a decided revision allows only a comment, none without a
      reviewer; an older revision; Open in Processes asked then followed; not found; a
      session); `pnpm build`; `pnpm build-storybook`.
- [x] Dashboard: ruff; `tests/test_api_doc.py` (facts and content, evidence to the scan section,
      relations, revisions and an older revision, the review panel, Prev / Next, a process's
      map and from-record, malformed content as JSON, a session with its empty states); the
      whole suite.
- [x] `pnpm --dir apps/dashboard ui:check` at 1280 and 390 px on REQ-001, PROC-001, SCR-001,
      UC-001, BR-001 (with its list) and a session (local-dev, reference-insurer-local): all
      pass after `Code` became focusable (axe: a scrolling `pre` must be reachable by keyboard).

## Close-out review: feature/067-r96-docs-record (2026-10-23)

Non-blank lines: `queries_app_doc.py` 323, `queries_app_doc_content.py` 231, `DocContent.tsx`
285, `DocRecord.tsx` 210 (G-01); no router imports a router, no SQL in routers (G-13, G-15); the
file maps name the new files (G-30); pages compose only, statuses come from the API, writes ask
first.

| # | File:line | Guideline | Finding | Change | Size | Outcome |
|---|---|---|---|---|---|---|
| 1 | `apps/web/src/pages/DocSession.tsx:22-138` | style | The split left five `return` bodies indented two spaces too deep. | Re-indented | small | fixed |
| 2 | `web/api_docs.py:50` | G-04 | `record_page` took six parameters. | A `RecordParams` query model, as `docs_page` has | small | fixed |

Summary: 2 findings, 2 fixed.
