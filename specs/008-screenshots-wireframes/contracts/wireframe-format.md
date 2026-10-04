# Contract: Wireframe format (`@pathfinder/wireframe`)

`renderWireframe(ariaYaml: string, opts?: { title?: string; width?: number }): { svg: string; excalidraw: string }`.
It is pure: the same input gives the same bytes. `GENERATOR_VERSION` is bumped on any visual
change.

## Layout

The layout is a single-column flow at `width` (default 960), with a 24 px margin and a 12 px gap.
Landmarks and `form`/`dialog` draw a labelled frame and indent their children by 16 px. All
other nodes are stacked in document order.

| Node | Drawn as | Height |
| --- | --- | --- |
| heading (level n) | bold text, size 28/22/18/16 for levels 1/2/3/≥4 | size × 1.4 |
| textbox, searchbox, spinbutton, combobox | label text above an empty box (combobox gets ▾) | 56 |
| checkbox, radio, switch | small square, circle or pill, plus label | 24 |
| button | rounded box with centred label | 36 |
| link | underlined text | 22 |
| img | box with a diagonal cross and the alt text | 96 |
| table | grid of min(rows,4) × min(cols,4), header row shaded, "+N more" note | 32 per row |
| list | bullets, at most 8 items, "+N more" | 22 per item |
| text paragraphs | grey bars, one per 80 characters, at most 3 | 14 per bar |
| other roles | skipped, but children are walked | — |

A page longer than 120 nodes stops with a "+N more elements" line. Labels are cut at 60
characters with `…`.

## SVG

- Fixed palette: ink `#1F2328`, muted `#6E7781`, line `#8C959F`, fill `#F6F8FA`, frame
  `#D0D7DE`.
- `font-family: system-ui, sans-serif`. No external refs and no scripts.
- Every drawn node is `<g data-key="<element key>">`. The root has the `viewBox` and a `<title>`.
- Numbers are integers. Attributes are written in a fixed order.

## Excalidraw

- `{"type":"excalidraw","version":2,"source":"pathfinder-wireframe","elements":[...],"appState":{"viewBackgroundColor":"#ffffff","gridSize":null},"files":{}}`
- Shapes map to `rectangle` (boxes, frames, buttons with `roundness: {type:3}`), `ellipse`
  (radio), `line` (link underline, image cross, table grid) and `text` (with `fontFamily: 2`,
  Helvetica).
- `id` = `w-<sha1(key + part)>` (first 16 hex characters); `seed`/`versionNonce` = the first 8
  hex characters of the same hash, as an integer; `version: 1`; `updated: 0`; `roughness: 1`;
  `strokeColor: "#1e1e1e"`; `customData: { key }`.
- JSON is written with a fixed key order and 2-space indent.
