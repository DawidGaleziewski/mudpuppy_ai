# ADR-0025: Frontend architecture: atomic layers, token-driven styling, RTK Query, checks on commit

- **Status:** Accepted
- **Date:** 2026-10-24 (spec 076, R-105)

## Context

The React console ([ADR-0023](0023-the-console-is-a-react-single-page-app.md)) grew page by page
in two days. The owner, 2026-10-24: "I want atomic design, atoms organism etc. Good practices like
compound components … Local state where it matters, react hook forms where it makes sense, rtk
query where we communicate with api. Styles should be in tokens and use a design system so we can
easily ie do a rebranding … No loose css styles … all this is running from hook on commit."

## Decision

- **Atomic layers** in the design system: `atoms/`, `layout/`, `molecules/`, `organisms/`;
  imports only downwards, enforced by ESLint; pages import the design system's `index.ts` only.
  Compound components where parts belong together (`Dialog`).
- **Styling through tokens only**: component classes (BEM names) in `design-system/styles/` using
  role tokens, plus `u-*` utility classes (spacing, tone, surface, layout) generated from the token
  scales, and a `Box` with typed utility props. Stylelint refuses literals and class names outside
  the pattern; pages never style.
- **State placement**: local state where it matters; server state in **RTK Query** (one
  `createApi` with the dashboard's base query; TanStack Query removed); multi-field forms in
  **React Hook Form** with **zod** schemas; view state in the URL.
- **`pnpm check`** in `apps/web` (typecheck, ESLint with the layer and no-styling rules,
  stylelint, knip for dead code, jscpd at zero clones, tests) runs from the git pre-commit hook
  ([ADR-0016](0016-test-tiers-and-a-pre-commit-check.md)).
- The rules are the skill `frontend-architecture`; the `code-reviewer` checks them with the skill
  `frontend-review`.

## Consequences

- Good: a rebrand changes token values only; a refused form value says why.
- Good: nothing changed on screen and every suite and both evals matched the baseline.
- Bad: RTK Query, React Hook Form and zod loaded up front grew the main bundle from 714 to
  859 kB until per-page code splitting (spec 077).
- Bad: one component (`Plate`) stayed on props instead of compound parts (52 callers, same
  slots).

## Alternatives considered

- TanStack Query, used for server state since spec 050: replaced by RTK Query.
- No other alternatives are recorded.

## Sources

- `specs/076-r105-frontend-architecture/spec.md` (owner's brief, FR-001–FR-010)
- `roadmap.md` R-105 (including leftovers)
- `CHANGELOG.md` R-105 entry (v2.9.1), spec 077 entry (v2.9.2)
- `apps/web/CLAUDE.md`; `.claude/skills/frontend-architecture/`; `CLAUDE.md` (Verification
  Before Commit)
