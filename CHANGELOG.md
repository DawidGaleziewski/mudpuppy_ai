# Changelog

Maintained by the `po` agent; one entry per closed roadmap item, linked to its commit.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- R-20 screenshots as evidence and R-21 wireframes: every new state gets an unmasked screenshot
  and a layout of element boxes with stable element keys on every environment (migration
  `0006`, binary evidence); the BA cites "screen regions" that the audit resolves and the
  dashboard highlights on record pages, with a state page and Screens panel; each state also
  gets a deterministic low-fidelity SVG wireframe and an editable `.excalidraw` file; `docs:export`
  includes screenshots, wireframes and highlight crops. Constitution 2.0.0 lowers the safety
  level: PII scrubbing is opt-in (`pii_scrub`), and forms are autofilled and submitted on
  sandbox/staging while production stays read-only. Validated on a fresh crawler-agent map of
  `reference-insurer` (21/21 states with screenshot, layout and wireframe; 8 states behind
  submitted forms), a BA session (all DI and 32/33 BR cite a region, audit clean), a
  byte-identical export with working image links, and the user's dashboard review. The
  `.excalidraw` open check on excalidraw.com (SC-004) is deferred for later verification.
  Fixed: a reopened `navigate` frontier item could never be settled and blocked `finish_run`
  (F-10). Bugs and open findings (F-01…F-13) are in `specs/008-screenshots-wireframes/findings.md`;
  the token analysis of this build started R-24 (`specs/008-screenshots-wireframes`, T001–T043).
  Commits: 0360a6a, 3e42eb2, d97436f, 2c297ac, cf17633, d821e98, 5e0c4db, b8b3082, eb1e746,
  075bbd1, d5bfb96, 4296c6f (squash-merged on master, tag v1.0.8).
- R-23 MudPuppy rebrand (brand only): the product is now MudPuppy. Dashboard top bar shows the
  pixel salamander head as its mark and the `mudpuppy://console` wordmark; full favicon set and web
  manifest under `static/brand/`; READMEs and glossary labels use the new name; the GitHub origin is
  now `DawidGaleziewski/MudPuppy-AI`. Code identifiers (`@pathfinder/*`, `pathfinder_dashboard`, MCP
  server names, `PATHFINDER_*`) keep the old name for a later item
  (`user_input/MudPuppyRebrand/mudpuppy.md`). Commit: 1f9c0d6 (squash-merged on master).
- R-16 SRS export and goal evaluation: `pnpm docs:export` renders a portal's documentation as a
  deterministic SRS folder (README, chapters 01–10 in a 29148-style outline, `11-unknowns.md`,
  `12-traceability.md`, change log, Mermaid diagrams, `records.json`) in "all, drafts marked" or
  `--confirmed-only` mode, with golden tests; `pnpm docs:evaluate` scores the documentation against
  the reference portal's ground truth per category (screens, fields, constraints, rules with claim
  markers, processes, terms), lists missing items and over-claims, and fails below the SC-008
  thresholds. Goal run on a fresh sandbox store (map → BA → 9 traces → BA, three BA sessions, 158
  records): every category 100, 0 over-claims. Six glossary terms added (SRS export, confirmed-only
  mode, traceability matrix, Unknowns, over-claim, coverage score)
  (`specs/004-ba-documentation`, T072–T082).
  Fixed: map runs stalled at `max_depth` because depth was measured from the browser's page; a
  page's actions now gate from that page's own depth, a state keeps its shallowest depth and a
  shorter path reopens its depth-skipped frontier items. Bugs and gaps found during the goal run
  (F-01…F-16, open ones for a later tests/evals item) are in
  `specs/004-ba-documentation/goal-run-findings.md`.
  Commits: 2ba07d6, 6ad0551, e738338, 8ee6078, 74a3c66, 64a2e65, f86e6b9, 358641c (squash-merged
  on master).
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
