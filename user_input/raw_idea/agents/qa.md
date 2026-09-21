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
Make the obstacle library a first-class harness concept. Crawler runs will hit cookie banners and CAPTCHAs constantly. Give it a tool like register_obstacle_handler so a fix, once made, applies to discovery and generated tests.
Map rule types to test techniques. A decision table becomes a data-driven test, a state machine becomes transition tests, and a boundary rule becomes boundary cases. Claude can do this systematically if you tell it to.

I can also turn this into a file, such as a CLAUDE.md-style ruleset for the Test Writer subagent, if that would be useful. And if you tell me your stack (TypeScript or Python), I can sketch the fixture layout and a sample spec that uses all the layers.

Claude works directly with your codebase