# Spec 054 · Edges on the recorded map

**Question.** The recorded map (one scan's moves, drawn as a tree of first visits) needs two more edge styles: one for **a
move off the tree** and one for **a move other scans made**. For now the retired and unseen styles stand in.

## Why the stand-ins have to go

`--retired` and `--unseen` already mean something on the model map: "this link is gone" and "this link was missing after
that date". On the recorded map they would say the portal changed, when all that happened is the scan went back to `/` or
another scan took a link this one didn't. Each edge style has one meaning everywhere, so these two moves get their own.

## Decision

On the recorded map, **solid means this scan made the move; dashed means it didn't.** Width and colour say how much it
matters: the tree is the spine, everything else is quieter.

| Move | Class | Stroke | Arrow | Shown |
|---|---|---|---|---|
| **First visit**: the scan's first arrival at a page (the tree) | `.sy-edge--tree` | ash `--sy-text-muted`, 2 px, solid | no (the tree reads left to right) | always |
| **Move off the tree**: between two pages the scan already had (back to `/`, across through the menu) | `.sy-edge--offtree` | control edge `--sy-border-control`, 1 px, solid | **yes**, at the page it went to | layer "Moves off the tree", **on** by default |
| **Other scans' move**: a link other scans took and this one didn't | `.sy-edge--others` | control edge, 1.5 px, long dash `10 6` | no | layer "Other scans' moves (N)", **off** by default |
| Queued (not followed yet) | `.sy-edge--frontier` | unchanged: ash, dash `4 4` | no | always |
| The failing move | `.sy-edge--failed` | unchanged: red, 2 px | no | always |

- **Contrast:** ash is 7.0:1 and the control edge 3.6:1 on the plate, so every line passes the 3:1 for graphics.
- **Kept apart by more than colour:** width (2 / 1 / 1.5), pattern (solid / solid with arrow / long dash / short dash) and
  the arrowhead. In forced colours every line is `CanvasText` and they still read apart; the failing move becomes the only
  4 px line there (it was the same 2 px as the tree).
- **Never on the same map as** `--unseen`, `--unchecked`, `--retired`, `--planned`: those are model-map layers. In the view
  "One scan's path" the Layers group shows only the two layers above.

See it: `design-system/components.html#c-21-edges` (graph, legend, the hub chip).

## Moves off the tree

**What counts.** A move is a tree move if it is the scan's first arrival at the page it goes to; every later move into an
already-visited page is off the tree. Not drawn as edges:

- steps on the same URL (they are the page's steps, already shown on the node);
- repeating a tree move (`/` → `/ubezpieczenia/samochod` again): the tree line is already there;
- coming back from a **side trip** (a page opened from a menu and left at once): the "+2 side pages" chip already covers the
  round trip.

**One line per page pair.** All moves from A to B are one line, labelled with `text.sy-edge-label`:

- `↩ 3×` when it happened more than once;
- `↩ step 140` when it happened once (the step the scan made it on).

If the scan moved both ways between two pages, it is one line with an arrowhead at each end (`marker-start` as well; the
marker uses `orient="auto-start-reverse"`), labelled with both counts: `↩ 2× · 1×`.

**Routing.** Off-tree lines go around the tree, never across a node:

- back to an ancestor: an arc over the top row (or under the bottom row when that's shorter);
- between neighbours in one column: straight;
- lay the graph out with **tree edges only**, then route the off-tree lines. The nodes never move because a back move
  arrived, which matters on the live map.

**A page many moves return to.** If more than six off-tree lines would end on one page (in practice `/` and the menu
targets), none of them is drawn. The page gets a chip instead:

```html
<span class="sy-chip">↩ 14</span><span class="sy-sr-only">moves back here from 9 pages</span>
```

Selecting the page lists them in the inspector. Six because beyond that the fan of lines hides the tree: the same reason the
11-link menu is bundled on the model map.

## Other scans' moves

**What counts.** A link between two pages that one or more of the **other scans of this portal that the map is built from**
took and this scan didn't. If spec 054 means a different set (only the same release, only the last N scans), the style
stays the same; only the layer's count changes.

- The layer is **off by default**: the view is about this scan. Its count is in the label: "Other scans' moves (12)".
- The edge label says how many: `2 scans`. The inspector names them: "Also taken by 01a1083f-5472, 01a12f40-8c1e".
- **Pages only other scans reached** appear with the layer and use `.sy-node--dim` with the dashed status:

```html
<button class="sy-node sy-node--dim" type="button" aria-pressed="false" style="…">
  <span class="sy-node__route">/porownanie</span><span class="sy-node__title">Porównanie produktów</span>
  <span class="sy-node__meta"><span class="sy-status" data-status="unobserved">Not reached</span>
    <span class="sy-sr-only">, reached by other scans</span></span></button>
```

(No `aria-label`: the visible text names the button, D-51.)

## Markup

```html
<fieldset>
  <legend class="sy-legend-label">Layers</legend>
  <label class="sy-check"><input type="checkbox" checked> Moves off the tree</label>
  <label class="sy-check"><input type="checkbox"> Other scans' moves (12)</label>
</fieldset>

<svg class="sy-graph__edges" aria-hidden="true" focusable="false">
  <defs><marker id="g7-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8"
          markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path class="sy-edge-arrow" d="M1 1 7 4 1 7"/></marker></defs>
  <path class="sy-edge sy-edge--tree" d="M200 192 C220 192 220 102 240 102"/>
  <path class="sy-edge sy-edge--offtree" d="M580 60 C580 0 100 0 100 150" marker-end="url(#g7-arrow)"/>
  <text class="sy-edge-label" x="340" y="14" text-anchor="middle">↩ 3×</text>
  <path class="sy-edge sy-edge--others" d="M580 144 V240"/>
  <text class="sy-edge-label" x="588" y="196">2 scans</text>
</svg>

<ul class="sy-legend" aria-label="Moves of this scan">
  <li class="sy-legend__item"><svg width="28" height="10" aria-hidden="true"><path class="sy-edge sy-edge--tree" d="M0 5H28"/></svg>First visit</li>
  <li class="sy-legend__item"><svg width="28" height="10" aria-hidden="true"><path class="sy-edge sy-edge--offtree" d="M0 5H24" marker-end="url(#g7-arrow)"/></svg>Move off the tree</li>
  <li class="sy-legend__item"><svg width="28" height="10" aria-hidden="true"><path class="sy-edge sy-edge--others" d="M0 5H28"/></svg>Other scans' move</li>
  <li class="sy-legend__item"><svg width="28" height="10" aria-hidden="true"><path class="sy-edge sy-edge--frontier" d="M0 5H28"/></svg>Queued</li>
  <li class="sy-legend__item"><svg width="28" height="10" aria-hidden="true"><path class="sy-edge sy-edge--failed" d="M0 5H28"/></svg>Failed</li>
</ul>
```

- The arrowhead is a `<marker>` in the graph's own `<defs>`, set with the `marker-end` **attribute** (not CSS), so it works
  with any stylesheet path. Its id must be unique on the page: two graphs, two ids.
- `.sy-legend__item` lines a swatch up with its words. It replaces the page-local `.mp-legend` rules in v2-08; the old
  markup still works.
- Edges stay decoration (`aria-hidden`). The List view and the inspector carry the same facts in text.

## React sketch

```tsx
type Move = { step: number; from: string; to: string; result: "ok" | "failed" | "queued" };
type Edge = { kind: "tree" | "offtree" | "others" | "frontier" | "failed"; from: string; to: string;
              steps: number[]; back?: number; scans?: string[] };

const HUB_LIMIT = 6;

function classify(moves: Move[], sideTrips: Set<string>): Edge[] {
  const seen = new Set<string>([moves[0]?.from]);
  const tree = new Set<string>();                                    // "from→to" of tree moves
  const pairs = new Map<string, Edge>();
  const out: Edge[] = [];
  for (const m of moves) {
    if (m.from === m.to) continue;                                   // same-URL steps live on the node
    if (m.result !== "ok") { out.push({ kind: m.result === "failed" ? "failed" : "frontier", from: m.from, to: m.to, steps: [m.step] }); continue; }
    const key = `${m.from}→${m.to}`;
    if (!seen.has(m.to)) { seen.add(m.to); tree.add(key); out.push({ kind: "tree", from: m.from, to: m.to, steps: [m.step] }); continue; }
    if (tree.has(key) || sideTrips.has(m.from)) continue;            // repeated tree move; way back from a side trip
    const e = pairs.get(key) ?? { kind: "offtree", from: m.from, to: m.to, steps: [] };
    e.steps.push(m.step); pairs.set(key, e);
  }
  return [...out, ...pairs.values()];                                // then fold reverse pairs, then apply HUB_LIMIT per target
}

const label = (e: Edge) => e.kind === "offtree" ? (e.steps.length > 1 ? `↩ ${e.steps.length}×` : `↩ step ${e.steps[0]}`)
                        : e.kind === "others" ? `${e.scans!.length} scan${e.scans!.length > 1 ? "s" : ""}` : null;

function Edges({ edges, layers }: { edges: Routed[]; layers: { offtree: boolean; others: boolean } }) {
  const arrow = `${useId()}-arrow`;
  return (
    <svg className="sy-graph__edges" aria-hidden="true" focusable="false">
      <defs><marker id={arrow} viewBox="0 0 8 8" refX={7} refY={4} markerWidth={8} markerHeight={8}
        markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path className="sy-edge-arrow" d="M1 1 7 4 1 7" /></marker></defs>
      {edges.filter(e => (e.kind !== "offtree" || layers.offtree) && (e.kind !== "others" || layers.others)).map(e => (
        <g key={e.id}>
          <path className={`sy-edge sy-edge--${e.kind}`} d={e.d}
            markerEnd={e.kind === "offtree" ? `url(#${arrow})` : undefined}
            markerStart={e.kind === "offtree" && e.both ? `url(#${arrow})` : undefined} />
          {label(e) && <text className="sy-edge-label" x={e.lx} y={e.ly} textAnchor={e.anchor}>{label(e)}</text>}
        </g>))}
    </svg>);
}
```

## What the map needs from the data

Per move of this scan: step number, from page, to page, result (already in the scan's events). For the "Other scans'
moves" layer: per link the other scans took, from page, to page and their scan ids (full ids; shown in the 13-character
form, D-49). Nothing else is new.

## What to change

- [ ] Copy the updated `salvage.css` (section "2.1 · Recorded map"). Nothing else in the CSS changed.
- [ ] On the recorded map, replace the stand-ins: `--retired` → `--offtree`, `--unseen` → `--others`. Classify moves as in
      the sketch (first arrival = tree).
- [ ] Add the arrowhead marker to the graph's `<defs>` and `marker-end` to off-tree paths; one marker id per graph.
- [ ] Bundle off-tree moves per page pair with the `↩ 3×` / `↩ step 140` label; apply the hub chip above six lines.
- [ ] Lay out with tree edges only; route off-tree lines around the tree.
- [ ] Layers in the view "One scan's path": "Moves off the tree" (on), "Other scans' moves (N)" (off). Hide the model-map
      layers there.
- [ ] The legend uses `.sy-legend__item`; the labels as above.
- [ ] Inspector and List view: "Moves off the tree: 3 (steps 88, 112, 140)" and "Also taken by …" on the selected page.

## Acceptance

- No `--retired` or `--unseen` edge on the recorded map.
- A scan that goes `/` → `/ubezpieczenia/samochod` → `/kalkulator/kierowca` → `/` three times draws two tree lines and
  one off-tree line labelled `↩ 3×` with an arrowhead at `/`.
- Seven or more off-tree lines into one page: none drawn; the page shows `↩ N`; the inspector lists them.
- Turning "Moves off the tree" on and off doesn't move any node.
- The "Other scans' moves" layer is off on load; on, dimmed pages and long-dash lines appear and the count matches.
- Forced colours: all lines visible, arrowheads visible, the five legend swatches tell apart.
- axe: 0 issues on the map page (edges are `aria-hidden`; nodes are named by their text).
