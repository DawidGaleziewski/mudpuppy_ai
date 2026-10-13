# Research: spec 021

## R1 What "no limit" is

- **Decision**: an omitted `max_action_class` means the most dangerous class,
  `external-side-effect`, so `minSafetyClass(portal, persona)` lets the persona's limit win.
- **Rationale**: keeps one ceiling computation; a persona or environment can still lower it.
  The chat service already writes `external-side-effect` for new portals (`apps/chat/src/portals.ts`).
- **Alternatives**: a nullable ceiling ("unlimited") through the gate — more branches for the same
  result.

## R2 The production-address check

- **Decision**: delete `looksLikeProduction` and the check; `assertRunAllowed` keeps only the
  ceiling computation, and `EnvGuardError` goes because nothing throws it any more.
  `ENV_GUARD_REFUSED` also goes from the preflight refusal codes and `errors.ts` once no path
  returns it (the placeholder User-Agent was the other one).
- **Alternatives**: keep the check as a warning — the user asked for removal.

## R3 Rate limit and User-Agent

- **Decision**: drop the production refinement in `portal-schema.ts` and the placeholder check in
  `preflight.ts`. A portal without `rate_limit` keeps the existing gentle default in
  `crawler/src/session.ts` on every environment.

## R4 CAPTCHA and blocks

- **Decision**: CAPTCHA is always handed to a human. `captchaHandoff` in the request gate becomes
  the only behaviour (the option is removed); `handoffIfCaptcha` loses its production branch and
  the `onProductionStop` parameter. Block signatures that are not CAPTCHAs keep their current
  handling (that is not production-specific).
- **Note**: the constitution keeps "CAPTCHAs are never solved by automation".

## R5 Playwright traces

- **Decision**: traces are recorded on every environment. `pwTraceEnabled` and the
  `PATHFINDER_PW_TRACE` switch go; new runs boot with mode `all`. `PwTraceMode` keeps
  `non_production` as a readable value for runs recorded before this change (trace import,
  dashboard display).
- **Alternatives**: a new `off` switch for disk space — not asked for; can come later.

## R6 Portals that relied on the default

- **Decision**: `liveinsurer`, `marketsite` and `reference-insurer-readonly` get
  `max_action_class: read` with a comment ("explicit since spec 021: the default is now no
  limit"). reference-insurer-readonly keeps `environment: production` as a label; its trace
  boundary now comes from the explicit `read`.

## R7 Constitution and product rule

- **Decision**: 4.0.0 → 5.0.0 (MAJOR, a NON-NEGOTIABLE principle redefined). New Principle V text:
  every environment equal; the action limit optional and BA-set; classification and enforcement in
  code; CAPTCHA hand-off to a human, never automated solving; robots default and `robots: ignore`
  unchanged. The testing section's "production targets are read-only" goes. The product rule is
  added under Principle I or a short "Product rule" line: Pathfinder records the as-is; people
  draw the to-be in it; the assistant only proposes and changes nothing until a person applies it.

## R8 Docs and specs

- **Decision**: `docs/portal-config.md`, glossary entries that mention production read-only, and
  spec 001 FR-011, spec 002 FR-005/FR-006/FR-018/FR-026, spec 009 FR-022, spec 011 phase 2 get a
  "superseded by spec 021" note (history is not rewritten). Code comments citing these rules are
  reworded. The BA fixture texts ("not observable on production", "Dalej is mutating on
  production") say "at the portal's limit".
