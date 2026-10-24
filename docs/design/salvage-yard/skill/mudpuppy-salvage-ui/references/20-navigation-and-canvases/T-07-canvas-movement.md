# T-07 · How a canvas moves: engage, wheel, drag, touch

**Answers:** Q6.1–6.4, Q6.6 · **Size:** L · **Depends on:** — · **Changes:** D-47 (the wheel rule) · **Applies to:** every
`.sy-graph` (Screens ▸ Map, the recorded map, a scan's Graph tab, the Workbench live map) and every Diagram (T-09) ·
**Screens:** `screens/v2-22-capabilities-diagram.html` (engaged) · **Demo:** `components.html#c-23-canvas`

> Owner, 24 Oct: "I would like zoom in via scroll, and drag and drop similar to Figma. Currently drag and drop highlights
> text." … "something that locks my mouse in when I click in it."

## Decision: model (c), engage to zoom, for all canvases

| State | Wheel | Ctrl / ⌘ + wheel, pinch | Drag | Keys |
|---|---|---|---|---|
| **At rest** (not engaged) | Goes to the **page**. The canvas never catches it, so a page with a 520 px graph scrolls past it | Zooms at the pointer | Pans (and engages) | Tab into it engages |
| **Engaged** | **Zooms at the pointer** | Zooms at the pointer | Pans | + / − / 0 zoom, F full screen (in the Workbench F stays focus mode: full screen is the button there), arrows move between nodes (Shift + arrows pan), Esc releases |

- **Engage** by clicking or starting a drag inside the canvas, or by Tab focus on it or a node. **Visible:** a 2 px marker
  ring on the canvas (`.sy-graph[data-engaged]`, the focus colour, because it is a kind of focus) and the hint
  "Wheel zooms · Drag pans · Esc to leave" in the bottom-left corner.
- **Release** with Esc, a click outside, or Tab out. Scrolling the page with the pointer outside the canvas does nothing to it.
- **The hint at rest** shows on hover only: "Click to zoom with the wheel · Drag pans". It never covers a node for long: it
  fades out 3 s after the last wheel or drag.
- **Why not (b), Figma:** it catches the wheel whenever the pointer passes over a canvas, so embedded graphs trap the page.
  **Why not (a) alone:** it doesn't give the owner wheel zoom. (c) gives wheel zoom on request and never traps.

## Drag to pan

| | Rule |
|---|---|
| Empty canvas | Drag pans. Cursor `grab`, `grabbing` while dragging (`[data-panning]`) |
| Starting on a node | **Pans too**, once the pointer moves 4 px; a press and release under 4 px **selects** the node. Dense maps have no empty canvas to grab |
| Space + drag, middle button | Pan from anywhere, nodes included |
| Text | No text selection on the canvas while dragging or ever (`user-select: none` on `.sy-graph__canvas`). Node text is copyable from the inspector and the List view |
| Momentum | None: the canvas stops where you let go |

## Zoom

- **Smooth** with the wheel and pinch (any level from 10 % to 400 %), anchored at the pointer.
- The **− / + buttons and keys** go to the next step from where you are: 25 · 33 · 50 · 67 · 80 · 100 · 125 · 150 · 200 %.
- The level button shows the **actual** value rounded to a whole percent (73 %) and resets to 100 % when pressed.
- Under 50 %: the overview drawing (`.sy-graph--overview`, round 3 Q3). Opening stays "readable first" (≥ 80 %).

## The canvas moves by transform

The canvas is positioned with `transform: translate(x, y) scale(z)` inside a box with `overflow: hidden`
(`.sy-graph--canvas`). The box never scrolls natively: that's what lets an un-engaged wheel reach the page. Keep the pan
inside bounds: at least 80 px of the drawing stays visible.

## Touch and pen

| Where | One finger | Two fingers / pinch | Tap |
|---|---|---|---|
| Embedded, not engaged | Scrolls the page (`touch-action: pan-x pan-y`) | Pinch zooms the canvas | Engages |
| Engaged, or full screen | Pans (`touch-action: none`) | Pinch zooms | Tap a node selects; **Done** in the hint releases |
| Phones (< 640 px) | The map opens as the List; the graph opens full screen (T-08) | | |

A pen behaves like a mouse (press-drag pans, tap selects).

## Build notes (React)

- One `useCanvas()` hook for Graph and Diagram: state `{x, y, z, engaged, panning}`; Pointer Events (`pointerdown/move/up`,
  `setPointerCapture`), `wheel` with `{passive: false}` and `preventDefault()` **only** when engaged or Ctrl/⌘ is held;
  pinch via two active pointers; keys on the canvas element.
- Release on `focusout` of the canvas subtree, `pointerdown` outside, `Escape`.
- Write the transform to the canvas element in a `requestAnimationFrame`, not through React state per event.
- The selected node stays in view when zooming with the buttons; wheel zoom keeps the point under the pointer still.
- Announce zoom changes from buttons and keys only ("Zoom 80 %"), once, in the page's polite live region.

## Acceptance

- On a Scan page with an embedded 520 px graph, the wheel scrolls the page past it; after a click inside, the wheel zooms it.
- Dragging anywhere pans; no text is selected; a short click on a node selects it.
- Esc, a click outside or Tab out releases; the ring and hint go.
- Touch: one finger on an embedded graph scrolls the page; tap, then one finger pans.
