# Session dump: 2026-09-24, target change and R-11 spec + plan (portal-agnostic safety)

Branch `feature/002-r11-portal-agnostic-safety`, **stacked** on `feature/001-r04-core-crawler-map-mode` (master
`348fac0` has none of the 001 code; R-11 must merge after 001). Read this, then `roadmap.md`,
`specs/002-portal-agnostic-safety/plan.md` and `specs/001-crawler-map-mode/tasks.md`.

## State at end of session
- Spec 002 written and planned; **next step: `/speckit-tasks`** for spec 002, then implementation.
- Spec 001: 71 of 74 tasks `[X]`. Open T059, T072, T073, T074, now **retargeted to liveinsurer** (roadmap Notes).
  T073 note in `tasks.md`: §1 and §5 pass (see below).
- Working tree clean. Commits this session:
  - `5806681` (user): removed `*:Zone.Identifier` files, `.gitignore` rule, T073 §1/§5 note
  - `db05277` liveinsurer portal + guest persona (on the 001 branch)
  - `d883aa9` (po) roadmap: R-11 added, live runs retargeted to liveinsurer, branch-stacking note
  - `69c232d` spec 002 + checklist; `3117c1d` plan, research, data-model, contracts, quickstart
- Not committed on purpose: `.specify/feature.json` (gitignored) points at `specs/002-portal-agnostic-safety`.

## Quickstart 001 §1 and §5 (T073, partial)
- Run by a script (`StdioClientTransport` → real `pnpm ... start`) with `PATHFINDER_ROOT` scratch copies, not via the
  crawler subagent: auto mode denied editing `portals/marketsite/portal.yaml` (production config).
- §1: staging copy refused `ENV_GUARD_REFUSED` in 18 ms, 0 requests. §5: 403 on first request → `stopped_warning`,
  `block_detected`, later tools `RUN_STOPPED`, resume `RUN_NOT_RESUMABLE`, 0 further requests.
- The "ignore the block" subagent prompt moved to T074's live bypass run.

## Target decision (legal review)
- **MarketSite on hold**: Regulamin MarketSite art. 10.10, "Pobieranie lub wykorzystywanie w jakimkolwiek zakresie
  dostępnych w ramach MarketSite materiałów wymaga każdorazowo zgody marketsite.example". The user does not want to break the law.
- Rejected: CLASSIFIEDS (Regulamin §1.3, written consent + aggregation ban), Onet (RASP bans scraping/TDM), justjoin.it
  (database right + no copying/downloading), ubezpieczenia.orange.pl (§7 explicit bot ban), bulldogjob.pl (403/406 to
  fetches). Uncertain: forum.example and pl.wikipedia.org (robots disallows `/api/` that their pages call), 9gag (bot
  protection), warta.pl (non-commercial only), axa-assistance.pl (review incomplete).
- Legally clean options noted: books.toscrape.com (smoke), dane.gov.pl (open data, complex SPA).
- **Chosen practice target: liveinsurer.example** (terms only forbid further distribution). `portals/liveinsurer/portal.yaml`:
  scope `www.liveinsurer.example` only (form., zgloszenia., fundusze. stay external), Cookiebot decline
  `#CybotCookiebotDialogBodyButtonDecline`, 1 rps, 300 states, 40 actions/state (mega menu ~250 links), denylist incl.
  `path:/logowanie/*`, `path:/quote/*`, `path:*.pdf`, `wroc-do-wyliczenia`; item templates `/porady-{komunikacja,
  nieruchomosci,podroz}/:slug`, cap 10. Compliance fields and UA contact **left null for the user** (T072).
- **Gap found**: robots.txt query rules (`*cHash*`, `/*?id=*`, `*no_cache*`) cannot be expressed; `path:` globs ignore
  the query. Campaign links with `cHash` are in liveinsurer menus. Verified: the cHash URL is `allowed` today.

## Spec 002: portal-agnostic safety and portal workspaces (R-11)
User asked: app portal-agnostic, but data, personas, mixins and fixes kept separate per portal. Clarification answered:
option C, per-portal `robots_page_requests: block | allow_and_record`, default `block`.
- US1 P1 robots.txt fetched and enforced automatically (RFC 9309, path+query, 4xx = no rules, 5xx/unreachable =
  refuse, `ROBOTS_UNAVAILABLE` on start, evidence + snapshot, re-fetch on resume/24 h, Crawl-delay only slows).
- US2 P2 `url:` denylist entries (path+query); `path:` unchanged.
- US3 P2 generic rule ids `purchase`, `contact_or_message`, `reveal_contact`, `submit_request`; old marketplace ids are
  aliases (`buy_now→purchase` shown in refusals); 001 fixture classes must not change; second mock portal (insurer).
- US4 P3 portal `action_rules` (phrases + path globs; can only add or raise; `read` and alias ids rejected).
- US5 P2 portal workspaces: config only under `portals/<p>/`, `personas/<p>/` (+ `personas/<p>/_mixins/`); persona
  `extends` fenced to shared mixins and own portal; every record attributable to one portal; per-portal state identity;
  `portal:export` / `portal:delete` operator scripts with `portal_data_log`.
- 28 FRs, 9 SCs; SC-007: no portal names in code (grep is empty today).

## Plan 002 key decisions (see research.md §1-§12)
- In-house pure RFC 9309 parser `safety/src/robots.ts`, no new dependency; fixtures = real robots files saved today.
- `RobotsRegistry` per run in `crawler`; enforced in `action-gate.decide` (after scope, `unknown` passes) and in
  `request-gate` (awaits `ensure(host)`; navigations always, page requests per `robots_page_requests`). Only hosts in
  `allowed_domains` are robots-checked. Fetch with Node `fetch` via the run limiter + UA, manual redirects (max 5),
  10 s timeout, not through `detectBlock`.
- `ACTION_RULES` → `RuleSet` param for `classifyAction`/`classifyUrl`/`checkDenylist`; built per run in `RunState`.
- **Existing bug the plan fixes**: `states` has a global `UNIQUE(fingerprint)` and `browser-runtime.ts` rebuilds the
  fingerprint index from all states ("clusters are global"), so identical pages on two portals merge. Migration
  `0002_portal_workspaces` (via **db-admin**): `states.portal_id` + `UNIQUE(portal_id, fingerprint)` (table rebuild),
  frontier status `robots_disallowed`, decision_log kind `note`, tables `robots_policies`, `portal_data_log`.
- Evidence stays flat content-addressed; delete removes only files no other portal references.
- Persona fence: `loadPersona(file, { fence })` with realpath check; `preflight` passes `[personas/_mixins, personas/<p>]`.
- Complexity tracking: `allow_and_record` loosening; Crawl-delay slows the whole run.

## Environment notes
- Chromium libs still missing system-wide (`libnss3`, `libnspr4`, `libasound2t64` on this Ubuntu). Workaround:
  `apt-get download` + `dpkg-deb -x` into the session scratchpad + `LD_LIBRARY_PATH` (gone with the session).
  Permanent fix needs sudo: `pnpm --dir apps/crawler exec playwright install --with-deps chromium`.
- No `pdftotext`/`pypdf`; poppler extracted the same way (needs `libpoppler134`, `libopenjp2-7`) to read terms PDFs.
- marketsite.example and bulldogjob.pl answer WebFetch with 403.

## Next session
1. `/speckit-tasks` for spec 002 (then `speckit-analyze` via po; po may retitle R-11 "... and portal workspaces").
2. Implement in build order: safety (robots parser, RuleSet, aliases, url:) → config (schema, fence) → migration 0002
   (db-admin) → crawler (registry, gates) → mcp-server (start_run, fingerprint scoping) → mock-insurer + scripts → 001
   docs retarget (FR-022; po listed the files: 001 spec, plan, quickstart, tasks T045/T046/T059/T072, contracts).
3. User: T072 for liveinsurer (fill `compliance.*`, real UA contact; I must not fill these), then the live liveinsurer run closes
   T059/T073/T074.
4. Optional: `.gitignore` `data/exports/` when the export script lands.
