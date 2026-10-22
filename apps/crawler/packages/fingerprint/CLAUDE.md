# @mudpuppy/fingerprint

Pure state fingerprinting: route templates, ARIA canonicalisation, two-level fingerprint.

Layer: kernel (G-07)

## Public API
- `route-template`: route template computation (path parameters such as `;jsessionid=` dropped, LO-24).
- `url-params`: `parseUrlParams`, every query, path and hash-route parameter of a URL as written
  (spec 019, R-37).
- `aria-canonical`: ARIA canonicalisation.
- `fingerprint`: two-level fingerprint, v2 (spec 039 design § 5.4: level 1 over the collapsed
  tree); `computeComponents` (structure, content, overlay, calls, mounts hashes, MinHash, element
  keys) and `minhashBlob` for `state_components`; `FingerprintIndex.seed` adds a cluster known from
  earlier runs (spec 038, mcp-server `seedKnownClusters`).
- `structure` (spec 039): `buildTree`, structural signatures, `collapsedText` (row-like repeated
  siblings with the same field names count once, without their text; leaves never collapse,
  F-02@039, F-26@039; the structure text names form fields, F-27@039), `modelElementKeys`
  (`role|masked name|container path|ordinal`, F-03@039; not core's spec-008 `elementKeys`,
  F-08@039), `ACTIONABLE_ROLES`.
- `profile` (spec 039 T111): `FingerprintRules` (row, field and named roles, `ignore_names_in`,
  `cluster_threshold`), the built-in `ROWS_V2` / `ROWS_V2_PROFILE` (the behaviour before profiles),
  `resolveProfile` (a portal's profiles with `extends`), `makeProfile` (`name@<8 hex of the rules
  hash>`). `computeFingerprint`, `computeComponents` and `collapsedText` take a profile (default
  rows-v2).
- `form-step` (spec 032 US1): `formControls` (form name, control set, label), `errorSignals`
  (invalid controls, alert texts), `FormStepIndex` (steps of a route: same form name, else control
  overlap ≥ 0.5; numbered in first-seen order). Used by mcp-server's `record_state`. The `invalid`
  and `shown` node fields never enter the level-1 text.

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
