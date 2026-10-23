# Tasks: spec 071 (R-100)

## Phase 1: router navigation (FR-001, FR-002)

- [x] T001 `LinkProvider` in the design system; every component with an `href` draws through it
- [x] T002 The app provides React Router's `Link` for `/app/` addresses; files stay plain links
- [x] T003 No raw `<a>` in `src/pages` and `src/app` (pages use the design system; lint rule)
- [x] T004 Programmatic moves (`window.location`) go through `useNavigate`
- [x] T005 `/app/assets/*` immutable, `index.html` no-store; `/` redirects to `/app/`
- [x] T006 Tests: a nav click renders the next page without a document load

## Phase 2: htmx pages in React (FR-003)

- [x] T010 The recorded screen (`/app/states/:id`; designer Q10: a dialog on its Screen page)
- [x] T011 Same screen? (`/app/portals/:portal/same-screen`)
- [x] T012 The scan plan and Recover (`/app/scans/plan`, `/app/scans/:scan/recover`)
- [x] T013 + new portal (`/app/portals/new`)
- [x] T014 The full chat page and an error reference (designer Q11: no chat page, `?assistant=open`; `/app/errors/:ref`)
- [x] T015 Access, Activity, Search, scans by process, superseded amendments
- [x] T016 The glossary and the wiki (`/app/glossary`, `/app/glossary/wiki`)
- [x] T017 The Workbench (`/app/portals/:portal/workbench`)
- [x] T018 Every React link that pointed at an htmx page points at its React page

## Phase 3: htmx gone (FR-004, FR-005)

- [x] T020 Old addresses redirect to their React page
- [x] T021 htmx routers, fragments, form posts, templates, static files and Jinja deleted
- [x] T022 htmx tests deleted or moved to the read models and the JSON API
- [x] T023 Docs, skills and the agent say React only; the assistant's `open_page` opens `/app/` pages
- [x] T024 The header's parts the htmx frame had: the data-store menu (`/api/stores`, `?store=` kept
  on every link and API call), As of on the model pages, stray-server warnings, hooks on a scan
- [x] T025 No htmx left in code comments (they named deleted files); `in_react` renamed `has_detail`;
  `neighbours.py` keeps only the Docs list (the Screens and scan-states lists served deleted pages)
- [x] T026 The recording's Access (spec 024 US2: who reached it, elements some personas see, two
  personas side by side by `?left=&right=`) in the recording dialog; every API href to a recording
  is `/app/states/…` (`queries_app.state_href`), so no link reloads the console

## Close-out

- [ ] T030 Browser walk: no document load between pages; `ui:check` on the new pages
- [ ] T031 code-reviewer, roadmap, glossary, changelog, merge
