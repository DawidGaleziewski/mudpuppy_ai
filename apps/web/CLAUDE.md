# @mudpuppy/web

The MudPuppy console as a React single-page app (R-96; owner 2026-10-22: "whole app to be react
from now, no more htmx"). The Salvage Yard design system as React components, documented in
Storybook; pages over the dashboard's JSON API (`/api`, read-only on the store).

**All work here follows skill `mudpuppy-react-ui`.** Pages compose design-system components and
never style (lint refuses `className` and `style` in `src/pages` and `src/app`).

## Run

- `pnpm --dir apps/web dev` → http://127.0.0.1:5173/app/ (Vite; `/api` proxied to the dashboard
  on 8765, so start the dashboard too).
- `pnpm --dir apps/web build` → `dist/`, served by the dashboard at http://127.0.0.1:8765/app/.
- `pnpm --dir apps/web storybook` → http://127.0.0.1:6006 (every component, the rules, the tokens).
- `pnpm --dir apps/web ds:sync` after the designer changes `docs/design/salvage-yard/design-system/`.

## Layout

- `src/design-system/`: `components/` (one file per component, owning its `sy-` classes),
  `stories/` (a stories file per component, `Introduction.mdx`, `Rules.mdx`, `Tokens.mdx`),
  `assets/` (the designer's CSS and fonts, a copy: never edit), `index.ts` (the one import).
- `src/app/`: `App.tsx` (routes under `/app/`, the query client), `api.ts` (typed endpoints and
  TanStack Query hooks), `ShownStatus.tsx` (a status as the API maps it), `Shell.tsx`,
  `QueryState.tsx`.
- `src/pages/`: one file per page.
- `tests/`: Vitest + Testing Library (components, pages with a stubbed API, the design-system drift).

## Tests

- `pnpm typecheck && pnpm lint && pnpm test` before every commit; `pnpm build` and
  `pnpm build-storybook` before a merge.
