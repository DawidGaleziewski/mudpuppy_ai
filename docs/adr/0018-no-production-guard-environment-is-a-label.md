# ADR-0018: No production guard: the environment is a label

- **Status:** Accepted
- **Date:** 2026-10-13 (constitution 5.0.0; spec 021, R-42)
- **Supersedes:** [ADR-0004](0004-production-is-read-only-behind-a-compliance-gate.md),
  [ADR-0011](0011-forms-filled-with-test-data-only-off-production.md)

## Context

BAs document sites they work on and migrate, often reachable only as production. The production
guard was loosened twice on 2026-10-06: constitution 3.0.0 made the robots/terms check the BA's
choice per portal (`robots: ignore`), and 4.0.0 let production fill, submit and log in up to a
BA-set limit, removed the compliance gate and allowed several environments per portal ("If i say
production should be scanned let it be production", "One portal, many envs"). Still left: a
production-address check, a required rate limit and identifiable User-Agent, a stop on a CAPTCHA
on production and no Playwright traces on production. The owner, 2026-10-13: "I don't care about
production guard. We should not have it at all to begin with. REMOVE IT."

## Decision

Constitution 5.0.0 (MAJOR) rewrote Principle V:

- Every environment (production, staging, sandbox) is treated the same; `environment` labels the
  runs and changes no behaviour.
- The action limit (`max_action_class`) is optional and set by the BA per portal, environment or
  persona; omitted means no limit. A set limit is enforced in code (lowest wins). Classification
  stays in code ([ADR-0003](0003-action-safety-classified-and-enforced-in-code.md)).
- Map and trace runs MAY fill and submit forms on any environment; that choice and its
  consequences on a live site are the BA's.
- A CAPTCHA is never solved by automation: it is handed to a human (decision note and open
  question) and the crawl goes on elsewhere. Any other block is a run-level warning and the run
  stops.
- `robots.txt` is obeyed by default; `robots: ignore` per portal stays the BA's choice.
- Playwright traces are recorded on every environment.
- **Product rule** (added in the same version): MudPuppy records the as-is; people draw the to-be
  in it; the assistant only proposes and changes nothing until a person applies it. Recorded
  evidence is never edited to look like the to-be.
- MudPuppy's own automated tests and gates still target the demo app, the proving ground or a
  local reference portal.

## Consequences

- Good: a BA can document a production-only portal, logged in and through its forms.
- Bad: how far a crawl changes a live site is now the BA's responsibility; nothing in code stops a
  scan on production without a limit.
- Bad: portals that relied on the old read-only default had to say `max_action_class: read`
  explicitly. Older specs keep their text with a "superseded by spec 021" note, and the top-level
  `README.md` still describes the removed guard.

## Alternatives considered

- Keep the production-address check as a warning: rejected, the user asked for removal.
- A nullable ceiling ("unlimited") through the gate: rejected; an omitted limit means the most
  dangerous class, so one ceiling computation remains.

## Sources

- `.specify/memory/constitution.md` Principle V, Product rule; Sync Impact Report 3.0.0, 4.0.0,
  5.0.0
- `specs/021-remove-production-guard/spec.md`, `research.md` R1–R8
- `specs/011-portal-onboarding/spec.md` Phase 2 (2026-10-06 decisions)
- `CHANGELOG.md` (Changed: R-42 no production guard)
