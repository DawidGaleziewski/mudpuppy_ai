# Q2 · A wide dialog for a picture: `.sy-dialog--wide`

**Question (`Picture.tsx:24-25`).** `.sy-dialog` is sized for confirmations, too narrow for a full-page screenshot. Should
there be a size modifier? What maximum width and image height? Should a very tall screenshot scroll or shrink? Full screen on
a phone?

## Decision

| Question | Answer |
|---|---|
| A modifier? | Yes: **`.sy-dialog--wide`**, plus **`.sy-dialog__figure`** for the scrolling picture area and **`.sy-dialog__close`** |
| Maximum width | `min(1280px, 100vw − 32px)` (`--sy-dialog-wide`). Our captures are 1280 px wide, so on a normal screen the picture shows at about 1:1 and text is readable |
| Height | The dialog is at most `100dvh − 32px`. Head and foot stay put; only the picture area scrolls |
| A very tall screenshot | **Scroll inside, fit to width, by default.** A switch offers **Whole page**, which shrinks the picture to the visible height as an overview. Never shrink by default: a 1280 × 4000 page squeezed into 600 px makes text about 4 px high |
| On a phone (< 640 px) | **Full screen**: 100vw × 100dvh, no border. Fit width; pinch-zoom allowed inside the picture (`touch-action: pan-x pan-y pinch-zoom`) |

## Anatomy

```
┌ head ─────────────────────────────────────────────────────────────────────────────┐
│ Kalkulator OC/AC — wynik · variant r3                     [Fit width|Whole page] × │
│ Release 9c21 · guest · visit 01a1340c-3b97#15 · 17 Oct 10:15Z · 1280 × 2140        │
├ figure (scrolls) ─────────────────────────────────────────────────────────────────┤
│ the screenshot, fit to width, marks as on the thumbnail                             │
├ foot ─────────────────────────────────────────────────────────────────────────────┤
│ [← r2] [r4 →]  3 of 4 variants                         Open full size in a new tab │
└───────────────────────────────────────────────────────────────────────────────────┘
```

```html
<dialog id="pic-dlg" class="sy-dialog sy-dialog--wide" aria-labelledby="pic-h">
  <header class="sy-dialog__head"><div class="sy-split">
    <div class="sy-stack" style="--sy-gap: 2px">
      <h2 id="pic-h" class="sy-h3">Kalkulator OC/AC — wynik · variant r3</h2>
      <span class="sy-meta">Release 9c21 · guest · visit 01a1340c-3b97#15 · 17 Oct 10:15Z · 1280 × 2140</span></div>
    <div class="sy-cluster">
      <div class="sy-seg" role="group" aria-label="Fit">
        <button type="button" aria-pressed="true">Fit width</button><button type="button" aria-pressed="false">Whole page</button></div>
      <button class="sy-btn sy-btn--icon sy-btn--md sy-dialog__close" type="button" aria-label="Close (Esc)">×</button></div>
  </div></header>
  <figure class="sy-dialog__figure" data-fit="width">
    <img src="/screens/…/r3.full.webp" alt="Variant r3 of Kalkulator OC/AC — wynik">
  </figure>
  <footer class="sy-dialog__foot"><div class="sy-split" style="width: 100%">
    <div class="sy-cluster"><button class="sy-btn sy-btn--sm">← r2</button><button class="sy-btn sy-btn--sm">r4 →</button>
      <span class="sy-small sy-muted">3 of 4 variants</span></div>
    <a class="sy-small" href="…" target="_blank" rel="noopener">Open full size in a new tab</a></div></footer>
</dialog>
```

`data-fit="width"` (default) scrolls; `data-fit="page"` fits the whole picture into the visible height.

## Behaviour

- Open with `showModal()`. Focus goes to the dialog heading's close button; **Esc** closes; focus returns to the thumbnail
  (`.sy-thumb-btn`). The backdrop is `--sy-backdrop`.
- **← / →** go to the previous / next variant when focus is not in the Fit switch. Prev / Next buttons disable at the ends.
- **Loading:** the thumbnail is shown stretched to the figure width until the full picture arrives (same aspect ratio, no
  layout jump). **Failed:** a `.sy-state` "Picture not available" with the reference; no red (nothing in the scan failed).
- **Marks** (Changed, New, Missing) are drawn at the same positions as on the thumbnail (`.sy-mark--overlay`, positioned in %).
- The Fit choice is remembered for the session.

## React

`Picture.tsx:24-25`: drop `width: min(960px, 100vw − 32px)` and `max-height: 65vh`; use `className="sy-dialog sy-dialog--wide"`
on the `<dialog>` and wrap the image in `<figure className="sy-dialog__figure" data-fit={fit}>`. Sketch:

```tsx
const [fit, setFit] = useState<"width" | "page">("width");
<dialog ref={ref} className="sy-dialog sy-dialog--wide" aria-labelledby={headingId}>
  <header className="sy-dialog__head">…<Seg value={fit} onChange={setFit} options={[["width","Fit width"],["page","Whole page"]]} />…</header>
  <figure className="sy-dialog__figure" data-fit={fit}><img src={full} alt={alt} /></figure>
  <footer className="sy-dialog__foot">…</footer>
</dialog>
```

## What to change

- [ ] `Picture.tsx:24-25`: classes instead of inline width and max-height; add the head facts, the Fit switch and the foot.
- [ ] Keyboard: Esc (native), ← / → between variants, focus return.
- [ ] Copy the updated `salvage.css` (section "2.1 · Wide dialog for a picture" and the < 640 px rule).

## Acceptance

- 1280 × 800: a 1280 × 2140 capture is readable at fit width and scrolls inside; head and foot stay visible.
- 390 × 844: the dialog fills the screen; pinch-zoom works in the picture; Close is reachable.
- Esc closes and focus is back on the thumbnail.
- Demo: `design-system/components.html#c-21-dlg`.
