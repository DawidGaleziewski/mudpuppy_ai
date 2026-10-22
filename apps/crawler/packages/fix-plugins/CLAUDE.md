# @mudpuppy/fix-plugins

Tested, reusable fixes for portal-specific scars (spec 030 R-59): each plugin is a function of the
client's data (validated parameters from the portal file's `fixes:` list) that returns ordinary
portal hooks (spec 023), run by the hooks runner as `fix:<id>`.

Layer: features (G-07; `apps/crawler/layers.json`). Depends on config, hooks, safety.

## Public API

- `FIXES` (id → plugin), `loadFixes(source, specs)` → `LoadedHook[]`; used by mcp-server
  (`services/run-hooks.ts`, before the portal's own hooks).
- `defineFix`, `FixPlugin`, `FixHooks` for new plugins.

## Plugins

- `seed-cookie` (SC-08, H-1), `expand-collapsed` (SC-09/SC-10, H-2), `wait-for-mount` (SC-11, H-3),
  `detect-stack` (H-4). Docs: `docs/portal-config.md` (Fixes).

## Invariants

- No client data in a plugin: selectors, names and URLs come from `with:`.
- In-page bodies use anonymous function expressions (portable even without the `__name` shim).
- A plugin never bypasses the gates: its hooks have the same power and recording as owner hooks.

## Where to add things

- New fix: `src/fixes/<id>.ts` with `defineFix`, registered in `src/registry.ts`, a unit test here,
  a scar in `apps/scar-maker` and its gate in `gates/tests/scars-*.test.ts`.

## Tests

- `pnpm exec vitest run --project fix-plugins`; tier: fast. Browser behaviour is in the scar gates.

## See also

- specs/030-battle-tested-scars, specs/023-crawler-hooks, docs/portal-config.md
