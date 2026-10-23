# Spec 064: Changes in React (R-96, step 15)

**Branch:** `feature/064-r96-changes` · **Owner (2026-10-23):** "Ok proceed with your work". The
htmx What changed (`web/changes.py`, designer screens v2-02 and v2-03, spec 039 T100, spec 040
T018) moves to the React console, read over the same read models (`queries_changes`,
`queries_change_detail`, `queries_releases`) so both show the same.

## What this step builds

- **FR-001 The list** (`queries_app_changes.py`, `GET /api/portals/{p}/changes`): the range
  (from the previous release, a model version, a date or a scan; to a version), the release lanes
  of the range with its bracket, the counts (all, need you, explained, waiting), the show / kind /
  process filters, the changes grouped by process then screen (needs you first) with their kind,
  finding, explanation chip and text, status and model version, and the explanations' legend.
  Statuses come mapped (`status_out`).
- **FR-002 One change** (`GET /api/portals/{p}/changes/{id}`): Before / after with each side's
  note, visit (scan, time), picture and the changed region (`visuals.region`) on the side that has
  it, "Not here" on the other; what differs (release per part, persona, scan); the explanation
  with its hypothesis, reason and tests; where it shows (Review, the screen, the process, Rules);
  Previous / Next among the changes that need you; whether it can be decided here.
- **FR-003 The pages** `/app/portals/:portal/changes` and `/app/portals/:portal/changes/:id`
  (`?mode=side|overlay|wire`, each mode its own address), Changes in the menu after Home. The
  decision bar decides the change's hypothesis through Review's decide API (asks first, offers
  Undo). J / K next and previous change, Esc back to the list (never while typing or with a
  dialog open; the Review switch turns them off).
- **FR-004 Design system:** `Releases` (portal parts × time, the scans below, the axis, the range
  bracket; a release links to Changes from its start) and `Shot` (a recorded page at full width
  with the changed region marked, or a second page drawn over it for Overlay), each with its story
  and test. Review's Explained tab links to the React Before / after.

## Not in this step

- Overturning an automatic explanation (R-87).

## Validation

- [x] `pnpm typecheck && pnpm lint && pnpm test` in `apps/web` (114 tests; `tests/changes.test.tsx`:
      groups and links, filters on the button and never on a select change, no model and nothing
      needs you, both sides marked and what differs, Overlay without a mark, the decision asked
      then sent through Review with Undo, J moves but not while typing, not found; Releases and
      Shot); `pnpm build`; `pnpm build-storybook`.
- [x] Dashboard: ruff; `tests/test_api_changes.py` (groups with mapped statuses, filters, the
      range's choices and release lanes, no model, one change's sides, region and neighbours, a
      change waiting for a check); the whole suite.
- [x] `pnpm --dir apps/dashboard ui:check` at 1280 and 390 px on the list and one change in all
      three modes (local-dev, reference-insurer-local): all pass.

## For the designer

- F-01@064: the dashed "same place" box on the side without the change and the Overlay's second
  page at 50 % have no class (`Shot` draws them with inline styles, like the htmx page's `mp-`
  classes); and at 390 px the release axis's labels crowd together (htmx too).

## Close-out review: feature/064-r96-changes (2026-10-23)

Files and functions within G-01–G-06 (`queries_app_changes.py` 309 lines, `Change.tsx` 314,
`Changes.tsx` 312; nothing in the ruff complexity report); `api_changes.py` imports no router and
has no SQL (G-13, G-15); pages compose only, selects set state and navigate on a button; statuses
come from the API. The inline styles of `Shot` and `Releases` are F-01@064 (above).

| # | File:line | Guideline | Finding | Change | Size | Outcome |
|---|---|---|---|---|---|---|
| 1 | `apps/web/CLAUDE.md` | G-30 | `Releases` not named in the file map. | None: `components/` is one file per component, none listed | small | rejected |
| 2 | `apps/dashboard/LAYOUT.md` | G-30 | The spec 064 files are named. | None | small | rejected (conforms) |

Summary: 0 findings fixed; 2 checks rejected.
