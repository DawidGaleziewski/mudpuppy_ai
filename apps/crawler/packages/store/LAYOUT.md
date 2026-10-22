# @mudpuppy/store: file map

What each module exports and why, by spec. The agent notes (`CLAUDE.md`) keep the rules;
this file keeps the map (spec 042 T050, G-30).

## Public API


- `openDb`, `dbPathFor`, `applyPragmas`, `MudPuppyDb`, `OpenedDb` (`db.ts`); `Database` and every
  `*Table` type (`db-types.ts` holds the `Database` map; the table types are one file per family:
  `db-types-crawl`, `-evidence`, `-model`, `-docs`, `-chat`, `-trace`, with the shared column
  helpers in `db-types-columns.ts`; together they mirror `data/schema/schema.sql`); `Selectable`,
  `Insertable`. The hypothesis reads `listHypotheses`, `getHypothesis`, `listDeviations` are in
  `agent-hypothesis-reads.ts`, the writes in `agent-hypotheses.ts`.
- `migrateUp`, `migrateDown`, `loadMigrations`, `appliedVersions` (`migrate.ts`; the SQL lives in
  `data/migrations/` at the repo root).
- `createDecisionLog`, `linkDecisions` (`decision-log.ts`): writes `decision_log`, mirrors to pino
  and emits a tracer `decision` event.
- `createTracer`, `emitForRun` (`tracer.ts`, state and span rows in `tracer-core.ts`), the
  span/phase/event vocabulary and `Tracer` (`tracer-types.ts`): writes `trace_spans`.
- `importAgent` (`import-agent.ts`): imports a crawler subagent transcript (`pnpm trace:import-agent`).
- `auditPii`, `compareRuns` (`audit.ts`), portal export/delete (`portal-data.ts`; the portal
  tables, delete order and `where` in `portal-tables.ts`), `secretsPlugin`.
- `planStoreReset`, `applyStoreReset`, `openHolders`, `answeringPorts` (`store-reset.ts`): the
  MudPuppy 2.0 data reset (`pnpm store:reset [--confirm]`, spec 039 T002).
- Spec 039 portal model: `reconcilePortalModel` (`model-writer.ts`; what it reads,
  `loadReconcileInput`, in `model-input.ts`), `interpretVersion`
  (`interpret-writer.ts`), `decideHypothesis`, `labelPair`, `setParameterRole` (`model-decide.ts`),
  `loadObservationTables`, `importMinedRule` (`rule-mining.ts`, `pnpm model:mine`),
  `mineRules`, `uvMiner` (`rule-miner-run.ts`: the miner on every decision point after a new
  model version; the MCP server's run end and `pnpm model:reconcile` call it when apps/miner and
  `uv` are there, `MUDPUPPY_MINER=off` turns it off; spec 040 T030),
  `plannerWork`, `writePlannerMarks`, `usePlannerMarks` (`planner-marks.ts`: the planner's work
  as `marks` of origin `planner`, kind `recheck`, with a priority; written after each rebuild and
  replay round, open ones replaced; every reader of a person's marks filters `origin = 'person'`;
  spec 040 T033),
  `processGraph`, `writeProposals` (`process-proposals.ts`, `pnpm model:propose`; it skips what
  `proposalConstraints` / `blockedBy` (`proposal-constraints.ts`) say a person dismissed or kept,
  spec 040 T034),
  `pendingReplays`, `recordReplay`, `judgeReplays` (`replay-tests.ts`, `pnpm model:replay`),
  `pendingErrorReplays`, `resolveErrorReplays` (`error-replays.ts`, rule R1 on the driver),
  `activeProfile`, `tauInForce`, `acceptedTau` (`fingerprint-profiles.ts`: one fingerprint profile
  per reconcile, the accepted τ per portal and profile, T112/T115), `acceptTau`
  (`model-calibration.ts`), `refingerprintPortal`, `compareProfiles` (`refingerprint.ts`, T113),
  `findProcessInstances`, `writeProcessInstances`, `processTraceVariants`
  (`process-instances.ts`: journeys through each process from its trigger, written on every
  reconcile; trace variants on read, T073), `explorationPlan`, `recordExploration`,
  `unexploredProcesses` (`process-exploration.ts`: the stopping rule's replays, planner priority 6,
  T075), `anchorReviewsOf` (`anchors.ts`, T074), `processModelFacts` (`process-facts.ts`: what
  the model knows of a process, for its export, T078), `classifierTrainingSet`,
  `recordClassifier`, `activeClassifier`, `acceptClassifier` (`similarity-classifier.ts`, T090;
  in force only once a person accepts it, owner answer 14),
  `decisionRules`, `ruleFiles` (`rule-export.ts`, `pnpm model:rules-export`: DMN, Markdown and
  `rules.csv`; the text in `rule-export-text.ts`), `writeGuardConflicts`
  (`rule-guards.ts`: guards along a path that cannot all hold → `ambiguous`, after
  `pnpm model:mine`, T064), `queueRegressions`,
  `recordRuleMismatches`, `pendingMismatchReplays`, `resolveRuleMismatch` (`regressions.ts`,
  decision drift by R8, `pnpm model:regress`), `pairsToLabel`, `tauCalibration`, `calibratedTau`
  (`model-calibration.ts`, the labelling queue and τ, `pnpm model:pairs`).
- `EVIDENCE_COLUMN`, `insertRef`, `insertEvidenceRef`, `addEvidenceLink` (`entity-refs.ts`, spec
  039 § 15, migrations 0040–0041): every evidence link, open question and amendment points at its
  target through an `entity_refs` row; the views `doc_evidence`, `amendments_with_target` and
  `amendment_revisions_with_target` read targets back as kind and id. Marks name their target in
  typed columns.
- Used by: mcp-server, crawler, docs, gates, vault, apps/chat, the crawler app scripts.

