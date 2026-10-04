# Research: Screenshots and Wireframes (spec 008)

## R1 Element boxes: `ariaSnapshotJSON({ boxes: true })`

- **Decision**: right after the YAML snapshot of a newly created state, call
  `page.locator('body').ariaSnapshotJSON({ boxes: true })`. Read `scrollX`/`scrollY` and the
  document's scroll size in the same tick, and convert each box to page coordinates
  (`x + scrollX`, `y + scrollY`). The result is stored as a **layout** JSON blob.
- **Rationale**: Playwright 1.63 returns the *same tree* as `ariaSnapshot()`, with a box per
  element. No per-element `getByRole().boundingBox()` round trips (hundreds of calls) and no DOM
  walk of our own that could disagree with the ARIA tree.
- **Alternatives**: `getByRole(...).boundingBox()` per element is slow and ambiguous for
  duplicates. `mode: 'ai'` refs are not stable across calls and add noise. A custom DOM walk
  would be a second, divergent notion of "element".

## R2 Element key (the join rule)

- **Decision**: walk the tree in document order. For each node with a role in KEYED_ROLES
  (interactive roles, headings, landmarks, form, table, img, list), its key is `role "name"`
  (or `role` when there is no name). Repeats get `#2`, `#3` and so on in order of appearance.
  The same function runs on the YAML snapshot (parsed with `yaml`) and on the layout tree. When a
  portal has `pii_scrub` on, layout names are masked with the same `maskText` before keying.
  The full rule is in `contracts/element-key.md`.
- **Rationale**: it is readable for the BA (`textbox "Pojemność silnika"`), stable within one
  snapshot, matches how actions are already described (role plus accessible name), and is cheap
  to reimplement in Python.
- **Alternatives**: a tree path (`0/3/1`) is unreadable and breaks the BA's ability to type it.
  Hashes are opaque. Action ids exist only for clickable elements, not headings or fields in map
  mode.

## R3 Screenshot capture

- **Decision**: `page.screenshot({ type: 'png', fullPage: true })`. When the scroll height is over
  10 000 px, use `clip: { x: 0, y: 0, width, height: 10000 }` and set `cut: true`. The width is
  the persona viewport. Capture happens only when `recordState` reports `created: true`, inside
  the `record_state` phase, after the YAML snapshot and before any action. Failure is a run
  warning plus a trace event, and the state stays recorded (FR-009).
- **Rationale**: one image per state as first seen, the same as the snapshot that made the
  fingerprint. PNG is lossless, so the export can decode it deterministically.
- **Alternatives**: a separate screenshot run would drift from recorded states (rejected in the
  roadmap note). JPEG is smaller but `pngjs` cannot decode it and it is lossy.

## R4 Storage

- **Decision**: the evidence store gets `storeBinary(bytes, ext)`, content-addressed like the
  text blobs. `states` gets two nullable columns, `screenshot_ref` and `layout_ref`. A new table,
  `state_wireframes (state_id PK, generator_version, svg_ref, excalidraw_ref, created_at)`, holds
  derived wireframes. They can be regenerated, and `generator_version` lets `wireframes:build`
  find stale rows.
- **Rationale**: images stay out of SQLite, existing patterns are reused, and the dashboard and
  export read plain files.
- **Alternatives**: a table of element boxes per element would mean thousands of rows per run
  that no query needs (consumers always want the whole layout of one state). Computing
  wireframes on demand would need TypeScript inside the Python dashboard.

## R5 Screen-region evidence

- **Decision**: `doc_evidence_links.target_kind` gains `screen_region`, and the table gains a
  nullable `region` column (the element key), with
  `CHECK ((target_kind = 'screen_region') = (region IS NOT NULL))`. `target_id` is the state id.
  `run_id` follows the `state` rule: optional on input, defaulting to the state's first-seen run.
  The key must be one of the state's element keys, taken from its YAML. A key without a box is
  allowed and shown as "not visible on the screenshot". `get_evidence(state)` adds
  `elements: [{ key, role, name, box: bool }]`, capped at 400.
- **Rationale**: there is no new BA tool. The BA already reads states with `get_evidence`, so the
  key list sits next to the snapshot.
- **Alternatives**: a `get_state_layout` tool means more tool surface. Encoding the key into
  `target_id` (`state#key`) would break the `ix_doc_evidence_links_target` lookups by state.

## R6 Wireframes

- **Decision**: `@pathfinder/wireframe`, a pure function `renderWireframe(ariaYaml, opts)` that
  returns `{ svg, excalidraw }`. Layout is a single column flow, with fixed widths and heights
  per node type (heading bar, labelled input box, button pill, link underline, table grid capped
  at 4×4, list bullets, landmark frames that nest). The style is the Console tokens in monochrome
  with system-ui text, and nothing is random. Excalidraw elements are `rectangle`, `text` and
  `line`, with ids derived from element keys, `seed` derived from a key hash and `roughness: 1`.
  Both outputs carry the element key (`data-key` in the SVG, `customData.key` in Excalidraw)
  (FR-017).
- **Rationale**: the output is deterministic, invents nothing, and a person can open and edit it.
  Single-column flow avoids pretending to know the real layout (the screenshot shows that).
- **Alternatives**: positioning by layout boxes looks closer to the page, but it does not work
  without a layout and repeats what the screenshot already shows. An AI-drawn wireframe breaks
  facts-only. `@excalidraw/excalidraw` is a browser React package and not needed to write the
  format.

## R7 Dashboard highlights

- **Decision**: the record and state pages render `<figure class="shot">` with the image and
  absolutely positioned `<span class="hl">` boxes. The boxes use percentage coordinates
  (`box.x / page.width`), so they scale with the image and need no JavaScript. The labels are
  numbered and listed under the image. `/evidence/{ref}` serves only refs matching
  `^[0-9a-f]{64}\.(png|svg|excalidraw)$` from `data/evidence`.
- **Alternatives**: a canvas overlay (needs JS), or images with highlights baked in by the
  server (the dashboard would need image code and could write files).

## R8 Export images

- **Decision**: `exportSrs` returns `Map<string, string | Uint8Array>` and takes `evidenceRoot`.
  It writes:
  - `images/screens/<SCR-KEY>.png`, a byte copy of the screenshot of the SCR's first cited state;
  - `images/wireframes/<SCR-KEY>.svg` and `.excalidraw`;
  - `images/highlights/<RECORD-KEY>-<n>.png`: per record, per state with regions, a crop of the
    union of its region boxes plus 120 px padding (clamped), with 3 px outlines and digit badges
    from a built-in 5×7 bitmap font, encoded by `pngjs` with fixed `deflateLevel` and filter.

  The chapters embed these with relative links, with a numbered legend under each highlight.
  `records.json` lists the screenshot, wireframe and regions per record (FR-021).
- **Rationale**: pure JS, so the same input gives the same bytes. Crops keep files small and
  readable.
- **Alternatives**: an SVG with an embedded base64 screenshot is huge per record. A browser render
  is not byte-stable. `sharp` is a native dependency and its output can vary by libvips version.

## R9 Lower safety level

- **Decision**:
  - **Scrubbing is a per-portal option.** The evidence store no longer masks. The pipeline masks
    the stored ARIA snapshot and the state title only when the portal has `pii_scrub: true`. The
    fingerprint keeps using the masked snapshot as normalisation, so clusters stay stable. As
    built (US5), these stay masked either way: agent notes (open questions, rule candidates),
    trace process names, intents and step values, URL templates of network calls, log reasons,
    decision details and trace error messages. They are agent-authored or developer data, and the
    BA value is in the snapshot and screenshot. Form fields hold no values, and network shapes
    hold no values, so neither needed a change.
  - **Synthetic-input check.** `isSyntheticInput` refusal of fill values applies only when
    `pii_scrub` is on.
  - **Map-mode autofill.** Off production, when map mode is about to click a control that submits
    a form (`el.form` and a submit type, read in the page), it first fills the form's empty
    fields with `testValueFor(field)`. Values come from the persona's `trace_inputs` (by label)
    or from the deterministic generator in `test-values.ts`. A trace event and a decision record
    the values. On production the click is refused by the env guard, as it is now, and autofill
    never runs there.
- **Rationale**: this is the user's decision (2026-10-04). Map mode already presses submits
  where the persona allows it (finding I1). Filling first turns validation dead-ends into the
  states behind them (SC-006).
- **Alternatives**: fill actions as separate frontier items would be lost on reach-state
  navigation. Having the agent type every field means slower, non-deterministic runs and more
  tokens.

## R10 No backfill

- **Decision**: the quickstart documents a wipe (`data/db/*.sqlite` moved to `data/db/backups/`,
  `data/evidence/` cleared) followed by a re-crawl. Old states without a screenshot or layout
  show their wireframe, which `wireframes:build` can generate from the YAML.
- **Rationale**: the user said the data is disposable. A re-capture run is out of scope.
