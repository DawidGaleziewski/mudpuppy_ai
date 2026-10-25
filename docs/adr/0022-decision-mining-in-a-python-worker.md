# ADR-0022: Decision mining and community detection in a Python worker (`apps/miner`)

- **Status:** Accepted
- **Date:** 2026-10-18 (spec 039 D-6)

## Context

The 2.0 portal model ([ADR-0021](0021-mudpuppy-2-reconciled-portal-model.md)) mines decision rules
("inputs → which screen comes next") from recorded scans, and proposes processes by community
detection on the screen graph. The libraries for this (decision trees, Leiden) are mature in
Python; the constitution forbids Python from writing the store except through the TypeScript
schemas.

## Decision

- A Python app, `apps/miner` (uv, Python ≥ 3.12, scikit-learn, igraph, leidenalg), is the
  analysis worker. It is never on the crawler's runtime path.
- It opens the store read-only (`mode=ro`) and prints JSON: `rules` (decision trees per decision
  point, written as DMN tables), `communities` (Leiden, for process proposals) and `classify`
  (the similarity classifier).
- The crawler app's TypeScript commands `model:mine`, `model:propose` and `model:classify` run it,
  validate its JSON with Zod and write the result. Boundary tests of mined rules run on the
  headless driver (`model:replay`, `model:regress`); `model:rules-export` writes DMN, Markdown and
  CSV.
- Constitution 6.0.0 added the rule: a Python analysis worker MAY compute from a read-only store
  connection; its output is written only through a TypeScript command that validates it with Zod.

## Consequences

- Good: mature mining libraries without weakening the single write path.
- Bad: the analysis path needs a working Python and uv install; the reconciler reports "miner not
  run" when Python is unavailable (design § 11.2).

## Alternatives considered

- The Python worker writing hypotheses itself (the source design): rejected, Python writes only
  through the TypeScript schemas (C-7).
- Leiden in TypeScript: no solid implementation (D-6).

## Sources

- `specs/039-mudpuppy-2-portal-model/spec.md` D-6, `design.md` § 2 (C-7), § 11
- `apps/miner/CLAUDE.md`
- `.specify/memory/constitution.md` Technical Constraints ▸ Python tooling (6.0.0)
- `README.md` (MudPuppy 2.0: Rules, Processes)
