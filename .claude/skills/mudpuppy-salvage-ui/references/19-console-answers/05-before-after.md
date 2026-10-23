# Q5 · Before / after (F-01@064): "Not here", overlay mode, dates on a phone

## a · The dashed "Not here" box

**Question.** The dashed box at the same place on the side without the change has no class. React uses inline styles; the
htmx page uses its own `mp-mark--gone`.

**Decision: `.sy-mark--gone`, in two shapes.** It is the system pointing at an absence, so it stays in the marker family
(like "Changed"), but dashed and untinted, with the label **Not here**.

| Shape | When | Drawn |
|---|---|---|
| **Box** (default) | The region doesn't push the page: a floating button, a badge, an overlay, a toast | At the region's own coordinates on the other picture: dashed marker outline, steel ring, no fill, label "Not here" on paper with a dashed ink edge |
| **Line** `data-shape="line"` | The region was **inserted** and pushed the content below it (the banner on wynik) | A 2 px dashed line (marker and steel) across the region's width at the insertion point. A box at the same coordinates would sit on unrelated content |

Your diff data knows which case it is (did the content below move?). If you can't tell, use the box.

```html
<span class="sy-mark sy-mark--overlay sy-mark--gone" aria-hidden="true" style="left: …; top: …; width: …; height: …">
  <span class="sy-mark__label">Not here</span></span>
<span class="sy-mark sy-mark--overlay sy-mark--gone" data-shape="line" aria-hidden="true" style="left: …; top: …; width: …">
  <span class="sy-mark__label">Not here</span></span>
```

The mark is decoration (`aria-hidden`); the figure's label says it in words: "…, without the banner; a dashed line marks
where it appears on the other visit". Updated on `screens/v2-03-change-detail.html` (line form) and its legend.

## b · Overlay mode

**Question.** Overlay (the after drawn over the before at 50 %) has no class either.

**Decision: `.sy-compare--overlay` with a stack.** One column, the before underneath, the after's **picture** on top at
`--sy-overlay` (default 0.5), and the after's marks on top at full strength (they are siblings of its `<img>`, so the
opacity doesn't reach them). A slider under the stack sets the mix.

```html
<div class="sy-compare sy-compare--overlay">
  <section class="sy-compare__side" aria-labelledby="co-h">
    <header class="sy-compare__head"><span id="co-h">Without banner, with banner over it</span><span class="sy-chip">r2 · r3 at 50%</span></header>
    <div class="sy-compare__stack" style="--sy-overlay: 0.5">
      <figure class="sy-shot sy-compare__under" aria-label="…visit 14, with visit 15 drawn over it at 50%"><img src="…before…" alt=""></figure>
      <figure class="sy-shot sy-compare__over" aria-hidden="true"><img src="…after…" alt="">
        <mark class="sy-mark sy-mark--overlay" style="…"><span class="sy-mark__label">Changed</span></mark></figure>
    </div>
    <label class="sy-compare__mix"><span>Before</span>
      <input type="range" min="0" max="100" step="5" value="50" aria-label="How strongly the after shows" aria-valuetext="After at 50%">
      <span>After</span><output>50%</output></label>
  </section>
</div>
```

- Both pictures are drawn at the same width from the same top-left. Pictures of different heights: the stack is as tall as
  the taller one.
- The **context diff** and the explanation under the pictures don't change between modes.
- Keys: the slider takes ← / → (5 % with `step="5"`) and Home / End (0 / 100 %).

## c · Release lanes at 390 px

**Question.** The date labels crowd into each other at 390 px. Fewer ticks, or only the first and last?

**Decision: only the first and last on phones; everywhere else, ticks at least 64 px apart.** The range's two ends are what
matters on a small screen, and the range label says what's between them. CSS hides the middle ticks under 640 px (for
`.sy-releases__axis` and the new `.sy-phasebar__axis`) and the scans' time labels (each scan keeps its full accessible
name). React should still thin ticks at any width: always keep the first and the last, drop middle ones that would sit
closer than 64 px to a kept neighbour.

```ts
function thin(ticks: Tick[], widthPx: number, min = 64) {
  const out = [ticks[0]];
  for (const t of ticks.slice(1, -1)) if ((t.pct - out[out.length - 1].pct) * widthPx / 100 >= min) out.push(t);
  const last = ticks[ticks.length - 1];
  if (out.length > 1 && (last.pct - out[out.length - 1].pct) * widthPx / 100 < min) out.pop();
  return [...out, last];
}
```

Demos: `design-system/components.html#c-22-compare`, `#c-22-releases` (try 390 px).

## What to change

- [ ] Replace the inline styles with `.sy-mark--gone` (box or `data-shape="line"`) and `.sy-compare--overlay` + `__stack`,
      `__under`, `__over`, `__mix`.
- [ ] Thin the axis ticks (64 px rule); phones get the ends from CSS.

## Acceptance

- The banner change shows "Changed" on r3 and a dashed "Not here" line on r2 at the insertion point.
- Overlay at 50 %: both pages visible, the Changed mark at full strength; the slider moves the mix and is keyboard-operable.
- At 390 px the axis shows only its two ends; no labels overlap.
