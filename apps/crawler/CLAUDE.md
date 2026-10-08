# apps/crawler

The crawler app: the TypeScript packages under `packages/` (layers in `layers.json`, each with its
own `CLAUDE.md`), the operator scripts under `scripts/`, and the test tiers.

## Commands (run here)

- `pnpm typecheck && pnpm lint && pnpm test:fast` — every commit (the hook runs it): tests affected
  by your uncommitted changes, no `*.e2e.test.ts`, no gates (`scripts/test-tier.ts`).
- `pnpm test:slow` — the `*.e2e.test.ts` browser files and the whole gate set (proving ground on
  4200/4201); before committing `mcp-server/src/runtime/**`, `crawler/src/**`, `gates/**` or
  proving-ground changes. `pnpm test` runs everything (close-out).
- `pnpm lint:report [dir…]` — warning counts per rule and package (`specs/012-maintainability/lint-baseline.md`).
- `pnpm mutate [--package <name>]` — mutation testing on demand (G-32), mutates files in place
  across the whole app (every file gets a temporary `// @ts-nocheck`): do not edit, test or
  commit anything in `apps/crawler` while it runs (spec 012 F-16). Not incremental (F-15).
- Operator scripts: `pnpm docs:*`, `pnpm portal:export|delete`, `pnpm vault`, `pnpm eval`,
  `pnpm tokens:ba`, `pnpm stability`, `pnpm trace:import-agent`, `pnpm wireframes:build`, `pnpm reference-portal`.

## Layout

- `packages/*` — workspace packages; `tests/layers.test.ts` (Vitest project `repo`) enforces
  `layers.json`: imports only downward, the kernel depends on nothing (G-07, G-08).
- `scripts/*.ts` — thin CLIs over the packages; typechecked through the root `tsconfig.json`.
- `tests/fixtures/` — shared fixtures (robots, HAR, ARIA, URLs); a change runs the whole fast tier.

## Where to add things

- New package: `packages/<name>/` with `package.json`, `tsconfig.json`, `vitest.config.ts`,
  `CLAUDE.md`, and its layer in `layers.json` (the layers test fails until it is listed).
- New browser end-to-end test: name it `*.e2e.test.ts` (slow tier).

## See also

- docs/code-guidelines.md, specs/012-maintainability (tiers, layers, move map)
