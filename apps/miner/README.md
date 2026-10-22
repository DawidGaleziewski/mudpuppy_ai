# mudpuppy-miner

Analysis worker for MudPuppy 2.0: mines business rules (DMN decision tables) from recorded inputs
and proposes process boundaries (Leiden communities). Reads the store read-only; its JSON output is
imported by `pnpm --dir apps/crawler model:mine` (rules) and `model:propose` (processes). See `CLAUDE.md` and spec 039.
