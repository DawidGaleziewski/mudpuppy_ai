# Feature Specification: Portal-Agnostic Safety and Portal Workspaces

**Feature Branch**: `feature/002-r11-portal-agnostic-safety`

**Created**: 2026-09-24

**Status**: Draft

**Input**: User description: "Portal-agnostic safety for Pathfinder, so the read-only crawler can gather requirements from any configured portal, not only a marketplace like MarketSite. Builds on spec 001 (crawler map mode). Scope: automatic robots.txt compliance with path and query matching; a `url:` denylist entry; generic built-in safety rule ids with the marketplace ids kept as aliases; per-portal custom action rules and extra-language keywords that can only add or raise; a second, non-marketplace mock portal in the tests; spec 001 docs and the crawler agent treat the target as a configured portal. Success: a liveinsurer map run cannot request any robots-disallowed URL including cHash campaign links; a new portal of a different kind needs only YAML, no code change. Follow-up (2026-09-24): the app is portal-agnostic, but data gathered per portal, personas, mixins and portal fixes stay separated by portal."

## Context

Spec 001 delivered a read-only `map` crawler whose safety gates, config loaders and MCP server
already work. Its first target, MarketSite, is on hold: the operator's main Regulamin
(art. 10.10) requires consent for downloading materials. The practice target is now liveinsurer.example.
Moving to a second portal showed three places where spec 001 still assumes one marketplace:

1. `robots.txt` rules are copied by hand into each portal's denylist, and denylist globs see only
   the URL path, so rules on the query string (liveinsurer.example disallows `*cHash*`, `/*?id=*`,
   `*no_cache*`) cannot be expressed. Campaign links carrying `cHash` sit in liveinsurer's menus.
2. The built-in safety rule names (`bidding`, `buy_now`, `message_or_contact_seller`,
   `reveal_seller_contact`) describe a marketplace, and a portal cannot add its own.
3. The only test portal is a marketplace, so nothing proves the gates hold on another site shape.

This feature removes those assumptions so that a new portal of any kind is onboarded with
configuration only.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - robots.txt is obeyed without hand-copying (Priority: P1)

An operator adds a portal config and starts a `map` run. Before the first page opens, the
system reads the portal's `robots.txt` and from then on refuses to open any URL it disallows for
the crawler's User-Agent, including rules that depend on the query string. The operator no
longer copies robots rules into the denylist, and a stale or mistyped copy can no longer let
the crawler into a disallowed area.

**Why this priority**: It is the one gap that blocks the first live run on liveinsurer.example, and it is
a legal and courtesy baseline for every portal (constitution Principle V).

**Independent Test**: Run a `map` run against a mock portal whose `robots.txt` disallows a
path, a query pattern (`*cHash*`) and an `Allow` exception, and whose pages link to all of them.
Confirm that no disallowed URL is ever requested, the allowed exception is visited, and each
refusal is in the decision log with the robots rule that applied.

**Acceptance Scenarios**:

1. **Given** a portal whose `robots.txt` disallows `*cHash*`, **When** the crawler meets the link
   `/formularze-online/?itm_campaign=x&cHash=02e3`, **Then** it does not request it, records the
   action as skipped with reason `robots_disallowed` and the matching rule, and continues.
2. **Given** `Disallow: /quote/` and `Allow: /quote/start*`, **When** the crawler meets
   `/quote/start` and `/quote/summary`, **Then** `/quote/start` is allowed and `/quote/summary`
   is refused (the most specific rule wins, `Allow` wins a tie).
3. **Given** `robots.txt` has a group for the crawler's own User-Agent token and a `*` group,
   **When** rules are applied, **Then** only the crawler's own group is used.
4. **Given** `robots.txt` returns 404, **When** a run starts, **Then** every URL in scope is
   allowed by robots (other gates still apply) and the run records that no robots file existed.
5. **Given** `robots.txt` cannot be fetched (timeout, network error or 5xx), **When** a run
   starts, **Then** the run is refused before any page opens, with a reason naming the failure.
6. **Given** a completed run, **When** the operator inspects it, **Then** the exact `robots.txt`
   content that applied, where it came from and when it was fetched are stored as evidence and
   referenced from the run's configuration snapshot.
7. **Given** the agent calls `navigate` with a disallowed URL directly, **When** the gate checks
   it, **Then** it is refused with a robots rule, exactly like a disallowed link.

---

### User Story 2 - Manual URL rules that see the query string (Priority: P2)

An operator needs to keep the crawler away from URLs that `robots.txt` does not cover, for
example a tracking parameter or a session-bound page, and writes a denylist entry that matches
the full URL path plus query string.

**Why this priority**: Robots rules are the site's view; the operator sometimes needs a stricter
one. It is small and reuses the matching built for Story 1.

**Independent Test**: Add `url:/*?*sessionId=*` to a mock portal's denylist, link a page with
and without the parameter, and confirm only the parameterised URL is refused, citing the entry.

**Acceptance Scenarios**:

1. **Given** the denylist entry `url:*itm_campaign=*`, **When** the crawler meets a link carrying
   that parameter, **Then** it is refused as `denylisted` with rule `url:*itm_campaign=*`.
2. **Given** an existing `path:` entry, **When** the portal file loads, **Then** it behaves exactly
   as before (path only), so existing portal files keep their meaning.

---

### User Story 3 - Onboard a portal of a different kind with configuration only (Priority: P2)

An operator onboards an insurer, a job board or a news site. The safety vocabulary they write in
the denylist is general (`purchase`, `contact_or_message`, `reveal_contact`, `submit_request`),
so it fits any portal, and existing marketplace portal files keep loading unchanged.

**Why this priority**: This is what "portal-agnostic" means to the user: gathering requirements
from any portal without touching code.

**Independent Test**: Map a second, non-marketplace mock portal (insurer-style: product pages,
a cookie banner, a multi-step quote form, campaign links with query strings) using only a new
portal file and persona file. Confirm the quote form is recorded but never submitted, the
purchase and contact controls are skipped under generic rule ids, and no code was changed.

**Acceptance Scenarios**:

1. **Given** a portal denylist that lists `purchase`, **When** the crawler meets "Kup teraz",
   "Licytuj", "Kup polisę" or "Buy now", **Then** each is refused under `purchase`.
2. **Given** a portal file that still lists `buy_now`, `bidding`, `message_or_contact_seller` or
   `reveal_seller_contact`, **When** it loads, **Then** it loads without error, each old id acts as
   the generic id it maps to, and the decision log shows both the id written in the file and
   the generic id.
3. **Given** a form such as "Oblicz składkę" or "Wyślij zapytanie", **When** the crawler records
   it, **Then** its fields and constraints are recorded and its submit action is refused under
   `submit_request`.
4. **Given** the spec 001 fixture set of labelled actions, **When** it is classified after this
   change, **Then** every action gets the same safety class as before.

---

### User Story 4 - Portal-specific rules and other languages (Priority: P3)

An operator knows labels or paths on their portal that mean "this changes something" but that
the built-in keywords do not catch, or the portal is in a language other than Polish or English.
They add those words and paths to the portal file, attached to a built-in rule or to a new rule
with its own id and safety class.

**Why this priority**: The unknown-control default already keeps unrecognised buttons unclicked,
so this refines coverage and the frontier report's reasons rather than closing a safety hole.

**Independent Test**: Add a portal rule `renew_policy` (class external-side-effect, keyword
"przedłuż polisę", path `/przedluzenie/*`) and German keywords on `purchase` ("jetzt kaufen")
to the mock insurer portal; confirm both are refused under the right ids, and that a portal rule
trying to mark a keyword as read-only, or to lower a built-in rule's class, fails to load.

**Acceptance Scenarios**:

1. **Given** a portal rule with id `renew_policy`, class `external-side-effect` and keyword
   "przedłuż polisę", **When** the crawler meets that button, **Then** it is refused under
   `renew_policy` and the frontier report shows that id.
2. **Given** extra keywords on a built-in rule, **When** the portal loads, **Then** the built-in
   keywords still apply and the extra ones are added.
3. **Given** a portal rule with class `read`, or one that redefines a built-in id with a lower
   class, **When** the portal file loads, **Then** loading fails with an error naming the file,
   the rule and the problem.
4. **Given** a portal rule's id is also listed in its denylist, **When** the crawler meets a
   matching control, **Then** it is refused as `denylisted`, exactly like a built-in id.

---

### User Story 5 - Each portal is its own workspace (Priority: P2)

The app itself is portal-agnostic, but everything that belongs to one portal is kept together
and apart from other portals: its configuration and fixes (scope, denylist, obstacle handling,
custom rules, robots settings), its personas and portal-specific mixins, and all data gathered
from it. An operator can see, export or delete everything for one portal without touching
another, for example when an operator's terms change or the operator asks for its data to be
removed.

**Why this priority**: With a second portal in use (and a first one on hold for legal reasons),
mixing portals' data or letting one portal's persona or fix leak into another would make results
untrustworthy and data removal impossible to do cleanly.

**Independent Test**: Map the marketplace mock and the insurer mock into the same environment,
then export and delete all data for the marketplace mock. Confirm the export holds only that
portal's records and evidence, the delete leaves 0 of its records and evidence files, and the
insurer mock's records, evidence and resumability are untouched.

**Acceptance Scenarios**:

1. **Given** runs of two portals in the same environment, **When** the operator lists results
   or opens a report, **Then** each is scoped to one portal and every record shows its portal,
   persona and run.
2. **Given** a persona in `personas/liveinsurer/` whose `extends` points at a file in
   `personas/marketsite/`, **When** it loads, **Then** loading fails with an error naming
   both files; extending `personas/_mixins/` (shared) or `personas/liveinsurer/_mixins/` (liveinsurer's own)
   works.
3. **Given** identical pages on two portals (for example the same cookie-consent page),
   **When** both are mapped, **Then** each portal records its own state; states, clusters and
   frontier items are never shared or merged across portals.
4. **Given** the operator deletes a portal's gathered data, **When** it completes, **Then** its
   runs, states, transitions, forms, API shapes, notes, decisions, frontier items and evidence
   files are gone, evidence files also referenced by another portal are kept, and the deletion
   itself is logged with who and when.

---

### Edge Cases

- `robots.txt` redirects: redirects are followed up to 5 hops; a redirect to another host is
  followed and that file applies to the original host. More than 5 hops is treated as
  unreachable (run refused).
- `robots.txt` larger than 500 KiB: only the first 500 KiB is parsed, and the run records the
  truncation.
- A 4xx other than 404 (401, 403, 410): per the Robots Exclusion Protocol this means "no rules",
  so robots allows everything. The 403/429 block detector from spec 001 does not fire on the
  robots fetch itself, because a missing robots file is not a block.
- Several hosts in `allowed_domains`: each host's `robots.txt` is fetched before the first
  request to that host and applies only to it. An unreachable file refuses that host only; the
  run continues on the others and records the skip.
- A run resumed after an interruption, or running longer than 24 hours, fetches `robots.txt`
  again; if the rules changed, the new rules apply from then on and the change is logged.
- `Crawl-delay` in `robots.txt`: if it is slower than the portal's configured rate, the slower
  rate applies. A faster value never speeds the crawler up.
- Malformed lines in `robots.txt` are ignored, the rest is applied, and the number of ignored
  lines is recorded.
- Wildcards and end anchors (`*`, `$`) and percent-encoding: URLs and rules are compared
  after normalising percent-encoding, so `%7E` and `~` match the same rule.
- A link whose URL is allowed but redirects to a disallowed URL: the redirect target is checked
  before it is followed and refused if disallowed.
- Requests the page's own scripts make (images, styles, scripts, data calls) to robots-disallowed
  paths, such as a single-page app calling `/api/`: the portal file decides with
  `robots_page_requests: block | allow_and_record`, default `block` (FR-009). Sites such as
  forum.example or pl.wikipedia.org disallow `/api/` yet load it from their own pages, so a person
  may switch them to `allow_and_record` as part of the portal's compliance review.
- A portal rule keyword that also matches a built-in read keyword: the non-read rule wins, as
  in spec 001, where any non-read match raises the class.

## Requirements *(mandatory)*

### Functional Requirements

**Robots Exclusion Protocol**

- **FR-001**: Before the first request to a host in scope, the system MUST fetch that host's
  `robots.txt` through the same request controls as page traffic (identifiable User-Agent, rate
  limit, concurrency), and MUST NOT open any page on that host until it has done so.
- **FR-002**: The system MUST apply `robots.txt` according to the Robots Exclusion Protocol
  standard (RFC 9309): pick the group whose User-Agent token matches the crawler's product
  token, otherwise the `*` group; match rules against the URL path plus query string with `*`
  and `$` wildcards; the longest matching rule wins; `Allow` wins a tie.
- **FR-003**: Every main-frame navigation, whether from a link, a redirect, an `act` or a direct
  `navigate`, MUST be refused when robots disallows its URL. The refusal MUST be decision-logged
  and appear in the frontier report with reason `robots_disallowed` and the matching rule text.
- **FR-004**: A missing robots file (any 4xx) MUST mean "no robots restrictions" for that host.
  An unreachable file (network error, timeout, more than 5 redirects) or a 5xx MUST refuse
  all requests to that host; if the host is the portal's base URL host, `start_run` MUST be
  refused before any page opens.
- **FR-005**: The fetched `robots.txt` content, its source URL, HTTP status and fetch time MUST be
  stored as evidence and referenced from the run's configuration snapshot, so every refusal can
  be traced to the exact file that caused it.
- **FR-006**: `robots.txt` MUST be fetched again when a run resumes and when a run passes 24 hours
  since the last fetch; a change of rules MUST be decision-logged.
- **FR-007**: If `robots.txt` declares a `Crawl-delay` for the crawler's group that is slower than
  the configured rate limit, the slower rate MUST apply for that host.
- **FR-008**: Robots rules MUST NOT be overridable by the agent or by the persona. A portal file
  MAY only add stricter rules (denylist entries), never allow what robots disallows, with the
  single exception in FR-009.
- **FR-009**: Requests made by the page's own scripts (not main-frame navigations) to
  robots-disallowed URLs MUST follow the portal setting `robots_page_requests`: `block` (the
  default when absent) aborts them; `allow_and_record` lets them through the other request
  controls. Either way each such request MUST be recorded in the run report with its URL shape
  and the robots rule, and the setting in force MUST be part of the run's configuration
  snapshot. Main-frame navigations are always governed by FR-003.

**URL denylist entries**

- **FR-010**: A portal denylist MUST accept `url:` entries whose glob is matched against the URL
  path plus query string. Existing `path:` entries MUST keep matching the path only.
- **FR-011**: A refusal caused by a `url:` entry MUST be reported as `denylisted` with the entry
  text, like every other denylist entry.

**Generic rule vocabulary**

- **FR-012**: The built-in safety rules MUST include the generic ids `purchase` (buy now, bid,
  order, buy a policy or ticket), `contact_or_message` (send a message, contact form, ask a
  question), `reveal_contact` (show a phone number or address) and `submit_request` (quote
  requests, applications, sign-ups, callbacks, newsletter sign-ups), alongside `logout`, `delete`
  and `payment`, each with Polish and English keywords and path patterns.
- **FR-013**: The ids `bidding` and `buy_now` MUST be accepted as aliases of `purchase`,
  `message_or_contact_seller` of `contact_or_message`, and `reveal_seller_contact` of
  `reveal_contact`. Portal files using them MUST load unchanged, and records MUST show both
  the id as written and the generic id.
- **FR-014**: Every action in the spec 001 labelled fixture set MUST keep its safety class after
  the vocabulary change.

**Portal-specific rules**

- **FR-015**: A portal file MAY declare extra action rules, each with an id, a safety class of
  `mutating`, `destructive` or `external-side-effect`, and keywords and/or path patterns.
- **FR-016**: A portal file MAY add keywords and path patterns to a built-in rule id, for
  example words in another language. It MUST NOT remove built-in keywords or patterns.
- **FR-017**: A portal rule MUST NOT declare the class `read`, MUST NOT reuse a built-in id with
  a lower class, and MUST NOT reuse an alias id. Violations MUST fail loading with an error that
  names the file, the rule id and the problem (consistent with spec 001 FR-017).
- **FR-018**: Portal rules MUST apply to labels, link targets, form actions and direct
  `navigate` URLs exactly as built-in rules do, and a portal rule id listed in the portal's
  denylist MUST refuse matching actions as `denylisted`.
- **FR-019**: A portal's rules MUST apply only to runs of that portal.

**Portal independence**

- **FR-020**: The test suite MUST include a second mock portal of a non-marketplace kind
  (insurer-style: product pages, a cookie-consent dialog, a multi-step quote form, campaign
  links carrying query strings, its own `robots.txt` with `Disallow`, `Allow` and query rules),
  and the spec 001 end-to-end checks (read-only guarantee, frontier report, block stop, resume,
  locators, PII audit) MUST pass against it with configuration only.
- **FR-021**: No crawler, safety, MCP server or agent code MAY branch on a portal id or on a
  portal-specific string; everything portal-specific MUST come from the portal and persona
  files.
- **FR-022**: Spec 001 documents (spec, plan, quickstart, tasks, contracts) and the crawler agent
  definition MUST describe the target as "a configured portal". `marketsite` (on hold for
  legal reasons) and `liveinsurer` (current practice target) appear only as example configurations,
  and spec 001's live-run tasks point at `liveinsurer`.

**Portal workspaces**

- **FR-024**: Everything specific to one portal MUST live under `portals/<portal>/` (portal file:
  scope, denylist, obstacle handling, custom rules, robots settings, item templates, block
  signatures) and `personas/<portal>/` (personas and portal-specific mixins under
  `personas/<portal>/_mixins/`). Only portal-neutral building blocks MAY live in the shared
  `personas/_mixins/`.
- **FR-025**: A persona MAY extend shared mixins and files of its own portal only. Extending a
  file under another portal's folder MUST fail loading with an error naming both files.
- **FR-026**: Every gathered record (runs, states, clusters, transitions, forms, API shapes, open
  questions, rule candidates, decision-log entries, frontier items, robots policies) MUST be
  attributable to exactly one portal, persona and run, and listings and reports MUST be scoped
  to one portal.
- **FR-027**: State identity, duplicate grouping and resume MUST be scoped to one portal: records
  of one portal MUST never be matched, merged or resumed against another portal's.
- **FR-028**: An operator MUST be able to export all gathered data of one portal (records and the
  evidence they reference) and to delete it. Deletion MUST remove every record of that portal
  and every evidence file no other portal references, MUST NOT touch other portals' data, and
  MUST itself be logged with who ran it and when. Deletion is refused while a run of that
  portal is active.

**Compliance gate**

- **FR-023**: The manual compliance gate from spec 001 (FR-026: terms reviewed by whom and when,
  robots checked on, real contact address in the User-Agent) MUST remain. Automatic robots
  enforcement adds to it and does not replace the human terms review.

### Key Entities

- **Robots policy**: the parsed `robots.txt` for one host at one point in time. It has a source
  URL, HTTP status, fetch time, raw content (stored as evidence), the group that applied, its
  rules and an optional crawl delay.
- **Robots decision**: the outcome of checking one URL against a robots policy: allowed or
  refused, and the rule that decided it. It is recorded in the decision log and the frontier.
- **Action rule**: a named safety rule with an id, a safety class, keywords and path patterns.
  It is built-in or declared in a portal file; built-in rules may have aliases.
- **Rule alias**: an old rule id that resolves to a generic id, kept so existing portal files
  keep working.
- **Denylist entry**: a rule id, a `path:` glob (path only) or a `url:` glob (path plus query).
- **Portal workspace**: everything that belongs to one portal: its portal file, its personas
  and portal-specific mixins, and all data gathered from it (records and evidence). Shared
  mixins and the app itself belong to no portal.
- **Portal data export**: a self-contained bundle of one portal's records and referenced
  evidence, with the portal id, the environment and the time of export.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In map runs of the insurer-style mock portal, 0 requests reach a URL its
  `robots.txt` disallows, including query-string rules, across 5 consecutive runs; 100% of the
  refusals appear in the decision log with the rule that applied.
- **SC-002**: With the liveinsurer.example portal config and its real `robots.txt` (saved as a fixture), 100%
  of a sample of 50 URLs taken from liveinsurer's pages, including every `cHash` campaign link, get the
  same allow or refuse outcome as a manual reading of the file.
- **SC-003**: When the robots file is unreachable or returns 5xx, the run is refused in under
  5 seconds and no page request is made.
- **SC-004**: The insurer-style mock portal is mapped end to end after adding only a portal file
  and a persona file: 0 lines of code change between the commit that adds the files and the run.
- **SC-005**: 100% of the spec 001 labelled actions keep their safety class, and every existing
  portal file (marketsite, liveinsurer, the marketplace mock) loads without edits.
- **SC-006**: 100% of invalid portal rules in a test set (class `read`, a lowered built-in class,
  a reused alias id, an unknown field) fail to load with an error naming the file and the rule.
- **SC-007**: A reviewer finds no portal-specific names or strings in crawler, safety, MCP server
  or agent code (checked by a search for known portal ids and domains).
- **SC-008**: With two portals mapped in one environment, deleting one portal's data leaves 0 of
  its records and unshared evidence files and changes 0 records or evidence files of the other;
  the export of a portal contains 100% of its records and 0 of the other's.
- **SC-009**: 100% of personas that extend another portal's files fail to load, and 0 states are
  shared or merged across the two mock portals.

## Assumptions

- The crawler's robots product token is the leading token of the configured User-Agent (for
  `PathfinderAI-Crawler/0.1 (+contact)` it is `PathfinderAI-Crawler`), so a site can target it.
- Robots rules govern which URLs the crawler requests; they are not a legal permission. The
  human terms review stays mandatory for every production portal (spec 001 FR-026).
- `Sitemap` lines are read and recorded in the run's evidence but not used to seed the frontier;
  seeding from sitemaps is a later feature.
- Other-language support in this feature means extra non-read keywords and paths. Adding
  read-only keywords per portal would widen what the crawler clicks, so it is out of scope; in
  another language, unrecognised buttons stay unclicked (unknown control) while links, which are
  read by their role, are still followed.
- `noindex` and `nofollow` robots meta tags and `X-Robots-Tag` headers concern search indexing,
  not fetching, and are out of scope.
- The marketsite portal file stays in the repository as an example and for regression
  tests; no live run against it happens until the operator's consent is obtained.
- No new runtime dependency is expected; if the plan picks a robots parser library, it must
  justify it against a small in-house parser covering RFC 9309.
- Data stays in one store per environment (as in spec 001), partitioned by portal, rather than one
  store per portal; the plan may choose otherwise if it justifies it. Content-addressed evidence
  may be shared between portals, which is why deletion keeps files another portal still
  references.
- Export and delete are operator actions outside the agent's tool list; the crawler agent can
  neither export nor delete.
- Depends on spec 001: the request gate, action gate, classifier, config loaders, decision log,
  frontier report and MCP tools exist and are the places this feature extends.
