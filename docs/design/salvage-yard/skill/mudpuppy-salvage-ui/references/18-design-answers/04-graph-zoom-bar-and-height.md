# Q4 · The map's zoom bar and the graph's height: `.sy-graphview` + `.sy-graph__zoom`

**Question (`Graph.tsx:98-117`).** The zoom bar (− / Fit / +) is a plain cluster above the graph and scrolls away while the
graph is still on screen. The graph box is capped at 75vh, a value nobody designed. Can the zoom bar stay in view? What
should the height be? How does it work at 390 px?

## Decision

**A frame around the graph, `.sy-graphview`, with a floating, sticky zoom bar, `.sy-graph__zoom`.**

| Question | Answer |
|---|---|
| Zoom bar | Floats in the **top-right corner of the graph**, over the canvas, on a steel plate. It is `position: sticky` under the sticky header, so it stays in view **as long as any part of the graph is on screen**, and leaves with the graph |
| Contents | **−** · the zoom level (e.g. "80%"; clicking it resets to 100%) · **+** · **Fit** (`aria-pressed` while the view is fitted). `role="toolbar"`, `aria-controls` the graph |
| Height, Map page | The graph's **natural height, capped at the viewport below the header**: `max-height: calc(100dvh − var(--sy-graph-top))`. The whole box fits on screen at once; the graph pans inside it. Not 75vh |
| Height, embedded | Map excerpts inside other pages (Scans live monitor, Changes, Workbench stage): natural height capped at **520 px** (`.sy-graphview--embedded`, `--sy-graph-max`) |
| Header height | One header row from 1200 px: `--sy-graph-top: 96px`, bar sticks at 72 px. Below 1200 the header wraps: 152 px and 128 px. Set in `salvage.css`; override only if the app's header differs |
| Phone, 390 px | The Map opens as the **List** (the FE-M01 list view). "Show the map" opens the graph **full screen** in `.sy-dialog--wide` (full screen under 640 px). The zoom bar moves to the **bottom-right, at thumb height**, with 44 px buttons. Pinch to zoom, drag to pan |

**Why not a fixed share of the viewport.** A small graph (three pages) in a 75vh box is mostly empty; a big one in 75vh
plus a page head scrolls the page and the graph at the same time. Natural height capped at the visible area gives one
scroll surface at a time.

**Why sticky, not only absolute.** On the Map page the inspector column can make the page longer than the graph. When the
person scrolls to read the inspector, the bar stays reachable as long as the graph is visible.

## Markup

```html
<div class="sy-graphview">                      <!-- add sy-graphview--embedded inside other pages -->
  <div class="sy-graph__zoom" role="toolbar" aria-label="Zoom the map" aria-controls="map-graph">
    <button class="sy-btn sy-btn--sm sy-btn--quiet" type="button" aria-label="Zoom out">−</button>
    <button class="sy-btn sy-btn--sm sy-btn--quiet sy-graph__zoom-level" type="button" aria-label="Zoom 80%, reset to 100%">80%</button>
    <button class="sy-btn sy-btn--sm sy-btn--quiet" type="button" aria-label="Zoom in">+</button>
    <button class="sy-btn sy-btn--sm sy-btn--quiet" type="button" aria-pressed="true">Fit</button>
  </div>
  <section id="map-graph" class="sy-graph" aria-label="Map of reference-insurer, 19 screens">
    <div class="sy-graph__canvas" style="width: 1180px; height: 760px; transform: scale(0.8); transform-origin: 0 0">…</div>
  </section>
</div>
```

Canvas size, node positions and the zoom factor stay inline, as you said: they come from the API's layout. Everything else
is in the classes.

## Behaviour

- **Open:** Fit if the canvas is larger than the box, otherwise 100%. Zoom steps: 50 · 67 · 80 · 100 · 125 · 150 %.
- **Keys** when focus is in the graph: **+** / **−** zoom, **0** back to 100 %. Ctrl + wheel (or pinch) zooms around the pointer;
  the wheel alone scrolls the graph box. (In the Workbench, **F** stays focus mode; Fit has no key.)

  > **Changed 24 Oct (round 4, D-71):** the wheel and drag rules are replaced by
  > `../20-navigation-and-canvases/T-07-canvas-movement.md`: the wheel zooms once the canvas is **engaged** (click or focus),
  > goes to the page otherwise; drag pans; the canvas moves by transform. The zoom bar, its place and the heights here stay.
- Zooming keeps the selected node in view. Fit turns off (`aria-pressed="false"`) as soon as the person zooms or pans.
- The level is announced only when the person changes it ("Zoom 80%"), through the page's one polite live region.

## React (`apps/web/src/design-system/components/Graph.tsx`)

Wrap the existing graph; move the bar into the frame. Sketch:

```tsx
<div className={embedded ? "sy-graphview sy-graphview--embedded" : "sy-graphview"}>
  <div className="sy-graph__zoom" role="toolbar" aria-label="Zoom the map" aria-controls={id}>
    <button className="sy-btn sy-btn--sm sy-btn--quiet" aria-label="Zoom out" onClick={zoomOut}>−</button>
    <button className="sy-btn sy-btn--sm sy-btn--quiet sy-graph__zoom-level" aria-label={`Zoom ${pct}%, reset to 100%`} onClick={reset}>{pct}%</button>
    <button className="sy-btn sy-btn--sm sy-btn--quiet" aria-label="Zoom in" onClick={zoomIn}>+</button>
    <button className="sy-btn sy-btn--sm sy-btn--quiet" aria-pressed={fitted} onClick={fit}>Fit</button>
  </div>
  <section id={id} className="sy-graph" aria-label={label}>
    <div className="sy-graph__canvas" style={{ width, height, transform: `scale(${zoom})`, transformOrigin: "0 0" }}>…</div>
  </section>
</div>
```

## What to change

- [ ] `Graph.tsx:98-117`: replace the `sy-cluster` bar and the inline `75vh` with `.sy-graphview` and `.sy-graph__zoom`.
- [ ] Use `--embedded` for the recorded map and the Scans graph in step 5.
- [ ] Phones: open the Map in List view; "Show the map" opens the graph in the wide dialog.
- [ ] Copy the updated `salvage.css` (section "2.1 · Graph view" and the 1199 / 639 px rules).

## Acceptance

- 1280 × 800, Map page: the whole graph box is on screen when scrolled to it; scrolling the inspector keeps the bar visible
  until the graph leaves the screen.
- Embedded: never taller than 520 px.
- 390 × 844: List first; the full-screen graph has the bar bottom-right with 44 px buttons.
- Demo: `design-system/components.html#c-21-map`; in use: `screens/v2-08-map.html` (Map page and the release excerpt).
