# Spec 019: Capture everything — query parameters, URLs and redirects, plus the R-28 leftovers (R-37, R-38, R-45)

Branch `feature/019-r45-r37-r38-capture-everything` · Created 2026-10-11 · Status: built,
awaiting the owner's merge (2026-10-12). Success criteria: SC-001–SC-004 met (gates LO-52, LO-21/22,
LO-23, LO-24, LO-53); SC-005 met on bank (4 %) and insurer (7 %), not on shop and reference (12 %,
findings F-10); SC-006 met (bank 12/13, insurer 5/6, shop 4/6, reference 17/17); SC-007 met
(dashboard store picker, route tests); SC-008 met (bank BR-005)

**Input**: roadmap R-45 (R-28 leftovers: micro-frontend mounts inside frames, BA write refusals,
eval stores in the dashboard), R-37 (record every query parameter and their dependencies), R-38
(record every URL and every redirect). User, 2026-10-11: "these are quite small. Lets do it on one
branch. Kick off sdd now. Start working unless you need clarification … move questions to end."
Sources: `specs/009-legacy-proving-ground/gap-ranking.md` (LO-23, LO-24 reversed),
`specs/015-crawler-hardening/findings.md` (F-08, F-20, F-21, T021 as built).

## Problem

Pathfinder documents legacy systems whose value lies in their odd inner wiring. Today it throws
much of that wiring away:

- **Query parameters** are stripped or never stored. A state keeps only its route template (path,
  no query); an observation stores no URL at all; an edge stores the clicked action but not the
  URL it led to; an API call keeps a path-only template. Tracking parameters (`utm_*`, `gclid`, …)
  are dropped by normalisation. The BA therefore cannot see that `typ=R` makes `okres` a year,
  or that `tryb=druk` turns a statement into its print version.
- **Session ids in the path** (`;jsessionid=<sid>`) end up in route templates (LO-24 gap), so one
  legacy screen becomes as many route templates as there are sessions — the opposite of what we
  want: record the session id, never use it as identity.
- **URLs and redirects** are lost. Only a form POST's HTTP redirect hops are kept (as templates).
  A plain navigation's 301/302 chain, a meta refresh, a JS `location.replace`, a React-router
  change and a full reload to authenticate leave no trace, and a page that shows "Proszę czekać…"
  before redirecting is recorded as a screen of its own (LO-23 gap).
- **R-28 leftovers**: a micro-frontend that mounts late inside a frame is read empty (the mount
  wait probes only the top document); about 40 % of the BA's `create_record` calls are refused
  (F-20: 18 `SCHEMA_INVALID`, 12 `RELATION_NOT_ALLOWED` of 72 on the bank), so documentation is lost
  and tokens wasted; the dashboard shows a portal as empty when its data sits in an eval workspace
  (F-21).

## Principles that shape the fixes

- **Capture more, not less** (user, gap ranking): every URL is stored verbatim, with every query
  parameter, path parameter and fragment, session ids and tracking parameters included. Nothing is
  normalised away in what is stored; normalisation is used only to decide identity.
- **Recorded, not identity**: parameters do not decide which screen a page is. The route template
  (path, with path parameters stripped) plus the page content stay the identity; a parameter that
  really selects a different screen shows up as different content and so as a different state.
- **Observed vs inferred** (constitution I): what the crawler saw (a URL, a redirect hop, a
  parameter value) is evidence; a dependency between parameters is the BA's inference, cited to
  the observations that support it and labelled `inferred` until confirmed.
- **Deterministic tools, one agent** (constitution III, VII): URL and redirect capture and the
  parameter inventory are deterministic code; the crawler agent gets no new tool.
- **Safety unchanged** (constitution V): following a client-side redirect is not an action; it
  goes through the same scope and robots checks as any navigation.

## User stories

### US1 Every query parameter is recorded and its dependencies documented (R-37, LO-24) — priority P1

A BA documents a legacy portal whose screens are driven by several intertwined query parameters.

- **AS1.1** Given any page the crawler observes, then the observation stores the full URL as the
  browser had it (scheme, host, path with path parameters, every query parameter in its original
  order and spelling, fragment), including tracking parameters and session ids.
- **AS1.2** Given an action that leads to another page, then the edge stores the URL before and
  the URL after the action.
- **AS1.3** Given an API call or form submit the page makes, then the call stores its full URL
  with its query parameters, besides its template; a form POST's body field names are kept apart
  from the body's content type, so a field named `content_type` is not lost (F-08).
- **AS1.4** Given `/legacy/bank/historia.do;jsessionid=<sid>`, then the state's route template does
  not contain the session id (`/legacy/bank/historia.do`), while the observation's URL does
  (LO-24 promoted from gap to gate, its catalogue entry rewritten).
- **AS1.5** For each screen, a **parameter inventory** lists every query and path parameter seen on
  the URLs it was reached under: name, the distinct values observed (bounded list plus a count),
  how many observations carried it, and which actions or redirects set it.
- **AS1.6** The BA can read the inventory with the run evidence and documents parameter
  dependencies as records (data items and business rules) that cite the observations; the BA
  practice tells the BA to look for parameters that change the screen, parameters that only
  matter in combination, and parameters carried from page to page.
- **AS1.7** A proving-ground case with intertwined parameters (one parameter selects the print
  version of a screen; another's format depends on a third; a session id in the path) lets a gate
  check that every parameter and value is recorded and that the inventory names them per screen.

### US2 Every URL a screen was reached under and every redirect is recorded (R-38, LO-23) — priority P1

- **AS2.1** Given a navigation that passes through HTTP redirects (shop `/shop/index.php?cat=7` →
  301 → `/old/kategoria/7` → 302 → `/sklep?kategoria=7`), then the redirect chain is recorded on the
  navigation: every hop's URL, its status and its kind (`http`).
- **AS2.2** Given a page that redirects by meta refresh or script (insurer `/polisa.php?id=7` →
  "Proszę czekać…" → meta refresh → `/stare/polisa/7` → `location.replace` →
  `/ubezpieczenia#/polisy/7`), then the crawler waits through the client-side redirects (bounded),
  records each hop with its kind (`meta_refresh`, `script`), and records the final screen — the
  interstitial is a hop, not a state; the old and the new URL land on one state (LO-23 promoted).
- **AS2.3** Given a single-page app that changes its URL without loading a document (history API
  or hash change) during an action, then the URL change is recorded as a hop of kind
  `same_document`; given a full reload (for example a reload to authenticate), the hop is of kind
  `reload`.
- **AS2.4** For each screen, the list of **entry URLs** (every distinct URL the screen was observed
  under, with how it was reached: direct navigation, an action, a redirect chain) is available to
  the BA and in the export, so the BA can document entry points and old-versus-new URL schemes.
- **AS2.5** A redirect hop that leaves the portal's scope or is blocked by robots is recorded with
  the reason it was not followed, never silently dropped.

### US3 Micro-frontends mounting late inside frames are waited for (R-45 item 1, LO-02) — priority P1

- **AS3.1** Given a page whose same-origin frame loads its own front end at run time and mounts it
  late, when the crawler settles the page, then it waits (bounded by the same per-portal mount
  wait) until the frame's mount points have content, and the frame's content is part of the
  observed screen.
- **AS3.2** A mount still empty when the wait runs out is reported per frame (the timeout event
  names the frame), as the top document's mounts are today.
- **AS3.3** A proving-ground case (a frame whose app mounts after a delay) backs a gate.

### US4 The BA's writes are accepted the first time (R-45 item 2, F-20) — priority P1

- **AS4.1** The refused calls of the last bank evals are classified by cause (element shape,
  missing route templates, empty verbatim label, relation not allowed, other) and the causes are
  written down in the findings.
- **AS4.2** Where the BA writes records it is shown the shapes it must use and the allowed
  relations (from the same source the server checks against), so the BA practice and the server
  cannot disagree; every example record in the BA practice passes the record schemas (a fast test).
- **AS4.3** A refused write tells the BA exactly what to change (the field, the expected shape,
  the allowed relations for that pair of kinds), so a retry succeeds.
- **AS4.4** The eval reports refused writes over all write calls per BA session (successful
  results counted, not calls), with the counts by error code.

### US5 The dashboard finds data that lives in eval workspaces (R-45 item 3, F-21) — priority P2

- **AS5.1** The data-store switcher lists, besides the stores of the main data directory, the eval
  workspaces on this machine, newest first, labelled with their portal and time.
- **AS5.2** Choosing an eval workspace shows its data like any other store, read-only.
- **AS5.3** A portal with no data in the current store says so and names the stores (including eval
  workspaces) that do hold data for it.
- **AS5.4** The startup line prints the store actually used (directory and environment after
  fallback), not only the requested environment.

## Edge cases

- Very long or binary-looking parameter values (tokens, view state): stored verbatim in the URL;
  the inventory keeps a bounded number of distinct values per parameter and a total count.
- Repeated parameter names (`?a=1&a=2`) and parameters without a value (`?flag`): kept as they are,
  in order.
- A URL with a percent-encoded or non-UTF-8 query: stored as the browser reports it.
- Redirect loops: the wait for client-side redirects is bounded by hop count and time; a loop is
  recorded as such and the last page observed.
- A meta refresh with a long delay (for example a 30 s session-timeout warning) is not a redirect
  to wait for: only short delays (up to a bound) are followed.
- A redirect to another origin within scope (SSO-like hop) is recorded; outside scope it is recorded
  with the reason it was not followed.
- A frame that never mounts, is cross-origin, or is removed mid-wait: the wait ends and the reason
  is reported; the run continues.
- Old data recorded before this feature has no URLs: views and the BA read them as "not recorded".
- An eval workspace deleted while the dashboard shows it: the dashboard falls back to the default
  store and says why.

## Functional requirements

- **FR-001** Every observation stores the full observed URL verbatim (AS1.1); every frame read as
  part of the observation keeps its full URL too (already in the page composition).
- **FR-002** Every edge stores the URL before and after its action, and the hops between them
  (redirect chain, AS2.1–AS2.3).
- **FR-003** Every recorded API call and form submit stores its full URL; form-body field names are
  kept under their own key, separate from the content type (F-08).
- **FR-004** Route templates strip path parameters (`;name=value`) from each segment; stored URLs
  keep them (LO-24).
- **FR-005** A per-screen parameter inventory is derived deterministically from stored URLs and
  edges (no new crawl data needed beyond FR-001–FR-003) and is exposed to the BA with the run
  evidence and to the dashboard and the export.
- **FR-006** Navigation hops are recorded with kind `http` (with status), `meta_refresh`, `script`,
  `same_document` or `reload`, in order, each with its URL; hops not followed carry the reason.
- **FR-007** After a navigation or action, the crawler waits through client-side redirects that start
  within a bounded window (meta refresh up to a bounded delay, script navigation during settle),
  bounded in hops and time, before observing; an interstitial passed this way is not recorded as a
  state.
- **FR-008** Entry URLs per screen (AS2.4) are available to the BA and in the export.
- **FR-009** The mount wait probes the top document and every same-origin frame the observation
  reads, within one shared time bound; mount timeouts name their frame.
- **FR-010** The BA's write tools carry, in their description or in an explicit read, the record
  shapes and the allowed relations derived from the server's own schemas and relation rules.
- **FR-011** Refusals name the offending field and the expected shape or allowed relations.
- **FR-012** The eval records BA write refusals (rate and counts by code) per BA session.
- **FR-013** The dashboard lists eval workspaces in the store switcher, shows them read-only, names
  where an empty portal's data is, and prints the resolved store at startup.
- **FR-014** Gates: LO-23 and LO-24 promoted from `gap()` to `gate()`; new gates for intertwined
  parameters, redirect chains of each kind, and a late mount inside a frame.
- **FR-015** Old stores keep working: new columns are optional and migrations are reversible.

## Key entities

- **Observed URL**: the verbatim URL of an observation (and of each frame in it).
- **Navigation hop**: one step from one URL to the next with its kind, status (HTTP only), and
  whether it was followed (with the reason when not). An edge or a direct navigation has an ordered
  list of hops.
- **Parameter inventory** (read model, per screen): parameter name, where it lives (query, path,
  fragment), observed values (bounded) and count, observations carrying it, actions or hops that
  set it.
- **Entry URL** (read model, per screen): a distinct URL the screen was observed under and how it
  was reached.
- **Data store**: a data directory plus environment; eval workspaces are data stores too.

## Success criteria

- **SC-001** On the proving-ground parameter case, 100 % of the query and path parameters and their
  observed values appear in the screen's parameter inventory (gate).
- **SC-002** On the shop and insurer redirect cases, 100 % of the hops are recorded with the right
  kind and order; the insurer's old and new policy URLs land on one state (LO-23 gate green).
- **SC-003** No route template recorded on any proving-ground portal contains a session id (LO-24
  gate green).
- **SC-004** The late-mounting frame's content is observed in 100 % of gate runs.
- **SC-005** BA write refusals on the bank eval fall from about 40 % to under 10 % of write calls,
  with no loss in the BA's coverage scores.
- **SC-006** Crawl coverage of the four eval tasks does not drop (reference 17/17, shop 4/6, bank
  10/11, insurer 5/6 or better).
- **SC-007** A BA opening the dashboard after an eval finds the eval's data within one switch of the
  store picker, with no command line.
- **SC-008** On the parameter case, the BA documents at least one parameter dependency as a record
  that cites the observations (eval check on the BA output).

## Assumptions

- The gap ranking's wording is the requirement: "capture everything", session ids included; test
  and dev systems only, no masking of URL values (constitution 2.0.0+, usefulness over security).
- Identity stays route template + content (the safer default: parameters are recorded, not used as
  identity). A parameter that selects a different screen is caught by different content.
- "Short" meta refresh: up to 5 s by default, settable per portal; the client-redirect wait is
  bounded at 5 hops and the same time bound.
- Playwright's own navigation events are enough for document navigations and redirect chains;
  DevTools-protocol capture (R-18) is not needed for this scope. If it is, that part is deferred to
  R-18 and noted.
- Eval workspaces are found under the system temp directory with the existing `pf-eval-<portal>-*`
  naming; no copying of eval stores into `data/`.
- Re-running the four evals for SC-005/SC-006 uses the owner's agent quota, one eval at a time, as in
  spec 014/015.

## Out of scope

- Using parameters as screen identity (configurable identity parameters per portal): only if the
  gates show merged screens that should be split; noted as a follow-up.
- Pop-up windows (LO-27), A/B variants (LO-35), the frontier stopping rule (F-17): R-35.
- DevTools-protocol network capture beyond navigations (R-18).
- Dashboard redesign (R-43); only the store switcher and the empty-portal message change.
