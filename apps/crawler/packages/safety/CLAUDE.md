# @pathfinder/safety

Pure action classifier, rule set (built-in + portal rules), robots.txt parsing, scope checks, denylist, environment guard, block detector.

Layer: models

## Public API
- Action classifier; used by crawler, mcp-server.
- Rule set and robots.txt parser; used by crawler, mcp-server.
- Scope checks, denylist, environment guard, block detector.

## Invariants
- Pure (no browser, no network).
- Production run never performs a mutating action.
- Refusals carry the rule id.

## Where to add things
- New rule: portal config or built-in rule set in `src/`.
- New classifier logic: follow existing patterns in `src/`.

## Tests
- `pnpm exec vitest run --project safety`; tier: fast. 6 files.

## See also
- specs/002-portal-agnostic-safety
- docs/code-guidelines.md
