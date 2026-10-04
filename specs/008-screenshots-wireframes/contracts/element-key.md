# Contract: Element key

One rule, implemented once in `@pathfinder/core/src/element-key.ts`. The layout JSON stores the
computed keys, so the dashboard reads them and never recomputes them. Golden fixtures are in
`apps/crawler/packages/core/test/fixtures/element-keys/`.

## Input

A tree of nodes `{ role, name?, children[] }`, in document order:

- from the ARIA YAML: each list item is a string `role "name" [attrs]` or a one-key map
  `role "name" [attrs]: <children | text>`. `text:` items and `/url:`-style properties are not
  nodes. `"name"` is a JSON-style double-quoted string (escapes `\"` and `\\`) or a `/regex/` and
  is absent when there is no name.
- from `ariaSnapshotJSON`: nodes with `role`, `name`, `children`. Nodes with role `text` are not
  nodes.

## KEYED_ROLES

`heading, button, link, textbox, searchbox, spinbutton, combobox, listbox, checkbox, radio,
switch, slider, tab, menuitem, option, img, table, list, form, dialog, alert, banner, navigation,
main, contentinfo, complementary, region, search`

## Rule

1. Walk depth-first, pre-order. Visit keyed nodes and skip other nodes, but still walk their
   children.
2. Base key: `role "name"` with the name whitespace-collapsed, trimmed and cut at 80 characters.
   With no name or an empty name, the base key is `role`.
3. The first occurrence of a base key is the key itself. The n-th occurrence (n ≥ 2) is
   `base#n`.
4. At most 400 keyed nodes. Later nodes get no key.

## Examples

```text
heading "Kalkulator OC/AC"
textbox "Pojemność silnika"
button "Oblicz"
link "Więcej"
link "Więcej"#2        ← second link with the same name; the suffix goes after the quote
navigation
navigation#2
```
