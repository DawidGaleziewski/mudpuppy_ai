# Spec 063: Review in React, part 2 (R-96, step 14)

**Branch:** `feature/063-r96-review-2` · **Owner (2026-10-23):** "Ok looks good proceed". Spec 062
moved Review's tabs, groups and the portal model's decisions; this step moves the rest, so the
htmx Review is no longer needed from the React console.

## What this step builds

- **FR-001 The detail** (`queries_app_review_detail.py`) of the kinds spec 062 left on htmx:
  - an **unexplained difference** (read-only): the element or the reach, who sees it and who does
    not with each persona's attributes, the side-by-side or Access tab link, how a record explains
    it;
  - an **amendment to re-anchor**: its text as the author's note, why it lost its place, where it
    was (screen, element, the scan that changed it), the screens to put it on;
  - an **assistant proposal**: what it changes (target and text, before and after), its status,
    stale or not, the revision applying it makes;
  - a **probe suite**: goal, start, form step, its variants with expectation, probe, fault, why and
    steps; the expectation and step kinds' words; where approving writes it.
- **FR-002 The writes** (`web/api_review_items.py`), signed, `{ok, message, href}`, the same chat
  calls as the htmx forms: `…/amendments/{id}/reanchor` (`state_id`, `element`, `text`) and
  `…/dismiss`; `…/proposals/{id}/apply|discard`; `…/suites/{id}` (`action` save, approve or
  dismiss, `variants` with `keep`, `expect` and `steps`, `new`), turned into the htmx form's fields
  (`suite_form.form_of`) so both edit a suite through `suite_form.edited_trace`. `suite_calls`
  and `SUITE_DONE` move from the htmx router into `suite_form.py` (G-13).
- **FR-003 The page**: the four details in Review's side column with their forms; every write
  asks first.
- **FR-004 The keyboard** (designer § 5.2): J / K next and previous item, C confirm, R reject
  (to the reason), U undo the last decision, ? the list of keys; never while typing; a switch
  turns single keys off in this browser.

## Not in this step

- Edit conflicts: not stored (a stale save is refused at once, spec 022 FR-005), so the group
  stays empty in both consoles.
- X (select the current row) and Shift+C: the row's box does it.

## Validation

- [x] `pnpm typecheck && pnpm lint && pnpm test` in `apps/web` (104 tests; `tests/review-items.test.tsx`:
      a difference with its sides and compare link, re-anchor asked then sent, a proposal before →
      after drawn and applied, a stale one not appliable, a suite edited (a variant dropped, an
      expectation changed, a step added) and approved with the edit sent; keys: C asks, not while
      typing, J moves, turned off in this browser); `pnpm build`.
- [x] Dashboard: ruff; `tests/test_api_review_items.py` (a difference's sides with attributes and
      compare link; re-anchor and dismiss signed, 422 without a screen; a proposal's detail and
      apply, 422 for another verb; a suite's detail, the JSON edit through `suite_form` to edit then
      approve, 404 for an unknown suite); the htmx suite tests unchanged after the move.
- [x] `pnpm --dir apps/dashboard ui:check` at 1280 and 390 px on each new detail: no local store
      holds these kinds, so on scratch stores seeded from the test fixtures (liveinsurer: re-anchor and
      two proposals, one stale; access-shop: a difference; scar-maker: a suite): all pass.

## Close-out review: feature/063-r96-review-2 (2026-10-23)

Files and functions within G-01–G-06 (largest `queries_app_review.py`, 334 non-blank lines; new
`queries_app_review_detail.py` 203; no function over 80 lines, nothing new in the ruff complexity
report); `api_review_items.py` imports no router and has no SQL (G-13, G-15); errors cross as
typed statuses with plain messages (G-24); pages compose only.

| # | File:line | Guideline | Finding | Change | Size | Outcome |
|---|---|---|---|---|---|---|
| 1 | `web/review.py:326` | G-20 / G-11 | `SUITE_DONE` and `suite_calls` left as aliases after the move. | Aliases deleted; the htmx route calls `suite_form` | small | fixed |
| 2 | `apps/dashboard/LAYOUT.md` | G-30 | Spec 063 files not named; the 062 line said the other kinds open on htmx. | Spec 063 entry, stale clause dropped | small | fixed |
| 3 | `apps/web/CLAUDE.md` | G-30 | `ReviewItems.tsx`, `ReviewSuite.tsx`, `useReviewKeys.ts` not named. | Added | small | fixed |

Summary: 3 findings; 3 fixed.
