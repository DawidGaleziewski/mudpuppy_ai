# @pathfinder/fingerprint

Pure state fingerprinting: route templates, ARIA canonicalisation, two-level fingerprint.

Layer: kernel (G-07)

## Public API
- `route-template`: route template computation (path parameters such as `;jsessionid=` dropped, LO-24).
- `url-params`: `parseUrlParams`, every query, path and hash-route parameter of a URL as written
  (spec 019, R-37).
- `aria-canonical`: ARIA canonicalisation.
- `fingerprint`: two-level fingerprint.

## Invariants
- Pure and deterministic: same input → same fingerprint.
- A change here changes state identity across runs; check `pnpm stability` (≥ 90% stable).

## Where to add things
- Changes to fingerprint logic: update `src/`, run `pnpm stability` to verify.

## Tests
- `pnpm exec vitest run --project fingerprint`; tier: fast.

## See also
- specs/001-crawler-map-mode
- docs/code-guidelines.md (G-07)
