# T-04 · The picture dialog browses the list it was opened from

**Answers:** Q2.1, Q2.2 (the dialog part) · **Size:** M · **Depends on:** the wide dialog (D-45) · **Screens:**
`screens/v2-19-picture-browse.html` · **Demo:** `components.html#c-23-browse`

> Owner, 24 Oct: "I can open the picture in a modal. But there is not next or prev button to view quickly next. I also do
> not see a checkbox to mark it to a process."

## Decision

**Opened from a list, the dialog steps through that list. A screen's variants move to a switch in the head.** When the
list is one you sort (In no process, a new process's candidates), the dialog's foot also carries the list's own actions:
the tick and Add to process. It still never edits the screen.

| Question | Answer |
|---|---|
| List vs variants | **The arrows are the list.** ← / → (and J / K) = previous / next screen in the list. The screen's variants are a segmented switch in the head (`r1 · r2`), keys **Shift + ← / →**. One row of controls, no second stepper. A screen with one variant shows no switch |
| Position | In the foot, left: `← Previous · 5 of 12 · Next →` and the list's name ("in no process"). The variant position is in the head's meta ("variant r1 of 2") |
| The tick | In the foot, right: **"In the new process"** checkbox, the same state as the row's, and the step number it got ("step 1") next to it. Only when the list is sortable |
| Key for it | **X**, as in Review (X selects). Space stays with the focused control (it scrolls the picture or presses a button) |
| Add to process | A menu button in the foot (**A** opens it), the same menu as T-05 |
| View-only? | The dialog never changes the **screen**. It may carry the **list's** actions, because they act on the list (ticks, scope). From lists that aren't sortable (the Screens list, a process's steps) the foot has the stepper and "Open screen page" only |
| Stepping | Moving keeps the fit mode (Fit width / Whole page) and the variant if the next screen has the same one; otherwise r1. Preload the next and previous pictures |
| Esc | Closes; focus returns to the row of the screen you ended on (not the one you opened), which is scrolled into view |
| Keys line | One muted line in the foot lists them: `← → or J K list · Shift + ← → variants · X tick · A add to process · Esc close` |

## Build

1. The dialog takes the list (ordered ids + label + whether it is sortable) and the index, from the page that opened it.
2. The figure reserves the next picture's size (its width × height from the API) before the image arrives (T-10), so the
   foot never jumps while you step.
3. Ticking in the dialog updates the same selection store as the grid/list; the step numbers follow tick order.
4. `aria-live="polite"` on the position announces "Kontakt, 5 of 12" after each step (once, not on every image load).

## Markup

```html
<footer class="sy-dialog__foot">
  <div class="sy-dialog__stepper"><nav class="sy-pager" aria-label="Screens in no process">← Previous · 5 of 12 · Next →</nav>
    <span class="sy-small sy-muted">in no process</span></div>
  <div class="sy-dialog__pick">
    <label class="sy-check"><input type="checkbox" checked> In the new process</label><span class="sy-dialog__step">step 1</span>
    <button class="sy-btn sy-btn--sm" type="button" aria-haspopup="menu" aria-expanded="false">Add to process ▾</button>
    <a class="sy-small" href="/screens/…">Open screen page</a></div>
  <p class="sy-dialog__keys">← → or J K list · Shift + ← → variants · X tick · A add to process · Esc close</p>
</footer>
```

## Acceptance

- From "In no process", 12 screens can be looked at and ticked without closing the dialog; the grid shows the same ticks.
- On a screen with 2 variants, Shift + → shows r2; → goes to the next screen.
- Esc returns focus to the last screen viewed.
