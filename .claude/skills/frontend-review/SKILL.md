---
name: frontend-review
description: How to review MudPuppy's React console (apps/web) against the frontend architecture rules - atomic layers and imports, compound components, state placement (local state, React Hook Form, RTK Query, URL), styling through tokens, component classes and utilities only, dead and duplicated code, TypeScript and size limits - and how to write the review report with findings and improvements. Use for a frontend review, a refactor's audit, or a branch's close-out when apps/web changed.
---

# Frontend review (apps/web)

The rule book is skill **frontend-architecture** (load it first); the look is skill
`mudpuppy-salvage-ui`, composition skill `mudpuppy-react-ui`. A finding cites a rule there (FA-1 …
FA-7 below) or a guideline of `docs/code-guidelines.md`; taste is not a finding.

| Id | Rule (frontend-architecture section) |
|---|---|
| FA-1 | Layers and import direction (§ 1) |
| FA-2 | Component API: compound where the consumer arranges parts, typed variants, no copied markup (§ 2) |
| FA-3 | State placement: RTK Query, React Hook Form, local state, URL, derive don't store (§ 3) |
| FA-4 | Styling: roles only, BEM component classes, token utilities, no loose CSS, pages never style (§ 4) |
| FA-5 | TypeScript and dead code (§ 5) |
| FA-6 | Limits: size, complexity, duplication (§ 6) |
| FA-7 | The commit checks exist and pass (§ 7) |

## 1. Measure first (free, in `apps/web`)

```
pnpm typecheck && pnpm lint          # types, layers, styling and size rules
pnpm lint:css                        # stylelint: literals, class pattern
pnpm lint:dead                       # knip: unused files, exports, dependencies
pnpm lint:dup                        # jscpd: duplicated blocks
pnpm test && pnpm build              # behaviour and the bundle (note the chunk sizes)
```
Before those scripts exist (an audit of an older tree): `npx knip`, `npx jscpd src --min-lines 8`,
and greps: `grep -rn "useQuery\|useMutation\|fetch(" src`, `grep -rn "useState" src | wc -l`,
`grep -rn "className=\|style={{" src/pages src/app`, `grep -rn "#[0-9a-fA-F]\{3,6\}\|rgb(" src --include=*.css`.

## 2. Read, by rule

- **FA-1**: for each folder, its imports (`grep -rn "from '\.\./" src/design-system`); a component
  in the wrong layer; a page importing a component file instead of `index.ts`.
- **FA-2**: components whose consumers pass the same parts in a fixed order (a compound API is
  missing); boolean props that are really variants; two components with near-identical markup.
- **FA-3**: every place that fetches, polls or holds server data; every form (fields, validation,
  submit); `useEffect`s that set state; state that the URL should hold (filters, selection, tabs);
  context for state one component owns.
- **FA-4**: CSS outside `assets/` and `styles/`; literals in our CSS; class names outside the
  pattern; `className` or `style` in pages and features; inline styles beyond custom properties.
- **FA-5/6**: `any`, `as unknown as`, `@ts-ignore`, `eslint-disable` without a reason; knip's and
  jscpd's lists; files and functions over the limits.
- **FA-7**: the hook runs the web checks; it blocks a red commit.

## 3. Report

Write `specs/<feature>/frontend-review.md`:

1. **Measures**: the numbers of § 1 (queries, mutations, `useState`, forms, CSS files and lines,
   literals, knip and jscpd counts, bundle sizes).
2. **Findings**: a table `# | File:line | Rule | Finding | Size (small/large) | Outcome`.
3. **State management**: how data, forms, UI state and view state are handled today, file by
   file where it matters, and the target per kind (§ 3 of the rules).
4. **Improvements**: what to change, in order, each with its benefit and its risk; what to leave.
5. **Open questions** for the owner (at most five).

In a close-out review, fix `small` behaviour-neutral findings (skill `refactor-code`), report the
rest, and return the findings table.
