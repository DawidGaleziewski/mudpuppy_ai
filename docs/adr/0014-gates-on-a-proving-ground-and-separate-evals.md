# ADR-0014: Deterministic gates on a local proving ground; paid evals kept apart, in Anthropic's terminology

- **Status:** Accepted
- **Date:** 2026-10-05 (spec 009, R-25/R-27); terminology and YAML ground truth 2026-10-10 (G-33,
  G-34)

## Context

The crawler is a non-deterministic agent ([ADR-0002](0002-crawler-is-one-llm-agent-behind-an-mcp-server.md))
and real legacy portals are full of obstacles (micro-frontends, frames, CAPTCHAs, session
expiry). Exact-output tests cannot judge an agent, and live sites cannot be the test bed for
MudPuppy's own automated tests.

## Decision

- MudPuppy's own automated tests and gates target a demo app, the proving ground or a local
  reference portal (constitution, Development Workflow).
- `apps/proving-ground` is a fictional legacy estate (Django backend, a React shell loading
  micro-frontends at runtime, an embedded server-rendered legacy app) that reproduces the
  obstacles catalogued in `docs/legacy-obstacles.md`, with a ground truth per brand. The reference
  portal (`reference-insurer`) is a local fake insurer whose truth is written down.
- **Tier-1 gates** are deterministic Vitest cases (`@mudpuppy/gates`): one `gate()` per catalogued
  obstacle or logged finding; a known, unfixed case is a `gap()` that fails once fixed (G-17).
  They run in `pnpm test`.
- **Tier-2 evals** (`pnpm eval <portal>`) run the real agents headless with a budget cap, score
  the result against ground truth and compare with a baseline. They cost real tokens and are never
  part of `pnpm test`. Deterministic checks are tests, not evals (spec 039 D-10).
- G-33 (2026-10-10): eval code, docs and agent notes use Anthropic's eval terms (task, trial,
  evaluation suite, grader, transcript, outcome, evaluation harness, agent harness, reference
  solution); kept on purpose: *ground truth* and the crawler's domain terms. G-34: ground truth is
  written in YAML, one file per portal, validated by the `GroundTruth` schema. New evals follow
  the `create-eval` skill.

## Consequences

- Good: obstacle handling is checked on every full test run without tokens; agent quality is
  tracked against a baseline.
- Good: one vocabulary across the code, the owner's learning material and the agents.
- Bad: evals cost money (default cap 5 USD) and are run on purpose, not on every commit.
- Bad: the gates start the proving ground on ports 4200/4201 and scar-maker on 4400, which must be
  free.

## Alternatives considered

- Growing the safety-test mock insurer into the reference portal: rejected, it would couple a test
  fixture with a product mock (spec 004 research §15).
- A separate app for the reference portal: not needed then; a package was enough.
- Ground truth in JSON: rejected by G-34; YAML allows comments and is easier to review by hand.

## Sources

- `specs/009-legacy-proving-ground/research.md` §8, §9
- `specs/004-ba-documentation/research.md` §15, §16
- `.specify/memory/constitution.md` Development Workflow & Quality Gates
- `docs/code-guidelines.md` G-17, G-25, G-33, G-34
- `specs/039-mudpuppy-2-portal-model/spec.md` D-10
- `CHANGELOG.md` R-25/R-26/R-27 and R-46 entries; `README.md` (Proving ground, vault, gates and
  evals); `CLAUDE.md` (Verification Before Commit)
