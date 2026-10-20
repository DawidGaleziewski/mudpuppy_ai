# Portal configs

One folder per portal with a `portal.yaml`, validated by `@pathfinder/config` (`portal-schema.ts`).
Personas live in `personas/<portal>/`.

- `id`, `base_url`, `environment` (`production` | `staging` | `sandbox`; a label only, every environment behaves the same, spec 021), `max_action_class` (optional ceiling; omitted = no limit).
- `compliance`: `robots_checked_on`, `terms_reviewed_on`, `terms_reviewed_by` (notes only; nothing checks them).
- `scope`: `allowed_domains`, `external_link_policy`, and the budgets (`max_depth`, `max_states`, `max_actions_per_state`, `max_run_time_minutes`, `max_steps`).
- `urls`: which URLs inside the allowed domains a run may open (see "URL lists" below).
- `denylist`: rule ids only (`logout`, `payment`, ...); `action_rules`: the portal's own safety rules.
- `rate_limit`: `requests_per_second`, `max_concurrency`, `user_agent` (optional; default 2 requests/s, concurrency 2).
- `obstacles`: list of `{id, selector}` overlays the crawler dismisses (cookie banner, modals).
- `login` (optional, needed by any persona with `ref:` credentials): `url`, `username`, `password`, `submit`, `success`, `failure`, `expiry`, `fields`. Full contract: `specs/009-legacy-proving-ground/contracts/login-tool.md`.
- `robots` (`respect` | `ignore`, default `respect`): with `ignore` robots.txt is neither fetched nor obeyed (constitution 3.0.0; the BA's choice for sites they work on).
- Also: `block_signatures`, `item_view_cap`, `item_route_templates`, `robots_page_requests`, `pii_scrub`.

## URL lists (`urls`, spec 023 US3)

```yaml
urls:
  allowed: ["/konto/*", "https://www.example.pl/kontakt*"]   # optional
  disallowed:
    - /__admin/*            # state reset endpoint
    - /*?*sessionId=*
    - /\/polisa\/\d+\/druk/
```

Each entry is one of:

- a **path glob**, `/konto/*` or `/szukaj?q=*`: matched against the URL path and against path plus
  query (`*` matches any run of characters, also `/`; case-insensitive);
- an **absolute URL glob**, `https://www.example.pl/kontakt*`: matched against the full URL
  without the fragment;
- a **regex** in slashes, `/\/polisa\/\d+/`: matched against the full URL. A slash-wrapped entry
  is a regex only when its body has a regex character (`\ ^ $ . + ? ( ) [ ] { } |`); `/konto/`
  stays a path.

Rules:

- `allowed` absent means everything on `scope.allowed_domains`. Once it is set, only matching
  URLs are in scope. It cannot be an empty list.
- `disallowed` always wins over `allowed`.
- An entry that is none of the three kinds, or a regex that does not compile, makes the file
  fail to load (`pnpm portal:check <portal>` names it).
- A refused URL is out of scope: the refusal rule is `urls.disallowed <entry>` ("excluded by
  rule <entry>") or `urls.allowed` ("matches no urls.allowed entry"). It is refused before any
  denylist rule, robots check or action class is looked at.
- `scope.allowed_paths` and the `path:` / `url:` denylist entries no longer exist: move them to
  `urls.allowed` and `urls.disallowed`. A `path:` or `url:` entry in `denylist` fails to load.

**Persona narrowing.** A persona may carry `scope_restrictions.urls` with the same two lists. A
URL must pass the portal's lists and the persona's lists (rules `persona.urls.allowed`,
`persona.urls.disallowed <entry>`), so a persona can only narrow.

**Scan focus.** A BA's focus for one scan (`only_paths`, `exclude_paths`) becomes one more set of
lists the URL must pass (rules `focus.allowed`, `focus.disallowed <entry>`). The entries are the
same three kinds. A focus never widens the portal's lists: a focus path the portal does not allow
simply opens nothing. An unusable entry, or a start page the focus excludes, is refused when the
scan starts.

## Hooks (`hooks`, spec 023 US1, US2)

A portal's quirks are fixed in its own folder, not in the crawler: `portals/<id>/hooks.ts` exports
functions, and the portal file maps them to points of a scan.

```yaml
hooks:
  - point: onRunStart            # once, after the browser opens, before the first page and login
    fn: acceptConsent
  - point: onPageLoad            # a page has loaded; before it settles and is observed
    fn: patchCalculator
    match: "/kalkulator/*"       # a URL list entry; leave out for every page
    timeout_ms: 5000             # default 10000
```

```ts
// portals/<id>/hooks.ts
import type { Hook } from '@pathfinder/hooks';

export const acceptConsent: Hook<'onRunStart'> = async (ctx) => {
  await ctx.cookies.add([{ name: 'consent', value: '1', url: ctx.config.base_url }]);
};

export const patchCalculator: Hook<'onPageLoad'> = async (ctx) => {
  await ctx.inPage((fieldId: string) => document.getElementById(fieldId)?.removeAttribute('disabled'), 'price');
};
```

| Point | Runs | May return |
|---|---|---|
| `onRunStart` | once per browser session (a resume opens a new one; a re-login does not) | nothing |
| `onBeforePageLoad` | before `navigate` opens a URL | `{ url }` to open another (it faces the gates), or `{ skip: true, reason }` |
| `onPageLoad` | after a page loads (by `navigate` or an action), before it settles | nothing |
| `onBeforeClickAction` | before an action is performed (`ctx.action`: role, name, locators) | `{ skip: true, reason }` or `{ waitFor: selector }` |
| `onRunEnd` | before the browser closes | nothing |

The context: `url`, `point`, `persona` (`id`, `attributes`), `environment`, `run` (`id`,
`mode`), `config` (the portal, read-only), `cookies.get/add/clear()`, `route(pattern, handler)`
and `addInitScript(script)` (Playwright's, on the browser context), `inPage(fn, ...args)` (runs
in the page; pass values as arguments, the function cannot see the hook's variables) and
`log(text)`. Hooks of one point run in file order; the first `skip` wins.

Hooks are the owner's trusted code with full power (spec 021). Every run is a `hook` trace span
and a decision note `hook:<point>:<fn>` with what it did; a screen an `onPageLoad` hook changed
gets a `hook:patched` note, so the BA never documents the patch as the portal's behaviour; the
scan page lists the hooks that ran. A hook that throws, times out or returns something its point
does not take is recorded as a failure and the scan goes on. A mapped function the file does not
export, a missing file or a file that does not load refuses `start_run` (`CONFIG_INVALID`). The
crawler agent never writes hooks; it may suggest one in an open question.

In-page code may use named inner functions: `inPage` defines esbuild's `__name` helper first (spec
030 FR-033; under `tsx` a named function inside the body used to throw `__name is not defined`).

## Fixes (`fixes`, spec 030 R-59)

A **fix-plugin** is a tested solution to a class of real-world obstacle (a scar), written once in
`@pathfinder/fix-plugins` and turned on per portal with the client's data. Prefer a fix over a
hand-written hook when one exists; the client's selectors, cookie names and URLs stay in the portal
file.

```yaml
fixes:
  - use: seed-cookie                 # content appears only with a feature-flag cookie
    with: { cookies: [{ name: show_services, value: "1" }] }
  - use: expand-collapsed            # open accordions, <details>, "show more" before observing
    with: { max: 60, exclude: ["#site-nav"], toggles: ['dl dt > a[href="#"]'] }
  - use: wait-for-mount              # a late micro-frontend, on the pages that host it
    match: "/service/*"
    with: { selector: "#mfe-root form", wait_ms: 8000 }
  - use: detect-stack                # tag every page SPA or legacy (read-only)
    with: { spa: ["#app-root"], legacy: ["input[name=__SERVERSTATE]"] }
```

| Fix | Points | Scar |
|---|---|---|
| `seed-cookie` | `onRunStart`, `onBeforePageLoad` (only when missing) | SC-08, field H-1 |
| `expand-collapsed` | `onPageLoad`: opens only panels that are really hidden, never real links, submits or pop-up openers; form submits suppressed while expanding; capped | SC-09, SC-10, field H-2 |
| `wait-for-mount` | `onPageLoad` (waits in the page), `onBeforeClickAction` (`waitFor`) | SC-11, field H-3 |
| `detect-stack` | `onPageLoad`: logs `stack: spa` or `stack: legacy (…)` | field H-4 |

Each entry takes `match` and `timeout_ms` like a hook. Fixes run before the portal's own hooks of
the same point, in the order listed, traced as `fix:<id>`. An unknown fix or parameters that do not
fit refuse `start_run` (`CONFIG_INVALID`) naming the field. A new fix: a file in
`packages/fix-plugins/src/fixes/`, registered in `registry.ts`, with a unit test and a scar-maker
gate. Rule of thumb (roadmap R-59): plain web-platform behaviour every portal benefits from goes
into the crawler itself; what needs one client's data, or is risky everywhere, is a fix.

## Network (`network`, spec 030 R-63)

For a portal behind a corporate network: the browser goes through a forward proxy, and hosts in
`bypass` go direct (a CDN the proxy refuses). `ignore_https_errors` is for a TLS-inspecting proxy
whose CA the browser does not trust (an explicit owner choice). Better, `ca_file` (spec 031) names a
PEM file with the corporate CA, and only that CA is trusted: the server adds it to Node's CA list,
and Chromium accepts a certificate chain that contains one of the file's keys. The proxy must
present that CA in its chain, so put the **issuing** CA in the file (a root that is never sent does
not help); `portal:doctor` checks it (`tls.ca-file`) and names the chain it saw. A relative path is
read from the portal's folder.

```yaml
network:
  proxy:
    server: http://proxy.corp.example:3128
    bypass: ["cdn.example.net", "*.fonts.example.net"]
  ca_file: corp-issuing-ca.pem   # portals/<id>/corp-issuing-ca.pem
  ignore_https_errors: false
robots: ignore      # robots.txt is fetched by the server, not through the proxy
```

Before the first run at a new site, `pnpm --dir apps/crawler portal:doctor <portal> [--env <env>]`
checks this machine (SQLite native module, Chromium), the environment, and the way to the portal:
direct reachability, a WAF that refuses the crawler User-Agent, an IP allowlist that admits only the
proxy, TLS inspection, DNS that resolves only through the proxy, robots behind a proxy. Every warning
and failure names its cause and the setting that fixes it. Checks live in `@pathfinder/doctor`
(`src/checks/`, a registry: id, depends on, applies when, probe); a new check needs no core change.

## Traces (`portals/<id>/traces.yaml`, spec 030 R-64)

The processes to drive to their end, the same way every time (map runs stop at the first
irreversible action; asking the agent to "finish the form" is unreliable). One entry per process,
one trace run per variant:

```yaml
traces:
  - id: apply
    name: Apply for a contract
    goal: Reach the success page
    start_url: /apply/step-1            # a path on the portal's base URL, or absolute
    steps:                              # by the control's visible label, in order
      - { name: Full name, kind: fill, value: Test Person, intent: enter the name }
      - { name: Product, kind: select, value: Household insurance, intent: choose the product }
      - { name: I accept the terms, kind: check, intent: accept }
      - { name: Next, kind: click, intent: go to step 2 }
    submit: Submit application          # the persona's limit decides whether it is pressed
    variants:
      - { id: happy-path, expect: proceed }
      - id: too-young                   # replaces the steps: a validator must stop the form
        expect: validation_error
        steps: [ ... ]
  - id: change-address                  # known to exist, not mapped yet: skipped
    name: Change the address
    goal: Change the postal address
    start_url: /profile
    to_be_discovered: true
```

Run: `pnpm --dir apps/crawler portal:trace <portal> <trace-id|all> <persona> --env <env>
[--variant <id>]`. Values are synthetic (e-mails on `.test`/`.example`). Each step's snapshot is
kept, so every validation message is in the evidence; a lower action limit ends the run at the
submit (`boundary_reached`), honestly.

Spec 032 adds two variant fields, used by probe suites:
- `fault`: `block_request`, `http_500`, `delay` or `offline`. It goes with `expect:
  technical_error`, and only with it. The variant's last action has its request broken in the
  crawler's browser.
- `probe`: the probe a variant came from.

`expect` also takes `branch`: an option leads somewhere other than the happy path. Suites the
owner approves in Review are written into this file (comments kept).

## Form probes (`probes`, spec 032 R-69)

A form-probing run (`start_run` `form_probing: true`, the chat's "probe the marked forms") tries the form
steps a person marked for probing beyond their happy path, when the crawler calls `probe_form`. A
plain map run never probes (owner answer of 2026-10-17, spec 032 US5). The tries:
- empty required fields, wrong formats, below the minimum and above the maximum;
- every other option;
- a blocked request, HTTP 500, a held request and going offline, all simulated in the crawler's own
  browser.

Each outcome is recorded as a state with its probe. Probes run only where the action limit allows
submitting forms (at least `mutating`), production included (owner answer O-M1). A step that asks
for a one-time code or a CAPTCHA is recorded as `blocked`.

```yaml
probes:
  per_step: 24   # tries per form step (default 24)
  per_run: 120   # tries per run (default 120); 0 turns probing off
```

## Test data (persona `test_data`, spec 032)

The valid values a form needs, by the field's label exactly as the form shows it. Probes and
autofill press with them first. A step those values do not pass is reported as
`missing_test_data`, and the assistant asks the BA once and saves the answers
(`save_test_data`). Values must be obviously synthetic: personal data is refused.
Trace runs fill fields from the same map. Before spec 032 it was called `trace_inputs`; a persona
that still uses that key is refused with a note to rename it.

```yaml
test_data:
  Start date: "01.01.2027"
  Promo code (optional): ""      # an empty value leaves the field empty
  Tax number: "1234567890"
```

## Timeouts (`timeouts`, spec 023 US4)

```yaml
timeouts:
  settle_ms: 8000                # settle: give up after this long with no progress, default 10000
  settle_hard_ms: 30000          # settle: never longer, while the page keeps loading new parts
  navigation_ms: 30000           # default 30000
  mfe_wait_ms: 10000             # mount wait: never longer, default scope.mfe_wait_ms
  mfe_quiet_ms: 3000             # mount wait: give up after this long with no progress, default 3000
  client_redirect_wait_ms: 5000  # default scope.client_redirect_wait_ms
  per_url:
    - match: "/kalkulator/*"     # first match wins
      settle_ms: 15000
```

Without `timeouts` the defaults apply. With it, each page's timeouts are recorded in a
`page_timeouts` trace event.

Settle and the micro-frontend mount wait are one kind of wait (spec 031, owner decision D-2 Q1, the
same as login's): they wait while the page makes progress and stop when nothing happens. Progress
is a request to a path the page has not asked for before (a poll or a cache-busting beacon to a
known path is not), a change of the URL, or a change in the number of elements of the page or its
frames. A micro-frontend slot that stays empty on purpose (a cookie banner after consent) costs
`mfe_quiet_ms`, not `mfe_wait_ms`. Raise `mfe_quiet_ms` for an application that mounts after a long
silent pause.

A BA adds a portal without editing files: **"+ new portal"** in the dashboard's portal dropdown
(spec 011). It writes `portals/<id>/portal.yaml` (sandbox or staging, robots ignored by default,
forms may be submitted, the address's domain and its subdomains in scope) and a `guest` persona.
