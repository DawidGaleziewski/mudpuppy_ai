---
name: frontend-architecture
description: The architecture rules of MudPuppy's React console (apps/web) - atomic design layers and their import direction, compound components, where state lives (local state, React Hook Form, RTK Query, the URL), styling through tokens, component classes and token utility classes only, TypeScript, size and DRY limits, and the checks that enforce them on commit. Use when writing or changing any code in apps/web, and as the rule book of a frontend review (skill frontend-review).
---

# MudPuppy console: frontend architecture

The owner's rules (2026-10-24): atomic design; good practices such as compound components; local
state where it matters, React Hook Form where it makes sense, RTK Query wherever we talk to the
API; styles only from tokens through a design system, so a rebrand is a change of token values
and of what classes mean; component classes such as `box`, `box__header`, `box--premium`; helper
classes like Tailwind's (`mb`, `pt`, red …) also from tokens; no loose CSS; DRY; limits, all
checked by a hook on commit.

The look itself (Salvage Yard: what each class and colour means) is skill `mudpuppy-salvage-ui`;
how pages compose is skill `mudpuppy-react-ui`. This skill is the code's shape.

## 1. Layers (atomic design)

```
src/design-system/
  atoms/       one element, no children of the system: Button, Tag, Chip, Count, Status, Text,
               Code, Kbd, Input/Select/Textarea/Check, ScanId, Icon …
  molecules/   a few atoms with one job: Field (label + control + help + error), SearchBox,
               Segmented, Callout, Facts, Disclosure, Steps, PageHead, Note …
  organisms/   a region of a page with its own structure: AppShell, Plate, Table, Tabs, Dialog,
               Graph, Diagram, Compare, Releases, Timeline, Drawer/Chat, CommandCard, GenView …
  layout/      Box, Stack, Cluster, Split, Grid, Columns: spacing and arrangement, nothing else
  styles/      our CSS on top of the designer's: utilities.css (u-*), component classes the
               designer has not drawn yet
  assets/      the designer's tokens, fonts and class library: a copy, never edited (pnpm ds:sync)
  index.ts     the one import for everything above
src/app/       templates and app wiring: the Shell (the frame), routes, the store, API endpoints
src/pages/     pages: compose templates, organisms and layout; data from endpoints
src/features/  a feature's own organisms when they are not general (the live Workbench)
```

- **Imports go one way**: atoms → molecules → organisms → templates → pages. An atom imports no
  molecule; a molecule no organism; nothing in `design-system/` imports `app/`, `pages/` or
  `features/`. Pages and features import the design system only through `index.ts`. Lint enforces
  it (`no-restricted-imports` per folder).
- **A component belongs to the lowest layer it fits.** A molecule that grows its own layout and
  state is an organism; a page-only arrangement used twice is an organism, not a copy.
- **One component per file** (its small private parts may share it); its story beside the others
  in `stories/`; its behaviour test in `tests/`.

## 2. Component API

- **Compound components** when the consumer arranges the parts: `<Plate><Plate.Head>…</Plate.Head>
  <Plate.Body>…</Plate.Body></Plate>`, `<Tabs>` with `Tabs.List`, `Tabs.Tab`, `Tabs.Panel`,
  `<Dialog>` with `Dialog.Head`, `Dialog.Body`, `Dialog.Foot`. The parent holds the shared state in
  a context; a part used outside its parent throws a clear error.
- **Props** when the parts are fixed (a `Tag`, a `Status`): no compound API for one element.
- Variants are a typed union prop (`variant="primary" | "strong" | "quiet"`), mapped to modifier
  classes in one place; never a `className` from outside.
- Every prop has a JSDoc line; every interactive component is keyboard-usable with its ARIA state.
- **No copy of a component's markup** anywhere; two similar pieces become one component with a prop
  (DRY, `jscpd` in the hook).

## 3. State: where each kind lives

| Kind | Where | Never |
|---|---|---|
| Server data (anything from `/api`) | **RTK Query** endpoints (`src/app/state/api.ts` + `injectEndpoints` per domain); writes are mutations that invalidate tags | `fetch` in a component; server data copied into `useState`; TanStack Query |
| Live streams (SSE, the Workbench WebSocket) | one hook per stream; it updates the RTK Query cache (`updateQueryData`) or invalidates tags | a second copy of the same data |
| Form values | **React Hook Form** (`useForm` + `zodResolver`) for a form with two or more fields or any validation; one free-text box (a composer) may be local state | a field per `useState`; validation by hand in `onSubmit` |
| UI state of one component (open, hover, the selected tab of a widget) | `useState` / `useReducer` in that component | Redux; a context for one component |
| Shareable view state (filters, the selected item, page, tab of a page) | the URL (`useSearchParams`) | `useState` that a reload loses |
| App-wide client state (the assistant drawer, the frame) | a React context near the root, or a Redux slice when many places write it | prop drilling through three layers |
| Per-viewer conveniences (the last portal) | `localStorage` in `try/catch` | anything that must survive or be shared |

- **Derive, don't store**: a value computable from props, state or the cache is computed in render
  (`useMemo` only when it is measurably slow). No `useEffect` that copies one state into another.
- An effect only for a real side effect (a subscription, a timer, focus): with its cleanup.

## 4. Styling: tokens → classes → components

- **Tokens** (`assets/css/tokens.css`, the designer's): a raw palette and **roles** (`--sy-text`,
  `--sy-fail`, `--sy-bg-plate`, `--sy-space-4` …). Our CSS uses **roles only**, never a raw palette
  name, a hex, `rgb()`, a named colour or a spacing length that has a token. A rebrand changes the
  token values (and, for a new brand, what the classes draw), not the components.
- **Component classes** (BEM): `sy-<block>`, `sy-<block>__<element>`, `sy-<block>--<modifier>`
  (`sy-plate`, `sy-plate__head`, `sy-plate--intent`). The designer's live in `assets/`; ours in
  `styles/` follow the same pattern. A component owns its classes; nothing else uses them.
- **Utility classes** (`styles/utilities.css`, generated from the token scales, nothing else):
  spacing `u-m-*`, `u-mt-*`, `u-mb-*`, `u-mx-*`, `u-my-*`, `u-p-*`, `u-pt-*`, … `u-gap-*` (0–9 =
  `--sy-space-*`), tone `u-text-muted`, `u-text-fail`, `u-text-ok`, `u-text-intent`,
  `u-text-active`, `u-text-tobe`, surfaces `u-bg-plate`, `u-bg-well`, `u-bg-raised`, and a few
  layout ones (`u-flex`, `u-wrap`, `u-items-center`, `u-justify-between`, `u-w-full`). They are used
  inside design-system components and through **typed props of `Box` and the layout components**
  (`<Box mt={4} tone="fail">`), never as class strings in pages.
- **Pages and features never style**: no `className`, no `style`, no CSS file of their own (lint).
- **Inline `style`** only for a data-driven custom property (`--value: 42%`, a node's `left`), never
  a colour, font, size, radius or shadow (lint).
- **No loose CSS**: every rule is in `assets/` (the designer's) or `styles/` (ours, a component
  class or a utility); stylelint refuses literals and class names outside the pattern.

## 5. TypeScript

- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` (tsconfig); no `any`, no
  `as unknown as`, no `@ts-ignore`; a `// eslint-disable` names its rule and why.
- API types are written once, beside the endpoint that returns them, and imported everywhere else.
- Exported names are used (`knip` clean): no dead export, file or dependency.

## 6. Limits (lint, on commit)

- File ≤ 400 lines, function ≤ 80, complexity ≤ 15, no nested ternary (ESLint).
- No duplicated block of 8+ lines (`jscpd`, threshold in the hook).
- No unused file, export or dependency (`knip`).
- No CSS literal outside tokens, class names in the BEM/utility pattern (`stylelint`).

## 7. The checks on commit

`.githooks/pre-commit` (installed with `git config core.hooksPath .githooks`; Claude Code's
PreToolUse hook runs the same script) runs, for a change in `apps/web`: `pnpm typecheck`,
`pnpm lint` (ESLint with the layer and styling rules), `pnpm lint:css` (stylelint), `pnpm
lint:dead` (knip), `pnpm lint:dup` (jscpd) and `pnpm test`. A red check blocks the commit.

## Before you say done

- The component is in the right layer and imports only downwards; a compound API where the
  consumer arranges parts.
- Server data through RTK Query, forms through React Hook Form, UI state local, view state in the
  URL; nothing stored that can be derived.
- No class, colour or length outside tokens, component classes and utilities.
- `pnpm typecheck && pnpm lint && pnpm lint:css && pnpm lint:dead && pnpm lint:dup && pnpm test`.
