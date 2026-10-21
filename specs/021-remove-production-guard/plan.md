# Implementation Plan: Remove the production guard; the to-be product rule (R-42)

**Branch**: `feature/021-r42-remove-production-guard` | **Date**: 2026-10-13 | **Spec**: [spec.md](spec.md)

## Summary

Make production behave like every other environment and drop the read-only default. Seven code
sites change, all in `apps/crawler/packages`: the default ceiling (`config/src/effective.ts`), the
production-address check (`safety/src/env-guard.ts`), the required rate limit
(`config/src/portal-schema.ts`), the placeholder User-Agent refusal (`crawler/src/preflight.ts`),
stopping on CAPTCHA (`crawler/src/session.ts`, `crawler/src/request-gate.ts`,
`mcp-server/src/runtime/handoff.ts`), Playwright traces only off production
(`mcp-server/src/runtime/pw-trace.ts`, `trace-config.ts`) and the unused `PRODUCTION_REFUSED`
code. Three portals that relied on the read default get an explicit `max_action_class: read`. The
constitution goes to 5.0.0 (Principle V without a production policy, plus the to-be product rule);
docs, specs, the glossary and code comments follow. Decisions are in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5 (Node 22) in `apps/crawler`; Python 3.12 in `apps/dashboard` (display of the Playwright-trace mode only)
**Primary Dependencies**: Zod (portal schema), Playwright (tracing, request gate)
**Storage**: SQLite; no schema change. The stored `pw_trace` boot mode keeps reading `non_production` from older runs
**Testing**: Vitest (fast tier + `pnpm test:slow`, since `mcp-server/src/runtime/**` and `crawler/src/**` change), pytest in `apps/dashboard`
**Target Platform**: Linux/WSL dev machine
**Project Type**: monorepo (crawler MCP server + dashboard)
**Performance Goals**: n/a
**Constraints**: no behaviour change for portals with an explicit limit; the trace-boundary gate keeps running
**Scale/Scope**: ~10 source files, ~15 test files, 3 portal files, constitution, ~6 docs/specs

## Constitution Check

| Principle | Check |
|---|---|
| V. Safety-First Exploration | **Amended by this feature** (MAJOR 4.0.0 → 5.0.0, user decision 2026-10-13). Classification of every action and enforcement of an explicit limit stay; the production policy goes. CAPTCHAs are still never solved by automation (handed to a human). |
| Human-in-the-loop, evidence | Unchanged; CAPTCHA hand-offs keep writing a decision note and an open question on every environment. |
| Testing section ("production targets are read-only") | Amended with V. |
| Monorepo / tooling | No new packages or apps. |
| G-31 code guidelines | Removal only; files get shorter. |

Gate: passes once the amendment lands in the same branch (T-group 1).

## Project Structure

### Documentation (this feature)

```text
specs/021-remove-production-guard/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/portal-config-delta.md
└── tasks.md
```

### Source Code (touched)

```text
.specify/memory/constitution.md                   Principle V, testing section, product rule
apps/crawler/packages/
├── config/src/effective.ts, portal-schema.ts     default ceiling; rate_limit refinement
├── safety/src/env-guard.ts                       production-address check
├── crawler/src/preflight.ts, session.ts, request-gate.ts
├── mcp-server/src/errors.ts, trace-config.ts, runtime/pw-trace.ts, runtime/handoff.ts, runtime/browser-runtime.ts
├── trace/src/schemas/trace-boot.ts               PwTraceMode keeps old value readable
└── **/tests                                      rewritten assertions
apps/dashboard/src/pathfinder_dashboard/          pw-trace mode label only
portals/{liveinsurer,marketsite,reference-insurer-readonly}/portal.yaml
docs/portal-config.md, docs/glossary/glossary.yaml, specs 001/002/011 (superseded notes)
```

## Complexity Tracking

None: the feature removes code paths.
