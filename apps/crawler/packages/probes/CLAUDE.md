# @pathfinder/probes

The form probe catalogue (spec 032, R-69 (2)): repeatable tries per control beyond the happy path,
defined once and tested in the style of the fix plugins, and the deterministic outcome classifier.
Pure: no browser, no DB, no LLM.

Layer: features (G-07; `apps/crawler/layers.json`). Depends on core only.

## Public API

- `defineProbe`, `Probe`, `ProbeField` (the form reader's field shape), `ProbeContext` (fields +
  happy-path values), `ProbeTry` (writes on top of the happy values, optional `fault`).
- `PROBES` (priority order), `planTries(ctx, { limit, only?, noTechnical? })` → tries within the
  budget, shared round-robin, plus the skipped keys; `unknownProbes(only)`.
- `classifyOutcome(facts)` → `next` | `branch` | `validation` | `technical` | `temporary` |
  `blocked`, with `accepted` and `possibleNewProcess` (plan decision 7).
- Used by mcp-server (`runtime/pipeline/probe.ts`, `services/probe-form.ts`).

## Probes

- validation: `required-empty-all`, `required-empty-one`, `wrong-format`, `boundary`,
  `optional-empty`
- branch: `option` (radio groups, selects (first 6 other options), optional checkboxes)
- technical: `http-500`, `block-request`, `delay`, `offline` (simulated in the crawler's browser;
  owner answer O-M1: wherever the action limit allows the submit)

## Invariants

- No client data in a probe: fields, labels and values come from the page and the persona.
- A try changes only what it is about; every other field keeps its happy-path value.
- Classification is a pure function of the facts; the same facts give the same kind.

## Where to add things

- New probe: `src/catalogue/<group>.ts` with `defineProbe`, listed in `PROBES` (`src/registry.ts`)
  at its priority, a unit test here, a scar case in `apps/scar-maker` and its gate.

## Tests

- `pnpm exec vitest run --project probes`; tier: fast. Browser behaviour is in the SC-19 gates.

## See also

- specs/032-form-states-probes (plan decisions 2, 3, 7, 8), design `11-map-runs.md` §3
