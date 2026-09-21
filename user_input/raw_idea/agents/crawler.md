The crawler for this harness

The crawler is a single LLM + Playwright agent with two modes: `map` (what exists and how is it connected? routes, capabilities, forms, API calls) and `trace` (what do people do with it? one named process, step by step). It records and does not interpret. Its deterministic pieces (fingerprinting, safety classification, scope checks, PII scrubbing, DB access through MCP) are tools it calls and cannot override; the LLM decides where to go, the tools decide what is safe and what counts as a new state. A good crawler also leaves a worklist of what it deliberately didn't do. The rest of this document describes those deterministic modules and the crawl loop they support.

The academic term for this is model-based GUI crawling. Crawljax is the classic prior art (state-flow graphs for AJAX apps), and it's worth skimming for the terminology. For URL queues, sessions and retries you can build on Crawlee's Playwright crawler, but plain URL-frontier crawlers assume page = URL, which is false for SPAs, so the state layer will be your own code.

What a good crawler must know

1. State identity. This is the hardest part.

Fingerprint = route template + normalized ARIA snapshot (roles and names, with volatile text, numbers, dates and IDs masked) + open overlays.
Normalize URLs to route templates (/orders/8841 → /orders/:id) and strip tracking params, sort query params, and drop fragments unless the app uses hash routing.
Fingerprints need tunable granularity. Too fine and you get state explosion, too coarse and you merge different states.
Similar-but-not-identical states (a list with 10 vs 11 rows) should cluster as one state via fingerprints over structure, not content.

2. When a page is "done." Wait for stability instead of a fixed timeout: network idle for a window, no pending requests, DOM mutation quiet (via a MutationObserver), and animations finished. Bad stabilization produces phantom states and flaky graphs.

3. What's interactable. Extract candidate actions from the ARIA tree (links, buttons, menu items, tabs, comboboxes, form submits) plus handlers that roles miss (clickable divs). Each action needs a stable locator descriptor (role + name + container), because the same descriptor is reused later by tests.

4. Action safety classification. Before executing anything, classify it:

read (navigation, tabs, expanding, filters)
mutating (add to cart, save, comment)
destructive (delete, cancel, logout, unsubscribe)
external (pay, send email, invite)

Classify from role, label text, HTTP method of the triggered request, and form semantics. Default policy: the crawler executes only read. Mutating and destructive actions are recorded as frontier items for a later trace run (sandbox only) along with their preconditions. A logout link in a deep crawl kills your session, so it belongs on a hard denylist.

5. Scope and policy. Domain and path allowlists, an external-link policy (record but don't follow), max depth, max states, per-state action caps, request rate limits, and a hard environment check (refuse to run against production unless explicitly flagged).

6. Persona and session handling. One crawl per persona using storageState. Detect session expiry (redirect to login, 401s) and re-authenticate or abort cleanly. Compare reachable states across personas to get the permission matrix.

7. UI structure beyond pages. Modals, drawers, dropdowns, tabs, and accordions are states too. Handle iframes (frameLocator), new tabs and popups, downloads, dialogs (alert/confirm), and file inputs. Infinite scroll and pagination need caps and detection (same fingerprint after scroll = stop). Calendars and date pickers are infinite-state traps, so cap or skip.

8. Forms. Record field schema (name, type, required, constraints, validation messages, options) without submitting. Client-side validation messages are cheap business-rule evidence. Submission is a trace-mode job, allowed only in a sandbox.

9. Network capture per state and per action. Record method, URL template, status, request/response shape (schema, not payloads with PII), and headers of interest. API calls often reveal entities and rules that the UI hides. Also record console errors and failed requests.

10. Known obstacles. It shares the obstacle library with tests (cookie banners, chat widgets) via addLocatorHandler, so they don't create false states.

11. Evidence and PII hygiene. Save ARIA snapshot, screenshot and trace ref per state, and scrub or mask PII before persisting.

12. Resumability and determinism. Persist the frontier and visited set so a crash resumes instead of restarting. Seed randomness and record the environment version and seed data ID, so two crawls are comparable.

Architecture
Policy/Scope ─┐
Persona/Session ─┤
              ▼
   Frontier (state, action) ──► Executor ──► Stabilizer ──► Observer
        ▲                                                     │
        │                                     snapshot, network, fingerprint
        │                                                     ▼
        └──── Action Extractor + Safety Classifier ◄──── State Store (DB)
                                                              │
                                                     Frontier Report
Module	Responsibility
Policy	Scope, budgets, safety rules, env guard
Session manager	Persona contexts, expiry detection
Executor	Perform an action from a locator descriptor, with timeouts
Stabilizer	Decide when the UI has settled
Observer	Snapshot, fingerprint, network log, evidence
Extractor + Classifier	Candidate actions, each with safety class
Frontier	Queue of unexplored (state, action) pairs, deduped
Store	Writes states, edges, forms, API calls, run metadata
Core loop
ts
async function crawl(persona: Persona, policy: Policy) {
  const ctx = await sessions.open(persona);
  frontier.seed(await observe(ctx.start(policy.entryUrl)));

  while (!frontier.empty() && budget.ok()) {
    const { state, action } = frontier.next();          // BFS by default
    if (!await navigateTo(ctx, state)) { store.markUnreachable(state); continue; } // replay path to reach state
    if (action.safety !== 'read') { store.addToTraceBacklog(state, action); continue; }

    const before = state.fingerprint;
    const net = await network.capture(() => executor.run(ctx, action));
    await stabilizer.settle(ctx);
    const after = await observer.observe(ctx, net);      // snapshot + fingerprint + evidence

    store.recordEdge(before, action, after.fingerprint, net);
    if (!store.hasState(after.fingerprint)) {
      store.saveState(after);
      frontier.push(extractActions(after).map(a => ({ state: after, action: a })));
    }
    if (sessions.expired(ctx)) await sessions.refresh(persona);
  }
  store.writeFrontierReport();   // unexplored mutating/destructive actions, forms, caps hit
}

Reaching a state: the graph must know how to get back to a state (a stored path of actions from the entry point, or a direct URL when the state is URL-addressable). Navigation by replaying paths is where most of the crawler's flakiness lives, so keep paths short and prefer direct URLs.

Outputs the rest of the harness needs
States: fingerprint, route template, title, ARIA snapshot ref, overlays, persona visibility
Edges: action descriptor, safety class, from and to state, network calls, and any error observed
Forms and API catalog: field schemas, endpoint templates, and methods
Frontier report: the crawler's worklist for trace runs (mutating actions, forms to submit, states behind preconditions, caps hit, unreachable states)
Coverage stats: states per persona, unexplored actions, and fingerprint churn (a health metric for your fingerprint design)
Limits to design around
DOM isn't the whole state. Cart contents, permissions and server data change what the same page means. The graph is an approximation, so record the seed data ID and treat state as "UI state given this data."
Fingerprint quality decides everything. Log every merge and split decision, and plan to tune it against a real app. Regression-test the fingerprinter on saved snapshots.
Crawlers find structure, not intent. A completed crawl tells you nothing about why a page exists. That's the crawler's trace mode and the BA's job.

If you tell me your target stack, I can sketch the state and edge schema plus the fingerprint function next. That's the piece worth prototyping before anything else, because it will show quickly whether your target apps produce a sane graph.

what good practices such crawlers fallow? Is there a standard for this? Terms and pitfalls to be aware of?

Outlining best practices and standards for web crawlers.
Crawler practices, standards, and pitfalls
Is there a standard?

No single standard covers this. Your crawler sits between three established fields, and each contributes practices and vocabulary.

Field	What it gives you	Examples
Web crawling / archiving	Frontier management, URL normalization, politeness, resumability	Heritrix, Scrapy, Crawlee, Browsertrix (browser-based)
Security scanning	Safe crawling of authenticated apps, AJAX handling, scope control, session handling	OWASP ZAP (spider and AJAX spider), Burp crawler
Model-based GUI testing	State abstraction, state graphs, exploration strategies, coverage	Crawljax, GUI ripping (GUITAR), Stoat, Monkey-style testers

The formal standards you can borrow are small building blocks:

RFC 3986 (URI syntax and normalization) for canonicalizing URLs.
RFC 9110 (HTTP semantics), which defines safe and idempotent methods and underpins your safety classification.
RFC 9309 (robots.txt) and the Sitemaps protocol. These are designed for third-party crawlers. For your own apps they're less about compliance and more about hints: sitemaps are a free source of seed URLs.
WAI-ARIA and the Accessible Name Computation spec, which define what your accessibility-tree fingerprints are made of.
WARC (ISO 28500) and HAR as archival and network-log formats. Optional, but useful if you want replayable evidence.
Terms worth knowing

Structure and state

Frontier: the queue of unexplored work. In your case it holds (state, action) pairs, not just URLs.
State abstraction / state equivalence: the rules for deciding two observed UI states are "the same." This is the central design problem in model-based GUI testing literature.
State explosion: unbounded growth of near-duplicate states.
Canonicalization / URL normalization: collapsing equivalent URLs.
Route template / URL pattern clustering: /item/:id grouping.
Crawler trap / spider trap: infinite or near-infinite URL or state spaces (calendars, faceted filters, session IDs in URLs, infinite scroll).
Deep web / hidden web: content reachable only through forms or login. That's most of your target.

Strategy

Exploration strategy: BFS, DFS, random, or coverage-guided (prefer actions likely to reveal new states). Crawljax made these configurable.
Backtracking vs. reset-and-replay: how the crawler returns to a state. Backtracking is fast but drifts, while replaying from the entry point is reliable but slow.
Event/action extraction: finding clickable elements, including handlers without semantic roles.
Coverage metrics: states found, actions executed, unique API endpoints seen.

Safety and correctness

Safe vs. unsafe methods, idempotency: HTTP concepts that inform your read/mutating classification.
Side effects, scope, blast radius: security-scanner vocabulary for "what could this crawl break."
Session fixation, CSRF tokens, session invalidation: authenticated-crawling hazards.
Good practices established crawlers follow

Frontier and identity

Normalize before deduping: sort query params, drop tracking params, lowercase hosts, resolve trailing slashes, and strip fragments (except for hash routers).
Dedupe on the abstracted state, not the raw URL or full DOM.
Prioritize the frontier (for example, shallow first, or actions that recently found new states), and always keep hard caps: depth, states, actions per state, time, and requests.
Persist the frontier and visited set so crashes are resumable.

Politeness and safety (security scanners are strictest here)

Rate-limit and cap concurrency, even against your own staging environment, because shared environments and their databases can suffer.
Scope by allowlist (domain and path), with an explicit denylist for logout, delete, payment, and admin-reset routes.
Refuse to run against production without an explicit override flag.
Use dedicated crawler accounts with least privilege, a recognizable User-Agent or header (so ops can identify and filter the traffic), and a known IP where possible.
Assume any GET can mutate. Use HTTP method as a signal, never as proof.

Determinism and observability

Record environment version, seed data ID, viewport, locale, timezone, and browser version with every run. Without these, two crawls aren't comparable.
Freeze what you can (page.clock, fixed viewport and locale, animations disabled).
Log every decision: why an action was skipped, why two states were merged or split. Tuning the fingerprinter depends on this.
Keep raw evidence (snapshot, trace, screenshot) separate from derived records, so you can re-derive with a better fingerprinter without re-crawling.

Robustness

Per-action timeouts, and per-run watchdogs for hung pages.
Retry transient failures, but distinguish them from real errors, and record both.
Detect and handle session expiry as a first-class event.
Handle browser crashes and memory growth by recycling contexts periodically.
Pitfalls specific to your use case
Fingerprint too sensitive or too coarse. The first produces a graph with thousands of near-duplicates, the second hides real states. Expect several tuning iterations against real apps, and keep a regression corpus of saved snapshots.
Timestamps, counters, and personalization in the fingerprint. "Welcome back, Anna," "3 items in cart," and rotating banners create phantom states. Mask them.
Silent side effects of "read" actions. Opening an email marks it read, viewing a notification clears it, and visiting a page can create a draft. Treat "read" as presumed, and run crawls on resettable data.
Logout and session traps. One crawled logout link ends the run, and some apps invalidate all sessions on password-change pages or hidden links.
Infinite spaces. Calendars, date pickers, faceted filters, pagination, and infinite scroll. Detect by repeated fingerprints or growth without new structure, and cap.
Path replay drift. Replaying a path to reach a state fails when data changed, or when earlier steps altered the state. Prefer direct URLs, keep paths short, and mark unreachable states rather than retrying forever.
Overlays contaminating states. Cookie banners, chat widgets, and onboarding tours make every state look different. Use the shared obstacle handlers before fingerprinting.
Ghost interactables. Elements that are clickable in the DOM but hidden, covered, or disabled. Check actionability, not just presence.
Anti-bot defenses on your own staging. Rate limits, WAF rules, and CAPTCHAs will silently degrade results. Allowlist the crawler, and treat unexpected 403 and 429 responses as run-level warnings, not ordinary edges.
Feature flags and A/B tests. The same persona can see different UIs between runs. Record flag state where you can, and pin it in test environments.
Incomplete personas. A crawl as admin shows structure the customer never sees. Keep graphs per persona, then compare.
Overtrusting the graph. It only knows what it reached. Unreached is not the same as nonexistent, so publish coverage numbers and the frontier report alongside the graph.
PII in evidence. Snapshots and HARs often contain names, emails, and tokens. Scrub at capture time, not later.
Treating the crawl as a deliverable. Structure without intent is not documentation. The crawler's output is input to trace runs and the BA.
Practical takeaways for your build
Study Crawljax's state-abstraction and crawl-strategy ideas and ZAP's authenticated-scan practices. They're the most relevant prior art.
Use Crawlee or your own frontier code for queue mechanics, but expect to write the state layer yourself.
Start with a small target app and inspect the graph by hand (render it as Mermaid or Graphviz). Ten minutes of looking at a wrong graph teaches more than any spec.
Define crawl quality metrics early: state count per persona, duplicate-cluster rate, unreachable-state rate, percentage of actions skipped by safety class, and fingerprint stability across two consecutive crawls of the same data. That last one is a good test of whether your fingerprinter is trustworthy.

If useful, next I can sketch the fingerprint function with its masking rules, or a run-manifest schema that captures the determinism metadata above.