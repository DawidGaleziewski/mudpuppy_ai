# Tasks 041 (R-83: rename pathfinder to MudPuppy)

Tags per task (`model-split-per-task`). One commit per task group, ids in the message.

## Rename

- [x] T001 [haiku] Roadmap: R-83 `in progress (spec 041)`; spec and tasks
- [x] T010 [opus] The one-off rename script (scratchpad, owner 2026-10-22): `git mv` of paths with the old name, then the replacement map of FR-002 over the in-scope tracked text files; the double names it makes ("MudPuppy (MudPuppy)") fixed by hand (one, `learning/README.md`); CRLF files redone (F-01), spec 041 restored (F-03)
- [x] T011 [opus] Reinstall under the new names: `pnpm install` (lockfile), `uv sync` in `apps/dashboard` and `apps/miner`, `apps/proving-ground`; import order and formatting (eslint, prettier, ruff): eight files reformatted
- [x] T012 [opus] Migration 0048 through db-admin: `trace_boots.server` CHECK `('mudpuppy')`, older rows rewritten; schema snapshot and data-model docs; migration-version tests (F-04), the trace enum test reads the snapshot (F-05)
- [x] T013 [sonnet] README logo: the design's grid-path mark instead of the removed `static/brand/` PNG
- [x] T014 [sonnet] This machine: `~/.config/mudpuppy` (copy of the key and judge token), the local MCP allow-list; the FR-001 leftover check (only the four `learning/` transcript paths and two history notes remain)

## Close-out

- [x] T020 [opus] Close-out suites (`CLAUDE.md`): crawler `pnpm test` 2489 passed and 1 failed (F-05, fixed, its project rerun green), `test:perf` passed; chat 311, workflow 29, dashboard parallel + serial, miner, proving-ground backend: all passed; dashboard and chat start under the new names; `code-reviewer`: 1 finding, fixed (F-02's prefix as `LIKE`)
- [x] T021 [haiku] Glossary sync, CHANGELOG, roadmap, merge, tag, push, session dump
