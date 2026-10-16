# @pathfinder/doctor

First-start diagnosis of a portal's environment (spec 030 R-63, field GC-02..GC-07, GC-12): a
registry of checks, each with the cause and the one-line fix it prints.

Layer: features (G-07; `apps/crawler/layers.json`). Depends on config; loads better-sqlite3 and
Playwright only to test that they work.

## Public API

- `CHECKS` (in run order), `runChecks(checks, ctx)`, `formatReport(rows)`, `httpProbe` (GET
  directly or through an HTTP proxy, absolute-form or CONNECT; never throws). Used by
  `apps/crawler/scripts/doctor.ts` (`pnpm portal:doctor <portal> [--env]`).

## Checks

- `checks/local.ts`: `env.declared`, `toolchain.sqlite`, `browser.launch`.
- `checks/network.ts`: `net.reach` (TLS inspection, DNS), `waf.user-agent`, `net.proxy`,
  `net.ip-allowlist`, `robots.proxy`.

## Invariants

- A check reads the portal file's values, never client data in code; probes are read-only GETs.
- A check that throws is reported as failed; dependencies that did not pass make a check skip.

## Where to add things

- New check: a `Check` in `checks/`, a line in `CHECKS` (order matters: later checks read
  `ctx.facts` and `ctx.results`), a unit test with a fake `HttpProbe`.

## Tests

- `pnpm exec vitest run --project doctor` (from `apps/crawler`); tier: fast (local HTTP servers only).

## See also

- specs/030-battle-tested-scars, docs/portal-config.md (Network)
