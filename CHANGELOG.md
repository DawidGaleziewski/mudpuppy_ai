# Changelog

Maintained by the `po` agent; one entry per closed roadmap item, linked to its commit.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- R-53 crawler hooks and URL lists per portal (spec 023; the owner's design of 2026-10-13):
  - **Hooks:** a portal's quirks are fixed in `portals/<id>/hooks.ts`, mapped in the portal file
    under `hooks:` to `onRunStart`, `onBeforePageLoad` (open another URL or skip the page),
    `onPageLoad`, `onBeforeClickAction` (skip or wait for a selector) and `onRunEnd`, optionally
    only on matching URLs. Hooks may set cookies, add init scripts, route requests and run code in
    the page. Each run is time-boxed (10 s by default), traced (`hook` span) and noted in the
    decision log; a failure is recorded and the scan goes on; a screen a hook changed is marked
    `hook:patched` so the BA never documents the patch; the scan page lists the hooks that ran.
    A broken mapping refuses `start_run`. New package `@pathfinder/hooks`, shipped in export-fork.
  - **URL lists:** `urls: { allowed, disallowed }` with path globs, URL globs or `/regex/` entries;
    `allowed` absent means everything on the domains; `disallowed` always wins; personas and a
    scan's focus narrow with their own lists; an excluded link is skipped "excluded by rule …".
    `scope.allowed_paths` and the `path:`/`url:` denylist entries are removed (every portal
    migrated; a leftover key fails to load).
  - **Timeouts:** `timeouts:` for settle, navigation, micro-frontend and client-redirect waits,
    portal-wide and per URL pattern.
  - Proving-ground page `/__test/hook-gate` and gates F-01..F-04@023.
- R-43 + R-44 dashboard redesign with versioning (spec 022; the owner, 2026-10-13: "redesign
  EVERYTHING", R-44 folded in), to the Salvage Yard design package:
  - **Portal as context, seven sections:** the portal is picked once in the header; Home (the
    assistant, Needs you, Processes summary), Processes, Screens, Docs, Review, Scans, Settings.
    Old URLs redirect (the superseded-amendments page lands in Review).
  - **Chat first:** "Ask the assistant" (Ctrl J) opens a drawer on every page with "This page" /
    "Whole yard"; the assistant reads the page (screen, docs record, scan, process), marks an
    element, opens a page, proposes changes the BA applies, undoes or discards (each a revision),
    and asks for a credential with a vault field (the value never reaches it).
  - **Nothing is overwritten (R-44):** screens get observed revisions (r1, r2…) instead of being
    replaced; amendments, processes, variants, change specs and the live marker are append-only
    revisions signed with the reviewer name; a save on an old base is refused and shown as
    "Someone saved first" with Rebase; amendments carry forward or wait in Review to be
    re-anchored. Migrations 0015 screens, 0016 amendment revisions, 0017 chat proposals, 0018 BA
    processes (saved process scopes become processes).
  - **Processes workspace:** the assistant suggests groupings (`list_grouping_inputs`,
    `suggest_grouping`; a dismissed set is never suggested again); a process has the observed
    as-is A and to-be variants B, C… drawn as autosaved drafts (add, move, merge, edit, annotate,
    remove steps), Save as rN+1, Discard; Compare shows the step diff and a generated, editable
    change spec (Markdown export); History marks which variant is live per environment and
    restores revisions.
  - **Review inbox, Scans, Settings:** one inbox for records to confirm, amendments to re-anchor,
    proposals and conflicts, with a count in the nav; Scans has the live monitor and history with
    what changed; Settings has environments, collapsed credentials (names only), personas, crawl
    rules and the data store.
  - The Console UI, the `PATHFINDER_UI_SALVAGE` flag, its CSS and JetBrains Mono are removed;
    `docs/how-to-use.md` is rewritten; nine glossary entries; browser end-to-end tests for
    proposals and for drawing and the two-person conflict (`pnpm --dir apps/chat test:e2e`).
- Owner decisions of 2026-10-14: a chat scan may fill and submit forms by default ("only look"
  makes one read-only); the `pwTrace` boot mode is removed; load-sensitive tests run alone after
  the parallel pass (`serial` marker, `pnpm test:perf`); a hook refuses `sed -i`, `perl -i` and
  redirect writes to tracked files.
- R-52 roadmap declutter (spec 020; the owner, 2026-10-12: "tasks that are a bit minor and can be
  done now without any decision on my end … one collective feature branch"), built overnight:
  - **Evals (R-40, done):** the gates' pure eval checks run in the fast tier; each agent session
    ends as `success`, `budget_end`, `api_error` or `usage_limit`, only the first two write a
    result (stored as `outcomes`), a usage limit exits 3; one eval at a time (a lock in the temp
    folder); the eval starts its own portal server, refuses a port another process holds, and
    checks its ports are free after stopping the server's process group.
  - **Pan and zoom for diagrams (R-19, done):** every dashboard diagram can be dragged, zoomed
    (Ctrl/⌘ + wheel, pinch, or a plain wheel once clicked) and fitted with + / − / fit buttons; a
    long map gets a usable height.
  - **Pop-ups with a URL (LO-27, part):** a `target="_blank"` link or `window.open(url)` is closed
    at once and its URL queued as a gated `navigate` frontier item, so the run visits the screen
    (gate F-04@020). A window written by script into `about:blank` is still a known gap.
  - Proving ground: the insurer's policy screen links the old claim form (S08 was unreachable).
- R-45 amendment, relation vocabulary (the owner, 2026-10-12: "add these arrows … make sure this
  won't happen again"):
  - New relation types: `applies_on` (business rule → screen), `asks_about` (open question → any
    record), `follows_up` (follow-up → process, capability, screen, rule, use case, open question),
    migration `0014_relation_vocabulary`. The export shows "Business rules on this screen", "Open
    questions about this" and "Follow-ups for this".
  - Guards the evals asked for: a screen route template with a query on its path is refused; a
    data item naming two or more observed labels of the form it cites is refused; a relation
    written from the wrong end says which way is allowed.
  - Tests against drift: `contract-drift.test.ts` keeps the relation types, the store triggers, the
    tool description and the `ba-practice` reference in agreement, and every evidence kind classified.
  - Eval checks: `ba_relation_refused`, `route_templates_with_query`, `data_items_joined`,
    `rules_on_screens_pct`. Reference trial: fields 100 %, constraints 100 %, all four checks clean,
    no regression.
- Proprietary licence (2026-10-12, asked by the owner): `LICENSE` (all rights reserved, confidential,
  no AI training or text and data mining) and `THIRD_PARTY_NOTICES.md` (Mermaid and Spec Kit MIT
  texts, htmx, JetBrains Mono) in this repo. export-fork ships its own pair from
  `apps/exportfork-export/templates`; the leak check lets `LICENSE` name the owner (`ownerFiles`).
- R-37, R-38 and R-45 on one branch (spec 019, "capture everything"; the user 2026-10-11: "these
  are quite small, one branch").
  - **Every URL, every parameter (R-37):**
    - Each arrival on a page is a `page_visit` with the verbatim URL: query, path parameters
      (`;jsessionid=`), fragment and tracking parameters, nothing normalised away. API calls keep
      their `url`.
    - Route templates drop path parameters, so a session id never makes a screen of its own (LO-24
      promoted to a gate).
    - A per-screen parameter inventory (values seen, where each was set) for the BA
      (`get_run_evidence` kinds `page_visits` and `parameters`, evidence kind `page_visit`), the SRS
      export ("URLs observed", "URL parameters") and the dashboard state page ("Reached under").
    - Proving ground: LO-52, the legacy statement `wyciag.do` with intertwined `typ`, `okres` and
      `tryb`. In the bank eval the BA documented it as BR-005 with a decision table, citing 13
      visits.
    - Form-POST shapes keep field names under `fields` (spec 015 F-08).
  - **Every redirect (R-38):**
    - Each visit lists its hops: `navigate`, `http` with status, `meta_refresh`, `script`,
      `same_document`, `reload`, or `blocked` with the reason. Playwright events only, no DevTools
      session.
    - Short client-side redirects are waited through (`scope.client_redirect_wait_ms`, 5 s), so an
      interstitial is a hop, not a screen (LO-23 promoted; LO-21 and LO-22 assert the hops).
  - **R-28 leftovers (R-45):**
    - Micro-frontend mounts are waited for inside every frame read (LO-53 gate).
    - The BA's write tools carry record shapes and relations generated from the schemas.
      Refusals name the expected shape and the relations a kind may assert. The eval reports
      `ba_write_calls`, `ba_write_refused` and `ba_write_refused_pct`. Bank refusals went from 39 %
      to 4 %; insurer 7 %; shop and reference 12 %, all guessed relations.
    - Dashboard: eval workspaces in the data-store picker, newest first; a portal with no data in
      the current store names the stores that hold it; the startup line prints the resolved store.
  - **Storage:** migration `0012_page_visits` adds the table and `network_calls.url`, and rebuilds
    `doc_evidence_links` for the `page_visit` kind (reversible). Migration `0013_relation_triples`:
    the store itself refuses a relation outside the allowed (kind, type, kind) triples (triggers,
    with a drift test against `RELATION_RULES`; the owner, "we should have no bad relations").
  - **Fixed on the way:** step durations use a monotonic clock. The wall clock stepping back broke
    `elapsed_ms >= 0`, so a call failed `INTERNAL` after recording its page; this was the cause of
    load-dependent e2e flakes, master included.
  - **Glossary entries:** `page-visit`, `navigation-hop`, `parameter-inventory`, `entry-url`;
    `eval-workspace` updated.
  - **Open:** F-10/F-13 (the BA merges form fields and writes queries into route templates; the
    `create_record` description now states both rules, unconfirmed), F-11 (residual timing flakes
    of the trace phase sum and the golden's `limiter_wait` under load), F-14 (relation vocabulary
    proposal for the owner to rate), R-50 (parameters as screen identity, to discuss).
- R-49 export-fork, the Kiro field artifact (added and started by the user 2026-10-11).
  - **`apps/exportfork-export`**, `pnpm --dir apps/exportfork-export export`: it builds a separate local
    repo (`../export-fork`, no remote) from the current commit.
    - **What it keeps:** an allow list in `src/manifest.ts`. That is the crawler and BA MCP
      servers with their packages and unit tests, plus the field commands. Left out: chat,
      dashboard, proving ground, evals, hooks, tracing, specs and every portal's data.
    - **Renames:** pathfinder → exportfork in any case, and the harness's portal names in test
      fixtures.
    - **Leak check:** fails the export on the project name, portal names, secret shapes or the
      user's e-mail.
    - **Verify:** install, typecheck, lint and tests run in a staging folder before anything is
      written.
    - **Sync:** never touches the field's `portals/`, `personas/`, `issues/` or data. The commit
      uses a neutral `exportfork-export` identity. `--dry-run` stages and checks only.
  - **Kiro setup in the artifact:**
    - agents `exportfork` (main: portal and persona files, commands, delegation), `crawler` and `ba`
      (built from `.claude/agents`, exactly their MCP tools) and `reporter`;
    - `permissions` fence each agent: the BA reads only its references, the reporter writes only
      `issues/`, and the main agent has no crawler or BA tools;
    - skills `ba-practice`, `create-portal` (new) and `create-persona` (writes files, no chat
      service);
    - a steering file, a README quick start and the MCP config.
  - **Field issues:** the reporter writes `issues/BI-<date>-<nn>-<slug>.md`, checked against
    one Zod schema. `pnpm --dir apps/exportfork-export import-issues` copies new ones into
    `docs/field-issues/` with an index row for triage. Invalid files are reported and repeats
    are skipped.
  - **`pnpm portal:check <portal> [<persona>] [--env e]`** in `apps/crawler`: validates portal
    and persona files without a run.
  - **Glossary entries:** `export-fork`, `field-issue`.
  - **Not verified here:** anything inside Kiro (no Kiro CLI on this machine). The first field
    session is the check.
  - **Amendment, the user 2026-10-11 ("I need it to check incoming data"): the dashboard ships.**
    - It is renamed (`exportfork-dashboard`, `exportfork://console`) and the Chat link is gone. The
      Glossary, its tooltips and the BA wiki come along.
    - The export verifies it with `uv sync`, `ruff` and `pytest`.
    - The field README now covers it; the field machine also needs Python 3.13 and uv.
    - The export rewrites the dashboard's hard-coded tool-prefix length (F-06).
    - The crawler tests run with one retry in verify (flaky wall-clock test, F-05).
- R-47 LLM judge, mechanism (paused by the user 2026-10-11 with calibration open).
  - **Model-based graders** (G-33) in `apps/crawler/evals/graders/model/`: a judge is one file
    (`defineJudge`: question, pass and fail wording, examples, model, `selectPairs`) with a
    wording version (a hash). Each pair is judged in an isolated headless `claude -p` call: fresh
    config folder, empty cwd, no tools, JSON-schema answer `pass`/`fail`/`unknown` plus a reason.
  - **Login:** the user's own judge token (`~/.config/pathfinder/judge-token`), else the linked
    Claude Code login; an invalid token fails loudly.
  - **`pnpm eval:judge-check`** proves the isolation: 7 checks, about 1,000 input tokens and
    $0.005 per call.
  - **Labels and calibration:** label files in `graders/human/labels/` with a stable dev/test
    split; `pnpm eval:draw` and `pnpm eval:calibrate` (TPR, TNR, flip rate over 3 runs, reports
    under `data/evals/judges/`).
  - **In trials:** judges run after the code graders, in a new `judges` section of the result,
    never compared with the baseline (`--no-judges` turns them off); results also record their
    `workspace`. `pnpm eval:judge` judges any store without a trial.
  - **Example judge `glossary-terms`:** "does the record define the term with the meaning the
    portal gives it?". Ground-truth terms gained `meaning`, the portal's /slowniczek text, kept
    equal by a test.
  - **Ground truth also keeps each rule's `statement`** for a future rules judge.
  - **Glossary entries:** `judge`, `judge-labels`, `judge-calibration`, `judge-isolation-check`.
  - **Open, the user's part:** labels (32 pairs), calibration (TPR/TNR on test) and the rules
    judge.
  - **Also on the branch:**
    - the user's request to map and document our own dashboard: `portals/pathfinder-dashboard`
      and its persona, export in `data/exports/`, crawler problems C1–C10 in
      `session_dump/2026-10-11-dashboard-scan.md`;
    - roadmap R-48 (dashboard self-eval, after R-47).
  - Branch `feature/017-r47-llm-judge` (squash-merged on master, tag v1.0.16).
- R-46 hands-on learning, first round (the user's learning branch, merged whole on 2026-10-10;
  the roadmap freeze set for it is lifted, R-46 is paused until an LLM judge exists). The eval
  runner `scripts/eval-run.ts` is rebuilt as `apps/crawler/evals/`, organised by role: `index.ts`
  (the trial, top to bottom), `config.ts` (strict `parseArgs`, unknown flags rejected),
  `tasks.ts` (the suite as data), `prompts.ts`, `queries.ts`, `harness/`, `graders/` grouped by
  Anthropic's kinds (`code/`, `model/`, `human/`) and `results.ts`; behaviour locked by the
  dry-run output and an identical grader result on a stored run. New guidelines: G-33 (Anthropic
  eval terms: task, suite, trial, grader…) and G-34 (ground truth is YAML: all four converted,
  `readGroundTruth()` in `@pathfinder/docs`, byte-identical `docs:evaluate` report). New
  `create-eval` skill with the eval conventions. Trace tasks (graded on the process's steps in
  order, `trace_steps`, `trace_goal_reached`), live-site tasks and `--crawler-only` (recorded as
  `conditions.crawler_only`). The user's first hand-written ground truth, Wikipedia "find the
  article about pickled cucumbers": `portals/wikipedia` made read-only with a narrow scope and
  signed off, persona in en-US; baseline 1/3 steps, because robots.txt blocks
  `/wiki/Special:Search` ($0.09 a trial). Also `pw-eval.ts` renamed `in-page.ts`, lint
  `no-nested-ternary` as a warning, learning modules 10 (writing evals) and 11 (writing ground
  truth, with an example), glossary entries `eval-task`, `eval-trial`, `grader`. Follow-ups:
  29 existing nested ternaries; the reference portal's own `GroundTruth` schema next to the docs
  one (G-09); crawl coverage treats any persona not named `guest` as logged in; a request blocked
  by robots or scope reaches the agent as a blank page with no reason. Branch
  `feature/016-r46-hands-on-learning` (merged on master, tag v1.0.15).
- R-28 crawler hardening: the crawler gets past the "now" set of legacy obstacles. Clickable
  `div`/`span`/`li` elements with only a JS handler and no ARIA role are found by a click-signal
  init script and issued as actions with `found_by` and path/text locators (`act` never clicks
  a guess); frames and framesets are walked to depth 3 (`scope.frame_depth`), their blocks
  appended to the page so frame-less pages keep their fingerprints (locked by
  `fingerprint-stability.e2e.test.ts`); `javascript:` postback links are clicks; fields get names
  from labels, nearby text or placeholders (`name_source`), `div` forms are read and autofilled;
  document POSTs and their redirect chains are recorded; the page waits for micro-frontend mounts
  while a bundle loads (`scope.mfe_wait_ms`, `mounts_pending` in the result); resumed runs rebuild
  their depths. Migration `0011_page_composition` stores each page's composition (frames,
  mounts, loaders, bundles). The eight gap cases LO-10, LO-02, LO-04, LO-11, LO-18, LO-34, LO-43
  and F-04@004 are now gates. Evals: bank `crawl_screens` 4 → 10/11 (legacy app reached,
  promoted as the new baseline), insurer 4 → 5/6, shop 3 → 4/6 (target 5/6 missed: budget
  spent on catalogue pages, F-17 → R-35), reference portal 17/17 with no regression; no password
  hits or widget actions in any run. The eval now counts screens read inside frames and ignores
  a query in a hash route. Open findings went to R-35 and the new R-45 (frame mounts, BA write
  refusals, dashboard eval stores). Glossary: 5 entries. Findings F-01–F-23 and verdicts in
  `specs/015-crawler-hardening/findings.md` (`specs/015-crawler-hardening` T001–T041). Branch
  `feature/015-r28-crawler-hardening` (squash-merged on master, tag v1.0.14).
- R-29 eval baselines: the first tier-2 baselines for `reference-insurer` (guest),
  `proving-ground-shop` (guest), `proving-ground-bank` (client, `--session-timeout 20`) and
  `proving-ground-insurer` (client), each with a second run and `tolerances.json`
  (`data/evals/`). `pnpm eval` now scores the crawler apart from the BA (`crawl_screens`: 17/17,
  3/6, 4/11, 4/6, identical in both runs), counts the frontier left pending, sweeps the store,
  every run file, the SRS export and both agent transcripts for the portal's vault passwords
  (`password_hits`, 0 in all 8 runs) and counts actions on the CAPTCHA widget
  (`widget_actions`, 0); both must be 0 or the eval fails and nothing is promoted. It starts the
  estate with `--session-timeout`, always stops the portal server it started, and writes no
  result when an agent is cut off by an API error or the account's usage limit (it happened
  twice; the first two baselines were withdrawn). Spec 009 verdicts on real agent runs: SC-003
  and SC-007 met, SC-004 and SC-005 not met (crawl coverage), in
  `specs/014-eval-baselines/criteria.md`. The user's gap ranking orders R-28 (LO-10 first) and
  added R-35..R-41 (next/later gaps, all query parameters, all URLs and redirects, BA goal
  quality, eval robustness, a roadmap review) with a priorities section in `roadmap.md`.
  Glossary: crawl coverage score, password sweep. Findings F-01–F-10 in
  `specs/014-eval-baselines/findings.md` (`specs/014-eval-baselines` T001–T020). Branch
  `feature/014-r29-eval-baselines` (squash-merged on master, tag v1.0.13).
- R-24 token usage: a drained map run of the reference portal now costs 1.05M cache-read
  tokens instead of 38–78M (36 agent turns instead of ~400, $0.47), with the same 21 states and
  the same 319 transitions. Map-mode `navigate`/`act` results leave out the action list of a page
  the run already knows (`actions_omitted`; `include_actions: true` lists it) and carry `next`,
  the next frontier item, so one call per item instead of two. A link whose target the run
  already reached is no longer clicked again: `get_next_frontier_item` records it as an
  `inferred` transition with the earlier click's evidence (`frontier_infer` trace event;
  coverage reports `actions_inferred` apart from `actions_executed`). BA reads: state `elements`
  are key strings plus `elements_without_box` (−28 % per `get_evidence`), `get_run_evidence`
  items drop nulls and values equal to the page's `defaults` (actions pages −36 %). New
  `token-budget.e2e.test.ts` holds the scripted-drain budget (78 → 12 calls); `pnpm tokens:ba
  <run>` measures BA reads. Trace runs are unchanged. Findings F-01–F-04 in
  `specs/013-token-usage/findings.md` (`specs/013-token-usage` T001–T020). Branch
  `feature/013-r24-token-usage` (squash-merged on master, tag v1.0.12).
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
- R-42 no production guard (spec 021; the owner, 2026-10-13: "We should not have it at all to
  begin with. REMOVE IT."): `environment` is a label and changes no behaviour. A portal or
  environment without `max_action_class` has no limit (it was `read`); liveinsurer, marketsite and
  reference-insurer-readonly now say `read` explicitly. Removed: the production-address check
  (`env-guard.ts`, `ENV_GUARD_REFUSED`), the required `rate_limit` and placeholder-User-Agent refusal
  on production, the stop on a production CAPTCHA (hand-off to a human everywhere), Playwright traces
  only off production (`PATHFINDER_PW_TRACE`), the unused `PRODUCTION_REFUSED`. Constitution 5.0.0:
  Principle V without a production policy, plus the product rule "Pathfinder records the as-is;
  people draw the to-be in it; the assistant only proposes". Docs, glossary, crawler agent and
  ba-practice texts follow; the missing F-08@020 eval case is added.
- Moved the TypeScript workspace into `apps/crawler/` so the repo root can host other apps. Commit: b1639fc.

### Fixed
- R-52: radio and checkbox highlight crops in the export hold their labels (F-12@008); a
  re-issued action's stored decision follows the latest one (F-05@004); a revised BA record keeps
  its citations from runs outside the session (F-16@004); trace runs are no longer cut off by the
  map's depth budget (F-14@004); a pop-up's first request no longer crashes the request gate
  (spec 020 F-05). Gates LO-08, F-05@004, F-12@008, F-14@004 and F-16@004 moved from known gap to
  gate. The LO-35 known gap no longer reports "fixed" by chance: it waits until both A/B variants
  were seen with their text, and confirms they still split into two clusters (spec 020 F-07).
- The crawler never followed hash-route links (`#/polisy`): the ARIA snapshot quotes such a
  `/url` and the action extractor kept the quotes, so the target became `/%22#…` and was refused
  as out of scope, on every portal since R-07 (spec 014 F-08). Insurer client crawl coverage
  went from 1 to 4 of 6 screens.
- BA `get_run_evidence` `actions` items carried `role: null` and `name: null` since R-13; they
  now carry the action's real role and name (spec 013 F-01).
