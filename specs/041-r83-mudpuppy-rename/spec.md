# Spec 041: Rename pathfinder to MudPuppy everywhere (R-83)

Branch `feature/041-r83-mudpuppy-rename` · 2026-10-22 · owner request (2026-10-20,
`user_input/MudPuppyRebrand/mudpuppy.md`: "change the name from pathfinder-ai to mudpuppy … All
references to old one need to change as well"); owner answers 2026-10-22: rename **everything**,
the `PATHFINDER_*` env vars and the MCP server names (`pathfinder`, `pathfinder-ba`) included; a
one-off scripted rename is allowed for this item only; history docs stay as written.

## Problem

R-23 (2026-10-04) renamed the brand only: the product, the dashboard and the READMEs say MudPuppy,
and the GitHub origin is `DawidGaleziewski/MudPuppy-AI`. The code kept the old name: packages
`@pathfinder/*`, the Python packages `pathfinder_dashboard` and `pathfinder_miner`, commands
(`pathfinder-dashboard`, `pathfinder-glossary`, …), env vars `PATHFINDER_*`, the MCP servers
`pathfinder`, `pathfinder-ba` and `pathfinder-chat` (tools `mcp__pathfinder__*`), the crawler's
user agent `PathfinderAI-Crawler`, the self-scan portal `pathfinder-dashboard`, class names
(`PathfinderDb`), the key folder `~/.config/pathfinder` and the docs that name them.

## Scope

**In:** every tracked file outside the history folders: code, tests, fixtures, package manifests and
the lockfile, `.mcp.json`, `.claude/` agents, skills and hooks, `CLAUDE.md` files, the constitution,
`docs/` (glossary, wiki, guides), `learning/`, `README.md`, `roadmap.md`, `THIRD_PARTY_NOTICES.md`,
`.idea/`; paths with the old name (`git mv`); the trace boot table's `server` value (a migration,
db-admin, G-16); this machine's setup (key folder, local MCP allow-list, virtualenvs).

**Kept as written (history, owner 2026-10-22):** `specs/` (except this spec), `session_dump/`, the
past entries of `CHANGELOG.md`, `user_input/`, applied migrations `data/migrations/0001…0047`
(they ran; 0048 changes the data). Local machine paths that name the checkout folder
(`~/.claude/projects/-home-dawid-projects-pathfinder-ai/…`, in `learning/`) stay until the owner
renames the folder.

**Logo and favicon:** the rust logo and favicon set (`mudpuppy-final-web-assets.zip`) shipped with
R-23 and were replaced on purpose by the Salvage Yard redesign (R-43, spec 022: tag-icon favicon,
live paint-block wordmark, no mark in the header). The current design package (2026-10-22) keeps
that, so the dashboard keeps it; only the README's logo, which still points at the removed
`static/brand/` file, is fixed (the design's grid-path mark).

## Requirements

- FR-001: no tracked file in scope contains "pathfinder" in any case (git grep check), apart from the
  local machine paths named above.
- FR-002: names map one to one: `@pathfinder/x` → `@mudpuppy/x`, `pathfinder_x` → `mudpuppy_x`,
  `pathfinder-x` → `mudpuppy-x`, `PATHFINDER_X` → `MUDPUPPY_X`, `PathfinderDb` → `MudPuppyDb`,
  `Pathfinder` / `Pathfinder AI` / `PathfinderAI` → `MudPuppy`, `PathfinderAI-Crawler` →
  `MudPuppy-Crawler`, `pathfinder-ai` → `mudpuppy`.
- FR-003: a store opened after migration 0048 records trace boots as server `mudpuppy`; older rows
  are rewritten.
- FR-004: every suite of the close-out passes after the rename.

## Success

The close-out suites pass, the dashboard and the chat service start under the new names, and the
crawler subagent reaches its tools as `mcp__mudpuppy__*` after a restart.
