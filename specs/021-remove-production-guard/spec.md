# Spec 021: Remove the production guard; the to-be product rule (R-42)

Branch `feature/021-r42-remove-production-guard` · Created 2026-10-13 · Status: done, merged 2026-10-13 (v1.0.22). SC-001–SC-004 met

**Input**: user, 2026-10-13, on the production guard: "I don't care about production guard. We
should not have it at all to begin with. REMOVE IT." Their R-42 note (2026-10-09,
`user_input/loose_ideas/readme.md`): "Some things like p1 quality gates to not do anything on prod
are simply wrong." Scope chosen the same day: remove all four parts (read-only default, the
production-address check, stopping on CAPTCHA/block, the required rate limit and User-Agent), plus
Playwright traces made only off production; the default limit becomes "no limit", with an explicit
`read` written into the three portals that rely on today's default. The design package
(`user_input/mudpuppy-salvage-yard.zip`, open item O-1) asks to replace the product rule "As-is
only"; the user chose: "Pathfinder records the as-is; people draw the to-be in it; the assistant
only proposes."

## Problem

Pathfinder is used on sites the BA works on and migrates, and those are often only reachable as
production. Constitution 4.0.0 (2026-10-06) already stopped treating production as read-only, but
production is still handled differently in six places, and a portal that does not state its action
limit gets the most restrictive one:

- **Read-only by default.** A portal (or environment) without `max_action_class` may only read, on
  every environment. A trace run then stops at the first form submit ("Dalej") and records a
  boundary.
- **Production-address check.** A run against a public-looking address is refused unless the portal
  says `environment: production`.
- **Stopping on CAPTCHA/block.** Off production a CAPTCHA is handed to a human and the crawl goes
  on; on production the run stops.
- **Required rate limit and User-Agent.** A production portal must declare `rate_limit`, and a
  placeholder contact address in its User-Agent is refused.
- **No Playwright traces on production** unless a boot flag says so.
- **Stale rule text.** The constitution's testing section still says "Production targets are
  read-only"; Principle V still lists the production policy above.

Separately, the product has no stated rule for the to-be work the redesign adds (R-43: drawing a
target process, variants, a change spec). The design package quotes an "As-is only" rule from the
mission doc; it is not written anywhere in the repo.

## User stories

### US1 Production is just another environment — priority P1

A BA points Pathfinder at a production address and runs a map or a trace, as they would on
staging.

**Acceptance scenarios**

1. **Given** a portal whose address looks public and whose environment says `staging` (or any
   other value), **when** a run starts, **then** it is not refused for the address.
2. **Given** a production portal with no `rate_limit`, **when** its config is loaded, **then** it
   loads; a run uses the same gentle default pace as any environment without one.
3. **Given** a production portal whose User-Agent still holds the placeholder contact address,
   **when** a run starts, **then** it is not refused.
4. **Given** a production run that meets a CAPTCHA or a block, **when** the crawler sees it, **then**
   it hands the page to a human (decision note and open question) and the crawl goes on, exactly as
   on staging.
5. **Given** a production run, **when** it starts, **then** a Playwright trace is recorded as on any
   other environment.

### US2 No limit unless the BA sets one — priority P1

**Acceptance scenarios**

1. **Given** a portal or environment without `max_action_class`, **when** a run starts, **then**
   every action class is allowed (no ceiling), on every environment.
2. **Given** a portal or environment that sets `max_action_class`, **when** a run starts, **then**
   that limit applies as today, and a persona can still only lower it.
3. **Given** a trace run on a portal with an explicit `read` limit, **when** it reaches a submit,
   **then** it stops at the boundary as today (the trace-boundary gate keeps working on
   `reference-insurer-readonly`).
4. **Given** the portals liveinsurer, marketsite and reference-insurer-readonly, which relied on the
   old default, **when** the change lands, **then** each states `max_action_class: read` in its
   own file, so their runs behave as before until the user deletes that line.

### US3 The rules say what the product does — priority P2

**Acceptance scenarios**

1. **Given** the constitution, **when** it is read, **then** Principle V has no production policy
   apart from labelling: every environment is equal, the action limit is optional and set by the
   BA, CAPTCHAs are still never solved by automation (they are handed to a human), and robots.txt
   stays obeyed by default with the per-portal `robots: ignore` switch; the testing section no
   longer says production is read-only. The amendment is a MAJOR version with a sync-impact entry.
2. **Given** the constitution, **when** it is read, **then** it states the product rule: Pathfinder
   records the as-is; people draw the to-be in it; the assistant only proposes and changes nothing
   until a person applies it.
3. **Given** the specs and docs that state the removed rules (portal-config docs, the env-guard and
   preflight requirements of specs 001/002/011, the BA fixture texts about a production boundary,
   portal-file comments), **when** this lands, **then** each is marked superseded by spec 021 or
   reworded, and no code comment still describes a production-only rule.

## Edge cases

- A portal with several environments where only one sets a limit: the others have none.
- A persona that sets a lower limit on a portal without one: the persona's limit applies.
- The `PRODUCTION_REFUSED` error code is never raised today; it is removed from the error list.
- Stored runs and evidence that recorded a production boundary stay as they are; only new runs
  change.
- The BA fixture of a "production-style" trace that stops at "Dalej" keeps its stop, but it is
  described as a stop at the portal's limit, not at production.

## Requirements

- **FR-001**: The environment guard MUST NOT refuse a run because the address looks like
  production. The `environment` value stays: it labels runs, environments and stores.
- **FR-002**: A portal or environment without `max_action_class` MUST have no action ceiling. An
  explicit portal, environment or persona limit MUST still apply (the lowest one wins).
- **FR-003**: Config loading MUST NOT require `rate_limit` on production, and the run preflight
  MUST NOT refuse a placeholder User-Agent. Runs without a rate limit use the existing default pace.
- **FR-004**: A CAPTCHA or block MUST be handed to a human on every environment; no environment
  stops the run for it.
- **FR-005**: Playwright traces MUST be recorded on every environment by default. The setting that
  limits them to non-production is removed; the stored mode value that older traces carry still
  reads.
- **FR-006**: The `PRODUCTION_REFUSED` error code MUST be removed.
- **FR-007**: liveinsurer, marketsite and reference-insurer-readonly MUST state
  `max_action_class: read` explicitly, with a comment that the default is now "no limit".
- **FR-008**: Constitution Principle V and the testing section MUST be amended as in US3, with a
  new MAJOR version and a sync-impact report; the to-be product rule MUST be added.
- **FR-009**: Specs, docs, the glossary and code comments that state a removed rule MUST be updated
  or marked superseded by spec 021.
- **FR-010**: Tests and gates that assert a removed rule MUST be rewritten to assert the new
  behaviour; the trace-boundary gate keeps running on an explicit `read` limit.
- **FR-011**: The export-fork export MUST carry the change (re-export after merge, per CLAUDE.md).

## Success criteria

- **SC-001**: A search of the crawler, chat and dashboard code for behaviour that depends on
  `environment === 'production'` finds none (labels, sorting and display excepted).
- **SC-002**: A run against a production-labelled portal without `max_action_class` submits a form
  in a test, and the same run on staging behaves identically.
- **SC-003**: The trace-boundary gate and every other gate pass; the fast, slow and Python suites
  are green.
- **SC-004**: liveinsurer and marketsite runs behave exactly as before (read only), through their
  explicit limit.

## Assumptions

- Action classification (read / mutating / destructive / external-side-effect) stays: it is how an
  explicit limit is enforced and is recorded on every edge.
- robots.txt handling, scope, denylists and the PII scrubber are not part of the production guard
  and do not change.
- The dashboard's environment lists and "production first" sorting are labels and stay.
- Out of scope: crawler hooks (R-53), the redesign and its to-be features (R-43), access-dependent
  content (R-33).
