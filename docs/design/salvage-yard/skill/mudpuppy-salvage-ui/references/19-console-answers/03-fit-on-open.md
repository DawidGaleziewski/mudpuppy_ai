# Q3 · Fit on open (F-01@061): a large map opens at 34–47 % and can't be read

**Question.** Should Fit stop at 50 % and scroll instead?

## Decision

**No: 50 % doesn't make the text readable either (a 12 px route becomes 6 px). Separate the two jobs.**

| | Opening the map | The Fit button |
|---|---|---|
| Job | Let people **read** the map | Show the **whole shape** |
| Zoom | Fit, but **never below 80 %**: `openZoom = fit >= 0.8 ? Math.min(fit, 1) : 0.8` | Fit, at any zoom (down to 10 %) |
| When the map is bigger | Opens at 80 % scrolled to the **start page** (`/`, top-left of the layered layout), or to the page in `?sel=` | Everything in view |
| Under 50 % | n/a | The graph becomes an **overview**: boxes keep their shape and state (border, failed red, dashed unobserved), their words fade (`.sy-graph--overview`) |
| Fit pressed | `aria-pressed="false"` | `aria-pressed="true"` until the person zooms or pans |

**Why 80 %.** It is the smallest step at which the node route (12 px → 9.6 px) and title (13 px → 10.4 px) stay readable.
Below it people zoom in anyway, so opening there only costs a click.

**In overview**, clicking (or Enter on) a node selects it and zooms to 100 % centred on it. The words fade with
`opacity: 0`, not `visibility`, so screen readers still read every node; the zoom level's label says "overview".

Zoom steps for − and +: **25 · 33 · 50 · 67 · 80 · 100 · 125 · 150 %** (25 and 33 are new; the rest as in
`18-design-answers/04`). The level button shows the actual value after Fit (e.g. 34 %) and resets to 100 %.

## Markup

```html
<button class="sy-btn sy-btn--sm sy-btn--quiet sy-graph__zoom-level" aria-label="Zoom 34%, overview, reset to 100%">34%</button>
<button class="sy-btn sy-btn--sm sy-btn--quiet" aria-pressed="true">Fit</button>
…
<section class="sy-graph sy-graph--overview" aria-label="Map of reference-insurer, 19 screens">…</section>
```

Demo: `design-system/components.html#c-22-zoom`.

## React (`Graph.tsx`)

```ts
const READABLE = 0.8, OVERVIEW = 0.5, STEPS = [0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5];
useLayoutEffect(() => {                                   // on open only
  const fit = fitZoom(box, canvas);
  setZoom(fit >= READABLE ? Math.min(fit, 1) : READABLE);
  if (fit < READABLE) scrollToNode(sel ?? startNode);
}, [graphId]);
const overview = zoom < OVERVIEW;                          // className={overview ? "sy-graph sy-graph--overview" : "sy-graph"}
const onNodeClick = (n) => overview ? (select(n), zoomTo(1, n)) : select(n);
```

## What to change

- [ ] Open with the 80 % floor and scroll to the start page or `sel`; Fit keeps fitting everything.
- [ ] Add `.sy-graph--overview` under 50 %; node click in overview zooms to 100 % on it.
- [ ] Add the 25 and 33 % steps.

## Acceptance

- A 19-screen map at 1280 opens at 80 % with `/` in view and readable text; Fit shows all of it.
- At 34 % the nodes show no words but keep their state borders; Tab still reaches every node with its full name.
- Clicking a node in overview lands at 100 % with that node centred and selected.
