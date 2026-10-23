# mudpuppy-dashboard: file map

Where each part lives, by role. The agent notes (`CLAUDE.md`) keep the rules; this file keeps
the map (spec 042 T050, G-30). Since R-100 (spec 071) the dashboard has no pages of its own: it
is the JSON API the React console (`apps/web`) reads, the relay to the chat service, the evidence
files, and the console itself at `/app/`.

## The app

- `app.py`: only builds the app (settings, the `Web` object, `include_router` calls in a fixed
  order: health, evidence, the chat relay, every `web/api_*.py`, the console, then `legacy`).
- `web/deps.py`: `Ctx` (the store a request reads: `?store=` an eval workspace or `?env=`; on a
  model page's API `?as_of=` shadows it, `as_of.py`) and `Web` (settings, chat transport,
  glossary) on `app.state.web`; routers call `web_of(request)`.
- `web/spa.py`: serves `apps/web/dist` at `/app/` (hashed assets immutable, `index.html` never
  cached, any other path under `/app/` gets `index.html`; setting `web_dist`).
- `web/legacy.py`: a permanent redirect from every address before R-100 to its React page, so
  evidence links, exports, the assistant's links and bookmarks keep working (the portal from
  `?portal=` or the old `pf_portal` cookie).
- `web/health.py` (`/healthz`, the code fingerprint of `version.py`), `web/evidence.py`
  (`/evidence/{ref}`: screenshots, wireframes, layouts by content address, from the main store and
  every eval workspace), `smoke.py` (`mudpuppy-dashboard-smoke`: a running dashboard's API
  addresses answer).
- `settings.py`: runtime settings (`MUDPUPPY_*`); `stores.py`: the stores a request may open
  (main data dir + eval workspaces, chosen by key; `portals_in` cached per file write).

## The JSON API (`web/api_*.py`, one router per page, no SQL: G-15)

| Router | Addresses | Read model |
|---|---|---|
| `api_app` | `/api/portals`, `…/overview`, `…/{p}/home`, `…/{p}/scans`, `…/{p}/model-versions`, `/api/stores` | `queries_app`, `queries_app_all_portals`, `queries_app_home`, `queries_app_stores` |
| `api_screens`, `api_map` | `/api/portals/{p}/screens[/{key}]`, `…/map` | `queries_app_screens`, `queries_app_map` |
| `api_recorded` | `…/map/recorded[/{screen}]`, `…/screens/recorded` | `queries_app_recorded`, `queries_app_recorded_pages` |
| `api_state` | `/api/states/{id}`, `…/screens/{key}/recordings` | `queries_app_state`, `queries_app_state_side`, `queries_app_screen_recordings` |
| `api_same_screen` | `…/same-screen` (+ `/label`) | `queries_app_same_screen` |
| `api_scan`, `api_scan_tabs`, `api_scan_trace` | `/api/scans/{id}`, `…/graph`, its sections, trace (`…/trace/phases`: the phase bar) and process | `queries_app_scan`, `queries_app_scan_tabs`, `queries_app_trace`, `queries_app_trace_events`, `queries_app_trace_phases` over `queries_trace_phases` |
| `api_plan` | `…/scans/plan` (+ start), `/api/scans/{id}/recovery` | `queries_app_plan` |
| `api_processes`, `api_process`, `api_process_export` | the list and its writes; one process, Compare, History, the editor; the export | `queries_app_processes`, `queries_app_process`, `queries_app_process_editor`, `queries_app_process_compare`, `process_export` |
| `api_review`, `api_review_items` | `…/review` and its decisions, records, amendments, proposals, probe suites | `queries_app_review`, `queries_app_review_rows`, `queries_app_review_detail` |
| `api_changes` | `…/changes[/{id}]` | `queries_app_changes`, `queries_app_change` |
| `api_rules` | `…/rules[/{key}]`, Reword, the export | `queries_app_rules`, `rules_export` |
| `api_docs` | `…/docs`, a record, a session | `queries_app_docs`, `queries_app_doc`, `queries_app_doc_content`, `queries_app_doc_session` |
| `api_settings` | `…/settings` and its writes | `queries_app_settings`, `settings_forms` |
| `api_assistant` | `…/assistant` (the conversation as a timeline) | `queries_app_assistant`, `queries_app_timeline` |
| `api_lists` | Access by persona, Server activity, Search, Scans by process | `queries_app_lists` |
| `api_glossary` | `/api/glossary`, its pages, the BA wiki | `glossary` |
| `api_portal_new`, `api_errors` | `+ new portal`; an `ERR-…` reference | through the chat service |
| `api_amendments`, `api_writes` | amendments on a screen; marks, Skip, restarts | through the chat service |
| `api_workbench` | the Workbench page model, Send, Path, command cards, feedback | `workbench_model`, `queries_wb`, `queries_wb_scan`, `wb_render`, `wb_frames` |

- `web/api_common.py`: what the routers share (`store`, `known_portal`, `scan_store`, `page_at`).
- Every status leaves the API mapped (`status_map.py`: `{shape, word}`, `queries_app.StatusOut`).
- As of (spec 040 FR-001): `as_of.py` (`follows` names the model API addresses; TEMP views cut
  at the version's `built_at`, so the read models run unchanged).

## Writes (the dashboard never writes the store)

- `chat_client.py`: the server-side client of the chat service (`apps/chat`).
- `web/chat_writes.py`: every console write's answer and checks (`WriteResult` `{ok, message,
  href}`, `write_refused` for another origin, `chat_write`) and the shared mark / scan calls.
- `web/chat_relay.py`: the assistant's and the Workbench's relay (`/chat/conversations…`:
  create, messages, the event stream, credentials, cancel, reset); `web/chat_forward.py` its
  helpers; `web/review_calls.py` Review's model calls (decide, undo, Also settles);
  `review.py` runs `pnpm docs:review` for a record's review.
- `suite_form.py`, `settings_forms.py`: the bodies of a probe suite edit and of hints / budgets.

## Read models (`queries*.py`, read-only)

- The store's records: `queries.py` (scans, states, actions, frontier, forms, network, robots,
  decisions), `queries_docs.py`, `queries_chat.py`, `queries_urls.py`, `queries_hooks.py`,
  `queries_trace.py`, `queries_screens.py`, `queries_revisions.py`, `queries_proposals.py`,
  `queries_access.py` (checked against `apps/crawler/tests/fixtures/access/three-personas.json`),
  `queries_run_groups.py` (checked against `apps/crawler/tests/fixtures/run-groups/cases.json`),
  `queries_suites.py`, `queries_scans.py`, `queries_settings.py`, `queries_plan.py`.
- Processes: `queries_processes.py`, `queries_process_doc.py`, `process_views.py`,
  `process_diff.py`, `change_spec.py`.
- Scan lines: `scan_words.py` (pure: the one grammar of a scan line, spec 072 FR-010; kind, progress,
  last-step and when words used by the home, assistant and scan read models).
- The recorded map: `map_layout.py` (pure layout), `map_edges.py` (pure: tree, off-tree,
  other scans' and failed moves, labels, arrowheads, the hub chip), `queries_map.py`, `queries_map_node.py`,
  `queries_run_graph.py`.
- The portal model (spec 039/040): `queries_model_screens.py`, `queries_model_map.py`,
  `queries_model_facts.py`, `queries_changes.py`, `queries_change_detail.py`,
  `queries_releases.py`, `queries_queue.py`, `queries_review.py`, `queries_rules.py`,
  `queries_same_screen.py`, `queries_identity.py`, `queries_portal_home.py`,
  `queries_all_portals.py`.
- Helpers: `pager.py` (25 a page), `neighbours.py` (Prev / Next), `formats.py` (durations,
  timestamps, short ids), `visuals.py` (screenshots, layouts, highlights), `diagrams.py`
  (Mermaid source), `glossary.py` (+ `glossary_cli.py`: `mudpuppy-glossary --write`),
  `servers.py` (live `mudpuppy` servers on another environment or checkout, spec 031 R-61).
- `models.py`: read-only models of the SQLite schema; drift test vs. `data/schema/schema.sql`.
