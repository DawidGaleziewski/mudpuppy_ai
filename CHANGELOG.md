# Changelog

Maintained by the `po` agent; one entry per closed roadmap item, linked to its commit.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
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
