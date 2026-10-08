# @pathfinder/crawler

Browser runtime library: action/request gates, rate limiter, robots registry, preflight, page stabilizer, network recorder, ARIA observer, screenshot capture, test values, autofill, action extractor, frontier, browser session, locators, step outcomes.

Layer: features (G-07; `apps/crawler/layers.json`). Depends on config, core, fingerprint,
obstacles, safety, store.

## Public API
- Request and action gates (gate objects); used by mcp-server, gates.
- Preflight, robots registry, rate limiter, page stabilizer, network recorder, ARIA observer.
- Screenshot capture, autofill, action extraction, frontier; used by mcp-server.

## Invariants
- Every request and action goes through the gates (request-gate, action-gate); no direct fetch/http calls (spec 001 FR-025).
- The crawler is one non-deterministic LLM agent; this package is not a deterministic crawler script.
- Never submits on production; autofill only on sandbox.

## Where to add things
- New browser capability: one file in `src/`, exported from `src/index.ts`, called from the
  mcp-server runtime (never from tools directly, G-12).
- A gate case for a crawler fix goes in `@pathfinder/gates` (G-17), not here.

## Tests
- `pnpm exec vitest run --project crawler`; tier: fast (browser unit tests via `tests/browser.ts` stay fast).

## See also
- specs/001-crawler-map-mode, specs/002-portal-agnostic-safety, specs/008-screenshots-wireframes
- docs/code-guidelines.md (G-17)
