# Spec 062: the Review page in React (R-96, step 13)

**Branch:** `feature/062-r96-review` · **Owner (2026-10-23):** "Ok Carry on with what you can
next". Review (designer screens v2-04, v2-05, v2-16; htmx `web/review.py`) moves to React in two
steps: this one has the three tabs, every group's rows, the filters and pages, and the detail and
writes of the portal model's items and of records; spec 063 has the rest.

## What this step builds

- **FR-001 The API** `GET /api/portals/{p}/review` (`tab`, `show`, `select`, `page`, `part`,
  `age`) over the htmx page's own queries (`queries_app_review.py`, the rows per kind in
  `queries_app_review_rows.py`): the counts, the groups as rows with mapped statuses and chips,
  each group's alike sets and empty text, the part and age filters with counts, the reasons used
  lately, the selected item's detail (in React or not, with its htmx address), its neighbours in
  the group; Explained automatically and Decided as their own lists.
- **FR-002 The writes** (`web/api_review.py`), signed with the reviewer, `{ok, message, href}`:
  `…/review/decide` (`keys`, `action` confirm or reject, `reason`, `also` pairs; a reject needs a
  reason; answers the `undo` command), `…/review/undo` (`decision`), `…/review/records/{key}`
  (`action` confirm, reject or comment, `rev`, `text`; `docs:review`).
- **FR-003 The page** `/app/portals/:portal/review` (`?tab=explained|decided`, `?show=<kind>`,
  `?select=<kind>:<id>`, `?part=`, `?age=`): Needs you with a tab per kind and their counts, the
  filters, each group as rows (the first group the one intent plate), the alike sets and your own
  selection decided at once with one reason, "Show all", a group's pages; the selected item beside
  with Prev / Next, its claim, its link (Before / after, the rule, Processes in React), Also
  settles, and Confirm / Reject with a reason; a record with the screens it cites and Confirm,
  Reject, Comment. Every write asks first; a decision's answer offers Undo (asks too). Review in
  the nav.

## Decisions for the owner

- **D-1 Ask first, then Undo.** The designer's Review decides at once with an Undo toast
  (§ 5.8); the React console asks before every write (skill rule 8). Built: ask first, and the
  answer still offers Undo. Say if Review should decide without asking.

## Not in this step (spec 063)

- The detail and writes of unexplained differences, amendments to re-anchor, assistant proposals
  and probe suites (an edited form), and edit conflicts: their rows are here, their detail opens
  the htmx Review on them.
- The keyboard (J / K / X / C / R / U and `?`), the Same screen? page (`/same-screen`).

## Validation

- [x] `pnpm typecheck && pnpm lint && pnpm test` in `apps/web` (97 tests; `tests/review.test.tsx`:
      the groups and the one intent plate, the selected item, confirm asked then Undo asked, a
      reject needs a reason, an alike set and a selection decided at once, a record's review, an
      item still on htmx, decisions off without a reviewer, Explained and Decided); `pnpm build`.
- [x] Dashboard: ruff; `tests/test_api_review.py` (groups and mapped rows, a group's tab and its
      empty text, selection and neighbours, Explained and Decided, 404, decide and undo signed with
      the undo answered, a reject without reason 422, cross-origin 403, a record's `docs:review`).
- [x] `pnpm --dir apps/dashboard ui:check` at 1280 and 390 px on reference-insurer-local's Review
      (137 waiting: Needs you, Records, Rules, Decided, Explained) and an empty portal: all pass.
      Found on the way: the "0 selected" bar showed in groups with nothing to pick; it now appears
      once a row is ticked.

## Close-out review: feature/062-r96-review (2026-10-23)

Files and functions within G-01–G-06 (largest `queries_app_review.py`, about 310 non-blank lines;
no function over 80 lines; nothing new in the ruff complexity report); `api_review.py` imports no
router and has no SQL (G-13, G-15), errors cross as typed statuses with plain messages (G-24);
pages compose only; `ConfirmedWrite` stays the one write path, `undo` optional.

| # | File:line | Guideline | Finding | Change | Size | Outcome |
|---|---|---|---|---|---|---|
| 1 | `queries_app_review.py:24` | G-20 | `IN_REACT` unused (the detail carries `in_react`). | Deleted | small | fixed |
| 2 | `apps/dashboard/LAYOUT.md` | G-30 | The new Review files not named. | Spec 062 entry | small | fixed |
| 3 | `apps/web/CLAUDE.md` | G-30 | The new files and `Ask.undo` not named. | Added | small | fixed |
| 4 | `queries_app_review.py` `review_page` | — | The inbox was read twice per request (counts, then the Needs tab). | Read once, filtered for the tab | small | fixed |
| 5 | `ReviewRows.tsx` / `queries_app_review.py` | G-20 | Which groups are decided here was listed in both Python and TypeScript. | The API sends `decides` per group | small | fixed |

Also found: the first API commit (T001–T003) held only its test file (the hook refused the first
attempt and only the test was staged again); the router and read models went in with T008.

Summary: 5 findings; 5 fixed.
