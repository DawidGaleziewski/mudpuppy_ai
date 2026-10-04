# Data Model: Screenshots and Wireframes (spec 008)

Migration `0006_screenshots_wireframes` (reversible, owned by `db-admin`). Conventions:
`sqlite-conventions` skill (STRICT, ULID text ids, ISO timestamps).

## `states` (altered)

| Column | Type | Rule |
| --- | --- | --- |
| `screenshot_ref` | TEXT NULL | evidence ref `<sha256>.png`; NULL when capture failed or state predates 0006 |
| `layout_ref` | TEXT NULL | evidence ref `<sha256>.json` (Layout, below); NULL as above |

`ALTER TABLE ... ADD COLUMN` (no rebuild). Down: drop the columns (SQLite ≥ 3.35).

## `state_wireframes` (new, derived)

| Column | Type | Rule |
| --- | --- | --- |
| `state_id` | TEXT PK | → `states(id)` |
| `generator_version` | TEXT NOT NULL | `@pathfinder/wireframe` `GENERATOR_VERSION`; stale rows are rebuilt |
| `svg_ref` | TEXT NOT NULL | `<sha256>.svg` |
| `excalidraw_ref` | TEXT NOT NULL | `<sha256>.excalidraw` |
| `created_at` | TEXT NOT NULL | ISO |

Upserted by the crawler on state creation and by `wireframes:build`. Never cited as evidence.

## `doc_evidence_links` (rebuilt)

- `target_kind` CHECK gains `'screen_region'`.
- New column `region TEXT NULL`, the element key (`contracts/element-key.md`).
- `CHECK ((target_kind = 'screen_region') = (region IS NOT NULL))`.
- `target_id` is the state id for `screen_region`. `run_id` is required, as for `state`.
- Indexes are recreated: `ix_doc_evidence_links_run_id`, `ix_doc_evidence_links_target`.
- Down: rows with `screen_region` are converted to `state` links (region dropped into `note`),
  then the old table shape is restored.

## Layout (evidence JSON blob)

```json
{
  "version": 1,
  "viewport": { "width": 1280, "height": 800 },
  "page": { "width": 1280, "height": 4310 },
  "cut": false,
  "elements": [
    { "key": "heading \"Kalkulator OC/AC\"", "role": "heading", "name": "Kalkulator OC/AC",
      "box": { "x": 120, "y": 96, "width": 540, "height": 40 } },
    { "key": "textbox \"Pojemność silnika\"", "role": "textbox", "name": "Pojemność silnika",
      "box": null }
  ]
}
```

- `page.height` is the screenshot's height (≤ 10 000 when `cut`).
- `elements` holds keyed nodes only (KEYED_ROLES) in document order, at most 400. `box` is null
  for zero-size, hidden or below-cut elements. Coordinates are page CSS px, rounded to integers.
- Zod schema `Layout` in `@pathfinder/core/src/layout.ts`. Python reads the same shape.

## Zod / TS changes

- `EvidenceTargetKind` + `'screen_region'`; `DocEvidenceLink.region: string | null` with the
  refine above.
- `db-types.ts`: `states.screenshot_ref`, `states.layout_ref`, `StateWireframesTable`,
  `doc_evidence_links.region`.
- Portal config: `pii_scrub: boolean` (default `false`).

## Entity relations

```text
states 1─0..1 screenshot (evidence png)
states 1─0..1 layout (evidence json) ── elements[key]
states 1─0..1 state_wireframes ── svg / excalidraw (evidence)
doc_revisions 1─* doc_evidence_links ──(screen_region: target_id=state, region=key)── layout.elements[key]
```
