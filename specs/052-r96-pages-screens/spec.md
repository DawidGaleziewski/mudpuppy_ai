# Spec 052: the React Screens pages (R-96, step 3)

**Branch:** `feature/052-r96-pages-screens` · **Owner (2026-10-22 night answers):** "We do full
change to React first … Goal is no more htmx, just React SPA app." This step moves the portal
model's Screens list (designer screen v2-06) and one screen (v2-07) to the React console.

## What this step builds

- **FR-001 The API.** `GET /api/portals/{p}/screens` (filters `status`, `q`, `process`, `part`,
  `why`, `sort`; an unknown why or sort falls back) and `GET /api/portals/{p}/screens/{key}`
  (`web/api_screens.py` over `queries_app_screens.py`, the htmx pages' read models as JSON).
  Statuses mapped by the one status map (`model_screen`, `action`, `deviation`); pictures as
  `/evidence/…` URLs. 404 with a reason for an unknown portal or screen. The routers share
  `web/api_common.py` (`store`, `known_portal`); Home and a screen share
  `queries_app.NeedsItem`, which now carries the hypothesis keys.
- **FR-002 The list** `/app/portals/:portal/screens`: status as a segmented control with counts,
  text, part, why and sort, all in the URL (a filter keeps the old rows on screen until the new
  ones arrive); the table with the key as a tag link, the title as stored, the route, status
  and "Needs you · n", variants and their whys, last seen, the checked meter with its release,
  part, process. Empty states: no match, no model yet.
- **FR-003 One screen** `/app/portals/:portal/screens/:key`: "Needs you on this screen" (the one
  intent plate, with the hypotheses' tags), then tabs (in the URL as `?tab=`): Variants side by
  side with their picture (a thumbnail that opens the screenshot / wireframe dialog), why, when
  and by whom seen; Actions with where each leads (links to the other screens); History of
  changes and the "same screen?" answers.
- **FR-004 The design system** gains Segmented, Timeline / TimelineItem, Compare / CompareSide,
  Picture and TabPanel, each with a story and tests; Text gets `route` and `asIs` (a stored value
  in a caps context), Meter `srLabel`. Vite proxies `/evidence` in development.

## Not in this step

- The Screens views Map and Recorded pages (with the Scans graph, next), the "As of" model
  version menu, the htmx page's "Open in map" and "Open in Review" (Review moves later).
- For the designer: a class for the picture's zoom button and a wide dialog (Picture keeps
  layout-only inline styles until then); one variant spans the whole row (the auto-fit grid,
  as on the htmx page).

## Validation

- [x] `pnpm typecheck && pnpm lint && pnpm test` in `apps/web` (28 tests: the new components,
      the list with a status change asking the API again, no model, one screen with its tabs, an
      unknown screen); `pnpm build`; `pnpm build-storybook`.
- [x] Dashboard: ruff and the whole suite; `tests/test_api_screens.py` (needs you first, mapped
      statuses, status and text filters, fallbacks, a screen's parts, 404s).
- [x] `pnpm --dir apps/dashboard ui:check` at 1280 and 390 px on the list (all, filtered) and on
      SC-0001 and SC-0004 (three variants) with each tab, against the local-dev store: all pass.
      Found and fixed on the way: a muted count on the pressed segment failed contrast (the count
      is plain text now).

## Close-out review: feature/052-r96-pages-screens (2026-10-23)

Lint (eslint) clean; ruff C901/PLR0912/PLR0913/PLR0915 report empty on the changed Python; no file over G-01.

| # | File:line | Guideline | Finding | Change | Size | Outcome |
|---|---|---|---|---|---|---|
| 1 | `apps/web/src/design-system/stories/Tabs.stories.tsx` | skill mudpuppy-react-ui "Add a component" 3 | `TabPanel` (new component) had no story | Added `WithPanel` story; docs text names `TabPanel` | small | fixed |
| 2 | `stories/Text.stories.tsx` | same | `Text` `route` and `asIs` (new props) not shown in Storybook | Added both to the Variants story | small | fixed |
| 3 | `stories/Meter.stories.tsx` | same | `Meter` `srLabel` (new prop) not shown | Added `OwnName` story | small | fixed |
| 4 | `apps/web/src/pages/Screen.tsx:69-92` | G-19 (style) | `CompareSide` block mis-indented inside `.map` | Re-indented | small | fixed |
| 5 | `Picture.tsx:25-27,48,52,74` | skill rule 1 / "Need a class the library lacks? ask" | Layout-only inline styles in a design-system component. Acceptable: inside the component, never in a page, lint allows it there, spec 052 and roadmap R-96 ask the designer for the classes. `cursor` and `background: none` are close to paint; remove when the classes arrive. | none | large (needs designer) | open, tracked in roadmap R-96 |
| 6 | `Screens.tsx:130-147` | skill "Never": a select that navigates on change | Part, why and sort `Select`s change the URL and refetch on change while the text filter needs Apply: mixed model, borderline (it filters, it does not leave the page). | none: kept (filtering the list in place is no change of context, WCAG 3.2.2; the text field waits for Apply so typing does not refetch per key) | — | accepted |
| 7 | `Screen.tsx:114,192`, `Screens.tsx:70` | skill rules 4, 5 | The app rewrites stored or product values: `result.replaceAll('_',' ')`, `answer.toLowerCase()`, `w === 'Unknown'` picks a chip variant. Rule 4 says the API maps (Variants already get `reason_chip` from the API). | The API sends the whys as chips, a lead's `note` ("no change") and the answer as said in a sentence; the app's `ShownChip` shows an API chip (Home too) | small | fixed (after the review) |
| 8 | `Screen.tsx:192,248-258` | skill rule 1 | Raw `<b>` and `<span>` in a page; no component for bold or plain inline text. | `Text strong` (a `<strong>`), the meta line in `Text`s | small | fixed (after the review) |
| 9 | `Screens.tsx:195` | G-22 | `as unknown as ScreenFilter` double cast hides the shape. | The filter is built field by field from the URL | small | fixed (after the review) |
| 10 | `Screen.tsx:289`, `Screens.tsx:218` | G-22 | `q.data!` non-null assertions inside the `QueryState` render prop (same pattern as earlier pages). | `QueryState` takes the query and hands its data to the page (every page) | small | fixed (after the review) |
| 11 | `Screen.tsx:102,186` | style | Index keys on `leads_to` and `labels` lists; the API has no stable id. | none: kept (the lists are fixed per response and never reorder in place) | — | accepted |

Checks after fixes: `pnpm typecheck && pnpm lint && pnpm test` in apps/web green (28 tests); no Python changed, so ruff/pytest not rerun.
Summary: 11 findings; 4 small fixed, 7 open (1 designer, 1 owner call, 5 follow-ups); 0 reverted.
After the review: #7–#10 fixed, #6 and #11 accepted with the reasons above, #5 waits for the
designer (roadmap R-96). Checks again: apps/web typecheck, lint, 28 tests, build, Storybook build;
dashboard ruff and the whole suite.
