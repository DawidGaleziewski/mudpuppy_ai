# Session dump 2026-10-19: MudPuppy 2.0 overnight (spec 039, R-81)

Branch `feature/039-r81-mudpuppy-2-portal-model` (main checkout). Not merged, not pushed. The owner
went to sleep with: "Proceed. Try to do as much regarding 2.0 as possible. Any questions push them
to the end." Questions are at the bottom, in the order they unblock work.

## Done (committed)

| Milestone | What | Commit |
|---|---|---|
| Docs | spec, design (adapted to the codebase), plan, tasks T001–T104, UX requirements, roadmap R-81 (R-79 decided) | 50e65f9 |
| M0 | `store:reset` script, `@pathfinder/model`, `apps/miner`, scenario switchboard registry | b76dffa |
| M0 | data reset: 21 MCP server processes of both Claude sessions stopped by PID, store, evidence, traces deleted (1.2 GB), v1 eval trials and baselines in `history/v1/` | 23579b8 |
| M0 | constitution 6.0.0 (three layers, derived facts, crawler hypotheses and headless driver, Python through `model:import`) | f5c83b6 |
| M1 | fingerprint v2 pure part (row-like repeated siblings), components, element keys | 40f4614 |
| M1 | build signatures, schema hash, step results, attribute snapshots, shown values (pure) | d76cc4a |
| M1 | migration 0029 capture | 851dcbc |
| M1 + M2 | capture wired into the pipeline (`model_capture` step, journeys, visits and transitions with step results, builds, attribute writes, state components, element keys on actions); migration 0030 portal model; reconciler (`@pathfinder/model` `reconcile` + store `model-writer`), `pnpm model:reconcile`, reconcile after every `finish_run`; Map reads the model; pure M3–M5 parts; miner `rules` and `communities` | f7e5597 |

## Done since (see the latest commit for the rest)

- M3: migration 0031 interpretation (deviations, hypotheses with evidence, tests and events,
  `entity_refs`), interpretation after every reconcile (R2, R6, R7 decide from the store), `pnpm
  model:decide` (confirm, reject, overturn, pair labels, parameter roles), the **What changed**
  page, glossary entries for the portal model, the **Deployment scenario** end to end (cb742f6).
- M4: observation tables, `pnpm model:mine` (miner → Zod import as `decision_rule` hypotheses with
  boundary tests) (8a5ad8a).
- M5: process proposals: weighted screen graph (correlation ids, mounts, API families, forms,
  links), Leiden, `pnpm model:propose` writes open grouping suggestions for the Processes page
  (a28bc7a).
- T021: the **headless driver**: replay runs (`start_run replay`), `replay-driver.ts`, `pnpm
  model:replay` runs the boundary tests and moves the rule to supported / refuted; a real-browser
  test on the reference portal's driver form (age 18). Bug F-21 found and fixed on the way:
  map-mode inputs never reached decision mining (f3d30ec).
- Rule R1 on the driver: a step that ended in an error is replayed twice, then `flaky` (derived) or
  `deterministic_error` (a person); the **deterministic-error** scenario built and checked end to
  end (F-22, d8ec4a7).
- Rule R6 scenarios **removed-link** and **renamed-button** built and checked end to end; bug F-23
  fixed on the way (R6 looked only at the version an action went missing in, so both derived
  answers fell to "a person decides") (85380a5).
- Bug F-24 fixed: a button first seen and later pressed counted as a new action (one element, two
  classes); a rename's new button is explained by the same `replaces` fact (a87b2c9).
- `pnpm model:dmn`: confirmed and supported decision rules as DMN 1.3 files plus a README index
  with each rule's boundary-test verdicts (88f2552).
- Dashboard ▸ What changed: a functional **Decision rules** section (status, passed / failed /
  inconclusive / not run, fit); a rename's new button now counts as explained. Not screenshot-
  checked (`ui:check` needs a running dashboard with a model; the page is the designer's to redo)
  (259d3cd). Glossary: headless driver, decision rule, boundary test, proposed process (8528c7f).
- **Decision drift (R8)** and the **rule-drift** scenario: a release on a confirmed rule's screen
  queues its regression suite (`pnpm model:regress` queues all); a failed test is a rule
  mismatch, R8 replays it once, reproduced → decision drift (derived), the rule is superseded
  (F-25, 4e01a22). Moved link scenario (f6dbfae).
- **Repeated rows** and **numbered sections** scenarios, and two fingerprint fixes they found:
  a form whose fields each sit in a paragraph collapsed into one field (F-26: the Deployment test
  would have missed a text field added next to another), and form field names are now part of
  the structure, so `/sekcja/1`…`6` are six screens with an identity parameter (F-27). **Owner
  check:** F-26/F-27 change fingerprints and structure hashes of every page with a form (57c6a1a).
- how-to-use: a 2.0 subsection (What changed, decision rules, the model commands) (a795683).
- τ calibration (T037): `pnpm model:pairs` shows the pairs worth labelling and the calibration;
  with 30 labels on each side the reconciler uses the calibrated τ (F-28).

## How to look at it in the morning

1. `cd apps/crawler && pnpm exec vitest run --project mcp-server tests/model-deployment.e2e.test.ts`
   — two scans of the reference portal around a release; read the asserts (one vehicle screen,
   both changes explained by R2).
2. Run a map scan on the sandbox as usual, then `pnpm model:reconcile <portal> --env sandbox` (it
   also runs after every scan) and open the dashboard: Scans ▸ Map shows the model's screens,
   Review section ▸ `/changes` shows what changed.
3. `cd apps/crawler && pnpm exec vitest run --project mcp-server tests/replay-driver.e2e.test.ts`
   — the rule loop with no LLM: replays make a decision point, a rule "under 18" is tested at 17,
   18 and 19 headless and ends `supported`.
4. `specs/039-mudpuppy-2-portal-model/findings.md` F-01–F-28: every place the build differs from
   the design, with why.

## Not built yet (in order)

- Driver follow-ups: prefix cache and checkpoint starts; replays for R4 and R5 (those deviations
  still wait as "waiting for a check"); the weekly regression schedule; the stopping rule.
- M4 rest: boundary tests as probe suites for owner review, the reconciler calling the miner,
  re-mining after a drift, DMN inside the process export.
- M5 rest: triggers and outcomes on proposals, human edits as constraints, one process concept,
  anchors on `entity_refs`, explorations; BA guidance waits for the R-77 review.
- Scenarios not built: persona variant (the reference portal has no working login), A/B test,
  flaky page, overlapping rule, not visited (built: deployment, deterministic error, removed link,
  moved link, renamed button, rule drift, repeated rows, numbered sections; threshold rule is the
  base portal). They run as e2e tests, not yet as gates.
- The UX designer's pages (T100).

## Questions for the owner

1. **Constitution 6.0.0** (`.specify/memory/constitution.md`): applied, taking "design.md all seems
   fine" as approval of design § 18. Please confirm or change the wording.
2. **F-06 table names**: `edges` = transitions and `page_visits` = observations kept their names
   (about 250 places name them; renaming changes no behaviour). Rename before 2.0 merges, or keep
   and say so in the glossary?
3. **F-02 fingerprint v2**: only row-like repeats collapse (list items, table rows, cards); a form's
   fields and menu links never do. Every reference-portal screen got a new fingerprint (each page
   has a menu list); the 19 screens are still told apart. OK?
4. **R-77 review**: M5's BA guidance (`ba-practice`) and dropping `reconciliations` /
   `rule_candidates` wait for it.
5. **UX designer**: `ux-requirements.md` is ready to send; the What changed page is a functional
   stand-in.
6. **F-20 run name**: the headless driver's runs are "replay runs" (`start_run replay`), because
   "probe run" already means spec 032's marked-step probing. Keep that, or rename spec 032's runs
   and use `mode = 'probe'` as the design says?
7. **F-28 calibrated τ**: once 30 labels on each side exist, the reconciler switches to the
   calibrated τ by itself. Keep it automatic, or show it and let a person accept it?
8. **F-26/F-27 fingerprint changes**: forms whose fields each sit in a paragraph no longer
   collapse, and field names are part of the structure. Five reference-portal screens got new
   fingerprints (snapshots updated on purpose). OK?
