# T-03 · A picture per row in the Screens list

**Answers:** Q4.4 (and the owner's "miniatures next to url", `1_review_basic.md` item 1) · **Size:** S · **Depends on:** T-10
(reserved sizes) · **Screens:** `screens/v2-06-screens.html` (updated) · **Demo:** `components.html#c-23-rowpic`

## Decision

| Question | Answer |
|---|---|
| Where | In the Screen cell, **left of the title and route** (`.sy-rowpic`). Not a column of its own: the picture belongs to the name |
| Size | **96 px** wide (16:10, 96 × 60) in normal tables; **72 px** in dense tables like the Screens list (`.sy-table--dense`); **64 px** on phones |
| Which picture | The **main variant's latest recording** (r1, or the variant marked main). Not one per variant: the Variants column already counts them |
| It's a button | It opens the picture dialog **browsing the list** (T-04). Named by its picture's alt + ", enlarge" (D-51). The title next to it stays the link to the Screen page |
| No picture | A hatched box with the words "no picture" (`.sy-thumb--none`), and the reason under the title: "No picture: behind a login" / "not recorded yet". Never an empty paper box |
| Loading | The box has its size from the start (`width`/`height` on the `<img>`, `aspect-ratio` on the box); before the image arrives it is faintly hatched paper (`.sy-thumb--loading`). `loading="lazy"`, `decoding="async"` |
| Image file | A 192 × 120 thumbnail (2× for sharp screens), WebP, cropped from the top of the recording. Served by the API, cached |
| Phones | The row stacks: picture 64 px left, title and route right; the other columns become a line of facts under them |

## Markup

```html
<th scope="row"><span class="sy-rowpic">
  <button class="sy-thumb-btn" type="button" aria-haspopup="dialog">
    <img class="sy-thumb sy-thumb--row" src="/api/screens/SCR-012/thumb.webp" width="96" height="60" loading="lazy" decoding="async"
         alt="Kalkulator OC/AC — dane kierowcy">
    <span class="sy-thumb-btn__hint" aria-hidden="true">…</span><span class="sy-sr-only">, enlarge</span></button>
  <span class="mp-cell"><a href="/screens/SCR-012">Kalkulator OC/AC — dane kierowcy</a><span class="sy-route">/kalkulator/kierowca · step 1</span></span>
</span></th>
```

## Acceptance

- Every row has a picture or the "no picture" box with its reason; rows don't change height when images arrive (CLS 0 for the list).
- The table doesn't scroll sideways at 1280 (the title column keeps ≥ 236 px).
- Clicking a picture opens the dialog on that screen with ← / → through the list.
