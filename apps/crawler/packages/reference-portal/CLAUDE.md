# @pathfinder/reference-portal

Local Polish insurer reference portal with ground-truth manifest (spec 004 D8), used to measure the BA goal. Exports: server (start), ground-truth, `TODAY`.

Layer: servers (G-07; `apps/crawler/layers.json`)

## Public API
- `server`: start the reference portal.
- `ground-truth`: ground-truth manifest for the BA goal.
- `TODAY`: deterministic test date.
- `SCENARIOS`, `BUILT_SCENARIOS`, `parseScenarios` (`scenarios.ts`): the MudPuppy 2.0 scenario
  switchboard (spec 039 design § 19.1); `REFERENCE_SCENARIOS=a,b` or `StartOptions.scenarios`;
  `GET /__admin/scenarios` reports the active ones. Built: `deployment` (new bundle + field),
  `deterministic-error` (HTTP 500 for the model `FAILING_MODEL`, short error body),
  `removed-link`, `moved-link`, `renamed-button`, `rule-drift` (driver age 21 in the date
  field), `repeated-rows` (`/kierowcy?n=`), `numbered-sections` (`/sekcja/1`–`6`). A scenario's
  effect may change HTML, ship a build, fail GET requests (`failsUnder`) or serve a page of its own
  (`scenarioPage`; such pages are not in the ground truth).

## Invariants
- Deterministic content and dates (`TODAY`).
- Ground truth must match the pages.
- No scenario is on by default; a scenario not in `BUILT_SCENARIOS` is refused, so a gate never
  passes against an injection that does not exist.

## Where to add things
- New page or rule: `src/pages/` or `src/rules.ts`, and the matching entry in `ground-truth.yaml`
  (YAML, G-34; schema in `src/ground-truth.ts`) in the same commit.

## Tests
- `pnpm exec vitest run --project reference-portal`; tier: fast. 4 files.
- Start: `pnpm reference-portal` from apps/crawler.

## See also
- specs/004-ba-documentation
- docs/code-guidelines.md
