# Tasks 042 (R-90: size and complexity follow-ups)

Tags per task (`model-split-per-task`). One commit per task group, ids in the message. Every task:
lock, extract, then move (the `refactor-code` skill); the tier after each step.

## Model and store

- [x] T001 [haiku] Roadmap: R-90 `in progress (spec 042)`; spec and tasks
- [x] T010 [opus] model `reconcile` per phase (163 lines, complexity 31, depth 5); `clusterPartition` (20); `inJourney` (16)
- [x] T011 [opus] store `model-writer.ts`: `loadReconcileInput` (148 lines), `writeScreens` (17), file under 400
- [x] T012 [sonnet] store `processModelFacts` (20), `loadObservationTables` (98 lines)
- [x] T013 [opus] options objects: `interpretVersion`, `recordClassifier`, `writeProposals` (and its 82 lines), every caller
- [x] T014 [opus] store large files: `db-types.ts` by table family, `agent-hypotheses.ts`, `portal-data.ts` (`where`, complexity 63), `tracer.ts` (`createTracer` 450 lines)

## Docs and MCP server

- [x] T020 [opus] docs `evaluate.ts` (`evaluate`, `loadEvalInput`), `render/model.ts` (`loadExportModel` 324 lines), `testing/doc-records.ts`, `testing/fixture-store.ts`
- [x] T021 [opus] mcp-server `ba/records.ts` (591 lines, `createRecord`), `start-run.ts` (`startRunRecord` 229 lines, complexity 24)

## Chat

- [x] T030 [opus] chat `api.ts` `route` per resource; `scan.ts`, `scan-directed.ts`, `amendment-revisions.ts`, `mcp-chat.ts`, `main.ts`: the functions over the limits (`portal-data` and `reconcile` of spec 040's row 6 were store and model, done in T010 and T014)

## Dashboard

- [x] T040 [sonnet] `also_settle`, `model_call`, `changes_view` (the review's "range_from", F-02) parameters; query models for Review, Changes, Screens, Home
- [x] T041 [sonnet] C901 / PLR hits that 2.0 and 2.1 wrote (by blame); the 23 left predate 2.0 (F-03)

## Notes and kernel checks

- [x] T050 [haiku] Agent notes to about 60 lines: dashboard, chat, mcp-server, store `CLAUDE.md`, file maps in `LAYOUT.md` (R-80 (5))
- [x] T051 [sonnet] R-80 (3): `pnpm stability` (100 %) and mutation testing on the fingerprint kernel (74.7 %); findings F-06–F-08

## Close-out

- [x] T060 [opus] Close-out suites: crawler `pnpm test` 2491 passed, `test:perf` passed; chat 311 + e2e 5, workflow 29, dashboard parallel + serial, miner, proving-ground backend: all passed; `code-reviewer` (4 findings: 3 fixed, 1 rejected); lint 112 → 70; two bugs fixed on the way (F-06, F-09)
- [x] T061 [haiku] CHANGELOG, roadmap, merge, tag, push, session dump
