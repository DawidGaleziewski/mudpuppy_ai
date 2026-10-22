# Findings 041 (R-83 rename)

Bugs and slips found while building, with test or eval ideas (`log-every-bug-for-evals`).

## F-01 The rename script turned CRLF files into LF

Python's text mode reads `\r\n` as `\n` and writes `\n`, so the three CRLF files it touched
(`CLAUDE.md`, `.idea/modules.xml`, `learning/1-evals-questions/readme.md`) showed as fully
rewritten. Redone from HEAD with `newline=""`; only the renamed lines differ now. Idea: a rename
or codemod check that a file's line endings are unchanged (`git diff --stat` matches the
replacement count).

## F-02 A tool-name prefix compared by a hardcoded length

`queries.py` matched agent tool calls with `substr(tool_name, 1, 17) = 'mcp__pathfinder__'`; after
the rename the prefix is 15 characters, so no call matched and "never reached the server" counted
0 (caught by `test_trace_summary_counts_phases_tokens_and_health`). Fixed to 15. Idea: compare with
`LIKE 'mcp\_\_mudpuppy\_\_%' ESCAPE '\'` or a length taken from the prefix itself.

## F-03 Spec 041 renamed its own old-name text

The script's scope kept `specs/041-…` in on purpose (for the new spec) and so rewrote the spec's
description of the old names; restored from its T001 commit. This spec and its findings name the
old names on purpose and are outside FR-001's check.

## F-04 Migration version tests

Adding 0048 broke 19 tests that hardcode the latest migration ('0047'); db-admin updated them.
Known pattern (each new migration does this); idea for R-90: one `LATEST_MIGRATION` constant the
tests import.

## F-05 The trace enums were checked against migration 0003 only

`trace/tests/schemas.test.ts` read the CHECK lists from `0003_trace.up.sql`, so 0048's new server
value failed it (the only failure of the close-out `pnpm test`: 2489 passed, 1 failed). It now
reads the schema snapshot, which is what later migrations left.

## Not changed (owner or machine)

- `~/.claude/settings.json` (the owner's global auto-mode notes) still names
  `DawidGaleziewski/pathfinder-ai` and `/home/dawid/projects/pathfinder-ai`; the origin has been
  `DawidGaleziewski/MudPuppy-AI` since R-23. The owner's file, not edited.
- The checkout folder `/home/dawid/projects/pathfinder-ai` keeps its name (renaming it moves
  Claude Code's project memory folder too); `learning/` names it in four transcript paths.
- `~/.config/pathfinder` stays beside the new `~/.config/mudpuppy` (a copy) until the owner
  deletes it.

## Close-out review: feature/041-r83-mudpuppy-rename (2026-10-22)

| # | File:line | Guideline | Finding | Change | Size | Outcome |
| - | --------- | --------- | ------- | ------ | ---- | ------- |
| 1 | apps/dashboard/src/mudpuppy_dashboard/queries.py:591 | G-27 | tool-name prefix matched by a hardcoded length (`substr(..., 1, 15)`), the F-02 trap; a test would only catch it by luck | `LIKE 'mcp\_\_mudpuppy\_\_%' ESCAPE '\'` | small | fixed |

Checks after fixes: ruff ✓ pytest -k trace_summary ✓ (full suites not run: a crawler run holds the ports)
Summary: 1 finding, 1 fixed, 0 deferred, 0 rejected.
