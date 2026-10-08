# @pathfinder/obstacles

Dismiss cookie banners, pop-ups and chat widgets: `registerObstacleHandlers(page, obstacles, opts)` uses Playwright `addLocatorHandler` plus explicit `sweep()` before observation. Single file `src/index.ts`.

Layer: kernel (G-07)

## Public API
- `registerObstacleHandlers()`: register and dismiss obstacles.

## Invariants
- Selectors come from portal config, never code (FR-019).
- An obstacle never fails a crawl step (failed clicks are swallowed).

## Where to add things
- Selectors: portal config, never code.
- Logic changes: `src/index.ts`.

## Tests
- `pnpm exec vitest run --project obstacles`; tier: fast. 1 browser unit test file.

## See also
- specs/002-portal-agnostic-safety
- docs/code-guidelines.md (G-07)
