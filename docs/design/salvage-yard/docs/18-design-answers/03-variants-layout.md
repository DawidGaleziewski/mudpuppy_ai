# Q3 · One variant stretches across the whole row: `.sy-variants`

**Question (`Screen.tsx:66`, `Compare min="220px"`).** With `auto-fit`, a screen with one variant gets one full-width card.
Intended? If not: (a) `auto-fill`, (b) a maximum card width, or (c) a different layout for one variant.

## Decision

**Not intended.** The Variants tab misused `.sy-compare`, which is a before / after **pair**. A screen's variants are a
**list**, so they get their own parts. The answer is **(a) and (c) together**:

- **Two or more variants:** `.sy-variants` uses `repeat(auto-fill, minmax(min(var(--sy-min), 100%), 1fr))`, so every card keeps
  the width of one column (240 px minimum by default) however many there are. Three variants on a wide page leave the rest
  of the row empty instead of stretching.
- **One variant** (most screens): `.sy-variant:only-child` switches to a media layout: picture on the left
  (`--sy-variant-pic`, 360 px), facts on the right, the whole card at most 960 px. There is nothing to compare, so the card
  says so: "One variant so far. A second one appears here when a scan sees this screen differently (another release,
  persona or state)."
- **`.sy-compare` stays** for real pairs: Changes ▸ Before / after (`v2-03`), the Workbench's Compare.

(b) alone, a maximum width, would still waste the row for one variant and gives an odd last row for three.

| Variants | Screen detail at 1280 (Variants tab ≈ 1030 px wide) | At 1024 (≈ 780 px) | At 390 |
|---|---|---|---|
| 1 | Picture 360 px left, facts right, card ≤ 960 px | Same | Stacked: head, picture, facts |
| 2–3 | Cards about 245 px wide in one row; the rest of the row stays empty | Two columns | One column |
| 4 | One row of four (v2-07) | 2 × 2 | One column |

## Markup

```html
<div class="sy-variants" style="--sy-min: 240px">
  <section class="sy-variant" aria-labelledby="r1-h">
    <header class="sy-variant__head"><h3 id="r1-h" class="sy-h3">r1</h3><span class="sy-chip">Baseline</span></header>
    <div class="sy-variant__pic"><button class="sy-thumb-btn" type="button" aria-haspopup="dialog">…</button></div>
    <div class="sy-variant__body">
      <p class="sy-small sy-muted">5f08 · guest · seen 4–15 Oct · scans <a class="sy-tag sy-tag--sm" href="…">01a1083f-5472</a></p>
      <span class="sy-status" data-status="ok">Observed</span>
    </div>
  </section>
  …
</div>
```

Order inside a card is fixed: head (label + why chip) → picture → facts (release, persona, seen, scans) → status and its
explanation → actions (Overturn…). The single-variant layout uses CSS grid areas, so the same markup serves both.

## React

Use a `Variants` list component instead of `Compare` on the Variants tab. Sketch:

```tsx
<div className="sy-variants" style={{ ["--sy-min" as any]: "240px" }}>
  {variants.map(v => (
    <section key={v.id} className="sy-variant" aria-labelledby={`${v.id}-h`}>
      <header className="sy-variant__head"><h3 id={`${v.id}-h`} className="sy-h3">{v.label}</h3><Chip>{v.reason}</Chip></header>
      <div className="sy-variant__pic"><Picture src={v.thumb} alt={`Variant ${v.label} of ${screen.name}`} onOpen={() => open(v)} /></div>
      <div className="sy-variant__body">…{variants.length === 1 && <p className="sy-small">One variant so far. …</p>}</div>
    </section>))}
</div>
```

## What to change

- [ ] `Screen.tsx:66`: replace `<Compare min="220px">` with the `.sy-variants` list (`--sy-min: 240px`).
- [ ] Show the "One variant so far…" line when there is exactly one.
- [ ] Keep `Compare` for before / after only.
- [ ] Copy the updated `salvage.css` (section "2.1 · Variants of one screen").

## Acceptance

- One variant at 1280: picture about 360 px wide, facts beside it, nothing stretched past 960 px.
- Three variants: three cards of equal width; no card wider than one column.
- 390 px: one column, no horizontal scroll.
- Demo: `design-system/components.html#c-21-var`; in use: `screens/v2-07-screen-detail.html` (four variants).
