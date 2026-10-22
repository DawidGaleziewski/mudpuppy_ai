# R-83 rename (spec 041) — closed 2026-10-22

**State:** squash-merged on master as 134c07e, tag `v2.2.0`, both pushed; feature branch deleted.
Nothing of ours running (the session's own old-name MCP server, started before the rename, stays
until Claude Code restarts).

## For the owner

- **Restart Claude Code** so `.mcp.json`'s `mudpuppy` / `mudpuppy-ba` servers and the agents'
  `mcp__mudpuppy__*` tools load. Shells and scripts: `PATHFINDER_*` is now `MUDPUPPY_*`.
- `~/.config/mudpuppy` is a copy of `~/.config/pathfinder` (vault key, judge token); delete the
  old one when you like.
- Your `~/.claude/settings.json` auto-mode notes still name `pathfinder-ai` (repo and folder); not
  edited. The checkout folder keeps its name; renaming it moves Claude Code's memory folder.
- Logo: the dashboard keeps the Salvage Yard tag-icon favicon and live wordmark (the rust set of
  R-23 was replaced by that design); the README shows the design's grid-path mark. Say if you
  want the rust picture back.

## Next

R-90 (size and complexity follow-ups, after R-83, no decisions), then R-89.
