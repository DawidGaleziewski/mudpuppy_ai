# Implementation Plan: Map graph and differing states

**Branch**: `feature/033-r69-map-graph-and-reconcile` | **Date**: 2026-10-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/033-map-graph-reconcile/spec.md`

## Summary

A read-only Map page in the dashboard (Scans ▸ Map) draws every screen of a portal as a node and
the discovery tree of transitions, with failed, blocked and queued items, filters, an inspector,
a list view, and Probe marks through the existing route (R1–R5, R9). Differing-states groups are
computed by a new BA tool from the store; the BA proposes verdicts (stored in a new
`reconciliations` table); the owner confirms them in a new Review kind through a chat-service
route (R6–R9). The design package and runtime design system are refreshed first (R10).

## Technical Context

**Language/Version**: Python 3.13 (dashboard, FastAPI + Jinja + htmx); TypeScript (Node 24) for
the BA tools (`@pathfinder/mcp-server`), the chat route (`apps/chat`), the Zod model
(`@pathfinder/docs-model`) and the store (`@pathfinder/store`).

**Primary Dependencies**: existing only (FastAPI, Jinja, htmx; MCP SDK, Zod, Kysely). No new
library (A-3).

**Storage**: SQLite; one new table `reconciliations` (migration 0025, db-admin, G-16).

**Testing**: pytest (dashboard: layout unit tests on fixtures, route tests, a perf test of 300
screens); Vitest (group rules on a fixture store, tool validation, chat route); a gate file with a
new scar SC-20 (a page that fails on its first visit) for SC-005; an eval check for SC-007.

**Target Platform**: local dashboard and chat service (Linux/WSL, browser at 1280 and 390 px).

**Project Type**: monorepo apps (dashboard, chat, crawler packages).

**Performance Goals**: map of ~60 screens < 2 s, 300 screens < 4 s (SC-002).

**Constraints**: dashboard read-only (`mode=ro`), writes through the chat service; Salvage Yard
classes only (`sy-`, product layout `mp-`); at most one primary button and one intent plate per
view; G-01–G-34.

**Scale/Scope**: five test portals (20–63 screens), field portals up to a few hundred screens.

## Constitution Check

| Principle | Check | Result |
|---|---|---|
| I. Observed vs intent | verdicts are BA proposals (`inferred`) until a person confirms; the map shows recorded facts only | pass |
| II. Evidence and traceability | each outcome in a group carries its scans and evidence; a proposal stores the snapshot it reasoned on | pass |
| III. Role separation | the system finds groups; the BA reasons; the owner confirms; the crawler is untouched | pass |
| IV. Replay before promotion | not affected (no new process promotion) | n/a |
| V. Safety-first | no browser action added; Probe marks unchanged (spec 032 rules) | pass |
| VI. Human in the loop | confirm step in Review (D-2) | pass |
| VII. Deterministic core | layout and group rules are pure functions over rows, unit-tested on fixtures | pass |
| Technical: dashboard read-only | reads with `mode=ro`; marks and confirmations go through the chat service | pass |

Re-checked after Phase 1 design: no change.

## Project Structure

### Documentation (this feature)

```text
specs/033-map-graph-reconcile/
├── plan.md  research.md  data-model.md  quickstart.md
├── contracts/map-page.md  contracts/reconcile-tools.md
├── checklists/requirements.md
└── tasks.md   (next: /speckit-tasks)
```

### Source Code

```text
docs/design/salvage-yard/                      # refreshed from the owner's package (R10)
apps/dashboard/src/pathfinder_dashboard/
├── static/salvage/css/salvage.css             # refreshed (map graph classes)
├── map_layout.py                              # pure layout: depth, layers, positions, families (R2, R4)
├── queries_map.py                             # nodes, edges, queued, marks, filters (read models)
├── queries_reconcile.py                       # Review items from `reconciliations`
├── web/map.py                                 # /map, /fragments/map/node/{id}
├── web/review.py, queries_review.py           # kind "differing", confirm forwarding
├── web/states.py                              # probe-mark `back`
├── templates/salvage/map.html, partials/map_*.html, partials/review_differing.html
├── static/js/map.js                           # selection, arrows, zoom
└── models.py                                  # Reconciliation read model
apps/crawler/packages/
├── docs-model/src/reconcile.ts                # verdict, hypothesis, proposal schemas
├── store/ (db-types, portal-data)             # reconciliations table (db-admin)
├── mcp-server/src/services/ba/differing-states.ts, reconcile.ts
├── mcp-server/src/ba-tools/index.ts           # list_differing_states, propose_verdicts
└── gates/tests/scars-differing.test.ts
apps/scar-maker/src/scars/sc20-flaky-page.ts   # a page that fails on its first visit
apps/chat/src/reconciliations.ts, api-reconciliations.ts
data/migrations/0025_reconciliations.{up,down}.sql, data/schema/schema.sql
.claude/agents/ba.md, .claude/skills/ba-practice/SKILL.md  # documentation rules FR-016
apps/crawler/evals/…                           # check no_error_page_as_step
```

**Structure Decision**: follow the existing patterns: a dashboard page per G-15 with its layout as
a separate pure module (testable without a store), BA tools per G-14, a chat route like
`api-marks.ts`, schema per G-16.

## Complexity Tracking

None: no constitution violation.
