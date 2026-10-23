# Q1 · A picture that opens larger: `.sy-thumb-btn`

**Question (spec 052/053, `Picture.tsx:23`).** The thumbnail is wrapped in a `<button>`, but `.sy-btn` draws a visible
button. We need a "naked" button. What about its focus ring and hover state, and should something show that the picture
can be enlarged?

## Decision

Yes. The library now has **`.sy-thumb-btn`**: a button with no border, paint or padding, full width, `cursor: zoom-in`.
The picture inside is the target. A small **corner badge** with an expand icon is always visible, so people can tell the
picture opens larger even on touch, where there is no hover. The word "Enlarge" joins the icon on hover and keyboard focus,
and is always shown on touch screens.

| State | What changes |
|---|---|
| Rest | The picture with its normal 1px edge; badge bottom-right: steel plate, chalk icon, 1px control edge |
| Hover | Picture edge and badge edge turn chalk (`--sy-text`); "Enlarge" appears in the badge; cursor `zoom-in`. Background change only, 120 ms, no scaling |
| Keyboard focus | 2px marker outline, 2px offset, **plus a 2px steel gap** (`box-shadow: 0 0 0 2px var(--sy-bg-ground)`). "Enlarge" appears |
| Pressed | Opens the wide dialog (Q2). No pressed style |
| Touch (`pointer: coarse`) | "Enlarge" is always shown; the button is the whole picture, so it is far above 44 px |
| Nothing larger exists | Not a button. Use `.sy-thumb` / `.sy-thumb--locked` on its own |

**Why the steel gap.** Marker orange on the light paper of a screenshot is only 2.0:1. The two-tone ring fixes that: steel
against paper is 16.3:1 and marker against steel is 8.2:1, so the indicator meets WCAG 2.4.11 / 1.4.11 on paper, on manila
and on steel. The assistant highlight (`.sy-mark`) already uses the same trick.

**Why an always-visible icon.** "Click to enlarge" text on every thumbnail is noise on a page of eight variants; no hint at
all hides the feature on touch and from people who don't hover. A 24 px badge in the corner is the quiet middle.

## Markup

```html
<button class="sy-thumb-btn" type="button" aria-haspopup="dialog" aria-controls="pic-dlg">
  <img class="sy-thumb" src="/screens/scr_…/variants/r3.webp" alt="Variant r3 of Kalkulator OC/AC — wynik">
  <span class="sy-thumb-btn__hint" aria-hidden="true">
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 1h4v4M11 1L7 5M5 11H1V7M1 11l4-4"/></svg>
    <span class="sy-thumb-btn__word">Enlarge</span>
  </span>
  <span class="sy-sr-only">, enlarge</span>
</button>
```

- Accessible name = the picture's `alt` + ", enlarge" ("Variant r3 of Kalkulator OC/AC — wynik, enlarge"). The badge is
  `aria-hidden`; the visible word is in the name through the sr-only text, so label-in-name holds.
- `aria-haspopup="dialog"`; Enter and Space open the dialog; focus returns to this button on close.
- Works with `.sy-thumb` (an `<img>`) and with a `.sy-shot` mock.

## React (`apps/web/src/design-system/components/Picture.tsx`)

Replace the inline style with the class. Sketch, not compiled:

```tsx
export function Picture({ src, alt, onOpen }: { src: string; alt: string; onOpen: () => void }) {
  return (
    <button className="sy-thumb-btn" type="button" aria-haspopup="dialog" onClick={onOpen}>
      <img className="sy-thumb" src={src} alt={alt} />
      <span className="sy-thumb-btn__hint" aria-hidden="true"><ExpandIcon /><span className="sy-thumb-btn__word">Enlarge</span></span>
      <span className="sy-sr-only">, enlarge</span>
    </button>
  );
}
```

## What to change

- [ ] `Picture.tsx:23`: drop the inline style (`display:block; width:100%; padding:0; border:0; background:none; cursor:zoom-in`)
      and use `className="sy-thumb-btn"` with the hint and sr-only text above.
- [ ] Don't render the button when no larger picture exists.
- [ ] Copy the updated `salvage.css` (section "2.1 · Picture that opens larger").

## Acceptance

- Keyboard: Tab reaches the picture, the ring is visible on light and dark content, Enter opens, Esc returns focus here.
- axe: no `button-name` or `label-content-name-mismatch` issues.
- Touch at 390 px: "Enlarge" is visible without hovering.
- Demo: `design-system/components.html#c-21-pic`; in use: `screens/v2-07-screen-detail.html` (Variants).
