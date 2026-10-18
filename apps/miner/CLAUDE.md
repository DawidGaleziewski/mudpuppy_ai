# pathfinder-miner

MudPuppy 2.0's analysis worker (spec 039, R-81, design § 11.2): decision mining (scikit-learn
decision trees, DMN tables) and community detection (Leiden) for process proposals.

Layer: app (Python, uv; outside the TS layers; never on the crawler's runtime path)

## Run
- `cd apps/miner && uv sync && uv run pathfinder-miner check`
- `rules` (M4) and `communities` (M5) print JSON; `pnpm --dir apps/crawler model:import <file>`
  validates it with Zod and writes it. This app opens the store read-only (`mode=ro`) and never
  writes it (constitution, Technical Constraints ▸ Python).

## Tests
- `uv run ruff check && uv run pytest`

## See also
- specs/039-mudpuppy-2-portal-model/design.md § 11, § 13.3
