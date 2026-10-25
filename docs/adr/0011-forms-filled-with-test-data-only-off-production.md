# ADR-0011: Forms are filled with test data and submitted only off production

- **Status:** Superseded by [ADR-0018](0018-no-production-guard-environment-is-a-label.md)
- **Date:** 2026-10-04 (constitution 2.0.0; spec 008)

## Context

Map runs stopped at forms: pressing submit on an empty form only produced validation messages, so
the pages behind forms were never recorded. Map mode already pressed submits where the persona
allowed it (spec 004 finding I1). Production was read-only
([ADR-0004](0004-production-is-read-only-behind-a-compliance-gate.md)).

## Decision

- On sandbox and staging, map and trace runs MAY fill forms with test data and submit them; data
  on those targets is disposable (they no longer need resettable seed data).
- Map-mode autofill: before clicking a control that submits a form, the server fills the form's
  empty fields with `testValueFor(field)`: values from the persona's `trace_inputs` (by label) or
  from a deterministic generator. A trace event and a decision record the values.
- On production the click is refused by the environment guard and autofill never runs.

## Consequences

- Good: validation dead-ends became the states behind them (spec 008 SC-006); a fresh map of the
  reference portal reached 8 states behind submitted forms.
- Good: autofill is deterministic and costs no agent tokens.
- Later: constitution 4.0.0 (2026-10-06) let production fill and submit up to a BA-set limit;
  5.0.0 (2026-10-13) made every environment equal (ADR-0018). On 2026-10-14 the owner decided that
  a chat scan may fill and submit forms by default, with "only look" making a scan read-only.

## Alternatives considered

- Fill actions as separate frontier items: rejected, they would be lost on reach-state
  navigation.
- The agent typing every field: rejected, slower, non-deterministic and more tokens.

## Sources

- `.specify/memory/constitution.md` 2.0.0 Sync Impact Report and Principle V text (git
  `ccd3d55e`)
- `specs/008-screenshots-wireframes/research.md` R9 (Map-mode autofill)
- `CHANGELOG.md` R-20/R-21 entry; "Owner decisions of 2026-10-14"
- `specs/011-portal-onboarding/spec.md` Phase 2 (FR-010)
