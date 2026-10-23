# Spec 051: the React portal home (R-96, step 2)

**Branch:** `feature/051-r96-pages-portal-home` · **Owner (2026-10-22 night answers):** "We do
full change to React first … Goal is no more htmx, just React SPA app." This step moves the htmx
portal home (designer screen v2-01) to the React console, as the first page after spec 050's
foundation.

## What this step builds

- **FR-001 One status mapping, in the API.** The API gives every status as the dashboard's one
  status map (`status_map.status_of`) maps it: `{shape, word}` (`queries_app.StatusOut`). The
  React app no longer maps product values itself (`src/app/status.ts` is gone); `ShownStatus`
  shows a status from the API, and a kind without a shape as a plain label. `ScanSummary.status`
  changes from the raw value to this shape.
- **FR-002 `GET /api/portals/{portal}/home`** (`queries_app_home.portal_home_data`, over the htmx
  home's read model `queries_portal_home.portal_home`): the model version, each part's latest
  release (`observed` false: told apart by asset hashes), the last scan, what needs you (the total,
  counts by kind, the top items), the changes by process, process and rule counts. 404 with a
  reason for a portal that is neither configured nor scanned; a configured portal without scans
  has a home with no last scan.
- **FR-003 The React page** `/app/portals/:portal` (`src/pages/PortalHome.tsx`): "Needs you" as the
  one intent plate, then Last scan, The model and Releases side by side, then Changes by process
  and Rules by status; loading, empty (nothing waits, no scan yet, no release, no change) and
  error states. The Portals list links to a portal's home; the shell gains a Home entry; the
  Scans page's crumbs lead back to it.

## Not in this step

- The home's actions (start a scan, review an item) wait for their pages: the items name what
  needs you; Review, Changes and Rules move next.
- Pages still link with `<a href>` (a full reload). The router-aware link is decided with the
  Review page, the first one with links inside a list that should keep its scroll.

## Validation

- [x] `pnpm typecheck && pnpm lint && pnpm test` in `apps/web` (18 tests; the home page with
      items, with nothing, and an unknown portal); `pnpm build`.
- [x] Dashboard: `uv run ruff check`, the whole suite; `tests/test_api_app.py` covers the home
      (last scan with the mapped status, empty needs, 404, a configured portal without scans) and
      the scans' mapped status.
- [x] `/api/portals/reference-insurer-local/home` on the local-dev store: 200 with the release
      lane, the last scan, 137 items that need you and 3 changes.
- [x] `pnpm --dir apps/dashboard ui:check` on `/app/`, the home and Scans at 1280 and 390 px: all
      pass. Found and fixed on the way: a table's sideways scroll was not reachable by keyboard
      (axe `scrollable-region-focusable`, also on spec 050's Scans: `Table` is now a named,
      focusable region), and the full scan id beside a fact name made the phone page scroll (the
      id now stands on its own line).

## Close-out review: feature/051-r96-pages-portal-home (2026-10-23)

| # | File:line | Guideline | Finding | Change | Size | Outcome |
|---|---|---|---|---|---|---|
| 1 | apps/dashboard/src/mudpuppy_dashboard/web/api_app.py:`_known` | G-15 | The router ran `SELECT 1 FROM runs` itself (no SQL in routers). | The query moved to `queries_app_home.portal_scanned`; the router calls it. | small | fixed |
| 2 | apps/dashboard/src/mudpuppy_dashboard/queries_app_home.py:`_lanes` | G-22 (spirit) | `_lanes(h_timeline: object)` narrows with `getattr`, hiding the read model's type. | none | large-ish (needs the timeline type exported from `queries_portal_home`) | deferred |
| 3 | apps/web/src/pages/PortalHome.tsx:`LastScan` | skill rule 4 | The page maps `scan.check` to the words "check"/"scan" itself; Scans shows the raw `mode`. | `LastScan.check` became `kind` ("check" or "scan"), sent by the API | small | fixed (after the review) |

Checks after fixes: ruff check clean; tests/test_api_app.py green; apps/web typecheck, lint, test run.
Summary: 2 fixed, 1 deferred (#2 waits until another page touches `queries_portal_home`; noted
on R-96); no guideline breaks otherwise.
