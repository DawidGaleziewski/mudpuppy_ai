# T-08 · Full screen for graphs and diagrams

**Answers:** Q5.4, Q6.5 (and the phone dialog left open in D-47) · **Size:** S · **Depends on:** T-07 · **Demo:**
`components.html#c-23-canvas` (full screen)

## Decision

**Every graph and diagram can go full screen**, with the same controls. It is one dialog, `.sy-dialog--full`, also used for
the phone case of D-47.

| | Rule |
|---|---|
| Open | A **Full screen** icon button at the end of the zoom bar (`aria-label="Full screen"`, title "Full screen (F)"), or **F** while the canvas is engaged. In the Workbench F keeps its meaning (focus mode), so there it is the button only |
| What it is | A modal `<dialog class="sy-dialog sy-dialog--full">`: 100vw × 100dvh, no border. Head: the graph's title (e.g. "Scan 01a110d5-2028 · map") and **Exit full screen** `Esc`. Body: the same `.sy-graphview` as `--full`, filling the rest |
| Behaviour | **Always engaged** inside (nothing else to scroll): wheel zooms, drag pans, the hint shows once. Zoom level and position carry over both ways |
| Esc | Closes full screen (in full screen there is no "release" step). Focus returns to the Full screen button |
| Inspector | On the Map page the selected node's inspector opens as a side sheet inside the dialog (`.sy-sheet`), so you can read without leaving |
| Phones | "Show the map" on the List opens this dialog directly; the zoom bar sits bottom-right at thumb height (as D-47 said) |
| Not the browser's Fullscreen API | It would hide the console's own Esc handling and doesn't exist in all embeds. The dialog is enough |

## Markup

```html
<dialog class="sy-dialog sy-dialog--full" aria-labelledby="fs-h">
  <header class="sy-dialog__head"><div class="sy-split"><h2 id="fs-h" class="sy-h3">Scan 01a110d5-2028 · map</h2>
    <button class="sy-btn sy-btn--md" type="button">Exit full screen <span class="sy-kbd">Esc</span></button></div></header>
  <div class="sy-graphview sy-graphview--full"> zoom bar · <section class="sy-graph sy-graph--canvas" data-engaged>…</section></div>
</dialog>
```

## Acceptance

- The scan graph (520 px embedded) opens full screen at the same zoom and position, and returns there on Esc.
- At 390 px, "Show the map" opens the same dialog with the zoom bar bottom-right.
