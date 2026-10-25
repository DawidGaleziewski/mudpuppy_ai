# ADR-0021: MudPuppy 2.0: scans are reconciled into one portal model

- **Status:** Accepted
- **Date:** 2026-10-18 (owner decision; spec 039, R-81). Merged as v2.0.0; constitution 6.0.0
  amended 2026-10-22.

## Context

Scans were stored as one append-only graph per portal, with no picture of the portal **as it is
now** (R-79: "we need to re-discuss how we store data and reconcile states"). Spec 039 lists
twelve problems, among them: edges never matched across scans; "scan B did not see it" not told
apart from "it no longer exists"; no reason recorded for why two states differ (release, persona,
error, A/B test); screen identity depending on visit order; three meanings of "process";
reconciliation only per node; polymorphic references with fragile anchors.

## Decision

- **Three layers** (constitution 6.0.0, Technical Constraints ▸ Data model): **A**, evidence, the
  mechanical UI state graph, append-only; **M**, the portal model, rebuilt by deterministic code
  from A plus recorded decisions, with stable ids and lineage; **B**, the BA's documentation.
  Interpretation (deviations, hypotheses, decision rules, process proposals) references A and M
  and never edits them. Scans are never rewritten.
- A **reconciler** (pure logic in `@mudpuppy/model`, writes in `@mudpuppy/store`) runs after
  `finish_run` and on demand (`pnpm model:reconcile <portal>`). It is idempotent,
  order-independent and rebuildable: the same evidence and decisions give the same model.
- Every difference between a run and the model is a **deviation**. **Rules R1–R8** explain them
  (errors, drift, backend, context, randomness, absence, targets, rules), mostly by replaying the
  journey prefix. A fact that follows from evidence by a published rule is a **derived fact**,
  recorded without a person's approval; it names its rule and evidence, appears in Review and can
  be overturned, and an overturn binds later reconciles (Principle VI). The list of rules is part
  of the constitution: adding one is an amendment. Everything else is a **hypothesis** or proposal
  until a person confirms it.
- **Replays are deterministic**: the headless driver re-runs them with no LLM, budgeted per run
  (D-7). The crawler emits flagged hypotheses instead of `rule_candidates`.
- "Process" becomes one concept with a trigger, member screens and outcomes; agents may save
  proposals (e.g. groupings) directly, marked as theirs.
- **Clean slate** (D-1): v1 store data was deleted; v2 migrations (0029 onward) drop obsolete
  tables with no back-fill, no dual writes and no compatibility views. The migration chain itself
  is kept (D-3).

## Consequences

- Good: the console can say what changed between releases and why, and decided items keep the
  person's reason.
- Good: reconciling costs no tokens; only changed route partitions re-cluster.
- Bad: all v1 data was lost (accepted: "all test data. We can drop it.").
- Bad: a full rebuild is O(n²) per route partition and runs offline; the schema grew by many
  tables (migrations 0029–0038 in the 2.0 work).
- Bad: the BA's guidance and tools changed with the model (hypothesis tools, process concept).

## Alternatives considered

From the owner's source design, changed while adapting (design.md § 2):
- Back-fill old rows, v1 and v2 fingerprints side by side, legacy links and compatibility views:
  dropped, all data was test data (C-1).
- `INTEGER` ids without `STRICT`: replaced by the store conventions (C-2).
- The reconciler inside the store package, called directly by the dashboard: rejected, the
  dashboard is Python and read-only (C-6).
- A new baseline migration instead of continuing the chain: rejected, it would rewrite 28
  migrations and every drift test for no gain (D-3).

## Sources

- `specs/039-mudpuppy-2-portal-model/spec.md` (Problem, Goal, D-1–D-11), `design.md` § 1, § 2,
  § 4, § 7, § 8, § 9, § 17, § 18
- `.specify/memory/constitution.md` 6.0.0 (Principles III and VI, Product rule, Data model)
- `README.md` (MudPuppy 2.0: the portal model); `CHANGELOG.md` MudPuppy 2.0 entry (v2.0.0)
- `roadmap.md` R-79, R-81
