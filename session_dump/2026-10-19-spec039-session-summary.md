# Session summary 2026-10-18/19: MudPuppy 2.0 (spec 039, R-81)

Compressed record of the whole session. Details per step: `2026-10-19-spec039-overnight.md`;
every deviation from the design: `specs/039-mudpuppy-2-portal-model/findings.md` (F-01–F-28).

## State

- Branch `feature/039-r81-mudpuppy-2-portal-model`, last commit 602b467. Not merged, not pushed.
- Working tree clean, no stray test, Chromium or portal processes.
- Verification: fast tier green on every commit. Slow tier green at 57c6a1a (all browser e2e tests,
  170 gates, perf); after that only store, model and script code changed. Dashboard, chat,
  workflow and miner suites green.
- Memory `r81-mudpuppy-2-state.md` updated.

## How the session went

1. **Review** of `user_input/system_design/Design.md` (the reconciled portal model). Points
   discussed: fit with the architecture; "statistical machinery" means clustering, decision trees
   and Leiden on recorded evidence, not training an LLM; reliability; token cost; how often to
   rerun; manual work for the BA. Claude recommended a trimmed version.
2. **Owner decision:** the full design as one branch, version 2.0. Existing data is test data and
   can be dropped. Wanted: design docs, a roadmap item, UX designer requirements, a plan.
3. **Docs** (50e65f9): spec, design, plan (M0–M7), tasks T001–T104, `ux-requirements.md`, R-81.
4. **M0** ("yes do it", "kill all processes that get in the way"): store reset (21 MCP server
   processes stopped by PID, 1.2 GB of data deleted), `@pathfinder/model`, `apps/miner`, scenario
   switchboard, constitution 6.0.0.
5. **Overnight** ("Proceed. Try to do as much regarding 2.0 as possible. Any questions push them
   to the end."). Built:
   - **M1–M3:** capture v2; migrations 0029–0031; the reconciler after every scan; deviations and
     hypotheses with rules R2, R6 and R7; `model:decide`; the What changed page.
   - **M4:** `model:mine`; boundary tests; DMN files (`model:dmn`); a Decision rules section on
     What changed.
   - **M5 (part):** process proposals (`model:propose`, Leiden).
   - **Headless driver** (replay runs, no LLM). `model:replay` runs R1 (errors), R8 (rule drift),
     boundary tests and regression rounds; `model:regress` re-tests every confirmed rule.
   - **τ calibration and labelling queue** (`model:pairs`).
   - **Scenarios checked end to end:** deployment, deterministic error, removed link, moved link,
     renamed button, rule drift, repeated rows, numbered sections.
   - **Docs:** glossary (4 entries), a 2.0 section in `docs/how-to-use.md`.
   - **Bugs found by the scenarios and fixed:**
     - F-21: typed inputs never reached rule mining.
     - F-23: removed and renamed elements went to a person instead of being explained.
     - F-24: a button seen first and pressed later counted as a new action.
     - F-26: a form whose fields each sit in a paragraph collapsed into one field.
     - F-27: form field names are now part of the structure.

## Not built

- R4 and R5 replays; persona-variant, A/B, flaky and overlapping-rule scenarios (the reference
  portal has no working login).
- Driver prefix cache and checkpoint starts; the weekly regression schedule.
- Migration 0036 (process instances, triggers); the stopping rule; M6 classifier.
- Blocked: M5 BA guidance (owner's R-77 review), UX pages (UX designer), M7 close-out (owner's
  review first).

## Owner questions

1. Constitution 6.0.0 wording OK?
2. Rename the tables `edges` and `page_visits` to the design's names before merge, or keep them (F-06)?
3. Fingerprint v2 collapse of repeated rows OK (F-02)?
4. R-77 review: BA guidance and dropping `reconciliations` and `rule_candidates` wait for it.
5. Send `ux-requirements.md` to the UX designer?
6. Keep the name "replay run", or rename spec 032's probe runs and use `mode = 'probe'` (F-20)?
7. Switch to the calibrated τ automatically, or have a person accept it first (F-28)?
8. Accept the fingerprint changes on five form pages (F-26, F-27; snapshots updated after
   reading the diffs)?
