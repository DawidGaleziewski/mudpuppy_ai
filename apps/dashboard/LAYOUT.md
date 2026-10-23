# mudpuppy-dashboard: file map

Where each page and read model lives, by spec. The agent notes (`CLAUDE.md`) keep the
rules; this file keeps the map (spec 042 T050, G-30).

## Layout

- `app.py`: only builds the app (settings, templates and filters, the `Web` object, the portal
  cookie middleware, static files, `include_router` calls in a fixed order).
- `web/deps.py`: `Ctx`, `build_url`, `Web` (`ctx`, `render`, `missing`, `not_found`, glossary) on
  `app.state.web`; routers call `web_of(request)`. `Ctx.url` adds `portal=` to links to things
  named by a per-portal key (`/processes/…`, a selected Review item; spec 029).
- `web/<page>.py`: one `APIRouter` per page with its fragments (`overview`, `runs`, `states`,
  `evidence`, `health`, `activity`, `docs`, `glossary`, `chat`, `portals`, `amendments`, `events`,
  and for spec 022 `processes`, `review`, `scans`, `screens`, for spec 024 `access`);
  shared view helpers in `web/views_docs.py`, `web/views_chat.py`, `web/chat_forward.py`,
  `web/views_access.py` (the /access matrix and the screen page's Access tab with its side by
  side, `partials/state_access_compare.html`; Review's "Unexplained differences" group comes from
  `queries_access.unexplained`, spec 024 P2).
- `queries.py`, `queries_docs.py`, `queries_chat.py`, `queries_urls.py` (visits, parameter
  inventory, spec 019), and for spec 022 `queries_screens.py`, `queries_revisions.py`,
  `queries_proposals.py` (the assistant's proposals), `queries_processes.py` (BA processes,
  history, compare), `queries_access.py` (which personas see which screen and element, spec 024;
  the same model as the BA tool `get_access_matrix`, both checked against
  `apps/crawler/tests/fixtures/access/three-personas.json`), `queries_review.py` (records, assumptions to check, unexplained differences, re-anchoring,
  proposals, probe suites), `queries_suites.py` (spec 032: open probe suites for Review, and a
  state's form step with its states and probe outcomes for the screen page), `queries_scans.py`, `queries_settings.py`, `queries_home.py` (Home beside the
  assistant): read models. Spec 033: `map_layout.py` (pure layout of the map: discovery tree,
  layers, families), `queries_map.py` + `queries_map_node.py` (the recorded map: Screens ▸ Map's
  view One scan's path and a portal without a model), `web/map.py` + `static/js/map.js`.
- `stores.py`: the stores a request may open (main data dir + eval workspaces), chosen by key;
  `portals_in` (cached per file write) backs the header's store menu, which lists the stores
  holding the chosen portal, and the portal menu's links, which land on such a store (R-71).
- Spec 034 (R-71): `pager.py` (25 a page, `paginate` / `paged_from_count`, the `sy.pages`
  macro) on Screens (`?q=` filter), scan history, Review group tabs, Processes; keyset lists
  use `settings.page_size` = 25. `neighbours.py`: Prev / Next on screen and record pages from
  the `list=` link the list adds (Screens, Docs sections, a scan's states); Review's side pane
  walks the selected item's group. R-70: `queries_run_groups.py` + `web/run_groups.py`
  (Scans ▸ By process: scans per documented process, unassigned, proposed groups; the same model
  as the BA server's `run-groups.ts`, both checked against
  `apps/crawler/tests/fixtures/run-groups/cases.json`). R-66: the map inspector sets Start here,
  Focus, Recheck, Retry and Skip (`web/states.py` `/states/{id}/mark`, through the chat service);
  `web/plan.py` + `queries_plan.py`: Scans ▸ Plan next scan (screen 14; Start scan posts one
  precise `request_scan` request to the portal's conversation) and `/scans/recover/{run}` (screen
  15: Resume, Retry this path with a variation, Skip it, attempts). R-68: `process_export.py` runs
  `pnpm docs:process-export` into a temp folder (kept until the store changes) and renders it
  without raw HTML; `web/process_export.py`: `/docs/{portal}/{PROC}/export` and
  `/processes/{PRC}/export` (one tab per file, images, `openapi.yaml`/`process.json`, zip).
- Spec 035 (R-74): `queries_run_graph.py` + `partials/graph.html`: a scan's Graph tab (its
  screens and moves in the map's layout, failures and the stop screen, path, Resume, Retry /
  Skip / Start here per screen); a scan that stopped or failed opens on it. Forms posted with
  `from=graph` (or a `/runs/…` mark `back`) return to the graph.
- Spec 027 (R-54, processes as-is first): `queries_process_doc.py` (pictures per screen, A per
  step with the records citing its screen, what is still open, the sign-off) and
  `partials/picture.html` + `static/js/pictures.js` (thumbnail → picture dialog). The process
  page leads with A as documentation until `to_be_design`; A is edited by screens (forwarded to
  `…/models/A/edit`), processes are archived (`?show=archived` lists them), a PROC record has
  Open in Processes (`…/processes/from-record`). Archived processes' screens count as loose.
- Spec 039 (T100, the designer's 2.0 pages): `nav.py` groups the sections (Home · Changes · Review
  | Portal model: Processes · Screens · Rules · Docs | Machine: Scans · Settings);
  `queries_rules.py` + `web/rules.py` (Rules, v2-11 / v2-12: decision tables, boundary tests,
  history; read-only; `rules_export.py` runs `pnpm model:rules-export` into a cached temp folder
  for the zip, single files and a rule's "In the export", OV-5); `queries_model_facts.py` + `partials/model_facts.html` (a process page's
  "In the portal model": triggers incl. deep links, outcomes, explored, rules).
  `queries_changes.py` + `web/changes.py` (Changes, v2-02: a range of model versions, grouped by
  process and screen, explanations in the UI's words) and `queries_change_detail.py` +
  `change.html` (Before / after, v2-03; `static/js/change-keys.js`); `queries_releases.py` +
  `partials/releases.html` (release lanes from the latest model version's build epochs, scans,
  range bracket). Review (v2-04 / v2-05 / v2-16): `queries_queue.py` (Findings, Rules, Removals,
  Processes ahead of `queries_review`'s kinds; Explained automatically and Decided tabs,
  `?tab=`), `partials/review_queue_item.html`; deciding posts `/review/hypotheses/{portal}` →
  the chat service's `POST /portals/{p}/model/decide`. Home of a picked portal (v2-01):
  `queries_portal_home.py` + `home.html` (no longer a redirect to `/chat`; the chat stays on
  `/chat` and in the drawer). Screens (v2-06 / v2-07): `queries_model_screens.py` +
  `model_screens.html` / `model_screen.html` (`/screens` for a portal with a model; `/screens/{SC-…}`);
  `?recorded=1` keeps the recorded-pages list. Map (v2-08): `queries_model_map.py` +
  `model_map.html` (`/map` views Now / Since previous release, link-state layers, the menu
  bundled, process overlay; inspector `/fragments/map/screen/{SC-…}`); `view=path` is the
  recorded map. Same screen? (v2-14): `queries_same_screen.py` + `web/same_screen.py`
  (`/same-screen`, conflicts first; answers post to the chat service's `…/model/label`). A process's A and
  B are process models (`?model=B`, status vocabulary `process_model`; owner answer 8).
- Spec 040: `as_of.py` (As of, FR-001: `?as_of=<seq>` on Processes, Screens, Map and Rules;
  `Ctx.conn` adds TEMP views named like the tables, cut at the version's `built_at`, so the read
  models run unchanged; posts with `as_of` are refused in `app.py`, `static/js/as-of.js` disables
  them; the header's As of menu and the banner in `base.html`).
- `servers.py`: live `mudpuppy` servers read from `<data_dir>/servers/*.json`; the header names
  those on another environment or checkout (spec 031 R-61). Read-only, dead files are skipped.
- `models.py`: read-only models of SQLite schema; drift test vs. `data/schema/schema.sql`.
- `templates/`, `static/`, `diagrams.py`, `glossary.py`, `live.py`, `chat_client.py`.

- Spec 042: a page's query is one Pydantic model (`Annotated[Model, Query()]`: `ChangesQuery`,
  `ReviewQuery`, `ScreensQuery`, `RunsQuery`, `SameScreenQuery`) in its router;
  `changes_view` takes a `ChangeFilter`, `chat_client.model_call` a `ModelCall`.

- Spec 043 (Workbench, generative UI beta, behind `settings.workbench`): `queries_wb_scan.py`
  (a scan's events from the store, one per step, `scan#step`; route pages with side trips folded;
  short scan ids), `queries_wb.py` (a Workbench conversation as turns: message, answer, view,
  command cards; feedback; records), `wb_render.py` (a stored view placed for phase 1, data from
  the store; standing ErrorCard; templated narration; command card facts; spec 044: the Start
card's "As" persona choice), `wb_frames.py` (frame,
  Why, feedback and command card view models). Routes: `web/workbench.py` (page, Send, Path
  switch, a turn as stored), `web/workbench_actions.py` (button cards, Confirm, Cancel,
  feedback), `web/workbench_stream.py` (one SSE per tab: the chat's words relayed as out-of-band
  fragments, the data lane from the store), `web/views_workbench.py` (their shared page model and
  chat calls). Templates `templates/salvage/workbench*.html` and `workbench/` (frame, components,
  command card, scan meter, log, sheet, `f_*` fragments); `static/js/workbench.js`;
  `static/salvage/css/genui.css` (the designer's, copied unchanged).
- Spec 050 (R-96, the React console): `web/api_app.py` (`/api/portals`, `/api/portals/{p}/scans`,
  read-only JSON) over `queries_app.py` (pydantic response models the React app mirrors in
  `apps/web/src/app/api.ts`); `web/spa.py` (serves `apps/web/dist` at `/app/`, every other path
  under it gets `index.html`; setting `web_dist`).
- Spec 051 (R-96, the React portal home): `GET /api/portals/{p}/home` in `web/api_app.py` over
  `queries_app_home.py` (the htmx home's `queries_portal_home.portal_home` as JSON); every status
  in the API is `queries_app.StatusOut` (`{shape, word}` from `status_map.py`).
- Spec 052 (R-96, the React Screens): `web/api_screens.py` (`/api/portals/{p}/screens`, `…/{key}`)
  over `queries_app_screens.py` (`queries_model_screens` and `queries_same_screen` as JSON);
  `web/api_common.py` holds what the `api_*` routers share (`store`, `known_portal`); a thing
  that needs a person is `queries_app.NeedsItem` everywhere.
- Spec 053 (R-96, the React model map): `web/api_map.py` (`/api/portals/{p}/map`) over
  `queries_app_map.py` (`queries_model_map.model_map` as JSON: nodes placed, edges drawn, the
  legend's words); a screen's actions carry their `place` (inside, out, menu) for the inspector.
