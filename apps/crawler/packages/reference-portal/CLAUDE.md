# @pathfinder/reference-portal

Local Polish insurer reference portal with ground-truth manifest (spec 004 D8), used to measure the BA goal. Exports: server (start), ground-truth, `TODAY`.

Layer: servers (G-07; `apps/crawler/layers.json`)

## Public API
- `server`: start the reference portal.
- `ground-truth`: ground-truth manifest for the BA goal.
- `TODAY`: deterministic test date.

## Invariants
- Deterministic content and dates (`TODAY`).
- Ground truth must match the pages.

## Where to add things
- New page or rule: `src/pages/` or `src/rules.ts`, and the matching entry in the ground-truth
  manifest (`src/ground-truth.ts`) in the same commit.

## Tests
- `pnpm exec vitest run --project reference-portal`; tier: fast. 3 files.
- Start: `pnpm reference-portal` from apps/crawler.

## See also
- specs/004-ba-documentation
- docs/code-guidelines.md
