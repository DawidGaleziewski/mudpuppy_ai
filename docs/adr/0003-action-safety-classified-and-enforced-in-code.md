# ADR-0003: Action safety is classified and enforced in code, outside the agent

- **Status:** Accepted
- **Date:** 2026-09-20 (spec 001; constitution 1.1.0)

## Context

The crawler clicks, fills and submits on real portals. Whether an action may change data must be
decided by something a prompt cannot talk out of it: Principle V requires the check to run outside
the agent's control. Which actions are allowed has changed over time (see
[ADR-0004](0004-production-is-read-only-behind-a-compliance-gate.md) and
[ADR-0018](0018-no-production-guard-environment-is-a-label.md)); the classification itself has not.

## Decision

- Every action is classified `read`, `mutating`, `destructive` or `external-side-effect` by a
  pure rules engine in the `safety` package. It scores role, label keywords (delete, pay, send,
  logout, buy, contact, show phone …), the HTTP method of any triggered request and form semantics,
  and returns the most dangerous class across signals. A conflict or an unknown case is unsafe.
- The server re-derives the class before executing, so an agent that calls a button "read" gains
  nothing. The class is recorded on every transition.
- Denylist entries and keywords are data the classifier consults. Spec 002 made the rules
  portal-agnostic: generic rule ids, per-portal action rules and extra-language keywords that can
  only add or raise, never lower.
- A limit (`max_action_class`) may be set per portal, environment or persona; the lowest one
  wins, and a persona can only restrict, never widen. Actions above the limit are never executed.
- Scope (allowed domains), the denylist and `robots.txt` (obeyed by default) are checked for
  browser-initiated navigations too.

## Consequences

- Good: a new portal needs only YAML, no code change (spec 002 success criterion).
- Good: the classifier is a pure function, unit-tested against fixtures (Principle VII).
- Bad: classification works from labels and requests, so a portal in another language needs its
  own keywords, and ambiguous actions are refused rather than tried.

## Alternatives considered

- LLM-judged safety per action: rejected outright; Principle V requires the check to survive a
  prompt telling the agent to ignore it.

## Sources

- `specs/001-crawler-map-mode/research.md` §4 (Action safety classification)
- `specs/002-portal-agnostic-safety/spec.md` (input), `research.md` §6–§7
- `.specify/memory/constitution.md` Principle V; Technical Constraints ▸ Portals and personas
- `README.md` (Safety model: classification, scope and denylist)
- `CHANGELOG.md`: R-06 safety (classifier, scope/denylist, block detector, rate limiter, gates)
