# @mudpuppy/workbench-contract

The Workbench contract (spec 043, R-92): what the assistant may return to compose a view, and the
check that drops what fails. Designer docs: `docs/design/salvage-yard/docs/14`–`17`.

Layer: models (G-07; `apps/crawler/layers.json`)

## Public API
- `loadContract()` (`contract.ts`): the view spec, narration and command schemas, the catalogue
  (placement, paths, phase per component), the commands and the tool definitions (`tools.json`,
  the MCP tool input schemas). `CONTRACT_DIR` for other readers (the dashboard reads the same JSON).
- `createViewChecker(contract)` (`validate.ts`): layers 1–5 of doc 17 § 5.1 (layer 4 through the
  caller's `idExists`); drop, don't fail; the designer's reason codes.
- `createCommandChecker(contract)` (`command.ts`): a proposal against the full command schema.
- Used by: apps/chat (spec 043).

## Invariants
- `workbench/` is the designer's folder copied unchanged: change `workbench/tools/gen_wb_schema.py`
  and rerun it, never edit the JSON. The drift test checks both the generator's output and that the
  copy equals `docs/design/salvage-yard/workbench/`.
- Pure apart from reading its own JSON: no store, no network, no model.

## Tests
- `pnpm --dir packages/workbench-contract test` (contract tests over `workbench/examples`, drift;
  needs `python3`); tier: fast.

## See also
- specs/043-r92-workbench-genui; docs/design/salvage-yard/docs/17-genui-architecture.md
