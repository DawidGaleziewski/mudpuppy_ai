# Research: spec 019 (capture everything + R-28 leftovers)

Read 2026-10-11 from the code on master `a781e77`, the bank BA transcript `e38c21e7…` (promoted
baseline of 2026-10-09) and the proving ground.

## R1 Where the URLs live today

| Data | What is stored | Lost |
| --- | --- | --- |
| `states.route_template` | path template, no query, path parameters kept (`;jsessionid=…`) | query, fragment (unless hash route), host |
| `state_observations` | one row per (run, state), PK `(run_id, state_id)`, no URL | every URL; a second URL reaching the same state in a run |
| `edges` | `action_json` (role, name, href of a link) | the URL before/after, redirects |
| `network_calls.url_template` | path-only template, PII masked | query, host, verbatim URL |
| form POST `res_schema.redirects[]` | hop status + URL template | hop URLs with query |
| trace evidence files | `observed.url` in the step's before/after | not queryable, map runs have none |

`normalizeUrl` (fingerprint) drops tracking parameters and sorts the query; it is used for identity
only and stays so, but nothing stores the raw URL beside it.

**Decision**: a new table `page_visits`: one row per arrival on a page (every `navigate`, every
`act` that observed a page, every re-login return), with the verbatim URL, the state, the edge that
led there (null for a direct navigation), how it was reached and the ordered hops. It is the single
source for the parameter inventory (R-37) and the entry URLs and redirects (R-38).
`network_calls` gets a nullable `url` (verbatim). **Alternatives**: a `url` column on
`state_observations` (loses repeat visits, the PK is per run and state); URLs inside
`action_json`/`composition_json` (not queryable, mixes concerns).

## R2 Masking and secrets

Vault secrets are already redacted from every DB write by `secretsPlugin` (FR-019 of spec 009), so
a credential that lands in a URL never reaches the store. Beyond that, URLs are stored verbatim
("capture everything", session ids included, constitution 2.0.0+). A portal with `pii_scrub: true`
gets `maskText` applied to stored URLs, as to every other text it stores.

## R3 Path parameters and route templates (LO-24)

`/legacy/bank/historia.do;jsessionid=<sid>` keeps `;jsessionid=<sid>` in the route template: one
screen per session. **Decision**: `normalizeUrl` strips `;…` from each path segment (matrix/path
parameters) before templating; the verbatim URL keeps them, and the inventory lists them with
`in: "path"`. `apiUrlTemplate` follows (it uses the same templater). Old stores keep their old
templates; new runs produce the stripped ones (a re-scan creates new states for those screens,
accepted: the old ones were wrong).

## R4 Capturing hops

Playwright gives, without the DevTools protocol:

- `request` / `response` for `document` requests of the main frame, with `redirectedFrom()` chains:
  HTTP 3xx hops with status;
- `framenavigated` (main frame): fires for document loads **and** same-document changes (history
  API, hash); a `framenavigated` with no document request since the last one is a
  `same_document` hop;
- in the new document, `performance.getEntriesByType('navigation')[0].type` (`navigate`, `reload`,
  `back_forward`) tells a reload;
- a meta refresh is visible in the document (`meta[http-equiv=refresh]`, its delay and target);
  a document navigation that starts with no action in progress and matches the previous document's
  meta refresh target is `meta_refresh`, any other is `script`.

**Decision**: a `NavigationRecorder` in `@pathfinder/crawler` (beside `NetworkRecorder`), attached
by the session, drained by a new pipeline step after `net_drain`. Hop kinds: `start` (the URL the
step asked for: `navigate` target or the page before an action), `http` (with status),
`meta_refresh`, `script`, `same_document`, `reload`, `blocked` (not followed, with reason).
R-18 (DevTools capture) is not needed for this scope.

## R5 Waiting through client-side redirects (LO-23)

The insurer's `/polisa.php?id=7` shows "Proszę czekać…" with `<meta http-equiv=refresh
content="1;url=/stare/polisa/7">`, then `/stare/polisa/7` runs `location.replace('/ubezpieczenia#/polisy/7')`.
Settle finishes inside the 1 s delay, so the interstitial is observed and recorded as a state.

**Decision**: the settle step, after settling, looks for a meta refresh with delay ≤
`scope.client_redirect_wait_ms` (portal config, default 5000) and for a main-frame navigation
already in flight; it waits for that navigation (delay + 2 s grace), settles again, and repeats up
to 5 hops. Each navigation goes through the same scope/robots policy (`navigationPolicy`): a
target out of scope is not followed (the browser already went there for script redirects — the
recorder marks the hop `blocked` with the reason and the observation proceeds where the browser
is, as today for out-of-scope landings). A meta refresh with a longer delay is recorded as a hint
on the visit (`meta_refresh_pending`), not followed.

## R6 Parameter inventory (read model)

Pure function `parameterInventory(visits, edges)` in `@pathfinder/docs` (feature layer; both the BA
server and the export use it): per state, per parameter name and location (`query`, `path`,
`fragment_query` for `#/x?y=1`): distinct values (first 20, in first-seen order) and their count,
the number of visits that carried it, and the set-by list (edge ids and hop kinds whose target URL
introduced or changed the value). Parsing keeps repeated names and valueless parameters. The
dashboard computes the same in Python (`queries_urls.py`) for display; a fixture test in each keeps
them in step on one shared JSON fixture (`data/fixtures/param-inventory.json`).

## R7 The BA reading URLs

`get_run_evidence` gets two kinds: `page_visits` (url, state, via, edge, hops) and `parameters` (the
inventory per state of that run). `ba-practice` gets a short "URLs and parameters" pass: entry
points per screen, old/new URL schemes, redirects worth documenting, parameters that select a
screen variant, parameters that only matter together, parameters carried from page to page;
documented as `data_item` (one per parameter worth documenting, `seen_in` a `page_visit`) and
`business_rule` (the dependency), citing visits. `EvidenceTargetKind` and `data_item.seen_in.kind`
gain `page_visit`.

`reads.ts` is 621 lines (G-01/G-06): the new kinds go into `services/ba/reads-urls.ts`; the evidence
kind table moves with them so the file shrinks instead of growing.

## R8 BA write refusals (F-20) — classified

Bank BA `e38c21e7…`: 72 `create_record` → 42 stored, 30 refused; 13 `revise_record` → 3 refused.

| Cause | Count | Example |
| --- | --- | --- |
| Content shape guessed on the first write of a kind | 12 | `screen` with `route`, `page_title`, elements as strings; `use_case` with `actor`, `steps`; `process`, `business_rule`, `nfr`, `open_question`, `followup` without their required fields |
| Nested shape wrong after the first fix | 6 | `main_flow` as strings, `seen_in` as strings, `constraints.required: "yes"`, `followup.target.route` |
| Empty `label_verbatim` (icon-only control) | 3 | `elements.4.label_verbatim: Too small` |
| Relation guessed | 12 | `capability appears_on screen` (6), `use_case refines capability` (4), `business_rule enforces capability` (3), `capability contains use_case`, `use_case describes capability` |

All shapes and relations are documented correctly in `ba-practice/references/record-kinds.md`; the
BA does not open the reference before writing. The tool description says only "Fields of the
record kind".

**Decision**: (1) `create_record`'s description carries one compact line per kind (required fields
and nested shapes) and the relation triples, both **generated** from the Zod schemas and
`RELATION_RULES` (`describeRecordKinds()` in `@pathfinder/docs`), so they cannot drift; (2) a
`SCHEMA_INVALID` answer carries `expected` = that kind's line; a `RELATION_NOT_ALLOWED` answer
lists every relation the source kind may assert; (3) the skill says: an element without a visible
label is left out of `elements` (its key goes in the evidence instead); (4) a fast test checks that
the field names in `record-kinds.md` match the schemas. A relation refusal still refuses the whole
record (atomic writes stay; question for the owner whether to store the record and drop the bad
relation instead).

## R9 Measuring refusals in the eval

The eval harness already reads the BA transcript (password sweep, `docs-coverage`). **Decision**: a
code grader `ba-writes.ts` counts write calls (`create_record`, `revise_record`, `withdraw_record`)
and their error results by code, from the transcript's `tool_use`/`tool_result` pairs, and writes
`ba_write_refusals: { calls, refused, rate, by_code }` into the trial's scores. No tolerance gate in
this spec (a first measurement); SC-005 is read from it.

## R10 Mount waits inside frames

`settle.ts` calls `waitForMounts(rs.session.page, …)`; `observePage` reads frames up to
`scope.frame_depth`, same-origin and in scope. **Decision**: `waitForMountsIn(page, frames, maxMs)`
probes the page and every same-origin, in-scope frame (the same filter `observePage` uses) with one
shared deadline; `MountWait` gains `frames[]` with each frame's URL and probe; `mountReports` names
the frame. Proving ground: the estate's bundle delay cookie (`estate.py`, `?ms=`) already delays
bundle loads; a new wrapper page in the bank embeds a same-origin page whose app mounts through an
import map after the delay.

## R11 Dashboard and eval workspaces (F-21)

The dashboard resolves one `data_dir` and an `env` (`data/db/<env>.sqlite`). Eval workspaces are
`<tmp>/pf-eval-<portal>-<rand>/data/db/sandbox.sqlite`. **Decision**: a *store* is (data dir, env);
`list_stores()` returns the main data dir's environments plus every eval workspace found under
`tempfile.gettempdir()` (newest first, label `eval · <portal> · <mtime>`); the store picker uses a
`store` key (`main:<env>` or `eval:<dirname>`), resolved server-side to a path (never a raw path
from the request). The empty-portal page queries the other stores' `runs` for the portal and lists
them as links. The startup line prints the resolved store path. Deleted workspace → fall back to
the default store with a flash note.

## R12 Proving-ground parameter case (LO-52, new)

A legacy bank statement page `wyciag.do;jsessionid=<sid>?konto=<nr>&typ=M|R&okres=<YYYY-MM|YYYY>&tryb=podglad|druk`,
linked from `menu.do` with two links (monthly preview, yearly print): `tryb=druk` renders a print
layout (a different screen), `typ` decides the format of `okres` (a mismatch shows an error), the
`konto` value is carried from `lista.do` links. Ground truth: one screen (+ print variant), two
rules (the `typ`/`okres` dependency; `tryb` selects the print view), parameters listed. The bank
ground truth grows by 2 screens, so `crawl_screens` denominators change (11 → 13); SC-006 is read
against the new totals.

## R13 Gate ids

The catalogue ends at LO-51. `docs/legacy-obstacles.md` gets **LO-52** (intertwined query
parameters) and **LO-53** (a micro-frontend mounting late inside a frame); LO-23 and LO-24 are
rewritten ("record every URL the screen was reached under, merge the screen"; "record the session
id, never part of the route template"). Gates: LO-23 and LO-24 promoted; LO-52 and LO-53 new; the
existing LO-21 (HTTP chain) and LO-22 (meta refresh + script) gates also assert the recorded hops
and their kinds (LO-22 loses its `setTimeout(2500)`, G-28).
