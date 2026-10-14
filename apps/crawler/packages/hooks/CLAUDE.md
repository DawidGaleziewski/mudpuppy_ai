# @pathfinder/hooks

Per-portal crawl hooks (spec 023, R-53): load `portals/<id>/hooks.ts`, match pages, run each hook
time-boxed with what it did recorded; a failing hook never stops the crawl.

Layer: features (G-07; `apps/crawler/layers.json`). Depends on config, safety.

## Public API

- `loadHooks(file, specs)`: import the hooks file, pair each portal `hooks:` entry with its
  export; a missing file or export is a `ConfigError` before the run starts.
- `createHookRunner({ hooks, browser, base, trace?, onRun? })` → `run(point, url, action?)`: the
  matching hooks in file order; returns runs, `skip`, rewritten `url`, `waitFor`, `patched`.
- Types for hook authors: `Hook<'onPageLoad'>`, `HookContext`, `HookResult` (Zod return contracts).
- Used by: mcp-server (`runtime/hooks.ts` adapts Playwright and the tracer).

## Invariants

- No Playwright and no tracer here: the browser is the `HookBrowser` interface, tracing and the
  decision log come through `trace` / `onRun`.
- Hooks are trusted owner code with full power (spec 021); every run is recorded.
- The crawler agent never writes hooks (spec 023 FR-009).

## Tests

- `pnpm exec vitest run --project hooks`; tier: fast. Fixture hooks file in `tests/fixtures/`.

## See also

- specs/023-crawler-hooks, docs/portal-config.md (`hooks`)
