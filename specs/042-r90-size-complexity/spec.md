# Spec 042: Size and complexity follow-ups of 2.0 and 2.1 (R-90, with R-80 (3) and (5))

Branch `feature/042-r90-size-complexity` · 2026-10-22 · owner 2026-10-22: "Proceed with working
on r83 and any other 2.0 tasks that are ready to go"; R-86 order: R-90 next, after R-83, with
R-80 (3) and (5).

## Problem

The 2.0 and 2.1 close-out reviews deferred the findings that need a behaviour lock before a split
(`specs/039-…/findings.md` "Close-out review" rows 5–13, `specs/040-…/findings.md` rows 3, 5–9).
R-80 (3) (stability and mutation runs on the fingerprint kernel after `FingerprintIndex.seed`) and
(5) (the long agent notes) are bundled here.

## Scope

**In (only the named findings; `dont-widen-removals`):**
- Model and store: `reconcile` (model), `clusterPartition`, `inJourney`, `model-writer.ts`
  (`loadReconcileInput`, `writeScreens`, file size), `processModelFacts`,
  `loadObservationTables`, the positional parameters of `interpretVersion`, `recordClassifier`,
  `writeProposals` (options objects), the large store files (`db-types.ts` by table family,
  `agent-hypotheses.ts`, `portal-data.ts` with `where`, `tracer.ts`).
- Docs and MCP server: `evaluate.ts`, `render/model.ts`, `testing/*`; `ba/records.ts`,
  `start-run.ts`.
- Chat hubs: `api.ts` (`route` per resource), `scan.ts`, `scan-directed.ts`,
  `amendment-revisions.ts`, `mcp-chat.ts`, `main.ts`, `portal-data`, `reconcile`.
- Dashboard: `_also_settle`, `model_call`, `range_from` parameters; a query-params dataclass per
  page for Review, Changes, Screens and Home; the C901/PLR hits in files 2.0 and 2.1 changed.
- Agent notes (G-30, about 60 lines): dashboard, chat, mcp-server, store `CLAUDE.md`.
- R-80 (3): `pnpm stability` and mutation testing on the fingerprint kernel.

**Out:** every other lint warning of the 112 in the crawler's baseline (they predate 2.0 and are
not named by a review); behaviour changes of any kind.

## Requirements

- FR-001: no behaviour change; each step is locked by existing tests or a characterisation test
  written first (G-29); the pipeline golden snapshots stay identical.
- FR-002: the named warnings are gone or recorded with a reason; the crawler's size/complexity
  warning count (112 at the start, `pnpm lint:report`) does not go up.
- FR-003: public signatures that change (options objects) update every caller, no shims (G-11).

## Success

Close-out suites green, warning count lower, each package's `CLAUDE.md` matches its layout.
