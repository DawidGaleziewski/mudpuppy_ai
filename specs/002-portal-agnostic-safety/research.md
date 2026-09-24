# Research: Portal-Agnostic Safety and Portal Workspaces

Phase 0 decisions for [spec.md](./spec.md). Each entry records the decision, the reason and the
alternatives considered. Code references are to `apps/crawler/packages/` as built by spec 001.

## §1 Robots parser: in-house, pure, in `safety`

- **Decision**: Write a small RFC 9309 parser and matcher as pure functions in
  `safety/src/robots.ts`: `parseRobots(text, { maxBytes })` returns groups, rules, crawl delay,
  sitemaps and a count of ignored lines; `robotsVerdict(policy, productToken, url)` returns
  `{ allowed, rule }`. No new dependency.
- **Rationale**: Principle VII requires the safety pieces to be pure and unit-tested against
  fixtures. The needed subset is small: group selection by product token, `Allow`/`Disallow`,
  `*` and `$`, longest-match with `Allow` winning ties, percent-encoding normalisation, the
  500 KiB limit, `Crawl-delay` and `Sitemap` as recorded extras. Fixtures: the real liveinsurer.example,
  marketsite.example, forum.example, pl.wikipedia.org and classifieds.example files saved on 2026-09-24, plus the
  RFC 9309 examples.
- **Alternatives**: `robots-parser` (npm): covers the RFC, but it is one more runtime dependency
  on the safety path, its match semantics must still be verified by our own fixtures, and its
  `Crawl-delay` and error handling do not fit the "unreachable means disallow all" rule directly.
  Google's C++ `robotstxt`: not usable from Node without native bindings.

## §2 Where robots is enforced

- **Decision**: A per-run `RobotsRegistry` (in `crawler`) holds one policy per host, loaded
  lazily through `ensure(host)` and read synchronously through `check(url)`, which returns
  `allowed`, `refused` (with rule) or `unknown` (not fetched yet). It is enforced in two places:
  1. `action-gate.decide` gets a `robots` check between scope and denylist. `unknown` passes
     here and is enforced by the request gate, so `decide` stays pure and synchronous.
  2. `request-gate` awaits `ensure(host)` for every request to a host in `allowed_domains`,
     then refuses main-frame navigations that robots disallows (always), and applies
     `robots_page_requests` to the page's own requests (FR-009).
- **Rationale**: `decide` refuses early with a clean frontier reason (`robots_disallowed`) for
  links and `navigate`. The request gate catches everything else: redirects, script-started
  navigations and URLs `decide` saw as `unknown`. This matches how spec 001 already splits scope
  enforcement between `decide` and `navigationPolicy`.
- **Hosts**: robots applies to hosts within `allowed_domains` (suffix match, as in `checkScope`).
  Requests to other hosts (CDNs, fonts, analytics) are page resources of an allowed page, not
  crawl targets, and are not checked against third-party robots files.
- **Alternatives**: checking only in `decide` misses redirects and page-started navigations;
  checking only in the request gate would record refusals as aborted requests instead of
  frontier skips with a reason.

## §3 Fetching robots.txt

- **Decision**: Fetched by the MCP server with Node's built-in `fetch` (no browser), after
  `preflight` and before the run row exists, through the run's rate limiter and with the
  configured User-Agent. At most 5 redirects are followed by hand, so each hop passes the limiter.
  Timeout 10 s. Outcomes: 2xx parsed; 4xx means `no_rules`; 5xx, timeout, network error or too
  many redirects means `unreachable`. The body is read up to 500 KiB.
- **Base host unreachable**: `start_run` is refused with the new error `ROBOTS_UNAVAILABLE`
  before any run row or page exists. Other hosts are fetched on first use; an unreachable one is
  marked `unreachable` and every request to it is refused for the rest of the run.
- **Block detector**: a 403 or 429 on the robots fetch is `no_rules`, not a block. RFC 9309 says
  4xx means "no rules", and a missing robots file is not the site refusing us. This is done by
  not routing the robots fetch through `detectBlock`.
- **Re-fetch**: on resume (`start_run` with `resume_run_id`) and when a policy is older than
  24 h. A changed body writes a new policy row and a decision-log entry.
- **Crawl-delay**: if the crawler's group has `Crawl-delay: d` and `1/d` is below
  `requests_per_second`, the run's limiter is lowered to `1/d` for the whole run. Slowing every
  host is stricter than slowing one host, and spec 001 has a single limiter per run.
- **Rationale**: using the same limiter and User-Agent keeps FR-001. Fetching outside the
  browser means no page, cookie banner or script runs before the rules are known.

## §4 Product token

- **Decision**: The robots product token is the part of `rate_limit.user_agent` before the first
  `/` or space (`PathfinderAI-Crawler`), compared case-insensitively as RFC 9309 requires.
  Without `rate_limit` (sandbox portals), the token is `PathfinderAI-Crawler`.
- **Alternatives**: a separate `robots_token` config field: redundant, and it could drift from the
  User-Agent the site actually sees.

## §5 `url:` denylist entries

- **Decision**: `url:<glob>` is matched with the existing `globToRegExp` against
  `pathname + search` (the query string with its leading `?`). `path:` is unchanged.
- **Rationale**: one matcher, one semantics (`*` spans anything), and `path:` keeps its meaning,
  so existing portal files do not change behaviour (FR-010).

## §6 Rule sets instead of a module constant

- **Decision**: Replace direct use of `ACTION_RULES` with a `RuleSet` value:
  `builtinRuleSet()` plus `extendRuleSet(base, portalRules)`. `classifyAction(d, rules)`,
  `classifyUrl(url, rules)` and `checkDenylist(denylist, target, rules)` take it as a parameter,
  defaulting to the built-in set. The run builds its set once from the portal file and stores
  it in `RunState`; `record-transition` and the pipeline read it from there.
- **Generic ids**: `purchase` (merges `bidding` and `buy_now` keywords and paths, adds "kup
  polisę", "kup bilet", "buy a policy"), `contact_or_message` (from `message_or_contact_seller`,
  seller-neutral wording kept), `reveal_contact` (from `reveal_seller_contact`), `submit_request`
  (new, class `external-side-effect`: "wyślij zapytanie", "poproś o ofertę", "zamów rozmowę",
  "zapisz się", "zarejestruj", "aplikuj", "request a quote", "sign up", "apply", "subscribe").
- **Aliases**: a fixed map `bidding → purchase`, `buy_now → purchase`,
  `message_or_contact_seller → contact_or_message`, `reveal_seller_contact → reveal_contact`.
  A denylist entry written as an alias resolves to the generic id; the refusal's `rule` is
  written as `buy_now→purchase` so both ids are visible (FR-013).
- **Fixture check**: the spec 001 labelled corpus (`safety/tests/fixtures.ts`) is re-run; FR-014
  requires identical classes. New keywords can only raise a class; if one changes a fixture's
  class, the keyword is narrowed until the corpus is unchanged (no exceptions list).
- **Alternatives**: keeping the module constant and mutating it per run (not safe with several
  runs in one server); a class hierarchy of rules (more code for the same data).

## §7 Portal action rules format

- **Decision**: New optional portal field `action_rules`, a list of
  `{ id, class?, keywords?: string[], paths?: string[] }`. Keywords are plain phrases, normalised
  like built-in labels (lower case, diacritics stripped) and matched on word boundaries; paths are
  globs matched against the normalised path. `class` is required for a new id and must be
  `mutating`, `destructive` or `external-side-effect`. For a built-in id, `class` is optional and,
  when given, must not be lower than the built-in class. Alias ids and `read` are rejected. At
  least one of `keywords` or `paths` is required.
- **Rationale**: phrases and globs instead of regular expressions keep portal files readable,
  avoid regex injection or catastrophic backtracking from config, and reuse matchers that exist.
- **Alternatives**: regex strings in YAML (more power, more risk, harder to review in a
  compliance sign-off).

## §8 Portal workspaces: storage

- **Decision**: Keep one SQLite file per environment and the flat content-addressed evidence
  store. Add `portal_id` to `states` and make fingerprints unique per portal
  (`UNIQUE (portal_id, fingerprint)`). All other gathered tables already hang off `runs`, whose
  `portal_id` is the partition key. The fingerprint index rebuild at session open selects only
  states of the run's portal, and cluster ids are therefore per portal.
- **Rationale**: the global `ux_states_fingerprint` and the "clusters are global" rebuild in
  `browser-runtime.ts` are the only places where two portals' data can meet today. Fixing them is
  a small migration; one file per portal would break the "one file per environment" rule from
  spec 001 and the constitution's storage constraint for no gain.
- **Evidence**: stays shared and content-addressed. Export copies the files a portal's records
  reference; delete removes only files no remaining record references (reference check across
  every evidence column), so shared files survive (FR-028).
- **Alternatives**: `data/evidence/<portal>/` folders (makes deletion a folder removal, but
  changes every `evidence_ref`, breaks deduplication, and needs a data migration for existing
  evidence); one DB per portal (rejected above).

## §9 Export and delete

- **Decision**: Two operator scripts beside the spec 001 ones, not MCP tools:
  `pnpm portal:export <portal> [--env <env>] [--out <dir>]` and
  `pnpm portal:delete <portal> --env <env> --operator "<name>" --yes`. Export writes
  `data/exports/<portal>-<env>-<timestamp>/` with `manifest.json`, one NDJSON file per table and an
  `evidence/` copy. Delete runs in one transaction, refuses while a run of that portal is
  `running`, and writes a `portal_data_log` row (portal, environment, action, operator, counts,
  time), which is kept after the delete.
- **Rationale**: the agent must not export or delete (spec Assumptions), and the crawler
  subagent's tool list is locked by `agent-lockdown.test.ts`. Scripts match how `audit:pii` and
  `stability` already work.
- **Alternatives**: MCP tools behind a flag (would put deletion one prompt away from the agent).

## §10 Persona fence

- **Decision**: `loadPersona(file, { fence })` takes an optional list of allowed roots. `preflight`
  passes `[personas/_mixins, personas/<portal>]`. Every file reached through `extends` must be
  inside one of the roots after `realpath`, or loading fails naming the persona file and the
  offending file (FR-025). Portal-specific mixins live in `personas/<portal>/_mixins/`, which
  `findPersona` already skips when looking for personas.
- **Rationale**: the loader already resolves every `extends` path, so the check is one line per
  file; `realpath` stops `..` and symlink escapes.

## §11 Recording robots decisions and page requests

- **Decision**:
  - Link and `navigate` refusals: frontier status `robots_disallowed` (new value), decision-log
    `refuse` with `rule: "robots:<rule line>"` and `detail` holding the policy id.
  - Refused main-frame navigations in the request gate: decision-log `refuse`, as spec 001 does.
  - Page requests to disallowed URLs: decision-log `note` (new kind) with URL template, rule,
    and whether it was blocked or allowed; deduplicated per run by (url template, rule) with a
    counter in `detail`, so a single-page app does not flood the log.
- **Rationale**: the frontier report and decision log are where spec 001 already explains every
  skip (FR-010, FR-021); a new status and kind keep robots decisions visible there.

## §12 Mock portals for tests

- **Decision**: Keep `mcp-server/tests/mock-portal.ts` (marketplace) and add
  `mock-insurer.ts`: product pages, a Cookiebot-style dialog with a decline button, a three-step
  quote form (`Oblicz składkę`, `Dalej`, `Wyślij zapytanie`), a "Kup polisę" button, a
  "Przedłuż polisę" button, campaign links with `?itm_campaign=…&cHash=…`, an `/api/` data call
  made by the page's own script, and a `robots.txt` with `Disallow: *cHash*`,
  `Disallow: /quote/`, `Allow: /quote/start*`, `Disallow: /api/` and `Crawl-delay`. Variants
  serve 404, 503 and a redirect loop for `robots.txt`.
- **Rationale**: FR-020 needs a second site shape; the liveinsurer.example features we saw on 2026-09-24
  (Cookiebot, TYPO3 `cHash` links, `/quote/` flow) are the realistic shape to cover.
