# Spec 076: frontend architecture refactor and code health (R-105)

**Branch:** `refactor/076-r105-frontend-architecture` · **Source:** the owner, 2026-10-24.

## The owner's brief

> Ok let's do a refactor. We will do this on refactor branch. Run both evals and tests first to
> check the current state. 10$ budget. After that we do a refactor. Double check no stale code
> that is not used is there, no htmx etc.
>
> Create a skill for frontend review and give it to code reviewer. I want atomic design, atoms
> organism etc. Good practices like compound components, check how state is managed and write a
> report and how we could improve it. Local state where it matters, react hook forms where it
> makes sense, rtk query where we communicate with api.
>
> Styles should be in tokens and use a design system so we can easily ie do a rebranding if needed
> (change token values and what classes mean) therefore css tokens -> css classes for components
> (like box box__header—premium etc). No loose css styles. + helper classes similar to tailwind
> (mb pt etc) handling red etc with token as well so we can easily rebrand on the go).
>
> Create a skill holding these rules. Create plan for refactor and implement it. Also review loose
> code and what is repeated (we should be following dry) make sure we have limiting rules, use
> typescript and all this is running from hook on commit.

## What this delivers

- **FR-001 Baseline**: every suite and both evals (the crawler eval and the grouping eval on the
  reference portal, within $10) before any change; the same suites after (`baseline.md`).
- **FR-002 Skills**: `frontend-architecture` (the rules) and `frontend-review` (the review and its
  report); the code-reviewer and frontend-dev agents load them.
- **FR-003 Review report** (`frontend-review.md`): measures, findings, how state is managed today
  and the target, improvements in order, open questions.
- **FR-004 Atomic layers**: the design system's components in `atoms/`, `molecules/`,
  `organisms/`, `layout/`; imports only downwards, enforced by lint; pages import `index.ts` only.
- **FR-005 Styling**: token utility classes (`u-*`, spacing, tone, surface, layout) generated from
  the token scales; a `Box` with typed utility props; our CSS in `design-system/styles/` with role
  tokens only and BEM class names; the live Workbench's placeholder CSS moved there on tokens;
  stylelint refuses literals and class names outside the pattern.
- **FR-006 Server state on RTK Query**: one `createApi` with the dashboard's base query (data store
  and As of kept), endpoints per domain, polling where a scan runs, writes as mutations that
  invalidate tags; TanStack Query removed.
- **FR-007 Forms on React Hook Form** (with zod) where a form has several fields or validation.
- **FR-008 Compound components** where consumers arrange parts (Plate, Dialog), and the duplicated
  blocks folded (the map canvas of two pages, the dialog's open/close).
- **FR-009 Dead code**: unused files, exports and dependencies removed; no htmx left in our code.
- **FR-010 Checks on commit**: a git pre-commit hook (`.githooks/`, the same script as Claude
  Code's hook) that runs, for `apps/web`, typecheck, ESLint (layers, styling, size), stylelint,
  knip, jscpd and the tests; the other apps' suites as today.

## Not in this spec

- The designer's own CSS (`assets/`) and its class names: a copy we never edit.
- Behaviour changes: every page works as before; the suites and `ui:check` prove it.

## Acceptance

Every suite green before and after; `ui:check` on the pages touched; the hook blocks a commit with
a red web check (tried once); the review report written.
