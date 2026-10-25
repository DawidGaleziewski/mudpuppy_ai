# ADR-0008: A server-rendered htmx dashboard

- **Status:** Superseded by [ADR-0023](0023-the-console-is-a-react-single-page-app.md)
- **Date:** 2026-09-25 (spec 003)

## Context

R-12 asked for a light, read-only dashboard over the crawl store with three screens and live
updates. The user asked for "light htmx".

## Decision

- Jinja2 templates rendered by FastAPI; htmx 4.0 for in-place fragment swaps (filters,
  pagination, live refresh), vendored under `static/vendor/`. Fragments are the same templates as
  the full page.
- Live updates over SSE: the server emits `store-changed`, live regions re-fetch themselves.
- The choice was confirmed later: spec 022 (2026-10-13) kept "no client framework" for the Salvage
  Yard redesign, and for the generative-UI Workbench the designer's ADR-WB-1 (2026-10-21)
  recommended htmx + server templates; the owner answered "htmx as designed" on 2026-10-22
  (spec 043).

## Consequences

- Good: no JS build, no client state, one language on the server.
- Bad: rich client state (pan/zoom, multi-select) needed hand-written islands (ADR-WB-1 § 1.5).
- Bad: by R-100 the React console still linked out to htmx pages, and every htmx page scanned
  `eval_root` about 55 times per render (1.3 s+); the owner then retired htmx (ADR-0023).

## Alternatives considered

- htmx 2.x with `htmx-ext-sse`: stable, but 4.0 was released and moving later would be a
  migration.
- A SPA (React/Vue): rejected as out of proportion for three read-only screens.
- In ADR-WB-1: React + Vercel AI SDK, React + a generative-UI kit, a JSON → client renderer.

## Sources

- `specs/003-dashboard-ui/research.md` §1, §3
- `specs/022-salvage-redesign/plan.md` (Constraints: "no client framework")
- `docs/design/salvage-yard/docs/17-genui-architecture.md` § 1 (ADR-WB-1)
- `specs/043-r92-workbench-genui/spec.md` (owner answers 2026-10-22)
- `roadmap.md` R-100
