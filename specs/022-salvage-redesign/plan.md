# Implementation Plan: Salvage Yard redesign with versioning (R-43 + R-44)

**Branch**: `feature/022-r43-salvage-redesign` | **Date**: 2026-10-13 | **Spec**: [spec.md](spec.md)

## Summary

Six milestones on one branch; each ends green and is merged to master behind `UI_SALVAGE`
(interim merge), the full close-out runs once at the end.

| M | What | Merge |
|---|---|---|
| M1 | Foundation + shell + Track 1 re-skin of every page; the skill and the style guard | interim 1 |
| M2 | Versioning backend (R-44): screen identity and observed revisions, revisioned amendments with re-anchoring, the revision write path in the chat service | interim 2 |
| M3 | Chat first: Home as assistant, the drawer with page context, assistant page tools, proposals with Apply/Undo | interim 3 |
| M4 | Review inbox, Scans monitor, Settings and credentials (screens 09–11), screen detail (08) | interim 4 |
| M5 | Processes workspace: list and groupings, variants and to-be drafts, compare and change spec, history and live per environment, conflicts (screens 04–07) | interim 5 |
| M6 | Clean-up: Console styles and the flag removed, visual baselines, axe pass, close-out | final |

## Technical Context

**Language/Version**: Python 3.12 (dashboard: FastAPI, Jinja, htmx); TypeScript (chat service, crawler store/migrations)
**Primary Dependencies**: the Salvage Yard CSS library (plain CSS, cascade layers, no build), htmx + SSE (existing), Playwright (screenshots), axe-core (vendored for the accessibility check)
**Storage**: SQLite; new migrations via `db-admin` (G-16): screens + screen_revisions, amendment revisions, BA processes (variants, revisions, live marker, groupings, change specs), proposals
**Testing**: pytest (routes, queries, status map, DOM checks FE-V07/V09), chat service Vitest, crawler fast/slow tiers for the observation→revision step, Playwright screenshots + axe at 1280/390
**Target Platform**: local dashboard (127.0.0.1:8765) + chat service (127.0.0.1:4310)
**Constraints**: dashboard stays read-only on the store; every write goes through the chat service (FR-011); no client framework; offline fonts
**Scale/Scope**: ~20 templates, 7 sections, 11 target screens, ~6 migrations

## Key design decisions (research.md has the alternatives)

1. **Flag**: `PATHFINDER_UI_SALVAGE` = `all` | comma list of route names; a route renders with
   `base_salvage.html` when on, else `base.html`. Never both stylesheets on one page.
2. **Helpers**: Jinja filters/macros `status(enum)` from one `status_map.py` (tested against
   `status-map.csv`), `tag(record)` (record knows its URL), `note(text, by, at)`, `utc(ts)`.
3. **Screen identity (FR-003)**: `screens(portal_id, route_template, cluster_id)` groups states;
   a state is one observed revision of a screen (`screen_revisions`: screen_id, state_id, rN,
   first_run). The crawler keeps fingerprinting as today; the revision link is written when a
   state is recorded (pipeline `record-state`), and backfilled by migration for existing states.
   Persona variants (R-33) will add a persona axis on the same table.
4. **Revisions (FR-004/005)**: append-only `*_revisions` rows (entity_id, rev, base_rev, author,
   created_at, body JSON); the "current" view is the max rev. A write states its base rev; a
   stale base returns 409 with the latest, which the UI shows as the conflict notice.
   Amendments: `superseded` becomes `needs_reanchor` (a revision), carried forward otherwise.
5. **BA processes** are a new entity (`ba_processes`, `process_variants`, `process_revisions`
   with steps JSON referencing screens, `process_live` per environment, `grouping_suggestions`
   with dismissals, `change_spec_revisions`), distinct from the crawler's trace `processes`.
6. **Chat page context (FR-006)**: each message carries `context` + ids; the chat service adds MCP
   chat tools `page_context` (read), `highlight_element`, `open_page`, `propose_change`;
   highlight/open reach the browser as SSE events the drawer handles; `propose_change` stores a
   proposal (a pending revision) that the BA applies through the same write path.
7. **Groupings (FR-007)**: the assistant drafts them from recorded screens and trace processes
   (an MCP tool listing screens and edges), stored as suggestions; accept creates A r1.
8. **Change spec (FR-008)**: generated server-side from the A/B diff and linked records, stored
   as revisions, exported as Markdown, saved to Docs as a doc record.

## Constitution Check

| Principle | Check |
|---|---|
| Product rule (5.0.0) | To-be is drawn by people; the assistant only proposes (proposals change nothing until applied). Recorded evidence is never edited: revisions sit beside observations. |
| II Evidence | Screen revisions point at the observing runs; change specs cite records. |
| VI Human-in-the-loop | Apply/Undo, Accept/Dismiss, Mark live are human actions. |
| G-13/G-15/G-16 | One router per section; queries in `queries_*`; migrations through `db-admin`. |

## Project Structure

```text
docs/design/salvage-yard/                 the package (reference)
.claude/skills/mudpuppy-salvage-ui/       the frontend skill
apps/dashboard/src/pathfinder_dashboard/
├── static/salvage/{css,fonts}/           tokens.css, fonts.css, salvage.css, app-salvage.css (mp-)
├── templates/salvage/                    base, header/nav partials, one template per section/screen
├── web/{home,processes,screens,review,scans,settings}.py   new section routers (existing ones restyled)
├── status_map.py, ui_flag.py, queries_processes.py, queries_revisions.py
apps/chat/src/                            page-context, proposals, revisions, processes write API + MCP tools
apps/crawler/packages/mcp-server/src/runtime/pipeline/record-state.ts   screen revision link
data/migrations/0015_*.sql …              via db-admin
```
