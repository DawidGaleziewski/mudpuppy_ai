# Changelog

Maintained by the `po` agent; one entry per closed roadmap item, linked to its commit.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- R-34 maintainability: written code guidelines G-01–G-32 (`docs/code-guidelines.md`, rated by
  the user) and a `CLAUDE.md` in every package and app. Test tiers: `pnpm test:fast` runs only the
  tests a change can affect (about 20 s per commit, was 5 min 40 s; the commit hook runs it),
  `pnpm test:slow` runs the browser end-to-end files and the gates in parallel (163 s, was 340 s);
  dashboard tests run in parallel with pytest-xdist (35 s, was 1 min 48 s). Type-aware ESLint
  (unawaited promises are errors; it found four unhandled-rejection paths, fixed) with size and
  complexity warnings and `pnpm lint:report`. `core` is now the kernel only: new packages `store`
  (DB, decision log, tracer), `trace`, `docs-model`, `chat-model`, with `layers.json` and a layers
  test that fails an upward import. The 1,484-line `pipeline.ts` is one file per step in
  `runtime/pipeline/`; steps return their decisions and events and `step()` writes them (G-18,
  lint-enforced), locked by a golden behaviour test; the dashboard's 2,187-line `app.py` is one
  router per page (172 lines left, all 55 routes unchanged). Mutation testing on demand
  (`pnpm mutate`, Stryker command runner; `uv run mutmut run` in the dashboard) plus follow-up
  boundary tests: core 60.9 → 82.6 %, safety 77.3 → 91.7 %, fingerprint 60.3 → 73.1 %,
  dashboard 85.3 → 89.3 %. A `code-reviewer` agent and a `refactor-code` skill, now a step of
  the feature close-out. Findings F-01–F-16 in `specs/012-maintainability/findings.md`
  (`specs/012-maintainability` T001–T052). Branch `feature/012-r34-maintainability`
  (squash-merged on master, tag v1.0.11).
- R-30 guided chat orchestrator and R-31 portal onboarding: the dashboard's Chat page talks to
  one orchestrator agent (`apps/chat`, ACP over the user's Claude Code login) that runs the
  workflow scan → map a process → narrow → document → amend from recorded data only
  (`packages/workflow`, migration `0008`), hands scans and traces to the `crawler` agent and
  documentation to the `ba` agent, and is fenced from editing the harness. The page shows a step
  tracker with [stop scan] / [resume scan], a progress feed and a live map read from the store,
  a credentials form, the state checklist for a process scope, amendments with superseded
  review, [stop], [reset assistant] with a context hand-over, and error references (`ERR-…`)
  backed by local logs. Portals: "+ new portal" in a header dropdown writes the portal and a
  guest persona; a portal holds production, staging and sandbox, each with its own address and
  limit (portal settings page); `robots: ignore` per portal. Constitution 3.0.0 and 4.0.0: the
  robots/terms check is the BA's choice and production may write up to the limit the BA sets.
  Per scan, the BA decides in the chat: read-only (default) or edits allowed, images or an
  "Image skipped" placeholder, and a focus (start page, hosts, paths, excluded paths; it only
  narrows); a scanned portal may be scanned again ("resume or new"), and "map searching for X"
  starts a process trace. A stop the BA asked for is `stopped` (migration `0010`), resumable from
  the queued pages; a run records the server that owns it (migration `0009`). Fixed along the
  way: undeclared `tsx` kept the `.mcp.json` servers from starting (F-01), an unreachable address
  crashed the `pathfinder` server (F-05) or was recorded as a page (F-06, now
  `NAVIGATION_FAILED`), the `pathfinder` server and Chromium outlived the chat service (spec 010
  F-19, now it shuts down when its client goes away), a read-only brief stopped a trace from
  using an allowed search box (F-10). Verified live with the real assistant: the BA's
  "English Wikipedia only, map searching for a pickle" reached its goal read-only. The full
  real-agent pass (scoped documentation, amendments, re-scan) is roadmap R-32, marked costly.
  15 glossary terms added or changed. Findings in `specs/010-acp-chat-orchestrator/findings.md`
  and `specs/011-portal-onboarding/findings.md` (`specs/010-acp-chat-orchestrator` T001–T052,
  `specs/011-portal-onboarding` T001–T022). Branches `feature/010-r30-acp-chat-orchestrator`,
  `feature/011-r31-portal-onboarding`, `feature/012-r30-r31-integration` (44 commits, fa97a8d …
  41706ac; squash-merged on master, tag v1.0.10).
- R-25 legacy proving ground, R-26 credential vault and logged-in crawling, R-27 quality gates
  and evals: `apps/proving-ground` is a local "Grupa Mokradło" estate (Django backend, React
  shell loading shop/bank/insurer micro-frontends at runtime, an embedded server-rendered legacy
  app, CMS label files) that reproduces the 51 entries of `docs/legacy-obstacles.md`, with a
  ground truth per brand checked by `pnpm gt:check` (35/35). Test-user passwords live encrypted
  per portal and environment in the store (migration `0007`, key outside the repo, `pnpm vault`);
  the crawler's new `login` tool types them server-side, re-logs in once after an expiry and
  never retries a rejected login; every resolved value is redacted before any write, Playwright
  trace chunks included (the trace pauses around the login and each chunk is redacted, F-15).
  Off production a CAPTCHA becomes a "Human needed" hand-off and the crawl goes on. `pnpm test`
  runs 78 gate cases (one per in-scope obstacle and per gate finding; 20 are known gaps that fail
  the run once fixed) in 2m05s; slow cases run in `pnpm test:slow`. `pnpm eval <portal>` runs the
  real agents headless in a throwaway workspace, scores the docs against ground truth and compares
  with a baseline. Fixed along the way: pages with a live SSE stream never settled (F-06),
  frameset pages crashed observation (F-10), an estate re-login expired at once (F-05). Open,
  moved to R-29: the first eval baselines (the crawler agent ends map runs early, F-17) and the
  gap ranking for R-28. 17 glossary terms added or changed (incl. "Slow gate"). Findings F-01…F-18 in
  `specs/009-legacy-proving-ground/findings.md` (`specs/009-legacy-proving-ground`, T001–T051).
  Commits: 3cc387b, 72d3f40, ad50575, 858f993, 4c17bca, 28464b2, 859fb87, b90b1eb, 6608c51,
  d204b5e, ce1b117, 96955ba, 1819ae5, f5566ca (squash-merged on master, tag v1.0.9).
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
