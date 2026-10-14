# Tasks: Content that depends on access (spec 024, R-33), P1

Model tags per memory `model-split-per-task`. Commit per group with the task ids.

## Group 1 — Personas (US1)

- [x] T001 [opus] persona schema `attributes:` (scalars or lists), `extends` merge per key; run config snapshot keeps them; tests
- [x] T002 [opus] `pnpm personas:import <portal> <csv>`: persona files + vault refs per environment, idempotent, no password in files/output/DB; tests with a temp tree and a fake vault key. As built: `pnpm vault import` (the alias runs it), one environment per import (`--env`: the vault is one database per environment); the default mixin is the portal's own `personas/<portal>/_mixins/login.yaml` (portal-specific settings stay out of the shared `_mixins/`, personas/README); the CSV is checked whole before writing; a persona that does not load is put back and stops the import; keys a file added by hand survive a re-import.
- [x] T003 [sonnet] dashboard Settings personas show attributes; BA `list_runs`/run evidence show the run's persona attributes. As built: Settings resolves `attributes` through `extends` like the loader; `list_runs` returns `persona_attributes` from the run's `config_snapshot` (not the current file); `list_runs` moved to `services/ba/runs.ts` (`reads.ts` passed 400 lines)

## Group 2 — Access read model (US2)

- [x] T004 [opus] dashboard `queries_access.py`: reached, variant per persona, element seen by / not seen by, access-dependent marks (completed map runs only count for "not shown"); fixture with three personas, SC-001 shape. As built: the fixture is one JSON file (rows + `expected`) at `apps/crawler/tests/fixtures/access/three-personas.json`, read by both sides; a screen lists only its access-dependent elements plus `elements_total`
- [x] T005 [opus] BA tool `get_access_matrix` (`services/ba/access.ts`, tool registration, contract), same model, same fixture expectations; ba-practice reference note. As built: also in the chat fence's BA read tools and the orchestrator and `ba` agent tool lists; contract `contracts/get-access-matrix.md`; note in `ba-practice/references/business-rules.md` (access rules)

## Group 3 — Views (US3.2 part)

- [x] T006 [sonnet] screen page "Access" side tab; `/access` portal matrix page; tests; ui:check. As built: `web/access.py` + `views_access.py`, live fragments `/fragments/access` and `/fragments/states/{id}/access`; status vocabulary `access` (Differs / Same for all, owner to confirm the words); "Access by persona" link on Screens; ui:check passed at 1280/390 px (before two wording tweaks); both read models now load only the asked screen's actions

## Close-out

- [x] T007 [opus] findings (US2.4 revisions per persona, content vs access difference), roadmap R-33 (P1 done, rest open), changelog, code-reviewer, full suites, merge, tag, export
