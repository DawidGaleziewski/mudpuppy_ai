# pathfinder-miner

Analysis worker for MudPuppy 2.0: mines business rules (DMN decision tables) from recorded inputs
and proposes process boundaries (Leiden communities). Reads the store read-only; its JSON output is
written by `pnpm --dir apps/crawler model:import`. See `CLAUDE.md` and spec 039.
