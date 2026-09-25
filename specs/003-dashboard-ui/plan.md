# Implementation Plan: Dashboard UI

**Branch**: `feature/003-r12-dashboard-ui` | **Date**: 2026-09-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-dashboard-ui/spec.md`

## Summary

A local, read-only operator dashboard over the crawl store (`data/db/<env>.sqlite`). A Python app
in `apps/dashboard/` (uv, FastAPI, Pydantic v2) renders server-side HTML with Jinja2; htmx 4 swaps
fragments for filters and pagination; one Server-Sent Events stream tells open pages when the
store changed (SQLite `PRAGMA data_version`), and each live region re-fetches its own fragment.
The UI applies the Console design system from `user_input/ux-package`, installed as the
`revamp-dashboard` skill, with a new `frontend-dev` agent that owns UI work from now on.

## Technical Context

**Language/Version**: Python 3.13 (uv-managed, `requires-python >=3.13`)

**Primary Dependencies**: FastAPI (with native `fastapi.sse`), Pydantic v2, Jinja2, uvicorn;
htmx 4.0 + its `hx-sse` extension, vendored as static files (no CDN at runtime); JetBrains Mono
self-hosted (woff2, latin + latin-ext subset for Polish titles)

**Storage**: existing SQLite crawl store, opened read-only (`file:…?mode=ro`, `query_only=ON`);
no new tables, no migration

**Testing**: pytest + FastAPI `TestClient` (httpx); fixture stores built from
`data/migrations/*.up.sql`; ruff for lint and format

**Target Platform**: local operator machine (Linux/WSL), modern evergreen browser

**Project Type**: web app (server-rendered, hypermedia), one self-contained app under `apps/`

**Performance Goals**: every page < 1 s on the current store and on a synthetic store with
10 000 frontier items (SC-005); store change visible < 3 s (SC-003)

**Constraints**: never writes the store (FR-001, SC-004); binds `127.0.0.1` (FR-012); motion
budget of three animations (design system); WCAG AA

**Scale/Scope**: 1 operator, a handful of environments, runs with up to ~10⁴ actions/frontier
items; 3 screens (overview, runs, run detail) plus shared partials

## Constitution Check

*GATE: checked before Phase 0 and again after Phase 1.*

| Principle / constraint | Status | How this plan complies |
| --- | --- | --- |
| I. Observed vs intent | Pass | The dashboard shows each record's own `confidence`; it never adds or upgrades a label. |
| II. Evidence and traceability | Pass | FR-005: confidence and `evidence_ref` shown on every record that has them. |
| III. Role separation | Pass | Read-only viewer, not an agent; no browsing, no interpretation. New `frontend-dev` agent writes UI code only. |
| IV. Replay before promotion | N/A | Nothing is promoted. |
| V. Safety-first (NON-NEGOTIABLE) | Pass | Touches no portal. Store opened `mode=ro` + `query_only`, so it cannot take a write lock on the crawler's DB (research §2). |
| VI. Human-in-the-loop | N/A (v1) | Read-only; approval screens come with the BA feature. |
| VII. Deterministic core | Pass | Query and summary functions are pure over a connection and unit-tested against fixture stores. |
| App layout / Python tooling | **Amend** | The constitution put Python "under `python/`"; the rule is that every app, in any language, lives in `apps/<name>/` (user decision, 2026-09-25). T003 adds an "App layout" bullet and allows a read-only dashboard to read the store over `mode=ro` (MINOR 1.2.0 → 1.3.0). Python stays off the crawler's runtime path and never writes the DB. |
| Schemas: Zod single source of truth | Pass (justified) | Zod stays the truth for agent output, MCP inputs and **writes**. The dashboard only reads; its Pydantic read models mirror the tables and a test fails on drift against the migrations (FR-015, research §4). |
| Agent interface: DB only via MCP | Pass | Applies to agents; the dashboard is operator tooling and does not act as an agent. |
| Storage: SQLite | Pass | No second store. |

Post-design re-check (after Phase 1): unchanged, no new violations. Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/003-dashboard-ui/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── http-routes.md     # pages, fragments, SSE stream
│   └── ui-conventions.md  # entity→accent mapping, status language, live regions
├── checklists/requirements.md
└── tasks.md
```

### Source Code

```text
apps/dashboard/
├── pyproject.toml            # uv project, ruff + pytest config
├── uv.lock
├── README.md                 # how to run (dev and normal)
├── src/pathfinder_dashboard/
│   ├── __init__.py
│   ├── __main__.py           # `uv run pathfinder-dashboard` → uvicorn on 127.0.0.1
│   ├── settings.py           # Pydantic settings: data dir, env, host/port, dev flag
│   ├── db.py                 # read-only connection factory, store discovery, data_version
│   ├── models.py             # Pydantic read models mirroring data/schema/schema.sql
│   ├── queries.py            # pure query + summary functions (connection in, models out)
│   ├── live.py               # SSE stream: store-changed + dev boot id
│   ├── app.py                # FastAPI app factory, routes, template env, static mount
│   ├── templates/
│   │   ├── base.html         # shell: nav, mark, live status, htmx + hx-sse
│   │   ├── overview.html
│   │   ├── run_detail.html
│   │   └── partials/         # one file per live region / component
│   └── static/
│       ├── css/tokens.css    # Console tokens as custom properties (only source of values)
│       ├── css/app.css       # primitives → patterns → screens, tokens only
│       ├── js/live.js        # connection-lost banner, dev reload (≈30 lines)
│       ├── vendor/htmx.min.js, vendor/hx-sse.min.js
│       └── fonts/JetBrainsMono-*.woff2
└── tests/
    ├── conftest.py           # fixture store builder from data/migrations
    ├── test_models_schema.py # drift: model fields == table columns
    ├── test_queries.py
    ├── test_routes.py
    ├── test_readonly.py      # store hash unchanged; writes refused
    ├── test_live.py
    ├── test_tokens.py        # app.css: tokens only, no literal colours/radii
    └── test_perf.py          # SC-005: every page < 1s on a 10k-item store

.claude/agents/frontend-dev.md
.claude/skills/revamp-dashboard/          # installed from user_input/ux-package
└── references/pathfinder-console.md      # product layer: name, mark, accents, htmx patterns
```

**Structure Decision**: one self-contained app, `apps/dashboard/`, beside `apps/crawler/`, per the
governor layout (own manifest, lockfile, lint and tests; nothing at the repo root). Server-rendered
HTML means no separate frontend build: the "frontend" is `templates/` + `static/` inside the app.

## Complexity Tracking

No unjustified violations.
