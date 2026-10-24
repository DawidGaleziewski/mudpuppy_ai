# @mudpuppy/web

The MudPuppy console as a React single-page app, the only UI (R-96, R-100). The Salvage Yard
design system as React components, documented in Storybook; pages over the dashboard's JSON API
(`/api`, read-only on the store).

**The code's shape follows skill `frontend-architecture`** (atomic layers, compound components,
where state lives, tokens → component classes → utilities, the limits); **pages follow skill
`mudpuppy-react-ui`**. Pages and features compose design-system components and never style (lint
refuses `className` and `style` in `src/pages`, `src/app` and `src/features`).

## Run

- `pnpm --dir apps/web dev` → http://127.0.0.1:5173/app/ (Vite; `/api` proxied to the dashboard
  on 8765, so start the dashboard too).
- `pnpm --dir apps/web build` → `dist/`, served by the dashboard at http://127.0.0.1:8765/app/.
- `pnpm --dir apps/web storybook` → http://127.0.0.1:6006 (every component, the rules, the tokens).
- `pnpm --dir apps/web ds:sync` after the designer changes `docs/design/salvage-yard/design-system/`
  (it regenerates the token utilities too, `pnpm ds:utilities`).

## Layout

- `src/design-system/` by layer (`atoms/`, `layout/`, `molecules/`, `organisms/`; imports only
  downwards), `styles/` (the generated token utilities), `stories/`, the designer's `assets/`,
  `index.ts` (the one import); `src/app/` (routes, the API hooks, the frame, links, writes);
  `src/features/` (a feature's own organisms: the live Workbench); `src/pages/` (one file per
  page); `tests/`.
- **Where each page's files live: `LAYOUT.md`.** Read it before adding a page or a hook.
- A page's route goes through `page(path, () => import('../pages/X'), 'X')` in `App.tsx`: each
  page is its own chunk (spec 077); `tests/render-at.tsx` loads them before a test renders.
- Every link inside the app moves through React Router (`RouterAnchor.tsx`); a raw `<a>` is
  refused by lint. Links and API calls keep `?store=` and, on the model pages, `?as_of=`.
- Every page renders inside `Shell` (one frame, drawn once); every write goes through
  `ConfirmedWrite.tsx`.

## Tests

- `pnpm check` before every commit (typecheck, ESLint with the layer and styling rules, stylelint,
  knip, jscpd, the tests); the git pre-commit hook runs it. `pnpm build` and `pnpm build-storybook`
  before a merge.
