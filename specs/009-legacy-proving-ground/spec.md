# Feature Specification: Legacy Proving Ground, Credential Vault, Quality Gates and Evals

**Feature Branch**: `feature/009-r25-r27-legacy-proving-ground`

**Created**: 2026-10-05

**Status**: Draft (written overnight; defaults marked "overnight default" wait for the user's review)

**Input**: User description (`user_input/more_testing_and_test_portals.md` and the 2026-10-05
conversation): "Create one more, more complex local mock for testing, using React, styled with our
current design, with harder problems we could meet in the wild like reCAPTCHA, a login page, a cart,
maybe micro-frontends, parts with bad HTML found on legacy portals. E-commerce, bank and insurer,
all three. A more complex architecture: micro-frontends, a React SPA with a Django backend,
simulated legacy software, some things from a wrapper, labels fetched from files simulating a CMS,
no accessibility, long ugly CSS classes, redirects and other things found in legacy software that
needs migrating, noted in a `legacy-obstacles.md` that grows when real projects show new ones. We
need a way to store safe passwords for test users in SQL, per environment, per portal; the user
usually provides them at the start; for now generate them for the portal's auth. After that, quality
gates so we can run traces, see that our edge cases are covered and that we don't break things
while building new ones. Also evals."

Three roadmap items share this spec: **R-25** the proving-ground portal (US1, US2), **R-26** the
credential vault and logged-in crawling (US3, US4, US5), **R-27** quality gates and evals (US6, US7).

## Context

The reference portal (`reference-insurer`, spec 004 D8) is a small, clean, server-rendered site: a
few pages, real labels, good ARIA. It proved the crawler → BA → evaluate loop, but real portals
that need migrating look nothing like it. They are built from several front-end apps glued
together, carry an old app inside an iframe, have no accessibility, name their CSS classes
`css-1q2w3e-Box`, redirect old URLs through chains, time sessions out, put a CAPTCHA in front of
login, and hold most of the interesting business behind a login that Pathfinder cannot pass today
(persona `auth` fields are `ref:NAME` references, but nothing resolves them).

Meanwhile the findings docs (spec 004 `goal-run-findings.md`, spec 008 `findings.md`) list bugs
and slips that were fixed or are open, and the user wants each of them to become a test or an eval
("paramount", 2026-10-04). There is no single command that tells whether a change broke the
crawler or the BA on the cases we already know.

This feature builds a deliberately messy local estate with three business domains, a catalogue of
legacy obstacles it reproduces (`docs/legacy-obstacles.md`), a vault so the crawler can log in
without anyone (agent included) seeing a password, and two tiers of checks: a fast deterministic
gate in the normal test run and an on-demand agent eval scored against ground truth.

## Clarifications

### Session 2026-10-05 (with the user)

- Q: How to split it on the roadmap? → A: One spec, separate roadmap items (pattern of R-20/R-21).
- Q: Business domain of the new portal? → A: All three: e-commerce shop, bank, insurer. More
  complex architecture: micro-frontends, a React single-page shell with a Django backend,
  simulated legacy software, things from a wrapper, labels from files simulating a CMS, no
  accessibility, long ugly CSS classes, redirects and anything else legacy software that needs
  migrating has; catalogued in a `legacy-obstacles.md`.
- Q: Bot checks? → A: A local fake CAPTCHA-like widget (offline, deterministic); never solved by
  Pathfinder.
- Q: Quality gates? → A: Two tiers: a deterministic gate in the normal test run (no LLM) and an
  on-demand eval running the real agents, scored against ground truth with a stored baseline.
- Test-user passwords: stored securely in the database, per environment and per portal; the user
  usually provides them; for the proving ground they are generated.

### Review session 2026-10-05 (with the user)

- Q: Gate time is ~4.6 min, over SC-006's 3 minutes? → A: Move the slow cases (LO-32 session
  expiry wait, LO-35 four fresh browsers) into a separate `pnpm test:slow` run for nightly use;
  `pnpm test` keeps the 3-minute budget. Follow-up after measuring (F-14): the real cost was the
  portal configs' politeness limit and SSE pages; the user chose to fix F-06 in the stabilizer,
  and the gate harness runs the crawler at 20 requests a second.
- Q: CAPTCHA off production? → A: Keep the hand-off. A bypass the portal owner provides
  (official test keys, a bypass header, an allowlisted crawler IP) is a roadmap note only.
  Pathfinder never solves or evades a third-party CAPTCHA.
- Q: No Playwright trace for credential runs? → A: Record the trace, but mask the password: no
  trace snapshot, screenshot or network entry may contain a resolved value (FR-019a).
- Q: The 20 known gaps? → A: A new roadmap item (crawler hardening); the user ranks the gaps on a
  rating page.
- Q: Eval budget? → A: $8 per agent; promote baselines for all four portals.
- Q: Login on production? → A: Stays refused; a roadmap note to discuss it in the constitution
  when a real logged-in target comes up.
- Vault key location and catalogue scope: overnight defaults confirmed.

### Overnight defaults (2026-10-05, user asleep; to confirm in the morning)

- Q: Which catalogue entries are in scope? → Overnight default: every `docs/legacy-obstacles.md`
  entry is in scope for R-25 except LO-36 (second factor) and LO-46 (XML endpoint), which are
  `later`. The user may re-rate the list (propose-then-rate) and move entries.
- Q: What does the crawler do when it meets the CAPTCHA widget? → Overnight default: on
  sandbox/staging it marks that state as needing a human, records a hand-off item in the run's
  worklist and keeps mapping the rest of the portal; on production it keeps today's behaviour
  (the run stops with a warning). No human-in-the-loop resume in this feature.
- Q: Where does the vault key live? → Overnight default: outside the repository and outside the
  database, in a key file in the user's config directory created on first use with owner-only
  permissions, overridable by an environment variable. Without the key the vault refuses to read.
- Q: Does the visual design follow the dashboard? → Overnight default: the new shell and its
  micro-frontends reuse the dashboard's colour and type tokens ("our current design"); the legacy
  parts look deliberately dated.
- Q: Does tier 2 run in this feature? → Overnight default: the command is built and run once per
  portal to store the first baseline; it is never part of the normal test run.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start the proving ground and browse three business domains (Priority: P1, R-25)

A developer starts the proving ground with one command. It serves a single local estate on fixed
local ports: a modern shell that hosts three separately built front-end apps (shop, bank, insurer),
a backend serving their data, and an old server-rendered app that the shell embeds for parts of
the bank and insurer. A guest can browse the shop catalogue, filter, add to a cart and reach
checkout; bank and insurer areas sit behind a login with generated test users. All texts come from
CMS-like files at runtime.

**Why this priority**: every other story runs against it; without the estate there is nothing to
crawl, log into or gate.

**Independent Test**: start the estate, open it in a browser, walk shop → cart → checkout as a
guest, log in to bank and insurer with the generated users, and see every page render with texts
from the CMS files.

**Acceptance Scenarios**:

1. **Given** a fresh checkout, **When** the developer runs the single start command, **Then** the
   shell, the three front-end apps, the backend and the legacy app are reachable on their fixed
   local ports within one minute, with no network access needed after install.
2. **Given** the estate is running, **When** a guest adds two products to the cart in the shop app,
   **Then** the cart count in the shell updates without a page reload.
3. **Given** the estate is running, **When** a CMS text file changes a label and the page is
   reloaded, **Then** the new label shows without rebuilding anything.
4. **Given** the generated test users, **When** one logs in to the bank, **Then** accounts,
   transfers and statements are reachable; a wrong password three times locks that user until the
   estate is reset.
5. **Given** a used estate, **When** the developer calls the reset endpoint, **Then** carts,
   orders, transfers, claims, lockouts and sessions return to the seeded state.

---

### User Story 2 - The estate reproduces catalogued legacy obstacles, with ground truth (Priority: P1, R-25)

Every in-scope entry of `docs/legacy-obstacles.md` is reproduced in at least one named place in the
estate, and each domain ships a machine-readable ground truth (screens, forms, fields, rules,
obstacles and where they live) in the same shape as the reference portal's, extended with obstacle
and login facts. The catalogue entry and the ground truth point at each other.

**Why this priority**: the obstacles are the point of the estate; the ground truth makes the BA goal
measurable on it (the reference portal's role, at a harder level).

**Independent Test**: for any in-scope catalogue id, open the place the catalogue names and see the
obstacle; validate each domain's ground truth against its schema and against the running estate.

**Acceptance Scenarios**:

1. **Given** the catalogue, **When** a reviewer picks any `in scope` entry, **Then** the entry names
   the domain and screen where it appears, and the ground truth lists that obstacle at that screen.
2. **Given** the running estate, **When** the ground-truth self-check runs, **Then** every listed
   screen is reachable as its listed actor (guest or a named test user), every listed field exists,
   and every guest-unobservable rule's markers are absent from guest pages.
3. **Given** the legacy parts, **When** their markup is inspected, **Then** they have no ARIA roles,
   unlabelled inputs, clickable `div`s and generated class names, as the catalogue says.
4. **Given** a new obstacle seen on a real project, **When** a developer adds a row, **Then** the
   catalogue format tells them which columns to fill and that "Proving ground" may stay `not yet`.

---

### User Story 3 - Store test-user credentials safely per portal and environment (Priority: P1, R-26)

A user setting up a portal stores its test users' credentials once, per portal and environment,
under the names the personas already reference (`ref:NAME`). Values are encrypted at rest; listing
shows names, portal, environment and dates but never values. For the proving ground the
credentials are generated and stored, and the estate is seeded with the same users.

**Why this priority**: logged-in areas hold most of the business; nothing else in R-26 works
without it, and it removes the temptation to put passwords in files.

**Independent Test**: store a credential, list it (no value shown), read the raw database and see
no plaintext, delete it; generate the proving-ground set and log in by hand with a value fetched
through the vault command.

**Acceptance Scenarios**:

1. **Given** no credentials, **When** the user stores `ref:BANK_USER_PASSWORD` for portal
   `proving-ground-bank` on `sandbox`, **Then** the value is stored encrypted and the command
   prints only the name, portal and environment.
2. **Given** stored credentials, **When** the database file is searched for the plaintext,
   **Then** it is not found.
3. **Given** the same name stored for `sandbox` and `staging`, **When** a run on `sandbox` resolves
   it, **Then** it gets the `sandbox` value only.
4. **Given** the vault key is missing or wrong, **When** anything tries to read a credential,
   **Then** it fails with a clear message naming the key location, never a partial value.
5. **Given** a persona references a name that is not stored for its portal and environment,
   **When** a run starts, **Then** it is refused before the browser opens, naming the missing
   reference.

---

### User Story 4 - The crawler logs in as a persona and maps logged-in areas (Priority: P2, R-26)

A persona with stored credentials starts a map or trace run. The crawler's server fills the login
form itself from the vault; the agent asks to log in and gets back whether it worked, never the
values. When the session expires mid-run, the server logs in again and the run continues; a failed
login stops the login attempts after one failure and reports it.

**Why this priority**: it unlocks bank and insurer, but depends on US3 and on the estate.

**Independent Test**: run a map on the bank domain with the bank persona, check that logged-in
states are recorded, and search evidence, logs, traces, screenshots and the agent transcript for
the password: zero hits.

**Acceptance Scenarios**:

1. **Given** the bank persona with stored credentials, **When** the agent asks to log in, **Then**
   the server fills and submits the login form, and the agent receives `logged in` or `failed`
   with a reason, never the values.
2. **Given** a logged-in run, **When** the portal's session expires, **Then** the server notices
   the login page or expiry notice, logs in again once, returns to the state it was going to, and
   records the re-login in the decision log; the login page is not recorded as a step of the
   process being traced.
3. **Given** a wrong stored password, **When** the login fails, **Then** no second attempt is made
   in that run and the run reports the failure (lockout protection).
4. **Given** a finished logged-in run, **When** evidence, screenshots, logs, traces, network
   bodies and the agent's view are searched for the password, **Then** it appears nowhere; the
   password field shows as filled but masked in screenshots, as the browser renders it.

---

### User Story 5 - Bot checks are handed to a human, not solved (Priority: P2, R-26)

When the crawler meets the estate's CAPTCHA-like widget on sandbox, it does not try to solve it. It
records that the state needs a human, adds a hand-off item to the run's worklist and goes on with
the rest of the portal.

**Why this priority**: real portals put these in front of login and checkout; today a detected
CAPTCHA stops the whole run, which makes such portals unmappable even on test environments.

**Independent Test**: map the shop with the checkout widget active and check that the widget's
state is recorded with a hand-off item, that nothing clicked the widget, and that the rest of the
shop was mapped.

**Acceptance Scenarios**:

1. **Given** a sandbox run, **When** a page shows the widget, **Then** the state is recorded as
   needing a human, a hand-off item names the page, and the frontier continues elsewhere.
2. **Given** a production run, **When** a CAPTCHA is detected, **Then** behaviour is unchanged: the
   run stops with a warning.
3. **Given** any run, **When** the widget is present, **Then** no action of the run targets it.

---

### User Story 6 - A deterministic quality gate runs with the normal tests (Priority: P1, R-27)

The normal test command also runs a gate suite that drives the crawler's server through scripted
tool calls (no LLM) against both portals and checks one assertion set per in-scope catalogue
obstacle and per logged finding that has a deterministic check. A failing gate names the obstacle
or finding id.

**Why this priority**: it protects what already works every time anything changes; it is cheap.

**Independent Test**: run the normal test command; break a known behaviour on purpose (e.g. let
class names into fingerprints) and see the gate fail naming LO-13.

**Acceptance Scenarios**:

1. **Given** the full test run, **When** it finishes, **Then** a gate report lists each covered
   catalogue id and finding id with pass or fail, and the run fails if any fails.
2. **Given** a catalogue entry `in scope` with no gate assertion, **When** the gate runs, **Then**
   it reports the entry as uncovered (a coverage list, not a silent gap).
3. **Given** the gate suite, **When** it runs, **Then** it needs no network, no LLM and finishes
   within the normal test run's time budget.

---

### User Story 7 - An on-demand eval runs the real agents and reports regressions (Priority: P2, R-27)

A developer runs one eval command for a portal. It starts the estate if needed, runs the real
crawler and BA agents headless with fixed budgets, scores the resulting documentation against
ground truth with the existing evaluator (extended for obstacles and logged-in facts), compares
with the stored baseline and prints what improved and what regressed, with the run ids and cost.

**Why this priority**: the crawler and BA are non-deterministic LLM agents; only real runs show
whether the goal (documentation good enough to re-create the portal) is reached and kept.

**Independent Test**: run the eval on `reference-insurer`, store it as baseline, run again and see
a comparison with per-category deltas and token cost.

**Acceptance Scenarios**:

1. **Given** a portal with ground truth, **When** the eval runs, **Then** it reports per-category
   recall and precision, obstacles handled, hand-offs raised, run ids, duration and tokens used.
2. **Given** a stored baseline, **When** a new eval scores lower beyond the tolerance in any
   category, **Then** the report marks it as a regression and the command exits non-zero.
3. **Given** a developer accepts a new result, **When** they promote it, **Then** it becomes the
   baseline, and the old baseline stays in history.
4. **Given** the normal test run, **When** it runs, **Then** the eval never runs as part of it.

---

### Edge Cases

- The estate's ports are taken: the start command fails and names the port, it never picks another.
- A front-end app fails to load in the shell: the shell shows an error area for it and the rest
  works (a real micro-frontend failure mode, also a catalogue case).
- A CMS file is missing a key: the raw key shows (LO-08), deliberately, only where the catalogue
  says so.
- Vault key rotated: stored values encrypted with the old key cannot be read; the command says to
  re-enter them; no silent fallback.
- Two personas reference the same name on the same portal and environment: they share the value.
- The session expires during the login itself: one re-login attempt, then the run reports failure.
- The CAPTCHA widget appears after a login failure: the run already stopped login attempts; the
  hand-off item records both.
- A gate assertion depends on wall-clock time (session timeout): the estate's timeout is
  configurable so gates use a short one without sleeping longer than a few seconds.
- The eval runs while a stale crawler server holds the store (spec 008 F-09): the command refuses
  and names the process.

## Requirements *(mandatory)*

### Functional Requirements

**Estate (R-25)**

- **FR-001**: The proving ground MUST live under `apps/` as its own app, start with one command,
  run fully offline after install, and serve fixed local ports documented in its quickstart.
- **FR-002**: It MUST consist of a modern shell that composes three independently built front-end
  apps (shop, bank, insurer) at runtime, a backend that serves their data and handles login and
  sessions, and one legacy server-rendered app embedded by the shell in an iframe.
- **FR-003**: The shop MUST offer guest catalogue browsing with filters and pagination, product
  pages, a cart shared with the shell, checkout with delivery choice and a CAPTCHA-like widget,
  and an account area behind login.
- **FR-004**: The bank MUST offer login, accounts overview, a domestic transfer form with Polish
  formats (IBAN, amount with decimal comma), statements by month with file downloads, and a
  legacy operations history in the embedded old app.
- **FR-005**: The insurer MUST offer login, a policy list and detail with old and new URL
  schemes, add-ons with a threshold rule, and a multi-step claim wizard with server-held state.
- **FR-006**: All visible texts of the modern parts MUST be read at runtime from CMS-like files
  per domain and language; changing a file changes the page after reload.
- **FR-007**: The estate MUST have seeded test users per domain, a reset endpoint that restores
  the seeded state, a configurable session timeout, and a lockout after three failed logins.
- **FR-008**: The estate MUST reproduce every `in scope` entry of `docs/legacy-obstacles.md` at the
  place the entry names; entries name the place and the ground truth lists the obstacle there.
- **FR-009**: The CAPTCHA-like widget MUST be local, deterministic and offline, carry the DOM
  markers of common vendors so existing detection applies, and never be solvable by clicking
  alone (the image step needs an answer only a human reading the image would give).
- **FR-010**: Each domain MUST have a ground-truth file in the reference portal's shape, extended
  with: the actor that can see each screen (guest or a named test user), obstacles per screen
  (catalogue ids), and redirects; plus a self-check that validates it against the running estate.
- **FR-011**: Each domain MUST have a portal config (sandbox, local scope, denylist for the reset
  endpoint, obstacles config for overlays) and a guest persona; bank and insurer also get a
  logged-in persona that references its credentials by name.
- **FR-012**: The modern parts MUST use the dashboard's design tokens; the legacy parts MUST look
  dated (tables, inline styles, small fonts) as the catalogue describes.
- **FR-013**: `docs/legacy-obstacles.md` MUST be a living catalogue with stable ids, columns for
  where it appears and what Pathfinder should do, a source, and a status; ids are never reused.

**Credential vault (R-26)**

- **FR-014**: Credentials MUST be stored in the Pathfinder database keyed by portal, environment
  and reference name, encrypted at rest with authenticated encryption; plaintext MUST never be
  written to the database, logs, traces, evidence, screenshots metadata or exports.
- **FR-015**: The encryption key MUST live outside the repository and the database (key file with
  owner-only permissions, overridable by an environment variable); missing or wrong key MUST fail
  closed with a message naming where the key is expected.
- **FR-016**: A command MUST let the user set (value read from a hidden prompt or standard input,
  never an argument), list (no values), delete and generate credentials; generation MUST produce
  strong random passwords and print nothing secret unless explicitly asked to export them for
  seeding.
- **FR-017**: Run start MUST resolve every `ref:` of the persona for the run's portal and
  environment and refuse the run naming any missing reference, before the browser opens.
- **FR-018**: The crawler server MUST offer a login operation that fills and submits the portal's
  login form from resolved values, using a login description in the portal config (login page,
  field labels or locators, submit, success and failure signs); the agent MUST only receive the
  outcome.
- **FR-019**: Resolved values MUST be registered with every redaction path (logs, decision log,
  trace payloads, network bodies, evidence snapshots, agent results) so that, even if a portal
  echoes one, it is replaced before storage.
- **FR-019a**: A run with resolved values MUST still record its Playwright trace, with the values
  masked: the trace MUST NOT capture the login fill and submit (snapshots, screenshots, network
  bodies), and a check after the run MUST find no resolved value in the run's trace files.
- **FR-020**: The server MUST detect session expiry (configured signs: login page reached
  unexpectedly, expiry notice), log in again at most once per expiry, resume, and record it; a
  failed login MUST stop further login attempts in that run.
- **FR-021**: The proving ground's test users MUST be generated with the vault command and the
  estate seeded from the same values through a seed export that is never committed.

**Bot-check hand-off (R-26)**

- **FR-022**: On sandbox and staging, a detected CAPTCHA on a page MUST mark that state as needing
  a human, add a hand-off item (page, kind, time) to the run's worklist, forbid actions on the
  widget and continue the frontier; on production the current stop-with-warning behaviour stays.

**Quality gates and evals (R-27)**

- **FR-023**: A tier-1 gate suite MUST run inside the normal test command, start the estate and
  the reference portal itself, drive the crawler server with scripted tool calls only, and finish
  within the normal test run's budget.
- **FR-024**: The gate MUST have one named assertion set per `in scope` catalogue entry and per
  logged finding that has a deterministic check, and MUST print a coverage report (id, pass, fail,
  uncovered) and fail the run on any failure.
- **FR-025**: Logged findings (spec 004 `goal-run-findings.md`, spec 008 `findings.md`) MUST be
  mapped to a gate case, an eval case, or "not testable" with a reason, in one eval-case index.
- **FR-026**: A tier-2 eval command MUST run the real crawler and BA agents headless against a
  named portal with fixed budgets, then score the docs with the evaluator, and report
  per-category recall and precision, obstacles handled, hand-offs, run ids, duration and tokens.
- **FR-027**: The evaluator MUST score the new ground-truth facts: obstacles documented (as rule,
  NFR, question or hand-off), logged-in screens, and redirects/alternative entry points.
- **FR-028**: Eval results MUST be stored with a baseline per portal; the command MUST compare
  with the baseline using per-category tolerances, mark regressions and exit non-zero on one;
  promoting a result keeps the old baseline in history.
- **FR-029**: The eval MUST NOT run in the normal test command and MUST refuse to start while a
  stale crawler or BA server holds the store.

### Key Entities

- **Legacy obstacle**: catalogue entry (id `LO-nn`, group, description, where it appears, expected
  Pathfinder behaviour, source, status).
- **Proving-ground domain**: shop, bank or insurer; its portal config, personas, CMS files, test
  users and ground truth.
- **Ground truth (extended)**: screens with actor, forms, fields, rules, obstacles per screen,
  redirects, login facts.
- **Credential**: portal, environment, reference name, encrypted value, created and rotated dates.
  Never carries plaintext outside memory.
- **Login description**: per portal, how to log in and how to recognise success, failure and
  expiry.
- **Hand-off item**: a worklist entry for a human (page, kind such as `captcha`, run, time).
- **Gate case**: id (catalogue or finding id), assertion set, last result.
- **Eval case index**: finding id → gate case / eval case / not testable (reason).
- **Eval result and baseline**: portal, run ids, scores per category, tokens, duration, promoted
  flag, history.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer starts the whole estate with one command and reaches every domain in a
  browser in under one minute, offline.
- **SC-002**: 100% of `in scope` catalogue entries are reproduced at the named place and listed in
  ground truth; the ground-truth self-check passes on a fresh estate.
- **SC-003**: After a logged-in run on bank and insurer, a search of the store, evidence, logs,
  traces, exports and agent transcripts finds the test passwords 0 times.
- **SC-004**: A map run with the bank persona records at least 80% of the bank's logged-in screens
  listed in ground truth, including at least one re-login after a forced session expiry.
- **SC-005**: A shop map run with the widget active records the hand-off and maps at least 80% of
  the shop's guest screens; the widget is never acted on.
- **SC-006**: The gate covers 100% of `in scope` catalogue entries and every finding marked
  "gate", adds no more than 3 minutes to the normal test run (cases marked slow run in
  `pnpm test:slow` instead), and fails naming the id when a covered behaviour is broken on purpose.
- **SC-007**: An eval on each portal produces a stored baseline and a comparison report; a second
  eval with no code change shows no regression beyond the tolerances.

## Assumptions

- The proving ground is our own local test estate: sandbox environment, forms may be filled and
  submitted, no masking (constitution 2.0.0); robots.txt is served and allows the crawler except
  the reset endpoint.
- Login is a username/password form; second factor (LO-36) is `later`.
- Front-end and backend dependencies are installed once with network access; runs are offline.
- Headless agent runs for tier 2 use the developer's own Claude Code installation and budget; their
  cost is reported, not capped beyond the fixed run budgets.
- Existing crawl and docs data may be dropped if a migration is in the way (no preservation work).
- The reference portal stays as it is and is the second gated portal.
- Out of scope: real third-party CAPTCHA, solving or bypassing bot checks, password managers or
  external secret stores, multi-user sharing of the vault, CI hosting.
