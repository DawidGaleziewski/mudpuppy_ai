# @pathfinder/wireframe

Pure, deterministic low-fidelity wireframes (SVG + `.excalidraw`) from recorded ARIA snapshots: `renderWireframe`, `layoutWireframe`, `toSvg`, `toExcalidraw`, `GENERATOR_VERSION` (bump on any visual change).

Layer: features (G-07; `apps/crawler/layers.json`)

## Public API
- `renderWireframe`, `layoutWireframe`: create wireframes from ARIA snapshots.
- `toSvg`, `toExcalidraw`: export formats.
- `GENERATOR_VERSION`: bumped on visual changes; used by mcp-server, crawlers scripts.

## Invariants
- Pure and deterministic: same snapshot + options → byte-identical output.
- Visual changes trigger version bump so `pnpm wireframes:build` regenerates.

## Where to add things
- New render logic or options: follow existing patterns in `src/`.
- Exports: update `src/index.ts`.

## Tests
- `pnpm exec vitest run --project wireframe`; tier: fast. 1 file.

## See also
- specs/008-screenshots-wireframes
- docs/code-guidelines.md
