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

## Timeouts (`timeouts`, spec 023 US4)

```yaml
timeouts:
  settle_ms: 8000                # page settle, default 10000
  navigation_ms: 30000           # default 30000
  mfe_wait_ms: 10000             # default scope.mfe_wait_ms
  client_redirect_wait_ms: 5000  # default scope.client_redirect_wait_ms
  per_url:
    - match: "/kalkulator/*"     # first match wins
      settle_ms: 15000
```

Without `timeouts` nothing changes. With it, each page's timeouts are recorded in a
`page_timeouts` trace event.

A BA adds a portal without editing files: **"+ new portal"** in the dashboard's portal dropdown
(spec 011). It writes `portals/<id>/portal.yaml` (sandbox or staging, robots ignored by default,
forms may be submitted, the address's domain and its subdomains in scope) and a `guest` persona.
