# Spec 048: Workbench commands per environment and the header's portal list (R-94 (8))

**Branch:** `feature/048-r94-workbench-envs` · **Owner (2026-10-22):** D-6 "only environments the
owner switches on (on for local-dev and sandbox, off elsewhere)", F-18 (b) "the header shows only
portals that declare the store's environment, the others under Other environments"; "yes, now"
for the server-side parts (2026-10-22 night answers).

## Requirements

- **FR-001 D-6.** Workbench commands run only on the environments in
  `MUDPUPPY_WORKBENCH_COMMAND_ENVS` (comma list; default `local-dev,sandbox`). The chat service
  refuses a proposal (`PAUSED`, in the MCP tool) and a confirm (`PAUSED`, with the reason) on any
  other; the dashboard's card says "Workbench commands are off on <env>. Start scans in Scans."
  before anything is sent (dashboard setting `workbench_command_envs`, same default).
- **FR-002 F-18 (b).** The header's portal menu lists this store's portals first (those that
  declare the store's environment, or have runs in it, or whose file does not read), then
  "Other environments" with the configured portals that declare another one.
- **D-9 (full scan ids): deferred to R-96.** It changes the designer's contract (the generator
  `workbench/tools/gen_wb_schema.py`, the JSON copy in `packages/workbench-contract` with its
  drift test, the examples and the 40 golden prompts), which R-96 replaces with A2UI: the new
  contract should carry full ids from the start. Tell the designer with R-96.

## Validation

- [x] Chat: default and owner list (`tests/workbench-envs.test.ts`); a proposal on `production`
      refused `PAUSED` (`tests/mcp-workbench.test.ts`).
- [x] Dashboard: a confirm on a store whose environment is off shows the reason and sends nothing
      (`tests/test_wb_routes.py`); the header split (`tests/test_header_portals.py`).

## Close-out review: feature/048-r94-workbench-envs (2026-10-23)

| # | File:line | Guideline | Finding | Change | Size | Outcome |
| - | --------- | --------- | ------- | ------ | ---- | ------- |
| 1 | apps/chat/CLAUDE.md, apps/chat/LAYOUT.md:64-74 | G-30 | new file `workbench-envs.ts` and the chat service's reading of `MUDPUPPY_WORKBENCH_COMMAND_ENVS` are in neither the package notes nor the file map (the dashboard's CLAUDE.md was updated) | add `workbench-envs` to the LAYOUT.md Workbench list and the env var to CLAUDE.md | small | open: files are outside the branch's changed files, parent to apply |

Checks after fixes: typecheck ✓ lint ✓ test ✓ (apps/chat, 349 tests); ruff ✓ pytest ✓ (apps/dashboard, not perf/serial)
Summary: 1 findings, 0 fixed, 0 deferred, 0 rejected (1 open for the parent).
