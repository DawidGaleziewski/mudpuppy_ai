# @pathfinder/safety

Pure action classifier, rule set (built-in + portal rules), robots.txt parsing, scope checks, denylist, block detector.

Layer: models

## Public API

- Action classifier; used by crawler, mcp-server.
- Rule set and robots.txt parser; used by crawler, mcp-server.
- Scope checks, denylist, block detector.
- Spec 023: `url-lists.ts` (`matchUrlEntry`, `checkUrlLists`: a URL must pass every set of lists
  on the run scope, portal, persona, focus) and `timeouts.ts` (`pageTimeouts`: per-URL timeouts).

## Invariants

- Pure (no browser, no network).
- No behaviour depends on the environment label (spec 021); a set action limit is enforced, none
  set means no limit.
- Refusals carry the rule id.

## Where to add things

- New rule: portal config or built-in rule set in `src/`.
- New classifier logic: follow existing patterns in `src/`.

## Tests

- `pnpm exec vitest run --project safety`; tier: fast. 10 test files.

## See also

- specs/002-portal-agnostic-safety
- docs/code-guidelines.md
