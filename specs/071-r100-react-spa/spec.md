# Spec 071: The console is a 100% React SPA (R-100)

**Branch:** `feature/071-r100-react-spa` · **Owner (2026-10-23):** "I want it to be 100% react
spa. No htmlx. NOT A SINGLE LINE. Everyhting that is htmlx has to be in react. React router. No a
hrefs ffs. Add it to roadmap and do it now!"

## Why

The owner's hand try of the R-96 console: every click between nav items took "forever".

- Every link in `apps/web` was a plain `<a href>`, so each click reloaded the whole app: the
  596 KB bundle parsed again, every query fetched again. React Router was there and unused.
- Pages still linked out to htmx pages. Every htmx page asked for the store list about 55 times
  per render, and each time listed `eval_root` (default `/tmp`, 14,510 entries): 1.3 s and more.
- `/` (the address the dashboard prints) was the htmx All portals page.

## What this builds

- **FR-001 Router navigation.** Every link inside the app goes through React Router: no reload
  between pages, the query cache kept. The design system stays router-free: its links draw a link
  component the app provides (`LinkProvider`); the app gives React Router's `Link` for addresses
  under `/app/`. Downloads, files, evidence and other sites stay plain links (`download` or a
  full-page target). No page draws a raw `<a>`; a lint rule refuses one in `src/pages` and
  `src/app`.
- **FR-002 Assets cached.** `/app/assets/*` (hashed names) are served `immutable` for a year;
  `index.html` is never cached.
- **FR-003 React pages for every htmx page still in use** (each with its read model, JSON route,
  page, states and tests):
  1. the recorded screen `/states/{id}` (picture, regions, highlight, access, amendments, form
     steps, marks);
  2. Same screen? (pairs, decide);
  3. the scan plan and Recover (start a scan, skip and resume);
  4. + new portal;
  5. the full chat page and an error reference;
  6. Access (the access matrix), Activity, Search, scans by process, superseded amendments;
  7. the glossary and the wiki;
  8. the Workbench (behind `MUDPUPPY_WORKBENCH`, as on htmx).
- **FR-004 No htmx.** The htmx pages, fragments, form posts that only htmx used, templates, htmx
  static files (`htmx.min.js`, the htmx page scripts), Jinja and their tests are deleted. Old
  addresses (`/`, `/runs/{id}`, `/review`, `/states/{id}`, …) redirect to their React page so old
  links and exports keep working. What stays in Python: the JSON API (`/api`), the chat relay
  (`/chat/conversations…`, JSON and SSE), evidence files, the exports and downloads, `/healthz`,
  and the SPA server.
- **FR-005 Docs.** `CLAUDE.md`, `docs/how-to-use.md`, the skills (`mudpuppy-react-ui`,
  `mudpuppy-salvage-ui`) and the agent `frontend-dev` say the console is React only.

## Validation

- [x] Clicking every nav item and tab in a real browser makes no document request (Playwright:
      one `document` load for a walk through every page). 2026-10-23: 10 nav clicks, 31–116 ms
      each, 0 document loads, 0 console errors; `?store=` kept.
- [x] `rg -l "hx-|htmx|jinja|Jinja2Templates|TemplateResponse" apps/dashboard apps/web` finds
      nothing (left: `scripts/find-old-styles.sh`, the designer's scanner, which names template
      file types it scans; `mutants/` is a gitignored mutmut copy).
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm build-storybook` in
      `apps/web`; ruff and the whole pytest suite in `apps/dashboard`.
- [x] `ui:check` on each new page at 1280 and 390 px (and every main portal page, a recording,
      an eval store).

## Close-out review (code-reviewer, 2026-10-23)

| # | Finding | Guideline | Outcome |
| - | ------- | --------- | ------- |
| 1 | `test_main` still expected html/css/js reload includes | G-27 | fixed (only `*.py` now) |
| 2 | `queries_scans.py`: all but `max_steps` is the htmx Scans page's leftover | G-20 | deferred → R-102 |
| 3 | Helpers orphaned by the htmx deletion, untested: `db.data_version`, `as_of.first_seq`, `queries_chat.target_state_id`, `queries_screens.screen_ids`, `queries_wb.conversation_of_command`/`current_turn`/`type_word`, `queries_wb_scan.scan_progress`, `stores.store_for_portal`, `visuals.has_picture`, `wb_frames.path_word`, `queries_model_screens` link helpers | G-20 | deferred → R-102 |
| 4 | Orphaned but still tested: `queries.portal_summaries`/`list_runs`, `queries_chat.superseded_counts`/`amendment_portals`, `queries_docs.doc_portals`/`portal_known`/`process_diagram_input` | G-20 | deferred → R-102 (with their tests) |
| 5 | `glossary._load` complexity 30 | G-02 | deferred → R-102 |
| 6 | `type: ignore` without a reason in `queries_app_state_side._pair` | G-23 | fixed (narrowed, no ignore) |
| 7 | Routers, SQL, raw `<a>`, file sizes | G-01, G-13, G-15 | conformant |
