# Contract: robots.txt Fetch, Matching and Enforcement

Implements spec FR-001 to FR-009. Matching follows RFC 9309; this page fixes the choices the RFC
leaves open and how the crawler applies them.

## Fetch

| Step | Rule |
|---|---|
| When | `start_run` (base host, before the run row), first request to any other host in `allowed_domains`, `start_run` with `resume_run_id`, and when the policy in force is older than 24 h |
| How | server-side HTTP GET of `<scheme>://<host>/robots.txt`, through the run's rate limiter, with `rate_limit.user_agent`, 10 s timeout, never through the browser |
| Redirects | followed by hand, each hop rate-limited, at most 5; more is `unreachable` |
| Body | read up to 500 KiB; the rest is ignored and `truncated = 1` |
| 2xx | `outcome = rules`, parsed |
| 4xx (any) | `outcome = no_rules`: robots allows everything on that host; not a block |
| 5xx, timeout, network error, too many redirects | `outcome = unreachable`: every request to that host is refused; for the base host `start_run` fails with `ROBOTS_UNAVAILABLE` |
| Evidence | every fetch, including failures, writes an evidence record and a `robots_policies` row |

## Group selection

- Product token: text of `rate_limit.user_agent` before the first `/` or whitespace, compared
  case-insensitively (`PathfinderAI-Crawler`). Default `PathfinderAI-Crawler` without `rate_limit`.
- Use the group(s) whose `User-agent` equals the token; if none, the `*` group(s); if none,
  no rules. Several groups with the same matching `User-agent` are merged (RFC 9309 §2.2.1).

## Matching

- Match target: URL path plus `?` and query (no fragment), percent-encoding normalised: octets
  that are unreserved characters are decoded, everything else upper-cased hex (`%7e` → `~`,
  `%2f` stays `%2F`).
- Patterns: `*` matches any sequence, `$` at the end anchors the end; everything else literal.
  A pattern matches when it matches a prefix of the target (or the whole target with `$`).
- The matching rule with the longest pattern (in octets) wins; on a tie, `Allow` wins. No match
  means allowed. `Disallow:` with an empty value is ignored.
- `/robots.txt` itself is always allowed.
- `Crawl-delay: <seconds>` in the applied group: recorded; if `1 / seconds` is below
  `requests_per_second`, the run's limiter is lowered to it (never raised).
- `Sitemap:` lines are recorded in the evidence; not used.
- Lines that do not parse are ignored and counted (`ignored_lines`).

## Enforcement points

| Request kind | Checked in | robots refuses → |
|---|---|---|
| Link or button target proposed by `act`, URL proposed by `navigate` | `action-gate.decide`, after scope, before denylist | frontier `robots_disallowed`, decision-log `refuse`, rule `robots:Disallow: <pattern>` |
| Main-frame navigation (redirect, script, click, `navigate`) | `request-gate` | request aborted, decision-log `refuse` with `detail.via = "request_gate"` |
| The page's own request (script, style, image, fetch/XHR) to an in-scope host | `request-gate` | `robots_page_requests: block` → aborted; `allow_and_record` → continues; either way a decision-log `note` per (URL template, rule) with a count |
| Request to a host outside `allowed_domains` | not robots-checked | other gates as in spec 001 |

`decide` sees a host whose policy is not fetched yet as `unknown` and lets the request gate
decide once the policy is loaded; the request gate always awaits the policy before letting any
request to that host through.

## Not overridable

Neither the agent nor the persona can change or skip robots checks. The portal file can only add
stricter rules (denylist entries) and set `robots_page_requests`.
