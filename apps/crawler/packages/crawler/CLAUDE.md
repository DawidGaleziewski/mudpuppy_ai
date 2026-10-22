# @mudpuppy/crawler

Browser runtime library: action/request gates, rate limiter, robots registry, preflight, page stabilizer, network recorder, ARIA observer, screenshot capture, test values, autofill, action extractor, frontier, browser session, locators, step outcomes.

Layer: features (G-07; `apps/crawler/layers.json`). Depends on config, core, fingerprint,
obstacles, safety, store.

## Public API
- Request and action gates (gate objects); used by mcp-server, gates.
- Preflight, robots registry, rate limiter, page stabilizer, network recorder, ARIA observer.
- Screenshot capture, autofill, action extraction, frontier; used by mcp-server.
- Spec 015 (legacy pages): `click-signals.ts` (init script noting click listeners) and
  `clickables.ts` (role-less clickables, `locateClickable`); `frames.ts` (frame walk, frame blocks
  appended to the snapshot); `page-candidates.ts` (actions per document); `mounts.ts`
  (micro-frontend mount wait, `waitForMountsIn` over frames too); `forms.ts` (field naming with
  `name_source`, `div` forms).
- Spec 019: `navigation-recorder.ts` (the hops of each step: HTTP, meta refresh, script, same
  document, reload, blocked) and `client-redirect.ts` (waiting through short client redirects).
- Spec 020: `BrowserSession.takeOpened()` returns the http(s) URLs of pop-up windows opened since
  the last call (the run queues them, LO-27); a pop-up's first request has no frame yet, so frame
  reads in `request-gate.ts` and `navigation-recorder.ts` treat it as top-level.
- Spec 030: `condition-wait.ts` (`waitForCondition`: waits while the page shows progress, gives up
  when quiet), `transient-error.ts` (`transientError`: 5xx and soft error pages, EN/DE/PL),
  `asset-health.ts` (`trackAssetHealth`: failed stylesheets, scripts and fonts); the request gate
  also budgets static files apart (`static_per_second`).
- Spec 031: `trusted-ca.ts` (`trustInNode`, `chromiumCaArgs`: a portal's `network.ca_file` is
  trusted by Node and, by SPKI key, by Chromium; preflight refuses an unusable file).
- Spec 036: `clock.ts` (`monotonicNow`: every wait and the network tracker measure durations with
  it, never `Date.now()`; record timestamps stay wall-clock); `forms.ts` skips unrendered controls
  and folds radios of one name into one field; the recorder ignores `requestfailed` after a response.
- Spec 032: `autofill.ts` also exports `readFormFields`, `writeFormFields` (`false` unchecks) and
  `nativeMessages` (the browser's own constraint messages after a refused submit), used by form
  probes, which take the control the agent named as the submit whatever its text (F-18; map-mode
  autofill keeps its submit words); autofill results carry each field's `label`, and fields carry `autocomplete`.
- Spec 034: `NetworkRecorder` keeps cut sample bodies (`req_sample`, `res_sample`, ≤ 4096) only
  when the session's `keepSamples` is on (the runtime sets it outside production).
- Spec 038: `field-labels.ts` (`withFieldLabels`, called by `page-candidates.ts`): an input
  candidate ARIA leaves unnamed gets the label the form reader found, matched by document order
  per kind (inside `<form>` with the real forms, outside with the `div_form`s), only when the
  counts agree (LO-48).
- In-page code with helpers goes through `evalWithHelpers` (`in-page.ts`; Playwright's `evaluate`, not an eval): top-level helper
  functions only, no closures (the `__name` shim, G-02).

## Invariants
- Every request and action goes through the gates (request-gate, action-gate); no direct fetch/http calls (spec 001 FR-025).
- The crawler is one non-deterministic LLM agent; this package is not a deterministic crawler script.
- Submits and autofills only within the run's action limit; the environment label changes nothing (spec 021).

## Where to add things
- New browser capability: one file in `src/`, exported from `src/index.ts`, called from the
  mcp-server runtime (never from tools directly, G-12).
- A gate case for a crawler fix goes in `@mudpuppy/gates` (G-17), not here.

## Tests
- `pnpm exec vitest run --project crawler`; tier: fast (browser unit tests via `tests/browser.ts` stay fast).

## See also
- specs/001-crawler-map-mode, specs/002-portal-agnostic-safety, specs/008-screenshots-wireframes
- docs/code-guidelines.md (G-17)
