# ADR-0010: Evidence is stored unmasked; PII scrubbing is opt-in per portal

- **Status:** Accepted
- **Date:** 2026-10-04 (constitution 2.0.0; spec 008, user decision 2026-10-04)

## Context

Spec 001 (research §9) masked PII by regex before anything was persisted and stored **no
screenshots**, because regex masking cannot redact pixels. That left the BA without pictures of
the screens it documented and without a way to point at a field. R-20 asked for screenshots on
every environment, with no masking, so records can cite and highlight screen regions.

## Decision

Constitution 2.0.0 (MAJOR) removed the PII scrubbing requirement:

- Every new state gets an unmasked full-page screenshot and a layout (element keys with boxes), on
  every environment. Traces and screenshots are stored as recorded.
- Text evidence (the stored ARIA snapshot and state title) is masked only when the portal sets
  `pii_scrub: true`. The fingerprint keeps using the masked snapshot as normalisation, so
  clusters stay stable.
- Network calls are recorded as shapes only, either way; form fields hold no values.
- Agent-authored and developer data (open questions, intents, log reasons, decision details)
  stays masked either way.
- Credentials are separate: every resolved secret is redacted before any write
  ([ADR-0013](0013-credentials-as-references-and-an-encrypted-vault.md)).
- Existing data was wiped instead of back-filled (the user said it was disposable).

## Consequences

- Good: the BA cites "screen regions"; the dashboard and the SRS export outline them on the
  screenshot; deterministic wireframes and highlight crops go into the export.
- Bad: evidence may hold personal data. `audit:pii` reports findings for every portal without
  `pii_scrub`, which is expected since 2.0.0.
- Bad: screenshots are never redacted; a portal that echoes a password in the page shows it in
  pixels (a known limit, spec 009 research §6).

## Alternatives considered

- Keep v1: mask by regex before persistence, no screenshots (spec 001 research §9).
- DOM-level masking before capture, or access-restricted storage: named in spec 001 as the
  options a screenshot decision would need.
- Mask on read: rejected in spec 001 (risks leaking PII if the step is skipped downstream).

## Sources

- `.specify/memory/constitution.md` Principle V (evidence unmasked, scrubbing optional); 2.0.0
  Sync Impact Report (git `ccd3d55e`)
- `specs/008-screenshots-wireframes/spec.md` (input, created 2026-10-04), `research.md` R9, R10
- `specs/001-crawler-map-mode/research.md` §9
- `CHANGELOG.md` R-20/R-21 entry; `README.md` (Safety model: Evidence as recorded)
