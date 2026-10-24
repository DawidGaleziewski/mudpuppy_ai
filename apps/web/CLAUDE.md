# @mudpuppy/web

The MudPuppy console as a React single-page app, the only UI (R-96, R-100). The Salvage Yard
design system as React components, documented in Storybook; pages over the dashboard's JSON API
(`/api`, read-only on the store).

**All work here follows skill `mudpuppy-react-ui`.** Pages compose design-system components and
never style (lint refuses `className` and `style` in `src/pages` and `src/app`).

## Run

- `pnpm --dir apps/web dev` → http://127.0.0.1:5173/app/ (Vite; `/api` proxied to the dashboard
  on 8765, so start the dashboard too).
- `pnpm --dir apps/web build` → `dist/`, served by the dashboard at http://127.0.0.1:8765/app/.
- `pnpm --dir apps/web storybook` → http://127.0.0.1:6006 (every component, the rules, the tokens).
- `pnpm --dir apps/web ds:sync` after the designer changes `docs/design/salvage-yard/design-system/`.

## Layout

- `src/design-system/` (components, stories, the designer's assets, `index.ts`), `src/app/`
  (routes, the API hooks, the frame, links, writes), `src/pages/` (one file per page), `tests/`.
- **Where each page's files live: `LAYOUT.md`.** Read it before adding a page or a hook.
- Every link inside the app moves through React Router (`RouterAnchor.tsx`); a raw `<a>` is
  refused by lint. Links and API calls keep `?store=` and, on the model pages, `?as_of=`.
- Every page renders inside `Shell` (one frame, drawn once); every write goes through
  `ConfirmedWrite.tsx`.

## Tests

- `pnpm typecheck && pnpm lint && pnpm test` before every commit; `pnpm build` and
  `pnpm build-storybook` before a merge.
