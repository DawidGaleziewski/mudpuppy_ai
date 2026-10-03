# Changelog

Maintained by the `po` agent; one entry per closed roadmap item, linked to its commit.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- R-22 glossary and BA wiki: one source (`docs/glossary/glossary.yaml`) explaining 59 Pathfinder
  and BA terms chosen by the user's term review, long pages for frontier and evidence, generated
  `docs/glossary/README.md` (`uv run pathfinder-glossary`); dashboard Glossary tab with filter,
  `[?]` tooltips on ~40 labels and one-line intros on Run, States, Analysis session and Gaps;
  14 local BA wiki pages citing the IREB CPRE glossary 2.2.0, BABOK v3 sections and ISO/IEC/IEEE
  29148:2018; a test fails on any template term missing from the glossary; glossary-sync step in
  the `po` close-out and `CLAUDE.md`. The Actions column "Target" is renamed "Links to"
  (`specs/006-glossary-ba-wiki`, T001–T030). Also fixed: `apps/dashboard/tests/test_main.py`
  leaked `PATHFINDER_*` environment variables into later tests.
  Commits: 502e13d, 1217667, a5a4f62, 1b72bf5, 8b0cf28 (squash-merged on master).
- R-14 crawler trace mode and R-15 Docs tab: `trace` runs record one named process as ordered
  steps (fill/check/select actions, persona `trace_inputs`, submit boundary on production,
  follow-up lifecycle `open → in_progress → done|blocked`, migration `0005_trace_processes`), BA
  process reads (`list_processes`, `get_process`); dashboard Docs tab with SRS view, record pages,
  Mermaid diagrams, run docs/process tabs and a review panel (confirm/reject/comment through
  `docs:review`, constitution 1.4.0); `/healthz` code fingerprint and `pathfinder-dashboard-smoke`.
  Validated by agent traces of FUP-001..004 on `reference-insurer` (FUP-004 to the confirmation
  after accepting reserved-TLD e-mails as synthetic input), BA re-runs (139 records, audit clean)
  and a browser review. FUP-008 left open (`specs/004-ba-documentation`, T033–T071).
  Commits: c66de2c, cfda2d0, b5ea41a, 1462cb0 (squash-merged on master).
- R-13 BA documentation store and BA agent: Layer B records with stable keys, revisions and
  evidence links in SQLite (migration `0004_ba_documentation`), `pathfinder-ba` MCP server with
  13 tools, `ba` subagent and `ba-practice` skill, `pnpm docs:audit`, and the local
  `reference-insurer` portal with a ground-truth manifest; validated by a guest map run and three
  BA sessions (102 records, audit clean) (`specs/004-ba-documentation`, T001–T032).
  Commits: 4666e02, 6a90a6d.
- R-17 crawl run observability trace: per-run technical trace of the crawler's own machinery
  (calls, phases, decisions, requests, fingerprinting, frontier, agent transcript), inspectable
  from the R-12 dashboard (`specs/005-crawl-run-observability-trace`, T001–T046). Commit: 89c3530.
- R-12 read-only FastAPI + htmx dashboard over the crawl store (`apps/dashboard`, uv, live SSE
  updates, Console design system), `frontend-dev` agent and `revamp-dashboard` skill, constitution
  1.3.0 app layout (`specs/003-dashboard-ui`, T001–T029). Commit: 8989790.
- R-11 portal-agnostic safety and portal workspaces: robots.txt enforcement, generic rule ids, per-portal
  rules, per-portal data (`specs/002-portal-agnostic-safety`, T001–T065). Commit: 3d4ed21.
- R-02 fingerprint package (route template, ARIA canonicalization, two-level fingerprint). Commit: 02e17b7.
- R-04 core: Zod schemas, SQLite layer with reversible migration 0001, PII scrubber, evidence store, decision log. Commit: 5633dc4.
- R-05 config: portal and persona loaders with `extends`, ceiling and secret detection. Commit: 17f1187.
- R-06 safety: classifier, environment guard, scope/denylist, block detector, rate limiter, request and action gates, preflight. Commit: eee48a9.
- R-08 reusable personas: anonymous-base mixin and `guest-mobile` sample. Commit: 412ed19.
- R-09 QA locators: ranked locator builder (dfe3f40 wiring in 23c8a9b). Commit: d4907a4.
- `governor` and `po` subagents, `roadmap.md`, and the `po` guard hook, plus the `sqlite-conventions` and `subagent-authoring` skills.

### Changed
- Moved the TypeScript workspace into `apps/crawler/` so the repo root can host other apps. Commit: b1639fc.
