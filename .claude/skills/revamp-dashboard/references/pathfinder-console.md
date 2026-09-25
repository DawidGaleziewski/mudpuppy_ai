# Pathfinder console — the product layer on Console

Read this before any UI task in `apps/dashboard/`. The Console system
(`console-design-system.md`) applies unchanged: tokens, the five rules, type, spacing, radius,
breakpoints and the three sanctioned animations. This file holds only what Console asks each
product to decide for itself, plus how the dashboard is wired. Spec of record:
`specs/003-dashboard-ui/contracts/ui-conventions.md` and `contracts/http-routes.md`; change both
together with this file.

## Identity

- Wordmark `pathfinder://console`, `display` size, phosphor glow.
- Mark: three small square nodes joined by two hairlines in a bent path (the node/edge unit the
  state graph will reuse), identity colour; one bounce on first paint of the shell, never again.
- Identity colour `brand` amber, which also means "Ok / nominal" (rule 3).

## Status language (bracket text, body size, never a pill)

| Record | Value | Label | Token | Extra signal |
| --- | --- | --- | --- | --- |
| run | `completed` | `[ OK ]` | `brand` | |
| run | `running` | `[RUN.]` | `accent-3` | live dot (pulse) — the only animated element |
| run | `stopped_warning` | `[STOP]` | `signal-error` | warning text beside it |
| run | `interrupted` | `[INT.]` | `ink-500` | |
| frontier | `done` | `[DONE]` | `brand` | |
| frontier | `pending` | `[PEND]` | `ink-500` | dashed row border |
| frontier | `skipped_unsafe`, `denylisted`, `robots_disallowed`, `out_of_scope`, `budget_reached` | `[SKIP]` + status | `ink-500` | reason column |
| frontier | `unreachable` | `[FAIL]` | `signal-error` | reason column |
| edge | `executed` / `skipped` | `[ OK ]` / `[SKIP]` | `brand` / `ink-500` | |
| decision | `warning` | `[WARN]` | `signal-error` | |
| decision | `skip` / `refuse` | `[SKIP]` / `[RFSE]` | `ink-500` | rule column |
| decision | `merge` / `split` / `note` | `[MRGE]` / `[SPLT]` / `[NOTE]` | `ink-100` | |

Red only where the crawl failed or stopped (rule 5). A safety skip is the system working: muted.
The mapping lives in one Jinja macro (`templates/partials/macros.html`); never inline a label.

## Accents (rule 4: one meaning per screen)

- Run detail, actions: safety class. `read` → `accent-2`; `mutating`, `destructive`,
  `external-side-effect` → `accent-4` with the class name as text.
- Confidence, everywhere: `observed` plain `ink-100`; `inferred` → `accent-4` + text;
  `needs_confirmation` → `accent-4` + text + dashed border. Text is the signal (Principle II).
- Overview: no category accents; portal cards stay neutral.

## How the app is built (so new screens fit)

- Server-rendered Jinja2 in `src/pathfinder_dashboard/templates/`; one partial per region in
  `partials/`, the same partial serves the full page and the htmx fragment.
- Every colour, size and spacing value comes from `static/css/tokens.css`; `app.css` uses
  `var(--…)` only (a test fails on hex literals or free radii).
- **Live region** = `hx-get="<fragment url with current params>"`
  `hx-trigger="store-changed from:body"` `hx-swap="outerHTML"`. `<body>` holds
  `hx-sse:connect="/events"`; the stream only says "store changed", each region re-fetches itself.
  While refreshing, keep current content: no spinner, no flash.
- Filters and pager links send `push=1`; the fragment answers with an `HX-Push-Url` header holding
  the page URL, so a filtered view is a shareable URL. Live refreshes never push.
- Lists: keyset pagination 50/page, rectangular pagination ticks.
- States for every region: empty, loading (caret blink), error, not-found — dashed borders.
- Below 1024px (tablet and mobile): tables become stacked cards; tabs scroll; targets ≥ 44px.
  Below 640px the top bar also wraps.
- Untrusted portal strings (titles, accessible names, JSON) are autoescaped; JSON goes in `<pre>`.

## Recipes

**Add a run-detail section** (a tab; the page shows one section at a time):
1. Query functions in `queries.py` (`_page` for lists, `_grouped` for counts), pytest first in
   `tests/test_queries.py`.
2. `app.py`: add `(id, label)` to `SECTIONS`, its count to `header_values`, and a branch in
   `section_values` that validates filters against the model's Literal values (unknown → `None`;
   an empty form value means "any").
3. `templates/partials/<id>.html` shaped like `decisions.html`: `m.region`, `m.filter_form` (with
   `{"tab": "<id>"}`), `table.data.stack` with `data-label`s, `m.pager`, `m.empty`.
4. Route tests: labels + counts, filter + `HX-Push-Url`, filter survives reload, empty and
   filtered-empty, escaping of untrusted strings, not-found. Add the tab URL to `tests/test_perf.py`.

**New status label**: add it to `macros.html`, the table above and
`specs/003-dashboard-ui/contracts/ui-conventions.md` in the same change, and list it in your
report; the user owns the design system and approves new vocabulary.

**Loading**: pages are server-rendered, so there is no first-load loading state. The caret shows
only while a filter or pager request is in flight (`.htmx-indicator` inside `m.filter_form`); a
live refresh keeps the current content.

**Screenshots and contrast** (scorecard): start `uv run pathfinder-dashboard --port 8799`, then
drive Chromium with the crawler's Playwright
(`require('<repo>/apps/crawler/node_modules/.pnpm/playwright@<ver>/node_modules/playwright')`,
viewports 375 / 768 / 1280, check `document.documentElement.scrollWidth` equals the width). Contrast
of every token pairing is in `specs/003-dashboard-ui/checklists/scorecard.md`; `ink-500` on
`surface-200` (hovered rows) is 4.39:1, just under AA.

**Hand-offs**: a missing index or any schema change → `db-admin` with the measurement; a change to
spec contracts → list it for `po`. Never add a table or index from the dashboard.
