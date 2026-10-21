# Implementation Plan: Crawler hooks and URL lists per portal (R-53)

**Branch**: `feature/023-r53-crawler-hooks` | **Date**: 2026-10-14 | **Spec**: [spec.md](spec.md)

## Summary

Three parts, one branch, one close-out:

| Part | What | Stories |
|---|---|---|
| P1 | URL lists `urls: { allowed, disallowed }` replace `scope.allowed_paths` and the `url:`/`path:` denylist entries; every portal file migrated; skipped edges "excluded by rule" | US3 |
| P2 | Hooks: `portals/<id>/hooks.ts` + `hooks:` in the portal YAML; loader, runner, five hook points in the pipeline, traced, never fatal | US1, US2 |
| P3 | Timeouts per portal and per URL pattern; dashboard lists hooks that ran | US4 |

Owner decisions 2026-10-14 (memory `r42-r43-r53-r33-kickoff`): no `afterLogin` in v1; per-hook
timeout default 10 s; hooks run in every run (CLI, chat, gates); old keys removed outright, no
deprecation period.

## Technical context

- TypeScript (crawler packages), Zod schemas in `@pathfinder/config`, the pipeline in
  `@pathfinder/mcp-server` `runtime/`, tracing in `@pathfinder/store` (tracer spans + events).
- Hook files are TypeScript loaded with `import()` under tsx (the MCP server, gates and the chat
  service already run under tsx; no build step).
- Tests: config + safety unit tests (fast tier); hook runner unit tests with a fake page; e2e on
  the mock portal (`*.e2e.test.ts`); proving-ground gates for SC-001..SC-003, SC-005.

## Design

### URL lists (P1)

```yaml
urls:
  allowed:          # optional; absent = everything inside allowed_domains
    - /konto/*               # path glob (starts with /)
    - https://www.liveinsurer.example/kontakt*   # absolute URL glob
    - /\/polisa\/\d+/        # regex in slashes, tested against the full URL
  disallowed:
    - /__admin/*
```

- Matching (`safety/src/url-lists.ts`, pure): an entry starting `/` and ending `/` with length > 2
  and a valid regex body is a regex on the full URL; an `http(s)://` entry is a glob on the full
  URL; any other entry starting `/` is a glob on path + query (the old `url:` meaning; a glob
  without `?` also matches the bare path). `*` matches any run of characters, case-insensitive.
  An invalid regex is a config error naming the entry (schema `superRefine`).
- Order: domain check → `disallowed` (wins) → `allowed` (when present) → persona narrowing → scan
  focus. Refusal `rule` is `urls.disallowed[i] <entry>` / `urls.allowed (no entry matches)`.
- `scope.allowed_paths` and `denylist` `path:`/`url:` entries are removed from the schema. Rule-id
  denylist entries and `allowed_domains` stay. Persona `allowed_paths` (narrowing) and scan focus
  `only_paths`/`exclude_paths` stay and keep narrowing.
- Links: a link whose target the lists exclude is recorded as a skipped edge with
  `error.reason = "excluded by rule <entry>"` and never enqueued; background requests are not
  blocked (the request gate checks domains/robots only, as today).
- Migration: every `portals/*/portal.yaml` (and the proving ground's, the chat's new-portal
  template `apps/chat/src/portals.ts`, gate fixtures, test fixtures): `allowed_paths: ["/*"]` →
  no `allowed`; other `allowed_paths` → `urls.allowed`; `path:`/`url:` denylist entries →
  `urls.disallowed`. The dashboard Settings "Crawl rules" reads the new keys.

### Hooks (P2)

```yaml
hooks:
  - point: onRunStart          # onRunStart | onBeforePageLoad | onPageLoad | onBeforeClickAction | onRunEnd
    fn: acceptConsent          # an export of portals/<id>/hooks.ts
  - point: onPageLoad
    fn: patchCalculator
    match: "/kalkulator/*"     # glob or /regex/, as in the URL lists; absent = every page
    timeout_ms: 5000           # default 10000
```

```ts
// portals/<id>/hooks.ts
import type { Hook } from '@pathfinder/hooks';
export const acceptConsent: Hook<'onRunStart'> = async (ctx) => {
  await ctx.cookies.add([{ name: 'consent', value: '1', url: ctx.config.base_url }]);
};
```

- New package `@pathfinder/hooks` (layer: features, beside `crawler`): `types.ts` (points,
  `HookContext`, return contracts as Zod), `load.ts` (import the file, check every YAML `fn` is
  an exported function, compile `match`), `run.ts` (`runHooks(point, url, input)`: matching hooks
  in YAML order, each in a traced span `hook:<point>:<fn>` with the matched URL, duration,
  outcome and what it did; timeout; a throw/timeout/invalid return is recorded as a failure and
  the crawl continues; for `onBeforePageLoad` / `onBeforeClickAction` the first `skip` wins, a
  `{url}` rewrite is then checked by the normal scope gate).
- Context: `url`, `point`, `persona {id, attributes}`, `environment`, `run {id, mode}`, `config`
  (effective portal config, frozen), `cookies.get/add/clear`, `route(pattern, handler)` and
  `addInitScript(fnOrPath)` (on the browser context, recorded), `inPage(fn, ...args)` (page.evaluate;
  arguments passed explicitly), `log(msg)` (into the span), plus `action` for
  `onBeforeClickAction` (role, name, locator kind/value).
- Return contracts: `onBeforePageLoad` → `void | {url} | {skip: true, reason}`;
  `onBeforeClickAction` → `void | {skip: true, reason} | {waitFor: selector}`; others → `void`.
- Pipeline points: `onRunStart` in `browser-runtime.openSession` after the context exists, before
  the first navigation and the login step (not again on relogin or resume of the same session);
  `onBeforePageLoad` in `navigate` before `goto` (and for `act`-driven navigations? no: only
  navigate items, v1); `onPageLoad` after `goto`, before `settle`; `onBeforeClickAction` in `act`
  after locating, before `perform`; `onRunEnd` before the session closes (finish, stop, crash
  path best effort).
- Visibility: a decision-log note per hook run (`hook:<point>:<fn>`, outcome), the span, and a
  "patched by hook" note on the observed state when an `onPageLoad` hook ran on that page
  (decision with state id) so the BA tools see it (`get_run_evidence` decisions). Dashboard run
  page: a "Hooks" list from the spans.
- No guard limits on hooks (spec 021); the crawler agent never writes hooks (FR-009): its brief
  says to file an open question suggesting one.

### Timeouts (P3)

```yaml
timeouts:
  settle_ms: 8000
  navigation_ms: 30000
  mfe_wait_ms: 10000
  client_redirect_wait_ms: 5000
  per_url:
    - match: "/kalkulator/*"
      settle_ms: 15000
```

`scope.mfe_wait_ms` and `scope.client_redirect_wait_ms` move into `timeouts` (removed from
scope, migrated). Bounds as today (Zod). `effectiveTimeouts(config, url)`: first `per_url` match
wins over the portal values over the defaults; recorded on each page's trace span.

## Constitution check

- Principle II (evidence): every hook run is a span and a decision; patched pages are marked.
- Spec 021: no guard on hooks. The agent stays one portal-agnostic agent: hooks are portal config.
- G-07 layers: `hooks` sits in features (uses config, store tracer types); mcp-server runtime
  calls it; no upward imports.

## Risks

- Portal file migration touches every portal and fixture: one task, with `pnpm portal:check` over
  all portals and the full fast tier + gates.
- `import()` of a user TS file in vitest/gates: tested in the hook loader tests with a fixture.
