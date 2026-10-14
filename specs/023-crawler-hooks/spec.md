# Spec 023: Crawler hooks and URL lists per portal (R-53)

Branch `feature/023-r53-crawler-hooks` · Created 2026-10-13 · Status: Draft

**Input**: user, 2026-10-13: "The crawler will have lifecycle hooks like onRunStart onRunEnd
onPageLoad, onBeforePageLoad, onBeforeClickAction. For each portal we create we already have
personas per portal. So we can also add HOOKs per portal … Therefore we can patch portals with
issues they have, i.e. add cookies, add extra scripts patching the window. The hooks can be
accepted as lambdas … (context: {window, url, cookies}) => {} … In this config yaml we can also
add other things like timeouts etc. … we can also add fixes per PAGE as we have url in the hook.
So we can regex on it." Later the same day: "Add allowed and disallowed array for urls.
Accepting urls and regex. I want to be able to exclude urls from scan … By default allowed is
all, but if overwritten only these in allowed array will be traced."

Decisions taken in the session: the hook context has two parts (crawler side: `url`, `persona`,
`cookies`, `route()`, `config`; page side: `ctx.inPage(fn)` for `window`); a small typed return
contract; no guard limits on hooks (spec 021 removed the production guard), but every hook run
is traced; portal YAML also overrides crawl timeouts, optionally per URL regex; `hooks.ts` ships
in the export-fork export; URL lists replace `allowed_paths` and the `url:`/`path:` denylist
entries.

## Problem

Real portals have quirks the generic crawler should not special-case: a consent cookie that must
exist before the first page, a script that breaks in headless Chromium, a micro-frontend that
needs a longer wait on one route, a modal after login, a page that must never be opened. Today
the only places for such fixes are the generic pipeline (which must stay portal-agnostic) or
the portal YAML (which has no way to run code and only globs for paths). Excluding a URL needs
two different mechanisms (`allowed_paths` globs and `url:`/`path:` denylist entries), neither
of which takes a regex.

## User stories

### US1 Per-portal lifecycle hooks — P1

A developer fixes a portal's quirk in that portal's folder, without touching the crawler.

1. **Given** `portals/<id>/hooks.ts` exporting a function and the portal YAML mapping
   `onRunStart` to it, **when** a run starts, **then** the function runs once, after the browser
   context is created and before the first navigation and the login step, with `ctx.cookies`,
   `ctx.route()`, `ctx.addInitScript()` and `ctx.config` available.
2. **Given** a hook mapped to `onBeforePageLoad` with `match: "/kalkulator/.*"`, **when** the
   crawler is about to open a matching URL, **then** the hook runs first and may return
   `{ url }` (open this instead) or `{ skip: true, reason }` (do not open; recorded as a skipped
   item with the reason).
3. **Given** a hook mapped to `onPageLoad`, **when** a matching page has loaded and before it is
   settled and observed, **then** the hook runs and may patch the page via `ctx.inPage(fn)`.
4. **Given** a hook mapped to `onBeforeClickAction`, **when** the crawler is about to act on a
   matching page, **then** the hook gets the action (role, name, locator) and may return
   `{ skip: true, reason }` or `{ waitFor: selector }`.
5. **Given** a hook mapped to `onRunEnd`, **when** the run finishes (any outcome), **then** the
   hook runs once before the context closes.
6. **Given** a hook throws or times out, **then** the run records a hook failure (warning, trace
   span, decision note) and continues; a hook never crashes the crawl.

### US2 Every hook run is visible — P1

1. Each hook run is a trace span (`hook:<point>:<name>`) with the matched URL, duration, outcome
   and what it changed (cookies set, scripts added, routes registered, return value).
2. Each page a hook patched carries a "patched by hook" note in its evidence, so the BA does not
   document a patch as the portal's own behaviour.
3. The dashboard run page lists the hooks that ran.

### US3 URL lists — P1

1. **Given** no `urls.allowed`, **then** every URL inside `allowed_domains` is in scope.
2. **Given** `urls.allowed` set, **then** only URLs matching an entry are scanned (navigated,
   clicked, queued).
3. **Given** `urls.disallowed`, **then** a matching URL is never opened or clicked, even when it
   also matches `allowed`; the link is still recorded as a skipped edge "excluded by rule
   <entry>". Requests the page makes in the background are not blocked.
4. Entries are a plain URL or glob (`https://www.liveinsurer.example/kontakt*`, `/konto/*`) or a regex in
   slashes (`/\/polisa\/\d+\/druk/`); an invalid regex is a config error naming the entry.
5. Existing `allowed_paths` and `url:`/`path:` denylist entries are migrated into the lists in
   every portal file; the old keys are removed; rule-id denylist entries (e.g. `logout`) and
   `allowed_domains` stay. Persona scope restrictions and a scan's excluded paths (spec 011
   FR-017) keep narrowing the lists.

### US4 Per-portal and per-page timeouts — P2

1. The portal YAML may override the crawl timeouts that exist today (settle, navigation,
   micro-frontend wait `mfe_wait_ms`, client redirect wait `client_redirect_wait_ms`) for the
   whole portal or per URL pattern (first match wins).
2. The effective timeouts of each page are recorded in its trace span.

### US5 Hooks travel to the field — P3

1. The export-fork export carries `hooks.ts` files and the hook runner, renamed and
   leak-checked like the rest.

## Edge cases

- A hook mapped in YAML whose function `hooks.ts` does not export → config error at run start.
- `hooks.ts` that does not compile → config error with the compiler message; no run starts.
- A `{ url }` rewrite to a disallowed or out-of-domain URL → refused like any navigation.
- Two hooks for the same point and URL → run in YAML order; the first `skip` wins.
- `ctx.inPage(fn)` closing over Node variables → documented; arguments are passed explicitly.
- A login re-run (relogin) does not re-run `onRunStart`; an `afterLogin` point is out of scope
  for v1 (may be added).
- A hook that hangs → per-hook timeout (default 10 s, configurable), recorded as a failure.

## Requirements

- **FR-001**: Hook points v1: `onRunStart`, `onBeforePageLoad`, `onPageLoad`,
  `onBeforeClickAction`, `onRunEnd`, each mapped onto one place in the crawl pipeline
  (documented in the plan).
- **FR-002**: Hooks live in `portals/<id>/hooks.ts`; the portal YAML maps hook points to
  exported function names with an optional `match` (URL glob or `/regex/`) and `timeout_ms`.
- **FR-003**: The hook context: `url`, `persona` (id and attributes), `environment`, `run`
  (id, mode), `cookies.get/add/clear`, `route(pattern, handler)`, `addInitScript(fnOrPath)`,
  `inPage(fn, args)`, `config` (the portal's effective config, read-only), `log(msg)`.
- **FR-004**: Return contract, validated: `onBeforePageLoad` → `void | { url } | { skip, reason }`;
  `onBeforeClickAction` → `void | { skip, reason } | { waitFor }`; others → `void`. Anything else
  is a hook failure.
- **FR-005**: A hook failure never stops the run; it is recorded (span, decision note, run
  warning).
- **FR-006**: Every hook run is a trace span and a decision-log entry; pages a hook patched are
  marked in their evidence.
- **FR-007**: `urls.allowed` / `urls.disallowed` as in US3; migration of every portal file and
  the persona/scan narrowing as in US3.5.
- **FR-008**: Timeout overrides as in US4, validated with the existing bounds.
- **FR-009**: The crawler agent never writes hooks; it MAY file an open question suggesting
  one.
- **FR-010**: The export-fork export includes hooks (US5).

## Success criteria

- **SC-001**: A proving-ground gate where a page only works with a cookie and an init-script
  patch passes with a hook and fails without it.
- **SC-002**: A gate where a disallowed regex URL is linked from a scanned page: never opened,
  recorded as skipped with the rule.
- **SC-003**: A gate where `urls.allowed` limits a scan to one section: no state outside it.
- **SC-004**: Every portal file loads after migration; every existing gate passes unchanged.
- **SC-005**: A throwing hook leaves the run completed with one recorded hook failure.

## Assumptions

- Hook files are TypeScript loaded with the crawler's existing TS runtime (tsx); no build step.
- Hooks are trusted code written by the owner; there is no sandbox (spec 021).
- One portal-agnostic crawler agent: hooks are invisible to the agent except through their
  effects and the "patched by hook" notes.
