# Contract: Dashboard Docs Routes (R-15)

Extends [003 http-routes](../../003-dashboard-ui/contracts/http-routes.md): same conventions
(`?env=`, full pages bookmarkable, live regions re-fetch on `store-changed`, `push=1` for filters).
A top-level nav tab **Docs** is added next to the overview.

## Pages (GET)

| Route | Content | Params |
|---|---|---|
| `/docs` | portal picker: each portal with doc record counts by status and last session; empty state when none | — |
| `/docs/{portal}` | SRS view: side index of sections (FR-030) with counts; the selected section | `section` (default `overview`), `kind`, `status`, `confidence`, `flag` (`open_question`, `not_observable`), `cursor` |
| `/docs/{portal}/{key}` | one record: header (key, title, kind, status, confidence, rev, session), rendered content (diagram if any), evidence list with links, relations (in and out), review panel, revision history | `rev` (show an older revision) |
| `/docs/{portal}/sessions/{session_id}` | session: input runs (links to run pages), passes, records created/revised, gaps | — |

Section ids: `overview, capabilities, screens, processes, requirements, rules, data, glossary, nfr,
assumptions, questions, followups, traceability`.

Evidence links resolve to: `state/edge/action/form/network_call/rule_candidate/open_question/decision`
→ `/runs/{run_id}?tab=<section>#<target_id>`; `process/process_step` → `/runs/{run_id}?tab=process#…`
(new run tab for trace runs); `doc_record` → `/docs/{portal}/{key}`; `review` → the record page
anchor. SC-003: requirement → run in ≤ 2 clicks.

## Run page additions

- New run tab `docs` on `/runs/{run_id}`: records citing this run's evidence (key, title, status,
  what they cite) — FR-033.
- New run tab `process` for trace runs: ordered steps, boundary, outcome.

## Fragments (GET, live)

`/fragments/docs/{portal}/index`, `/fragments/docs/{portal}/section/{section}`,
`/fragments/docs/{portal}/{key}/header`, `/fragments/docs/{portal}/{key}/reviews`,
`/fragments/runs/{run_id}/docs`, `/fragments/runs/{run_id}/process`.

## Review actions (POST)

| Route | Form fields | Result |
|---|---|---|
| `POST /docs/{portal}/{key}/reviews` | `rev_no`, `action` (`confirm, reject, comment`), `text` | runs `docs:review` (see [operator-cli.md](operator-cli.md)) with `reviewer` = setting; returns the refreshed review panel + header fragments (htmx OOB). Refusals (`STALE_REVISION`, missing reason) render inline in the panel with HTTP 409/422 |

Guards:

- Enabled only when `PATHFINDER_REVIEWER` (dashboard setting) is set; otherwise buttons are
  disabled with a hint and POST returns 403.
- Same-origin check: `Origin`/`Referer` must be the dashboard's own host:port, else 403 (local tool,
  no login; this blocks cross-site form posts).
- The POST handler never opens a writable connection; the only write is the subprocess.
- `test_readonly.py` keeps asserting no GET route changes the store; a new test asserts the POST
  route changes it only by rows the command reports.
