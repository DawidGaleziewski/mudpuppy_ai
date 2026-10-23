# Q6 · The release range's label

**Question.** "this range · 41 changes" sits above the tracks and covered the field above it. You added room above the
lanes. Is that how it was meant, or should the label sit elsewhere?

## Decision

**Yes, room above the lanes is the intent, and the label stays where it is.** The label belongs to the bracket, so it sits
on the bracket's top edge. The screen had that room as a page-local rule (`.mp-releases { margin-top: 22px }` in
`v2-02-changes.html`), which is why React didn't get it. It is now part of the component: the timeline reserves the room
**inside its own box**, so nothing outside it can be covered.

```html
<div class="sy-releases sy-releases--ranged" style="--sy-releases-name: 112px">     <!-- 24px of room above the lanes -->
  …lanes… <div class="sy-releases__axis" aria-hidden="true">…</div>
  <div class="sy-releases__range" data-label="end" style="left: …; width: …"><span>this range · 41 changes</span></div>
</div>
```

| | |
|---|---|
| `.sy-releases--ranged` | Add it whenever the timeline shows a range. It pads the top by 24 px and puts the bracket and its label inside the padding |
| `data-label="end"` | The bracket reaches the right end (a range up to Now, the usual case): the label aligns to the right edge instead of centring, so it can't run out of the box |
| `data-label="start"` | The bracket starts at the left end |
| neither | The label is centred over the bracket |

Why not elsewhere: under the axis it would be read as a date; inside the tracks it would cover release names; in the page
head it would be far from what it labels.

Updated: `screens/v2-02-changes.html` (the page-local margin is gone). Demo: `components.html#c-22-releases`.

## What to change

- [ ] Remove your extra margin; add `sy-releases--ranged` and `data-label` from the bracket's position.

## Acceptance

- With a range, nothing above the timeline is covered at 1280, 1024 and 390 px; the label never leaves the timeline's box.
