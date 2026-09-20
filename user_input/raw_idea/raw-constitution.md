# pathfinder-ai
This tool is supposed to be used by BA.


## tech domain


### BA domain knowladge
This project should fallow principles of BA domain knowledge. Best tractices etc. Such as:

How an expert BA documents an existing system
The core idea

What you're describing is usually called as-is analysis or reverse-engineering requirements (sometimes "brownfield documentation" or "requirements recovery"). The key difference from greenfield BA work is that the system already exists, so the code and behavior are the source of truth for what it does, but not for why it does it. A good BA keeps those two separate:

Observed behavior (verifiable from code, UI, data)
Intent / business rationale (only knowable from people, docs, or inference, and must be flagged as such)

This distinction is the most important thing to build into your harness.

How an expert BA would approach it
Scope and context. Identify stakeholders, system boundaries, and the purpose of the documentation (onboarding, migration, audit, compliance, rewrite?). The purpose determines the depth.
Discovery. Read existing docs, walk through the UI, review the code and database schema, look at logs and support tickets, and interview users and SMEs.
Decomposition. Break the system into business capabilities, then processes, then use cases, then business rules.
Modeling. Produce diagrams and structured artifacts (see below).
Validation. Walk the drafts back to stakeholders. Most BA work is here: "Is this actually how it works?"
Traceability and maintenance. Link requirements to their sources and keep them versioned.
Typical deliverables
Business Requirements Document (BRD): the why, goals, and scope, at the business level.
Functional Requirements Document (FRD) / Software Requirements Specification (SRS): what the system does. SRS is the more technical, IEEE 830 / ISO 29148 flavor.
Process maps (as-is): flow diagrams of how work moves through the system and people.
Use case specifications: actor, preconditions, main flow, alternate flows, exceptions, postconditions.
Business rules catalog: discrete rules like "orders over €10k need manager approval."
Data dictionary and domain/glossary: entities, fields, definitions, and the business vocabulary.
Non-functional requirements (NFRs): performance, security, availability, audit, compliance.
Traceability matrix (RTM): requirement ↔ source (code, screen, person) ↔ test.
Gap analysis: as-is vs. to-be, if there's a future-state goal.
Open questions / assumptions / risks log.
Terms worth knowing

Analysis concepts

As-is / to-be: current state vs. desired future state
Actor / stakeholder / persona: who interacts with or cares about the system
Business rule vs. functional requirement: a rule is a policy constraint ("refunds only within 30 days"); a requirement is system behavior that enforces it
Business capability: what the org does, independent of how (e.g., "Invoicing")
Acceptance criteria: testable conditions for a requirement being satisfied
Traceability: being able to link every statement back to its evidence
Elicitation: gathering info from people and artifacts
SME (Subject Matter Expert): the person who actually knows the domain
Happy path / alternate flow / exception flow: the main scenario and its variations

Prioritization and quality

MoSCoW: Must/Should/Could/Won't
INVEST: qualities of a good user story (Independent, Negotiable, Valuable, Estimable, Small, Testable)
Ambiguity, completeness, consistency, verifiability: the classic quality attributes of a requirement
Methodologies, frameworks, and notations
BABOK Guide (IIBA): the BA "bible." It defines knowledge areas such as Elicitation & Collaboration, Requirements Life Cycle Management, Strategy Analysis, and Requirements Analysis & Design Definition. Even skimming its structure gives you the vocabulary.
BPMN 2.0: the standard notation for process diagrams (swimlanes, gateways, events). It's what most BAs expect for process maps.
UML: use case diagrams, activity diagrams, sequence diagrams, state machine diagrams, class/ER diagrams.
SIPOC: a high-level process summary (Suppliers, Inputs, Process, Outputs, Customers).
User stories and Gherkin (Given/When/Then): common output formats, and Gherkin doubles as executable acceptance criteria.
Use cases (Cockburn style): more formal than stories, and better for documenting existing behavior.
Domain-Driven Design (DDD): bounded contexts, ubiquitous language, and aggregates. Very useful for structuring legacy system documentation.
Event Storming: a workshop technique for discovering domain events and flows. Also a good mental model for extracting events from code.
Decision tables / decision trees (DMN): the best way to document complex conditional business rules.
RACI: who is Responsible, Accountable, Consulted, Informed.
C4 model: context, container, component, and code diagrams for architecture-level documentation.
Gap analysis, SWOT, root cause analysis (5 Whys), process mining: supporting analysis techniques.
What this means for your harness

Since you're a developer, the design implications matter more than the BA theory:

Evidence-based output. Every requirement should cite its source (file:line, endpoint, DB table, UI screen). This is the traceability principle, and it's your best defense against hallucination.
Confidence and provenance labels. Tag statements as Observed (directly in code), Inferred (reasonable deduction), or Needs confirmation (business intent). Claude can see that a discount is applied at 15%. It cannot know why 15%.
Open questions as a first-class output. An expert BA's most valuable artifact is often the list of questions for SMEs. Make the harness generate these deliberately rather than guess.
Layered, multi-pass pipeline. Mirror the BA workflow: inventory (routes, screens, entities, jobs) → capability map → per-process deep dives → business rules extraction → NFRs → synthesis. Single-shot "document this app" prompts produce shallow, inconsistent results.
Structured intermediate formats. Have Claude emit JSON/YAML for rules, entities, and flows, then render to Markdown, Mermaid (BPMN-ish flows, sequence, ER), or Gherkin. This keeps documents consistent and diffable.
Controlled vocabulary. Build and maintain a glossary/ubiquitous language across passes, so "customer," "client," and "account holder" don't drift.
Human-in-the-loop validation. Design a review step where BAs confirm, correct, or reject items, and feed corrections back in. That mirrors real elicitation.
Audience-specific views. The same underlying model can render as a BRD for stakeholders, an SRS for devs, and a rules catalog for compliance.
Watch for code-only blind spots. Manual processes, workarounds outside the system, config in third-party tools, and tribal knowledge won't appear in code. Your tool should explicitly state what it couldn't see.
Suggested starting points
Skim the BABOK v3 knowledge area names and the techniques list (Chapter 10).
Look at a sample use case spec (Cockburn's Writing Effective Use Cases) and a sample SRS (ISO/IEC/IEEE 29148 outline).
Learn Mermaid for diagrams, since it's text-based and LLM-friendly.
Talk to one or two BAs about what their real deliverables look like; templates vary a lot by company and industry.

## General scope of functionalieties for project:
 I want this to be powered by playwright. Its purpose is 3 fold:

Discovery period and pathfinding. A way for the app used by claude to crawl the web app. And map its urls and processes. By process I understand a single process a persona can take. Like buying a item on awebsite. Adding comment. changing his user settings etc. As process can floew between each other I would like to save this in a db with agraph. Document each step persona takes from start to finish in a project.
Use QA in order to create playwright static tests. That can be run to eval if the process works as per previously noted requirments. Or quickly check the process both if it meets buisness requirments and works e2e.
Run tests to eval processes. Or prove procesess work as per new requirments
Mapping out data model, discovery flow, and test generation.
Harness design: Playwright + Claude for discovery, test generation, and verification
Your three goals map to a pipeline, and the graph is the shared backbone.

1. Model two graphs, not one
Most designs blur these, and it causes trouble later.

Layer A: UI state graph (mechanical, crawled)

Nodes: states (a page or meaningful UI state such as an open modal or a cart with items)
Edges: actions (click, submit, navigate) that move between states
Produced largely deterministically by the crawler
Layer B: Process graph (semantic, Claude-authored)

Nodes: Persona, Process, Step, Business Rule, Requirement, Test, Evidence
Edges: Persona -performs-> Process, Process -has_step-> Step, Step -traverses-> UI edge, Process -triggers/precedes/includes-> Process, Requirement -verified_by-> Test, Test -latest_run-> Result
A process is a path through Layer A plus intent, preconditions, and outcomes
Layer B is your BA deliverable, and Layer A is its evidence. This mirrors the observed vs. intent split from earlier.

DB choice: start with SQLite or Postgres using nodes and edges tables (JSON columns for attributes). Recursive CTEs handle process-flow queries fine at this scale. Move to Neo4j or Kuzu (embedded graph DB) only if traversal queries become painful.

2. Discovery and pathfinding
Split the work:

Deterministic crawler for structure: URLs, route templates, forms, nav, and API calls
Claude-driven exploration for processes: goal-oriented walks like "as a customer, try to buy something"
Techniques and terms to know:

State fingerprinting. SPAs make URL-only identity useless. Hash a normalized ARIA snapshot plus route template. Normalize /product/123 to /product/:id, or you get infinite state explosion.
Accessibility snapshots over screenshots. Playwright's ariaSnapshot (and the Playwright MCP server) gives Claude a compact semantic tree. It's cheaper, more deterministic, and it maps directly onto role-based locators later.
Network capture (HAR / page.on('request')). Recording the API calls behind each step often reveals business rules, validation, and data entities better than the UI does.
Persona = auth state. Use Playwright storageState per persona (guest, customer, admin, etc.), then run discovery per persona. Differences in reachable nodes between personas give you an implicit permissions matrix.
Action classification: tag every action read-only / mutating / destructive / external side-effect (payments, emails). Only explore mutating and destructive actions against staging or a sandbox with resettable seed data. This is the single most important safety design in the harness.
Goal seeding. Claude proposes candidate processes from nav labels, button text, and (if you have repo access) routes and controllers in the code. Cross-referencing code and UI catches processes the UI hides.
Replay-to-verify. After Claude records a trajectory, replay it deterministically. If it fails on replay, it's not a real process yet.
Step record (the core unit):

yaml
step:
  process_id: buy-item
  order: 3
  persona: customer
  intent: "Add selected item to cart"
  action: {type: click, locator: "getByRole('button', {name: 'Add to cart'})"}
  state_before: fp_a13f
  state_after: fp_b77c
  network: [{method: POST, url: /api/cart/items, status: 201}]
  observed_outcomes: ["Cart badge shows 1"]
  rule_candidates: ["Out-of-stock items disable the button"]
  evidence: [trace.zip#step3, screenshot, aria_snapshot]
  confidence: observed | inferred | needs_confirmation
Process-to-process links (e.g. "Checkout" requires "Login" and may lead to "Track order") are edges in Layer B. Discover them by matching one process's postconditions to another's preconditions.

3. Test generation
Key distinction:

Type	Asserts	Source	Purpose
Characterization test (golden master)	What the app does today	Recorded trajectory	Safety net, regression
Acceptance test	What the app should do	Confirmed requirement	Proof of business compliance
Characterization tests can be auto-generated, but they only prove "it still behaves as it did", not "it's right". Only requirements a human has confirmed should produce acceptance tests. Keep them in separate tag sets (@characterization, @acceptance).

Generation guidelines:

One spec per process, tagged with requirement and process IDs (@REQ-042, @process:buy-item)
Role/label-based locators (getByRole, getByLabel), never brittle CSS or XPath
Page Object or fixture layer generated once and reused, so a UI change means one fix
Assertions derive from requirement acceptance criteria (Gherkin Given/When/Then maps nicely onto Playwright steps via test.step)
Persona fixtures use storageState; data setup and teardown go through API or DB seeds, not UI clicks
Emit static, plain .spec.ts files. Once generated they run with no LLM at all, which is what you want for CI and speed
4. Running and evaluating
Use the Playwright JSON reporter plus traces and ingest results into your DB, linked Test → Requirement → Process
Coverage is measured at the process/requirement level ("87% of documented processes have a passing acceptance test"), not code coverage
Failure triage is where Claude adds value. Classify each failure as:
Real app defect (behavior violates the requirement)
Requirement drift (app changed legitimately, doc outdated)
Test brittleness (locator or timing issue)
Environment/data issue
Self-healing should be proposal-only. Claude suggests a locator or requirement fix as a diff and a human approves. Auto-healing tests to pass is how you get tests that prove nothing.
New requirements flow (ATDD/TDD style). Write or confirm the requirement, generate tests, expect them red against the current app, then go green after the change. The red-then-green record is your "proof" artifact.
Track flakiness (run N times, quarantine unstable tests) so results stay trustworthy.
5. How this fits on Claude Code
The harness owns state and orchestration (queue, DB, safety rules). Claude is a stateless worker per task.
Run Claude in headless mode (claude -p) or via the Agent SDK, with JSON-schema structured output for step and process records.
Give it Playwright MCP for browsing and a small custom MCP (or CLI tools) for your DB (record_step, link_process, get_known_states). This keeps Claude from writing raw SQL or inventing IDs.
Use subagents or skills per role: Explorer, Process Analyst, Test Writer, Failure Triager.
Give each task a narrow prompt, a budget (max steps and tokens), and a stop condition ("stop when you reach an order confirmation or 30 steps").
6. Pitfalls to plan for early
Auth, MFA, and CAPTCHAs: pre-bake the auth state, and use test accounts and disabled MFA in staging
State explosion and loops: cap depth, dedupe by fingerprint, track visited actions
Non-determinism: dynamic content, timestamps, and A/B tests need masking or normalization in fingerprints and assertions
Data pollution: every exploration run should start from a reset or seeded environment
Hallucinated steps: never persist a process unless replay verified it
PII in traces and screenshots: scrub or restrict storage
Cost: favor ARIA snapshots, cache known states, and let the deterministic crawler do the bulk work
Rules that don't show in the UI (backend jobs, emails, integrations): flag as "not observable" instead of guessing
Suggested build order
Schema (nodes and edges) plus the step record format
Deterministic crawler → state graph for one persona
Claude explorer for a single goal, with recording and replay verification
Process entity plus generated Markdown/Mermaid docs from the DB
Test generator (characterization first)
Runner ingestion plus a results dashboard or report
Requirements layer, acceptance tests, and the red-to-green flow
Multi-persona, process linking, failure triage
I can go deeper on any piece: the concrete SQL schema, the state-fingerprint algorithm, the MCP tool surface for the DB, or a sample generated spec with requirement tagging. What's your target stack for the harness itself (TypeScript, Python)? That will shape the specifics.

## QA domain knwoladge

What a good QA knows, and how to write composable Playwright tests
Is POM still standard?

POM is still common and still fine, but it's no longer the whole story. The Playwright team itself recommends fixtures as the primary composition mechanism, and POM as one thing you can inject through them. The classic POM problems are:

Page classes grow into god objects with dozens of methods.
They encourage inheritance chains (BasePage → AuthedPage → ...), which are brittle.
They model pages, but modern apps are made of components (a cart drawer appears on every page) and flows (checkout spans five pages).
Assertions hidden inside page methods make failures hard to read.

Current practice layers several patterns:

Layer	Pattern	Example
Component	Component objects: small classes wrapping one widget	CartDrawer, DatePicker, DataTable
Page	Page objects: thin, mostly locators plus a few actions	ProductPage
Flow	App actions / flow helpers: business-level operations	checkout.placeOrder(cart)
Wiring	Fixtures: dependency injection and lifecycle	test.extend({ productPage, ... })
State	API/DB setup helpers: skip the UI for arrange steps	api.createUser()

Some teams also use the Screenplay pattern (actors, abilities, tasks), which maps well to your persona concept, but it's heavier than most teams need.

Composability tools in Playwright

1. Fixtures (test.extend) are the core primitive. They're lazy (only set up if a test asks for them), composable (fixtures can depend on other fixtures), and they handle teardown after the use() call.

ts
export const test = base.extend<{ cart: CartDrawer; api: ApiClient; customerPage: Page }>({
  api: async ({ request }, use) => use(new ApiClient(request)),
  cart: async ({ page }, use) => use(new CartDrawer(page)),
  customerPage: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: 'auth/customer.json' });
    await use(await ctx.newPage());
    await ctx.close();
  },
});

2. mergeTests and mergeExpects combine fixture sets from different modules (auth, data, payments) without inheritance.

3. Fixture scopes: test-scoped (default) versus worker-scoped (expensive shared resources, such as a seeded tenant per worker). Also learn auto fixtures ({ auto: true }) for things that must always run, like console error capture or network logging, and option fixtures for configurable values.

4. Setup projects with dependencies. Log in once per persona in a setup project, save storageState, and let test projects depend on it. This replaces old globalSetup patterns and shows up properly in reports and traces.

5. test.step for readable flows. Steps show up in traces and reports, and box: true hides helper internals so failures point at your test rather than at the helper.

6. Custom matchers (expect.extend) for domain assertions, e.g. await expect(order).toBeInStatus('paid').

7. Data-driven tests. Loop over arrays to generate tests, or use test.describe.parallel with parameterized data for rule tables (this fits your decision-table business rules nicely).

Handling repeatable obstacles (CAPTCHA, banners, MFA)

The principle is to not defeat the obstacle from the test; remove it from the test environment or isolate it in one reusable place.

CAPTCHA / bot protection

Never try to solve CAPTCHAs in automation. It's brittle, and against most providers' terms.
Preferred options, in order:
Disable or swap it in the test environment via a feature flag or config.
Use the provider's test keys. Google publishes reCAPTCHA test site/secret keys that always pass, and hCaptcha and Turnstile have equivalents. Set them in staging.
Server-side bypass using an allowlisted header or token for your test runner's IP.
Mock the verification call with page.route() for isolated UI tests, and only where the real backend isn't the thing under test.
Keep the CAPTCHA-protected path covered by a small number of manual or scheduled checks rather than the main suite.
Put the mechanism in one place: an auto fixture that sets the header or route, so no test knows about it.

Cookie banners, promo popups, chat widgets: use page.addLocatorHandler(), which Playwright provides for exactly this. It registers a handler that runs whenever a blocking overlay appears at any point during the test. Wrap it in an auto fixture:

ts
overlays: [async ({ page }, use) => {
  await page.addLocatorHandler(page.getByRole('button', { name: 'Accept cookies' }),
    async btn => btn.click());
  await use();
}, { auto: true }],

MFA / OTP: use a test account with a fixed TOTP secret (generate codes with a library in a helper), or disable MFA in staging, or read OTPs from a test mailbox API. Do it once in the auth setup project, not per test.

Flaky third-party embeds (payments, maps, analytics): stub with page.route(), or use the provider's sandbox with its documented test card numbers. Block analytics and ads globally in a fixture to speed up runs and reduce noise.

Time and randomness: page.clock to control time, and seeded data to control content.

Rule of thumb for your harness: maintain a "known obstacles" library (fixtures plus handlers, one per obstacle type). When the Failure Triager sees a repeat failure pattern, its output should be "add or extend an obstacle handler" rather than editing individual tests.

Good practices for e2e tests

Locators and assertions

Locator priority: getByRole → getByLabel → getByText → getByTestId → CSS/XPath as a last resort. Role-based locators double as accessibility checks.
Use web-first assertions (await expect(locator).toBeVisible()), which auto-retry. Avoid expect(await locator.isVisible()).toBe(true), which doesn't retry.
Never use waitForTimeout. Wait on conditions. Use expect.poll() and expect(...).toPass() for non-DOM conditions.
Rely on auto-waiting and actionability checks instead of adding manual waits.
Use getByTestId with a team-agreed attribute (configure testIdAttribute) for elements with no good semantic handle.

Test design

Each test is independent and order-agnostic, with its own data. Tests that depend on each other can't run in parallel.
Arrange through the API, act through the UI, assert on both (UI and backend state where it matters). Don't click through five screens to set up a state you aren't testing.
One test = one behavior or business rule. Long journeys are fine if they're deliberately "journey" tests, but keep them few.
Follow the test pyramid: e2e should be the thin top layer. Push rule-level logic down to API and unit tests, and keep e2e for critical journeys.
Use unique data per test (uuid suffixes) so parallel runs don't collide.
Keep assertions in the test body, not hidden in page objects. Helpers act, tests assert.
Descriptive test names that read as requirements, plus tags (@smoke, @REQ-042, @acceptance).

Reliability and speed

fullyParallel: true, sharding in CI, and isolated browser contexts per test (the default).
Retries in CI only (1-2), with trace: 'on-first-retry'. Treat any test that needs a retry as a flake to investigate, not as a pass.
Track flakiness over time and quarantine with an explicit tag and owner.
Mock only what you don't own or can't control; don't mock your own backend in e2e, or you're no longer testing the system end to end.
Reset or seed environments deterministically.

Maintainability

Locators live in one place. A UI change should break one file.
Avoid conditional logic in tests (if (await x.isVisible())). It usually hides non-determinism.
Keep helpers small and single-purpose, and avoid deep inheritance.
Use lint rules (eslint-plugin-playwright) to catch anti-patterns like missing await, waitForTimeout, and page.$.
Domain knowledge a strong QA brings

Playwright specifics

Browser contexts and isolation, storageState, projects and dependencies
Fixtures, auto-waiting, actionability, web-first assertions
Network: route, waitForResponse, HAR replay, APIRequestContext
Tracing (Trace Viewer), video, screenshots, --ui mode, debugging with PWDEBUG
Frames and iframes (frameLocator), shadow DOM (auto-pierced), popups, downloads, file uploads, dialogs
Visual comparison (toHaveScreenshot) and its masking and stabilization options
Accessibility checks via @axe-core/playwright
Config: timeouts (test vs. expect vs. action), reporters, sharding, webServer

Testing theory

Test pyramid vs. testing trophy, and where e2e fits
Equivalence partitioning, boundary value analysis, decision tables, state-transition testing, and pairwise testing. These techniques turn a business rule into a minimal set of cases, and map directly to your BA rule catalog.
Risk-based testing: prioritize by business impact and failure likelihood
Test data management: factories, seeding, cleanup, and environment parity
Flakiness root causes: races, shared state, timing, non-deterministic data, third-party dependence
Smoke vs. regression vs. acceptance vs. characterization tests
Non-functional testing: performance basics, accessibility, security basics, cross-browser and mobile viewports

Adjacent skills

HTTP, REST, auth flows (cookies, JWT, OAuth/OIDC), and reading DevTools network panels
CI/CD, parallelization, artifacts, and containers
Reading requirements critically and spotting untestable or ambiguous ones. This is the QA-BA overlap.
Contract testing (Pact) and API-level testing, to know what not to test in the browser
What this means for your harness
Generate into your architecture, not into flat scripts. The Test Writer should emit specs that use existing fixtures, components, and flow helpers, and create new ones only when none fit. Give it an index of the existing helper library as context.
Encode this document as rules. Put the locator priority, banned patterns (waitForTimeout, CSS selectors, conditionals), and assertion style into a skill or CLAUDE.md, and enforce them mechanically with eslint-plugin-playwright and a CI check. Don't rely on the model to remember.
Separate helper generation from spec generation. Components and page objects are generated once from the state graph (Layer A), while specs are generated per process (Layer B). Specs stay short because the helpers exist.
Make the obstacle library a first-class harness concept. Explorer runs will hit cookie banners and CAPTCHAs constantly. Give it a tool like register_obstacle_handler so a fix, once made, applies to discovery and generated tests.
Map rule types to test techniques. A decision table becomes a data-driven test, a state machine becomes transition tests, and a boundary rule becomes boundary cases. Claude can do this systematically if you tell it to.

I can also turn this into a file, such as a CLAUDE.md-style ruleset for the Test Writer subagent, if that would be useful. And if you tell me your stack (TypeScript or Python), I can sketch the fixture layout and a sample spec that uses all the layers.

Claude works directly with your codebase