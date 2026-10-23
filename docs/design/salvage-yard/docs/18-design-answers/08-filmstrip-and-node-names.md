# F-15 a · Filmstrip items and map nodes are named by what they show

**What happened.** The designer's filmstrip markup put an `aria-label` on each `.sy-film__item` that differed from its
visible text, so axe reported a label-in-name mismatch (WCAG 2.5.3). The team fixed it by letting the visible text name the
button. That fix is now in the design's own markup too.

## Rule

**Buttons that show their content (filmstrip items, map nodes, picture buttons) carry no `aria-label`.** The visible text
names them, so speech-input users can say what they see. If a node needs words that aren't on screen (a screen's name next
to its route, "collapsed", "2 extra states"), add them in a `.sy-sr-only` span **after** the visible text. State that has an
ARIA attribute stays an attribute (`aria-pressed` for the selection), not words.

```html
<button class="sy-film__item" type="button" aria-pressed="true">
  <span class="sy-order">3</span>
  <span class="sy-mini sy-mini--mock" aria-hidden="true">…</span>
  <span class="sy-film__route">/kalkulator/kierowca · step 1</span>
  <span class="sy-status" data-status="ok">Visited</span>
  <span class="sy-chip">+2 side pages</span>
</button>
<!-- name: "3 /kalkulator/kierowca · step 1 Visited +2 side pages" -->

<button class="sy-node" type="button" aria-pressed="false" style="left: …; top: …">
  <span class="sy-order">5</span>…<span class="sy-node__route">/porownanie</span><span class="sy-sr-only">Porównanie</span>…
</button>
```

## Updated in the package

- Workbench screens wb-01…wb-05 and wb-08 (filmstrip and live-map nodes), the gen UI gallery, `16-genui-components.md` §6.3.
- The v1 map (`screens/12-map-graph.html`, 13 nodes) and the map demo in `components.html` (5 nodes): `aria-label` removed;
  the few words that weren't visible moved to sr-only spans.
- The reference app already followed the rule.

## What to change

Nothing new on your side for the filmstrip (already fixed). Apply the same rule to the React `Graph` nodes if they still
carry `aria-label`.
