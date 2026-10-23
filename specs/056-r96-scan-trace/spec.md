# Spec 056: a scan's Trace and Process in React (R-96, step 7)

**Branch:** `feature/056-r96-scan-trace` · **Owner (2026-10-23):** "Proceed work as long as you can
without my help". The last two sections of the scan page move to React, so every link to a scan
stays in the React console.

## What this step builds

- **FR-001 Trace's API** (`web/api_scan_trace.py` over `queries_app_trace.py`):
  - `GET /api/scans/{id}/trace/summary`: the calls by tool and by status, the tokens, the trace
    levels, the trace's health (clean, or what was dropped, truncated, unfinished, unmatched, in
    words), the time per phase and the slowest calls; `has_trace` false when the scan has none.
  - `GET /api/scans/{id}/trace` (`tool` and `status` repeated, `problems`, `cursor`): one page of
    tool calls with their status, duration, the agent's stated rationale, the agent's tokens and
    preceding text (when the transcript is imported), the payload, the input as JSON text and the
    Playwright trace command; the tool and status options; the agent calls that never reached the
    server (first page only).
  - `GET /api/spans/{id}/children`: a call's phases (with their share of the time and their
    events) and its own events; each event's detail as label–value facts in the API's words (gate
    decision, robots check, request, block verdict, decision with its rule, fingerprint,
    frontier, stabilization timeout with what was still in flight, obstacle).
- **FR-002 Process's API**: `GET /api/scans/{id}/process`: a trace run's process (name, goal,
    persona, outcome mapped, observed result, boundary action, follow-up, times, what was not
    observable), its Mermaid diagram source and its steps; `process` null for a scan without one.
- **FR-003 The pages** `/app/scans/:scan/trace` and `/app/scans/:scan/process`: the summary plate
    and the calls, each call a disclosure that loads its phases when opened; the filters in the
    address; Problems only as a filter. Process: the facts, the diagram, the steps table.
- **FR-004 The design system** gains `Diagram`: a Mermaid source drawn as a picture in the Salvage
    Yard tokens (Mermaid is the dashboard's vendored copy, loaded only when a diagram is shown);
    until it is drawn, and if it cannot be, the source is shown as text.
- **FR-005 Moved, not changed:** `agent_context_for_run` and the process diagram leave the router
    `web/runs.py` for `queries_trace.py`, so the htmx page and the API share them (G-13).

## Not in this step

- The phase bar of the htmx page (an `mp-` class, not the designer's): phases show their share as
    a number; a bar is for the designer.

## Validation

- [x] `pnpm typecheck && pnpm lint && pnpm test` in `apps/web` (64 tests: the summary, a call's
      phases fetched only once it is opened, an event's facts and its decision-log link, a status
      filter asked of the API, no trace, a process with its map source, no process, Diagram drawing
      Mermaid's picture); `pnpm build`; `pnpm build-storybook`.
- [x] Dashboard: ruff and the whole suite; `tests/test_api_scan_trace.py` (agent context, the
      never-reached calls, events as facts including the in-flight lines and similarity, no trace,
      a trace run's process and a map run's none, 404s).
- [x] `pnpm --dir apps/dashboard ui:check` at 1280 and 390 px: Trace (and Problems only) and
      Process of a local-dev scan (109 calls), and a sandbox trace scan's process with its map: all
      pass. Found on the way: the diagram's text used `--sy-ink` and was near-invisible on the dark
      ground (now `--sy-text`).

## Close-out review: feature/056-r96-scan-trace (2026-10-23)

Files within G-01 (largest `queries_app_trace.py`, 369 lines); no complexity warnings on changed
lines; no SQL in routers, no router imports another (G-13: the shared scan helpers moved to
`api_common.py`, the trace helpers to `queries_trace.py`); pages compose only; `Diagram` sets HTML
only from Mermaid's output under `securityLevel: strict`.

| # | File:line | Guideline | Finding | Change | Size | Outcome |
|---|---|---|---|---|---|---|
| 1 | `apps/web/CLAUDE.md` Layout | G-30 | `api-scan-trace.ts`, `scanLinks.ts` and `Diagram`'s Mermaid dependency not in the notes. | Two lines added | small | fixed |

## Findings

- F-01 (not fixed, pre-existing): the process map's step labels (`1. fill: …`) render as
  "Unsupported markdown: list" in Mermaid, on the htmx page as well. The label comes from
  `diagrams.process_map`, byte-identical with the crawler's `docs/src/render/mermaid.ts` and the
  goldens in `specs/004-ba-documentation/contracts/diagram-fixtures/`; the fix (for example
  `1 · fill: …`) changes both builders, the goldens and the exported documentation together.
  Eval idea: a diagram golden that renders through Mermaid and fails on "Unsupported markdown".
