---
name: mudpuppy-react-ui
description: How to build the MudPuppy console in React (apps/web, the only UI since R-100) so it stays consistent - the design-system components and their rules, Storybook documentation for every component, the page and data patterns over the dashboard's JSON API, router links, tests, and the checks before done. Use for ANY UI work - a new page, a component, a story, a visual fix, the API a page reads. Not for the crawler.
---

# MudPuppy console in React

The console is a React single-page app in `apps/web`, the only UI (R-100, owner 2026-10-23:
"100% react spa. No htmx. … React router. No a hrefs"). The look is Salvage Yard: the
designer's CSS is the source of truth, the React components draw it, pages compose the
components. Consistency comes from one rule: **pages never style; they compose.**

**The code's shape** (atomic layers, compound components, where state lives, styling through
tokens, component classes and utilities, the commit checks) is skill `frontend-architecture`;
this skill is how pages compose. Where the two differ, `frontend-architecture` wins.

## Where things are

| What | Where |
|---|---|
| The design system (components, tokens, CSS copy) | `apps/web/src/design-system/` (`index.ts` exports everything) |
| The designer's CSS, tokens, fonts (copy) | `apps/web/src/design-system/assets/` (`pnpm ds:sync`; never edit; a test fails while it drifts from `docs/design/salvage-yard/design-system/`) |
| Component stories and docs pages | `apps/web/src/design-system/stories/` (`*.stories.tsx`, `Introduction.mdx`, `Rules.mdx`, `Tokens.mdx`) |
| Pages, routes, data hooks | `apps/web/src/pages/`, `apps/web/src/app/` |
| Tests | `apps/web/tests/` (Vitest, jsdom, Testing Library) |
| The JSON API the app reads | `apps/dashboard` (`web/api_*.py` routers under `/api`, read models in `queries*.py`) |
| The look's rules and reference screens | skill `mudpuppy-salvage-ui` (its references) and `docs/design/salvage-yard/screens/` |

Commands (in `apps/web`): `pnpm dev` (Vite on 5173, `/api` proxied to the dashboard on 8765),
`pnpm storybook` (6006), `pnpm typecheck && pnpm lint && pnpm test` before every commit,
`pnpm build` and `pnpm build-storybook` before merging.

## The rules

1. **Compose, never style.** A page imports components from `src/design-system` and nothing
   else for the look. No `sy-` class names in pages, no `className` strings that paint, no inline
   colour, font, size, radius or shadow (lint refuses the inline ones). Layout goes through `Stack`,
   `Cluster`, `Split`, `Grid`, `Columns`.
2. **A missing piece is a component first.** When a page needs something the design system does
   not have, add a component (below), with its story and test, then use it. Reuse before you add:
   check `index.ts` and Storybook first; extend a component's props before writing a sibling.
3. **The eight Salvage Yard rules hold** (Storybook "Design system / Rules"): ids are `Tag`s,
   at most one `primary` button and one `intent` plate per view, to-be is `drawn`, human text is
   `Note`, content in `Plate`s, square and flat, short caps only, every status a `Status`.
4. **Statuses come mapped from the API.** The dashboard's one status map (`status_map.py`) gives
   every status as `{shape, word}` (`StatusOut` in `api.ts`); show it with `ShownStatus`. The app
   never maps a product value itself; a status the API sends raw is an API bug, fixed there.
5. **Show stored values exactly**: Polish labels, ids, UTC timestamps with `Z`. Never invent copy.
6. **Every view has its states**: loading, empty, error (with the reference and the next move),
   not found. A region without its empty state is not finished.
7. **Accessible by construction**: one `h1` per page (`PageHead`), landmarks from `AppShell`,
   labels on every control (`Field`), keyboard for everything interactive, focus visible, live
   regions for results that arrive later (`Callout live`).
8. **Read-only data, writes through commands.** The app reads the dashboard's JSON API (read-only on
   the store). Every write goes through an API that forwards to the chat service, behind a confirm
   the person sees; nothing writes the store from the browser directly.

## Add a component

1. `src/design-system/<layer>/<Name>.tsx` (`atoms/`, `molecules/`, `organisms/` or `layout/`:
   the lowest layer it fits, skill `frontend-architecture` § 1): a typed function component that
   owns its `sy-` classes (from the designer's class reference in skill `mudpuppy-salvage-ui`);
   JSDoc on the component and on every prop says what it is for and its rule; a compound API
   (`Dialog.Head` …) when the consumer arranges its parts.
2. Export it (and its props type) from `src/design-system/index.ts`.
3. `src/design-system/stories/<Name>.stories.tsx`: `title: 'Components/<Name>'`, a
   `docs.description.component` that states its purpose and rules, `args` for the default story,
   and one story per meaningful variant or state. Autodocs makes the props table from the types.
4. A behaviour test in `tests/` for anything beyond markup (keyboard, ARIA, disabled, empty).
5. Need a class the library lacks? Do not invent one: ask the owner (and the designer) first; the
   CSS comes from the design package and `pnpm ds:sync`.

## Add a page

1. The reference screen first (`docs/design/salvage-yard/screens/`); its structure decides the
   components.
2. The data: one read model per page in the dashboard (`queries_*.py`, pytest first), one JSON
   route in `web/api_<page>.py` under `/api` (no SQL in routers, G-15), typed response models.
3. In `apps/web`: an RTK Query endpoint (`read(...)` in the page group's `api-<page>.ts`,
   `api.injectEndpoints`; its key's prefixes are its tags) and a hook named for it, the page in
   `src/pages/<Page>.tsx` composed from the design system, the route in the `routes` list of `src/app/App.tsx`.
4. A test that renders the page with a stubbed API: its states (loading, empty, error, data).
5. Links: every `href` goes through a design-system component (`Text`, `LinkButton`, `Anchor`…),
   which the app draws as a React Router `Link` (`routerLink`); a move made by code uses `useGo`.
   Never a raw `<a>` in `src/pages` or `src/app` (lint refuses it); a file or a download stays a
   plain link through `Anchor download`.

## Before you say done

- `pnpm check` in `apps/web` (typecheck, lint, lint:css, lint:dead, lint:dup, test; the commit
  hook runs it) and `uv run ruff check && uv run pytest` in `apps/dashboard` when the API changed;
  `pnpm build-storybook` succeeds.
- Look at it: the page and its components at 1280 and 390 px (Playwright screenshot of the story
  or the page), no page-level horizontal scroll, one `h1`, at most one primary button and one
  intent plate.
- Every new component has a story with a description; every new page has its states.

## Never

- A copy of a component's markup in a page instead of the component.
- Editing `src/design-system/assets/` (it is the designer's).
- A select that navigates on change; text under 11px; any animation but the running pulse.
- Data in `localStorage` that must survive or be shared (it lives in the store, behind the API).
