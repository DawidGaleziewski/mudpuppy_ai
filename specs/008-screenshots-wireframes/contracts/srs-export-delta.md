# Contract delta: SRS export (`docs:export`)

Extends `specs/004-ba-documentation/contracts/srs-export.md`.

## New files

```text
<portal>-<env>-srs/
├── images/screens/<SCR-KEY>.png            # byte copy of the SCR's first cited state screenshot
├── images/wireframes/<SCR-KEY>.svg
├── images/wireframes/<SCR-KEY>.excalidraw
└── images/highlights/<RECORD-KEY>-<n>.png  # n = 1.. per cited state with regions, link order
```

## Chapters

- `03-screens.md`: each SCR section starts with `![Screenshot of <title>](images/screens/<KEY>.png)`
  and then `![Wireframe of <title>](images/wireframes/<KEY>.svg)`, with an `[edit in Excalidraw]`
  link to the `.excalidraw` file. With no screenshot, only the wireframe is shown, with the line
  "_No screenshot recorded._" When no wireframe exists either, both are omitted and the line
  says so.
- Records of any kind with `screen_region` links embed their highlight images after the
  statement text, with a legend: `1. textbox "Pojemność silnika" (note)`.
- `README.md` gets one line about `images/` and opening `.excalidraw` files.

## Highlight image

- Crop: the union of the record's region boxes on that state, plus 120 px padding, clamped to the
  image. With no boxed region, there is no image, and the legend lists the regions as "not
  visible on the screenshot".
- Outline 3 px `#E8590C`, with a numbered badge (18 px high, white digits from a 5×7 bitmap
  font at 2× scale) just above the top-left of each box. Regions are numbered per state in link
  order (by element key).
- Encoding: `pngjs` with `deflateLevel: 9`, `filterType: 4` and RGBA. Same input gives
  identical bytes.

## `records.json`

Each record gains `visuals: { screens: [{ state_id, screenshot, wireframe_svg,
wireframe_excalidraw }], regions: [{ state_id, key, box | null, note, image }] }` with paths
relative to the export root. Absent visuals are `null`, not omitted.

## Determinism

Two exports of the same store and evidence give identical files, images included (FR-020).
Files are written in a fixed sorted order.
