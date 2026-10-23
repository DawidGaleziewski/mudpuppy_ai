# Q7 · Decision table facts: caption or facts above?

**Question.** Our markup put the inputs and the hit policy inside the table caption, styled by a page class (`mp-caption`).
React shows them as facts above the table. Do we want a caption style in the design system?

## Decision

**No caption style. React's way is right: facts above the table, outside the caption.** It is now a part:
`dl.sy-facts.sy-facts--table`, joined to the top of the table, and the table points at it with `aria-describedby`.

| | |
|---|---|
| **The caption** | Names the table, nothing else: `<caption class="sy-sr-only">BR-021 decision table</caption>` (visually hidden when a heading right above already says it; a table labelled by `aria-labelledby` needs none) |
| **The facts** | Input(s) and where each comes from · Hit policy in plain words · Where it's decided. For a rule decided on hidden data: Found · Why "any" |
| **Above, not below** | You need the hit policy and what each input means before reading the rows (the 2.0 doc said "under the table"; corrected in `12-v2-ux.md` §7.1) |
| **Why not in the caption** | Screen readers announce the caption every time you enter the table, so a paragraph there is read again and again; `aria-describedby` is read once, on demand. A caption also can't hold layout reliably across browsers (that's what `mp-caption`'s `display: table-caption` fought) |
| **Looks** | Compact facts (12–13 px), well background, the table's border on three sides and a weld line to the table. Inside a plate with a flush table, it is flush too |

```html
<dl id="br021-facts" class="sy-facts sy-facts--table">
  <dt>Input</dt><dd><b>Wiek kierowcy</b> = age on today's date, from field "Data urodzenia" on dane kierowcy</dd>
  <dt>Hit policy</dt><dd><b>First match</b>: rows are checked top to bottom; the first that matches decides.</dd>
  <dt>Decided</dt><dd>When "Dalej" is pressed on Kalkulator OC/AC — dane kierowcy</dd>
</dl>
<div class="sy-table-wrap">
  <table class="sy-table sy-table--decision" aria-describedby="br021-facts">
    <caption class="sy-sr-only">BR-021 decision table</caption>
    …
```

Updated: `screens/v2-12-rule-detail.html` (BR-021) and `screens/v2-11-rules.html` (BR-024, the hidden-data case);
`.mp-caption` is gone from both. The Workbench DecisionTable component uses the same part. Demo: `components.html#c-22-facts`.

## What to change

- [ ] Keep your facts above the table; give them `sy-facts sy-facts--table` and an id; `aria-describedby` on the table;
      the caption becomes the table's name only.

## Acceptance

- Entering the table, a screen reader announces "BR-021 decision table" (not the facts); the facts are its description.
- No `mp-caption` anywhere.
