# Tasks: Portal onboarding and portal switcher (spec 011, R-31)

Plan in brief: the chat service writes the files (all dashboard writes go through it, spec 010
T037), the crawler config gets one new field, the dashboard gets the dropdown and the form. No
schema migration.

- [x] T001 [opus] Constitution 3.0.0 (MAJOR): Principle V's robots.txt/terms check becomes a
  per-portal choice of the BA (`robots: ignore`); production stays read-only. Sync Impact Report.
- [x] T002 [opus] `robots: respect | ignore` in `PortalConfig` (default `respect`); the robots
  registry governs no host when ignored (no fetch, no refusals); tests in config and crawler;
  crawler gates green (SC-003).
- [x] T003 [opus] Chat service `POST /portals`: build `portal.yaml` (id from the host, base URL,
  environment sandbox|staging, allowed domain = host, paths `/*`, default budgets and rate limit,
  compliance left null, `robots`) and `personas/<id>/guest.yaml`; validate with
  `loadEffectiveConfig`; refuse existing ids (409), bad URLs and loader errors (400); remove
  half-written files on failure. Tests.
- [x] T004 [sonnet] Dashboard portal dropdown (FR-001–FR-003): configured ∪ scanned portals,
  "all portals", "+ new portal"; cookie; Overview filter, Docs redirect, Chat newest
  conversation of the portal and [new conversation] for it. Tests.
- [x] T005 [sonnet] Dashboard "New portal" page (FR-004, FR-005): form, proxy to `POST /portals`,
  errors shown in place, on success select the portal and open a new chat conversation for it.
  Tests.
- [x] T006 [sonnet] Orchestrator prompt (FR-007), `docs/how-to-use.md`, glossary (portal
  dropdown, robots ignore), roadmap R-31 row; full gates.

## Phase 2: environments per portal (FR-008 to FR-012)

- [x] T007 [opus] Constitution 4.0.0 (MAJOR): production may write per the portal's limit (the
  BA's choice); compliance gate dropped; a run's environment is chosen per scan and recorded,
  one store for all. Sync Impact Report.
- [x] T008 [opus] Config: `environments` map; `loadPortal(file, environment?)` and
  `loadEffectiveConfig(..., { environment })` resolve it (one env: no choice needed; unknown
  env: plain error listing the ones there are); `portalEnvironments(file)`. Tests.
- [x] T009 [opus] Crawler: `start_run` takes `environment`; preflight resolves it; the
  store-environment equality check goes; credentials by the run's environment; production
  write refusals go (record-transition, login, autofill); compliance gate goes. Tests and
  quality gates updated.
- [x] T010 [opus] Chat: `request_scan` environment = the portal's only one, else MISSING_INPUT
  naming them; the crawler brief passes it to `start_run`; `createPortal` takes several
  environments; `PUT /portals/<id>/environments/<env>`, `DELETE …` (not the last). Tests.
- [x] T011 [sonnet] Dashboard: new-portal form with an address and limit per environment;
  portal settings page (list, add, revoke) linked from the header. Tests and a browser check.
- [x] T012 [sonnet] Docs, glossary, orchestrator prompt; full gates. Also: the header's
  "environment" picker is relabelled "data store" (it picks the database, not a scan's
  environment); [settings] shows only for a portal with a config file.

### Phase 2 verification (2026-10-06)

- Gates green: crawler 1350 passed (quality gates included), chat 213, dashboard all.
- Browser: "+ new portal" with production (only look) and staging → settings → add sandbox,
  revoke staging → file holds production and sandbox. Preflight on that file: no environment →
  "choose an environment: production, sandbox"; production → ok (a public address as
  production passes the guard), limit read; staging → "has no environment". Throwaway files
  deleted.
- Not done: a real production scan through the chat (T038-style live pass).
- The BA's existing `portals/wikipedia` is a legacy sandbox file: fix in its settings (add
  production, revoke sandbox), not changed by Claude.

## Phase 3: per-scan decisions and live-check fixes (FR-013 to FR-016, BA answers 2026-10-07)

- [x] T013 [opus] `start_run` `max_action_class` (lowers, never raises) and `skip_images`, kept in
  `config_snapshot.choices`; a resume keeps or replaces them. Tests (`start-run.test.ts`).
- [x] T014 [opus] Request gate `skipImages`: image requests answered with the "Image skipped"
  SVG, no network, no limiter slot; one decision note per run. Tests (gate unit, real browser in
  `run-choices.test.ts`).
- [x] T015 [opus] Chat `request_scan` `allow_writes` (default false → read-only) and
  `skip_images` (default false) into the crawler brief; orchestrator asks both before a new scan
  and plans silently (F-08). New-portal form wording: the limit is the most a scan may do. Tests.
- [x] T016 [opus] `stopped` step status (migration 0010, core Zod, workflow package, dashboard
  model): a stop the BA asked for marks the run's steps stopped, no error reference;
  "continue scan" stays valid; tracker **[resume scan]** sends "Resume the scan." Tests in
  workflow, chat and dashboard.
- [x] T017 [opus] F-06 `NAVIGATION_FAILED` (session keeps the last network error, `navigate`
  refuses and records nothing); F-07 message for a run with no page. Tests.
- [x] T018 [sonnet] Spec 010 wording (FR-020, edge case, assumption, FR-009, plan constraint and
  Constitution Check, T016 path, T029 note, data model); constitution report label; roadmap
  R-32 (rest of the real-agent pass, costly); docs, glossary; full gates.

## Phase 4: focused scans and process traces (FR-017 to FR-019, BA request 2026-10-07)

- [x] T019 [opus] Safety `focusScope` (narrow only: hosts incl. a subdomain of a portal domain,
  path globs, start page inside the focus) and `excluded_paths` in `checkScope`
  (`scope:excluded_path`); `start_run` `focus` kept in `config_snapshot.choices` and `scope`, a
  resume keeps it, `base_url` = the start page. Tests (scope unit, `start-run.test.ts`, real
  browser in `run-choices.test.ts`).
- [x] T020 [opus] Chat `request_scan` `focus` and `process` (trace hand-off, `map` step; not with
  a resume); one crawler per portal; the step recorder follows the crawler on `scan` and `map`;
  stop notice for a trace; workflow `scan` move valid on a scanned portal, not proposed. Tests.
- [x] T021 [sonnet] Orchestrator (focus, one process, resume or new; no persona to narrow),
  crawler agent (`focus`, start at the returned `base_url`), docs, glossary, findings F-09.

- [x] T022 [opus] Spec 010 F-19: the `pathfinder` server shuts down when its stdin ends (and on
  SIGHUP): browser closed, runs interrupted, exit; a real-process test with a browser open
  (`shutdown.test.ts`, fails on the old code); how-to "Stop everything" updated. The BA's
  throwaway `sc001` data store deleted.

### Phase 4 verification (2026-10-07)

- Gates green: crawler 1364 passed (quality gates included), chat 222, workflow 27, dashboard
  all.
- Live with the real assistant on the BA's `wikipedia` portal (sandbox store, production
  environment), the BA's own words: "can you scan wikipedia now? only go for english route and
  only map searching for a pickle". The assistant proposed a new trace on en.wikipedia.org only
  (the stopped scan keeps its pages), asked the two decisions, made no persona. First try:
  run 01a11736-46a0 abandoned on the Main Page (F-10, brief forbade typing). After the fix: run
  01a11738-e195, focus `{start_url: en…/Main_Page, only_domains: [en.wikipedia.org]}`, read-only,
  5 steps (Main Page → typed "pickle" → Search opened /wiki/Pickle → "Search for pages
  containing pickle" → /w/index.php results), `goal_reached`, no refusals, step `map` done. No
  Chromium left after the run.

### Phase 3 verification (2026-10-07, branch `feature/012-r30-r31-integration`)

- Gates green: crawler 1357 passed (quality gates included), chat 217, workflow 27, dashboard
  all, proving-ground backend all.
- Live with the real assistant (separate `sc001` store, throwaway portal on a local site with an
  image on every page): "Scan the portal as a guest." → the assistant asked both decisions and
  started nothing; "Read-only, and skip images." → run with choices `read` / `skip_images: true`,
  5 pages, **0 image requests** reached the site, one skip note, screenshots show the
  "Image skipped" box where the banner was. [stop] → step `stopped`, no reference, no error-log
  line; tracker "[STOP] stopped [resume scan]". "Resume the scan." → same run resumed with the
  same choices, still 0 image requests; [stop] → stopped again. Orphaned `pathfinder` servers
  after stopping the chat service again (spec 010 F-19, known); cleaned by hand. Throwaway
  files deleted.

## Verification (2026-10-06)

- Gates green: crawler 1344 passed (quality gates included), chat 209, dashboard all.
- End to end in a browser: "+ new portal" → https://example.org/ as `e2e-check` → both files
  written and loadable, the header switched to it, a chat opened proposing "scan the portal".
  The throwaway files were deleted; its conversation row stays in the sandbox store.
- Not done: a real scan of a new portal (SC-001 timing) and a run with robots unreachable
  (SC-003 is covered by the registry test, not a live run).

## Live verification (2026-10-07)

- SC-001: a throwaway production portal (wikipedia, "only look") added through `POST /portals`,
  a chat opened, "Scan the portal as a guest." → run running after 16.6 s; stop, reset, resume,
  progress feed, live map and tracker checked on the same conversation. SC-003: live on four
  throwaway portals (ignore/respect × robots.txt disallowing/unreachable). See `findings.md`.
- Fixed on the way: F-01 (`tsx` undeclared, `.mcp.json` servers did not start), F-02 (resume
  after [reset assistant] asked for the persona), F-05 (an unreachable address killed the
  `pathfinder` server). Open: F-03 (slow maps on image-heavy sites), F-04 (a stop the BA asked
  for shows as failed), F-06 (a failed navigation is recorded as a page), F-07 (misleading log
  message for an unreachable site), F-08 (planning text shown to the BA).
