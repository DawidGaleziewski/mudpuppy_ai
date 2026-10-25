# ADR-0004: Production is read-only, behind a compliance gate

- **Status:** Superseded by [ADR-0018](0018-no-production-guard-environment-is-a-label.md)
- **Date:** 2026-09-20 (constitution 1.1.0)

## Context

The first target was a live production site crawled as an anonymous guest. Spec 001's input was
"Read-only only, because the portal is a live production site". The constitution's rationale:
"read-only crawling of a live site is acceptable only when it cannot change the site's data and
cannot degrade or evade its protections."

## Decision

Constitution 1.1.0 added a production policy to Principle V:

- A production target MUST declare `environment: production`; without it the environment guard
  refuses to run against a production-looking address.
- On production the guard allows only `read` actions, enforced in code. Mutating and destructive
  actions run only against sandbox or staging.
- A production run uses a conservative rate limit, low concurrency and an identifiable User-Agent.
- `robots.txt` and the site's terms are checked before the first run (the compliance gate:
  `compliance.robots_checked_on`, `terms_reviewed_on`, `terms_reviewed_by` filled by a person).
- Anti-bot or CAPTCHA defences are never worked around; a block is a run-level warning and the
  run stops.

## Consequences

- Good: a crawl could not change a live site's data.
- Bad: the guard got in the way of the BA's real work. "document wikipedia" was refused because a
  public address "looks like production" while the portal declared sandbox (spec 011 phase 2).
  The `login` tool was refused on production (spec 009 research §5), so pages behind a login on
  production could not be read.
- It was taken apart in steps: constitution 3.0.0 (2026-10-06) made the robots/terms check the
  BA's choice per portal (`robots: ignore`); 4.0.0 (2026-10-06) let production fill, submit and log
  in up to a BA-set limit and removed the compliance gate; 5.0.0 (2026-10-13, ADR-0018) removed the
  rest.

## Alternatives considered

None recorded in the sources.

## Sources

- `.specify/memory/constitution.md` 1.1.0 (git `ef61ec91`, Principle V "Production policy"); Sync
  Impact Report entries for 3.0.0, 4.0.0 and 5.0.0
- `specs/001-crawler-map-mode/spec.md` (input, FR-011, FR-026)
- `specs/002-portal-agnostic-safety/spec.md` FR-023 (compliance gate)
- `specs/011-portal-onboarding/spec.md` (Phase 2: environments per portal)
- `specs/009-legacy-proving-ground/research.md` §5 (Production)
