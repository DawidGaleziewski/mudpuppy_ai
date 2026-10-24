# T-10 · The loader, and loading a page without a blink

**Answers:** Q7 and the owner's request "design a loader that fits the design system … add it where content loads" ·
**Size:** M · **Depends on:** your shell fix (R-103: the header and nav don't re-render) · **Screens:**
`screens/v2-23-loading-screens.html`, `v2-24-loading-screen.html` · **Demo:** `components.html#c-23-loading` · **Try it:**
`design-system/loading-lab.html` (two panes, the same load, one jumps)

## The loader

```
■ ■ ■  Loading screens · 12 of 23
```

Three **weld beads**: the 6 px status square, pulsing in turn. It is the design system's own "running" pulse
(`--sy-dur-pulse`), so no new motion is added, and it reads as the same family as a running scan. Next to it, **what** is
loading, in mono, muted, with a count when there is one. Never "Please wait", never a spinner.

| Variant | Where |
|---|---|
| `.sy-loader` | Next to a section's heading while that section loads; at the top of a page skeleton |
| `.sy-loader--sm` | Toolbars, table heads, menus, the selection bar: "Updating" while a list re-loads |
| `.sy-loader--block` | Centred in a box that already has its final size (`.sy-reserve`): a graph, a diagram, the dialog's picture |
| A button at work | Not the loader: `.sy-btn[aria-busy="true"]` (the caret), as today |
| The assistant composing | Not the loader: `.sy-genskel` / `.sy-genstatus` (blueprint, the assistant's), as today |

`role="status"` on the loader, so the words are announced once. Reduced motion: the beads stand still at 100 / 60 / 30 %;
the words still say it.

## The page rule (answers to Q7)

| # | Question | Answer |
|---|---|---|
| 1 | Head at once, only the body loads? | **Yes.** The head renders from the route (title from the link or the nav label, crumbs from the route) with no data. A data line in the head (counts, dates) is a skeleton line of the same height until it arrives |
| 2 | The body while loading | **All three, in time order.** **0–300 ms:** (c) the previous page stays as it is (React `useTransition` / a pending route); only the nav's current item and the URL change at once, so the click is acknowledged. **From 300 ms:** the new page with (b) its body as **skeleton blocks at their final size** and (a) the loader on top saying what is loading. **Data:** lands in the same boxes |
| 3 | Minimum time before any state | **300 ms.** A load under that shows no loading state at all. **Once shown, the skeleton stays at least 300 ms**, so it never flashes |
| 4 | A filter or page inside a list | **Keep the old rows, dimmed, with `aria-busy`**, and `.sy-loader--sm` "Updating" next to the list's heading; swap when the new rows arrive. The count updates at the end. No skeleton (the layout is already there) |

**The skeleton** (`.sy-skel`) is neutral steel, not blueprint (blueprint means "the assistant is drawing this"). It is
drawn from what the page will have, not a generic grey block:
- a table → its header row and **n rows of the final row height** (`.sy-skel__rows`, `--sy-skel-rows`: the page size,
  at most 10; `--sy-skel-row`: the row height, 49 px for `.sy-table`, 61 px with 72 px pictures);
- plates → their heads (real titles) and grey lines for the body;
- pictures → boxes with their aspect ratio (`.sy-thumb--loading`);
- a graph or diagram → `.sy-reserve` at the graph's height (natural height if known from the layout, else 520 px) with
  `.sy-loader--block` "Laying out 19 screens".

## Build

1. One `<PageFrame>` that renders the head from route data immediately and the body through a `Suspense` boundary.
2. Navigation in a transition: `startTransition(() => navigate(to))`; show the pending page only after 300 ms
   (`useDeferredValue` or a 300 ms timer), keep it ≥ 300 ms.
3. Each page exports its skeleton (`ScreensPage.Skeleton`) built from the same layout components with `skeleton` props, so
   sizes match by construction.
4. List refetch: keep previous data (`placeholderData: keepPreviousData` in TanStack Query or equivalent), put
   `aria-busy="true"` on the table wrap, show `.sy-loader--sm`.
5. Errors replace the skeleton with the error state at the same size.

## Markup

```html
<span class="sy-loader" role="status"><span class="sy-loader__beads" aria-hidden="true"><i></i><i></i><i></i></span>
  <span class="sy-loader__label">Loading screens · 12 of 23</span></span>

<div class="sy-skel" aria-busy="true">
  <span class="sy-loader" role="status">…Loading screens…</span>
  <div class="sy-skel__rows" style="--sy-skel-rows: 8; --sy-skel-row: 61px"></div></div>

<div class="sy-table-wrap" aria-busy="true">…previous rows, dimmed…</div>

<div class="sy-reserve" style="--sy-reserve-h: 520px"><span class="sy-loader sy-loader--block" role="status">…Laying out 19 screens…</span></div>
```

## Acceptance

- A nav click to a page that loads in 150 ms shows no loading state; one that loads in 1.2 s shows the head and the skeleton
  from 300 ms and lands without moving anything below (the loading lab's right pane: shift 0.000).
- Changing a filter keeps the rows, dimmed, then swaps them; the page height doesn't change while it loads.
- No spinner anywhere; every loader names what it loads.
