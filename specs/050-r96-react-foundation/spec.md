# Spec 050: the React console's foundation (R-96, step 1)

**Branch:** `feature/050-r96-react-foundation` · **Owner (2026-10-22 night answers):** "We go full
change to React first, then add the gen UI features … replace [the htmx pages] as per your
convenience … I would suggest starting from creating design system. CSS tokens. I want components
in Storybook also so I can see them. Document each component and re-use as much as possible.
Create a skill for frontend dev to encapsulate all rules to stay consistent. I want whole app to
be React from now. Goal is no more htmx, just React SPA app." Stack (answer 10): a new
`apps/web` (Vite, React 19, TypeScript); the dashboard's Python becomes the JSON API.

## What this step builds

- **FR-001 `apps/web`**: Vite 8, React 19, TypeScript 6 (strict, exact optional properties),
  ESLint 10 with the repo's typed rules plus React hooks, Vitest + Testing Library (jsdom), in the
  root pnpm workspace. React Router 7 for routes under `/app/`, TanStack Query 5 for data.
- **FR-002 The design system** (`src/design-system/`): the designer's tokens, fonts and class
  library copied unchanged (`pnpm ds:sync`, a drift test against the design package), and typed
  components that own their `sy-` classes: AppShell, Button/LinkButton, Callout, Chip, Count,
  Facts, Field/Input/Select/Textarea/Check, Stack/Cluster/Split/Grid/Columns, Meter, Note,
  PageHead, Plate, Rows/Row, Status (the one status vocabulary), Steps, Table, Tabs (WAI-ARIA
  keyboard), Tag/Tags, Text. One import (`index.ts`).
- **FR-003 Storybook 10**: a stories file per component with its purpose and rules, autodocs from
  the types; pages Introduction, Rules (the eight rules, never, voice), Tokens (colour roles,
  type scale, spacing live from the CSS). `pnpm --dir apps/web storybook`.
- **FR-004 The skill `mudpuppy-react-ui`**: where things are, the rules (compose, never style; a
  missing piece is a component first; statuses through one mapping; states; accessibility;
  read-only data, writes through confirmed commands), how to add a component and a page, the
  checks before done. The `frontend-dev` agent puts React first. Lint enforces "pages never style".
- **FR-005 First slice**: the dashboard's JSON API (`/api/portals`, `/api/portals/{p}/scans`,
  typed pydantic models) and the React pages Portals and Scans (loading, empty, error states; a
  running scan as a live meter that refreshes every 2 s), served by the dashboard at `/app/`.

## Next steps (R-96, in order)

1. Move the htmx pages page by page (Home, Scans with its graph, Screens, Processes, Review,
   Changes, Rules, Docs, Settings), each with its JSON route, then the chat drawer; the
   Workbench last, with A2UI and live shared state over WebSockets (the gen UI features).
2. The designer: the catalogue as React components (A2UI), D-9 full scan ids in the new contract.
3. Remove the htmx templates once their React pages cover them.

## Validation

- [x] `pnpm typecheck && pnpm lint && pnpm test` in `apps/web` (13 tests: components' behaviour,
      pages with a stubbed API, the design-system drift); `pnpm build`; `pnpm build-storybook`.
- [x] Dashboard: `tests/test_api_app.py` (both endpoints, the app route with and without a build,
      no path outside the build).
- [x] Looked at: Storybook stories and both pages at 1280 px against the local-dev store (R-32's
      scans), in the Salvage Yard look.

## Close-out review: feature/050-r96-react-foundation (2026-10-23)

Findings 2–5 were fixed before the merge (owner: "document each component"): `max_steps` is
public in `queries_scans.py`; Count, Facts, Rows and Layout have their own stories and Meter's
file is named after it; an unknown portal answers 404 from the API and unknown `/app/` addresses
get a Not found page (tests on both sides); a titled plate is named by its title
(`aria-labelledby`). Open for R-96's next step: pages link with `<a href>` (a full reload), not
the router's link; decide with the next pages whether the design system gets a router-aware link.

| # | File:line | Guideline | Finding | Change | Size | Outcome |
| - | --------- | --------- | ------- | ------ | ---- | ------- |
| 1 | .claude/skills/mudpuppy-react-ui/SKILL.md:73 | G-30 | "Add a page" names `src/app/routes.tsx`, which does not exist; routes are the `routes` list in `App.tsx` (as apps/web/CLAUDE.md says) | skill text corrected | small | fixed |
| 2 | apps/dashboard/src/mudpuppy_dashboard/queries_app.py:16 | G-13 | imports the private `_max_steps` of `queries_scans`; a shared helper should be public | rename to `max_steps` in `queries_scans.py` and its caller (file not changed on the branch) | small | deferred → follow-up |
| 3 | apps/web/src/design-system/stories/ | skill "Add a component" 3 | no stories file named after Count, Facts, the layout components or Rows; they appear only inside other stories (Meter is in `Progress.stories.tsx`) | own stories for them, `Progress` renamed `Meter` | large | deferred → follow-up |
| 4 | apps/web/src/pages/Scans.tsx; apps/dashboard/…/web/api_app.py:30 | skill rule 6 | no "not found" state: an unknown portal lists "No scans yet" and unknown `/app/...` routes have no catch-all | 404 for an unknown portal in the API, a not-found route and page | large | deferred → follow-up (changes API behaviour) |
| 5 | apps/web/src/design-system/components/Plate.tsx:39 | skill rule 7 | a titled plate is a `section` without an accessible name (the designer ties it to its title with `aria-labelledby`) | `useId` and `aria-labelledby` | large | deferred → follow-up (changes markup and accessibility tree of every plate) |

Checked without findings: components own their `sy-` classes and every class they use exists in `salvage.css`; no `className` or `style` in `src/pages` and `src/app`; one `h1` per page (`PageHead`), labelled controls (`Field`), `Table` with scoped headers, `Callout live` for errors; `spa.py` resolves the path and refuses anything outside the build (a test covers an encoded `..`); no SQL in routers (G-15); size and complexity limits (G-01..G-04) hold in all new files. Deliberate markup deviations from the designer's `components.html` (`Rows` as `ul/li`, `Plate` titles as `h2`: list semantics, no skipped heading level) are rejected as findings.

Checks after fixes: apps/web typecheck ✓ lint ✓ test ✓ (13 tests); apps/dashboard ruff ✓ test_api_app.py ✓
Summary: 5 findings, 1 fixed, 4 deferred, 0 rejected.
