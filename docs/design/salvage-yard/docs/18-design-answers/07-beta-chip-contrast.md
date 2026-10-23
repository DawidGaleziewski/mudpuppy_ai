# Q7 · The beta chip on the selected nav item (F-15 b)

**Question.** axe reports `color-contrast` on wb-01 and wb-06: the dashed beta chip (`.sy-chip--dashed`) on the selected nav
item (`[aria-current="page"]`) is too faint. Darker text there, or mark beta differently?

## Decision

**Darker text, same chip.** On the selected item, every chip takes the item's ink:

```css
.sy-nav__item[aria-current="page"] .sy-chip { color: var(--sy-text-on-paint); border-color: currentColor; }
```

| | Text on the selected item (chalk) | Ratio |
|---|---|---|
| Before | ash `#A3A69F` | 1.9:1 (fails) |
| After | steel-900 `#111315` | 14.7:1 |

- It stays **dashed**, so it still reads as "not settled" and matches the chip on the unselected items (ash on steel, above 6:1).
- It applies to any chip inside a selected nav item, so the next one won't regress.
- Why not a different marker for beta: the chip is the right part (a small label after the name). The problem was only
  the paint on the inverted background; the same fix the nav counts already use (`.sy-nav__count`).
- Note: the selected item is **chalk**, not manila (manila is only for record tags and people's notes).

## What to change

- [ ] Copy the updated `salvage.css` (section "2.1 · Chips on the selected nav item"). No markup change.
- [ ] Re-run `ui:check`: the Workbench pages should report no issues.

## Acceptance

- axe `color-contrast`: 0 issues on wb-01…wb-10.
- Demo: `design-system/components.html#c-21-nav`.
