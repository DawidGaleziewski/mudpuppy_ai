# T-09 · Diagram (Mermaid): frame, zoom, theme; the capability map as a list first

**Answers:** Q5.1–5.3, 5.5, 5.6 · **Size:** M · **Depends on:** T-07, T-08 · **Screens:** `screens/v2-21-capabilities.html`
(List), `v2-22-capabilities-diagram.html` (Diagram, engaged) · **Demo:** `components.html#c-23-diagram`

> Owner, 24 Oct: "Diagram is unreadable. I would like to view it, zoom in, scroll by drag dropping."

## Decision

| Question | Answer |
|---|---|
| Frame | **The map's frame as is**: `.sy-graphview` + `.sy-graph__zoom` (− · level · + · Fit · Full screen), with a modifier `.sy-graphview--diagram` and the canvas `.sy-graph--canvas.sy-diagram`. One component family, one way to move (T-07) |
| Height | Like the graph: **natural height capped at the viewport** below the header on a page of its own; **520 px** when embedded (a process record, a scan's Process tab) |
| Opening zoom | **Readable first** (round 3 Q3): fit if that is ≥ 80 %, otherwise 100 % at the **top-left** of the drawing for left-to-right and top-down diagrams (where they start). A process flow (LR) starts at its start |
| Full screen | Yes, T-08 |
| Mermaid render | Render once to SVG (`mermaid.render`) with our theme; put the SVG in the canvas. Re-render only when the source changes. Never at the column's width: the SVG keeps its natural size and the canvas scales it |
| Theme | Below. Today's colours in `Diagram.tsx` move into this one config |
| Capability map | **List first, Diagram second** (`List · Diagram` switch, like the Map's List view, FE-M01). A capability map is a tree; a tree reads better as an indented table with counts, statuses and links, and it is accessible. The diagram shows the shape. The process record's map and the scan's Process tab stay **diagram first** (they are flows), with the steps table as their list |

## Theme (Mermaid `initialize`)

```js
mermaid.initialize({
  startOnLoad: false, securityLevel: "strict", theme: "base",
  fontFamily: "Archivo, system-ui, sans-serif", fontSize: 13,
  themeVariables: {
    background: "#181B1E",            // --sy-bg-plate
    primaryColor: "#202428",          // node fill: --sy-bg-raised
    primaryBorderColor: "#6B737C",    // --sy-border-control
    primaryTextColor: "#E8E4DA",      // --sy-text (chalk)
    lineColor: "#A3A69F",             // edges: --sy-text-muted (ash)
    secondaryColor: "#181B1E", tertiaryColor: "#181B1E",
    clusterBkg: "transparent", clusterBorder: "#2C3136",   // subgraphs: weld line, no fill
    edgeLabelBackground: "#181B1E", titleColor: "#E8E4DA",
  },
  flowchart: { curve: "basis", nodeSpacing: 28, rankSpacing: 48, htmlLabels: false },
});
// Status by classDef only (no other colours):
//   classDef failed   stroke:#FF5A5F,stroke-width:2px;          (--sy-failure)
//   classDef unreached stroke-dasharray:5 4,color:#A3A69F;      (behind a sign-in, not observed)
//   classDef current  stroke:#E8E4DA,stroke-width:2px;           (the root / selected)
```

**Rules:** nodes are steel plates with a control-edge border and chalk text, keys (CAP-…, PROC-…) in mono 11 px above the
name; edges ash 1.5 px; subgraph labels mono 11 px caps, no fill; **no colours** except the status classes (red = failed,
dashed = not observed). Text never smaller than 11 px at 100 %. `htmlLabels: false` keeps the SVG self-contained and
lets the canvas scale it crisply. `securityLevel: "strict"` because labels come from portal data.

## The capability list (v2-21)

An indented table: group rows (CAP-001 Sprzedaż ubezpieczeń · 3 capabilities · 10 screens) as bands, capabilities under them
with screens, process, status ("Confirmed", or dashed "Not reached · needs sign-in"). Keys are tags that open the record.
Content in the screens is illustrative (the fixture has no capability map yet).

## Acceptance

- The capability map opens as the List; Diagram shows it at ≥ 80 % from its top-left; wheel zoom after a click, drag pans.
- Labels stay ≥ 11 px at 100 %; a node marked unreached is dashed; nothing uses Mermaid's default colours.
- Full screen works the same as for the map.
