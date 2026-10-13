# Feature Specification: Crawler Map Mode

**Feature Branch**: `001-crawler-map-mode`

**Created**: 2026-09-20

**Status**: Draft

**Input**: User description: "Crawler MVP: a single LLM + browser-automation agent in `map` mode that maps the capabilities, routes, URLs, navigation structure, forms and observed API calls of https://marketsite.example/ as an anonymous guest persona. Read-only only, because the portal is a live production site. Records facts for later BA and QA use; never interprets intent, verifies, or writes tests. Includes portal and persona configuration formats."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Map a portal as a guest (Priority: P1)

A BA points the crawler at a configured portal and a guest persona and asks it to map what the
portal offers: its routes, navigation structure, capabilities, forms and the API calls the
pages make. The crawler explores as a non-logged-in visitor, only performing actions that
cannot change anything on the portal, and produces a recorded map plus a report of what it
deliberately did not do.

**Why this priority**: This is the core value of the tool. Without a recorded map of what
exists there is nothing for the BA to document or for QA to test.

**Independent Test**: Run one `map` run for the guest persona on a configured portal (example:
`liveinsurer`; `marketsite` is on hold for legal reasons — see Assumptions) within its budget.
Verify that a map of states, transitions, forms and observed API calls exists, that every
record cites evidence, and that no non-read-only action was executed.

**Acceptance Scenarios**:

1. **Given** a valid portal config and guest persona, **When** the BA starts a `map` run,
   **Then** the crawler explores within its budget and stores states, transitions between them,
   forms (fields and constraints, not submitted), observed API calls, and open questions.
2. **Given** a completed run, **When** the BA opens the results, **Then** every recorded state,
   transition and API call links to evidence (page structure snapshot, screenshot or network
   record) and carries a confidence label of observed, inferred or needs-confirmation.
3. **Given** a completed run, **When** the BA opens the frontier report, **Then** it lists every
   action the crawler skipped and why (not read-only, out of scope, denylisted, budget reached,
   unreachable).
4. **Given** the crawler meets a page that could be an unwanted duplicate of one already
   recorded (for example a listing page with different items), **When** it records the page,
   **Then** the page is grouped with the existing state rather than creating a new state.

---

### User Story 2 - Guarantee that production is only read (Priority: P1)

A BA or maintainer needs confidence that a run against a live site cannot alter the site's
data, overload it, or evade its protections, regardless of what the agent decides to do.

**Why this priority**: The target is a real marketplace. A single unsafe action or evasion
attempt is unacceptable, so this guarantee must ship together with the first crawl.

**Independent Test**: Attempt runs with a missing or non-production environment flag, then with
actions the agent is prompted to take that are mutating, denylisted or out of scope, and with a
simulated block from the portal. Verify each is refused or stopped as described.

**Acceptance Scenarios**:

1. **Given** a portal config without an explicit production flag, **When** a run is started
   against a production address, **Then** the run is refused before any page is opened.
2. **Given** a production run, **When** the crawler proposes an action classified as anything
   other than read-only, or an ambiguous one, **Then** the action is not executed, and it is
   added to the frontier report with its classification.
3. **Given** a production run, **When** the crawler proposes an action outside the allowed
   scope or on the denylist (including the disallowed listing-creation path), **Then** the
   action is not executed and the refusal is logged with the rule that caused it.
4. **Given** a production run, **When** requests are made, **Then** they stay under the
   configured rate and concurrency limits and carry an identifiable User-Agent or header.
5. **Given** the portal shows a CAPTCHA, block page or rate-limit response, **When** the
   crawler detects it, **Then** it records a run-level warning and stops the run without
   attempting to bypass it.
6. **Given** the agent instructs itself to bypass any of these guards, **When** the action is
   evaluated, **Then** the guard still applies, because the checks run outside the agent's
   control.

---

### User Story 3 - Define portals and personas as reusable configuration (Priority: P2)

A BA or maintainer describes a portal once (where to crawl) and describes each persona (who
acts) separately, composing personas from shared pieces, so new portals and personas can be
added without changing the crawler.

**Why this priority**: The MVP needs one portal and one persona, but personas must be
composable from the start so later personas and processes need no redesign.

**Independent Test**: Load a configured portal's config (example: `liveinsurer`) and its guest
persona, then load a second sample persona that extends the guest and a shared piece; verify
both resolve into valid effective configurations and that an invalid file is rejected with a
clear message.

**Acceptance Scenarios**:

1. **Given** a portal config at `portals/<portal>/portal.yaml`, **When** it is loaded, **Then**
   it provides base address, environment classification, scope, denylist and known obstacles.
2. **Given** a persona at `personas/<portal>/[<process>/]<persona>.yaml` that extends another
   persona or a shared piece from `personas/_mixins/`, **When** it is loaded, **Then** the
   result is one effective persona in which later entries override earlier ones.
3. **Given** a persona whose maximum action class is higher than the portal's, **When** the
   effective run settings are computed, **Then** the lower of the two applies, so a persona can
   only restrict what the portal allows.
4. **Given** a persona that contains a credential value inline, **When** it is loaded, **Then**
   it is rejected; credentials may be referenced only by name.
5. **Given** a file that does not match the schema or has a circular `extends`, **When** it is
   loaded, **Then** loading fails with a message naming the file and the problem.

---

### User Story 4 - Hand locators to QA (Priority: P3)

A QA engineer, later, opens the recorded map and finds for each recorded action a ranked list
of candidate ways to locate its element, so page components can be built without re-exploring.

**Why this priority**: It saves QA effort but is only consumed after mapping exists.

**Independent Test**: Pick recorded actions, including ones on elements that expose test IDs,
and verify each has ranked candidate locators with the fields listed below.

**Acceptance Scenarios**:

1. **Given** a recorded action on an element, **When** QA reads it, **Then** it lists candidate
   locators in ranked order from role and accessible name, label or text, test ID, and
   container context, plus a reference to the page structure snapshot.
2. **Given** an element that exposes a test ID, **When** the action is recorded, **Then** the
   test ID appears among the candidates.

---

### Edge Cases

- The portal is unreachable, slow, or returns server errors partway through a run.
- A cookie banner, promo popup or chat widget covers the page and would otherwise create false
  states; known obstacles must be handled before a page is recorded.
- Infinite scroll, endless pagination, calendars or faceted filters could create unlimited
  states; the crawler stops expanding after per-template and total caps and reports it.
- A "read" action has a hidden side effect on the site. For example, on MarketSite,
  opening a listing counts as a view that feeds the portal's popularity ranking, so visits to
  listing pages are capped (FR-024) and the report states how many were made. The run is still
  read-only by class.
- A page offers actions that look harmless but are binding or reveal personal data: placing a
  bid (a bid in the last 60 seconds extends an auction), "buy now", payment, messaging or
  contacting a seller, or showing a seller's phone number. These are never executed and appear
  in the frontier report.
- The portal asks for location access or for marketing and personalization consent; the guest
  persona declines both.
- Personal data (names, emails, phone numbers, tokens) appears in pages or network data and
  must not be stored unmasked.
- The run is interrupted (crash, budget, manual stop) and later resumed without repeating work.
- Two runs of the same config produce different maps because the portal content changed; runs
  record the environment details needed to compare them.
- The agent claims a business reason for a behavior; only observed facts and flagged inferences
  may be stored, and intent is stored only as an open question.
- Robots rules or the portal's terms have not been checked before the first run.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The crawler MUST offer a `map` mode that explores a configured portal as a
  configured persona and records its routes, URLs, navigation structure, capabilities, forms and
  observed API calls.
- **FR-002**: The crawler MUST record only observed facts, clearly flagged inferences
  (including a few `rule_candidates`) and open questions. It MUST NOT record business intent as
  fact, verify processes, or write tests.
- **FR-003**: Every recorded state, transition, form and API call MUST carry a confidence label
  (observed, inferred or needs-confirmation) and a reference to its evidence. Records without
  evidence MUST NOT be stored.
- **FR-004**: The system MUST classify every proposed action as read-only, mutating,
  destructive or external-side-effect, treat ambiguous actions as unsafe, and decide execution
  in code outside the agent.
- **FR-005**: A portal config MUST declare an environment. Runs against a production
  environment MUST be refused unless the config explicitly declares `environment: production`,
  and MUST then allow only read-only actions. *(Superseded by spec 021 (R-42, 2026-10-13): the
  environment is a label only; no address check, no read-only default.)*
- **FR-006**: Production runs MUST enforce a configured request rate limit and a low
  concurrency limit, and MUST send an identifiable User-Agent or header. *(Superseded by spec
  021: `rate_limit` is optional on every environment; runs without one use the default pace.)*
- **FR-007**: The system MUST enforce a scope (allowed domains and paths, external-link policy,
  maximum depth, maximum states, per-state action cap, run time and step budget) and a denylist
  (including logout, delete, payment, bidding, buy-now, messaging or contacting a seller,
  revealing a seller's contact details, and the listing-creation path disallowed by the
  portal's robots rules). Spec 002 generalized `bidding`/`buy-now` into `purchase`, messaging
  or contacting a seller into `contact_or_message`, and revealing a seller's contact details
  into `reveal_contact`; the old ids remain accepted as aliases (spec 002 FR-013).
- **FR-008**: On detecting a CAPTCHA, block page or rate-limit response, the crawler MUST record
  a run-level warning and stop, and MUST NOT attempt to circumvent it.
- **FR-009**: The system MUST identify states by a fingerprint of the route template plus the
  normalized page structure with volatile content masked, group near-identical states, and log
  every merge and split decision.
- **FR-010**: Mutating, destructive and external actions, forms to submit, states behind
  preconditions, reached caps and unreachable states MUST be listed in a frontier report with
  the reason each was skipped.
- **FR-011**: Forms MUST be recorded with their fields, types, requirements, constraints,
  options and any validation messages, without being submitted. *(Superseded in part on
  2026-10-04 by constitution 2.0.0 and `specs/008-screenshots-wireframes` FR-002: recording a
  form still never submits it, but off production map mode may fill a form with test data and
  submit it as an action. Production is unchanged.)*
- **FR-012**: The system MUST capture, per state and per action, the API calls made (method,
  URL template, status, and request and response shape), and console errors and failed
  requests, without storing personal data payloads.
- **FR-013**: For every recorded action the system MUST store ranked candidate locators (role
  and accessible name, label or text, test ID when present, container context) and a
  reference to the page structure snapshot.
- **FR-014**: Personal data MUST be masked or excluded before anything is persisted, including
  evidence files.
- **FR-015**: Portal configs MUST live at `portals/<portal>/portal.yaml` and provide base
  address, environment, scope, denylist and obstacles.
- **FR-016**: Persona files MUST live at `personas/<portal>/[<process>/]<persona>.yaml`, with
  shared pieces in `personas/_mixins/`, and MUST support composition through `extends`, where
  later entries override earlier ones.
- **FR-017**: Portal and persona files MUST be validated against a schema, MUST reference
  secrets by name only, and MUST be rejected with a clear message if invalid, circular or
  containing inline secrets.
- **FR-018**: The effective safety ceiling of a run MUST be the lower of the portal's and the
  persona's, so a persona can only restrict, never widen.
- **FR-019**: The system MUST handle known obstacles (cookie banners, popups, chat widgets)
  before recording a state.
- **FR-020**: The system MUST persist its progress so that an interrupted run can resume, and
  MUST record for each run the persona, portal, environment version or date, viewport, locale,
  browser and configuration used, so runs can be compared.
- **FR-021**: The system MUST keep a decision log of every skipped action, refused action,
  merge and split, and produce coverage figures (states, actions executed, actions skipped by
  class, API endpoints seen) per run.
- **FR-022**: The design MUST allow a later `trace` mode and additional personas without
  changing the portal, persona or record formats defined here.
- **FR-023**: The guest persona MUST decline location sharing and marketing or personalization
  consent, and this MUST be expressible in persona configuration so other personas can differ.
- **FR-024**: A run MUST cap the number of visits to individual item pages, configurable per
  portal, and MUST report the number made, because such visits can affect the portal's
  popularity ranking.
- **FR-025**: The crawler MUST NOT call the portal operator's public or private APIs directly.
  It MAY only record the calls that the portal's own pages make while being browsed.
- **FR-026**: A production run MUST be refused unless the portal config records that
  `robots.txt` and the portal's terms were checked (who and when), and MUST be refused while
  the identifiable User-Agent still contains a placeholder contact address. *(Superseded: the
  compliance dates by constitution 4.0.0, the User-Agent refusal by spec 021.)*

### Key Entities

- **Portal**: a target site; has a base address, environment classification, scope, denylist
  and known obstacles.
- **Persona**: who acts; has an authentication kind (none for guest), environment settings, a
  maximum action class, optional scope restrictions, budgets, and composition links to other
  personas or shared pieces.
- **Run**: one crawl of a portal by a persona in a mode; has configuration, environment details,
  budget, status, warnings and coverage figures.
- **State**: a distinct UI condition of the portal; has a fingerprint, route template, title,
  evidence reference and the runs and personas that saw it.
- **Transition**: an action that leads from one state to another; has its safety class, ranked
  candidate locators, observed API calls and any error.
- **Form**: fields and constraints observed in a state, never submitted.
- **API Call**: a network request observed with method, URL template, status and shape.
- **Frontier Item**: an action or state the crawler did not pursue, with the reason and any
  preconditions.
- **Open Question**: something the crawler could not determine from observation, for the BA.
- **Evidence**: page structure snapshot, screenshot or network record supporting a record.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A single `map` run on a configured portal's guest configuration (example:
  `liveinsurer`) completes within its configured budget and produces a map covering the portal's
  main navigation areas, verified by a BA against the live site.
- **SC-002**: 100% of executed actions in production runs are read-only class, verified from
  the decision log across all runs.
- **SC-003**: 100% of recorded states, transitions, forms and API calls have evidence and a
  confidence label; 0 records lack either.
- **SC-004**: 0 unmasked personal data items found in stored records and evidence in a
  sampled review of a completed run.
- **SC-005**: Two consecutive runs on unchanged content produce at least 90% the same states,
  measured by the fingerprint stability of matched states.
- **SC-006**: A run started against a production config without the explicit flag is refused
  in under 5 seconds with no page opened, in 100% of attempts.
- **SC-007**: When a block or CAPTCHA is simulated, the run stops with a warning in 100% of
  attempts and makes no further requests to the portal.
- **SC-008**: A new persona that extends the guest persona can be added by writing one file,
  with no change to the crawler, and resolves correctly on first load.
- **SC-009**: A QA engineer can find at least one ranked candidate locator for 95% of
  recorded actions without re-exploring the site.
- **SC-010**: An interrupted run resumes and completes without repeating any already recorded
  action.

## Assumptions

- The MVP targets one configured portal and one persona (a guest who browses without logging
  in); `trace` mode and other personas are out of scope for this feature. The portal was
  originally MarketSite; it is on hold for legal reasons (Regulamin MarketSite art. 10.10)
  and the current practice target is `liveinsurer` (spec 002 FR-022). The marketsite-specific
  assumptions below (robots rules, terms review) are kept as the historical record of what was
  checked for that portal and are not re-derived for `liveinsurer`; `liveinsurer`'s own compliance sign-off
  is tracked at T072.
- The portal's robots rules (fetched 2026-09-20) disallow only the listing-creation path
  (`/oferty/wystaw/*`) for generic crawlers.
- Terms review, partial: the MarketSite annex (Załącznik nr 13) was reviewed on
  2026-09-20 and contains no clause on automated access, scraping or crawling. It defers
  unregulated matters to the operator's main Regulamin, which has NOT been reviewed. The first
  production run is blocked (enforced by FR-026) until a person has reviewed the main Regulamin
  (and any API terms) and recorded the outcome in the portal config.
- The annex forbids creating listings through the operator's API (art. 3.7) and states that
  listing contact data may be public (art. 3.10); both are reflected in FR-007, FR-014 and
  FR-025.
- The portal exposes test ID attributes on many elements, which are used as one candidate
  locator kind.
- The portal's operator uses anti-bot defenses: on 2026-09-20 a plain request to the operator's
  `marketsite.example` domain (where the portal's terms and cookie policies are hosted) returned a
  403 bot-challenge page. Links to `marketsite.example` are treated as external (recorded, not
  followed). If the portal blocks the crawler the run stops and no workaround is attempted.
- Runs are executed by a maintainer or BA on a machine with network access to the portal;
  the crawler is not deployed as a service in this feature.
- Storage and evidence follow the constitution's rules; specific technology choices are made
  in planning.
- Guest browsing on a live marketplace exposes only public content, but public pages may still
  contain personal data of sellers, which is masked under FR-014.
- Downstream consumers (BA documentation, QA test generation, process verification) are out of
  scope for this feature and are only served by the recorded outputs.
