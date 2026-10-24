# T-14 · Layout stability everywhere content loads (requirement FE-V45)

**Asked by:** the owner, 24 Oct: "Design a loader … add it to the package with a requirement to be added where content loads.
Add loaders in some places to show how to handle CLS, so it looks and behaves better and doesn't jump like it does now." ·
**Size:** L (an audit plus fixes, page by page) · **Depends on:** T-10 · **Screens:** `v2-23-loading-screens.html`,
`v2-24-loading-screen.html` · **Lab:** `design-system/loading-lab.html`

## The requirement

> **FE-V45 · Every place that loads content reserves its final size before the content arrives and shows the loader
> (T-10) when the wait passes 300 ms. Nothing that is already on screen moves because something else arrived.**
> Budget: **CLS ≤ 0.05** on every console page, measured on a cold load and on each nav click with a 1 s API delay.
> (Google's "good" is 0.1; we hold half of it because the console is used all day.)

## Where content loads, and what each place does

| Place | Reserve | Loader | Notes |
|---|---|---|---|
| **Page body** (every route) | The page's skeleton at final size (T-10) | `.sy-loader` at the top, after 300 ms | Head renders at once |
| **Page head data line** (counts, dates, release) | A skeleton line of the same height | — | Never insert a line later |
| **Lists and tables** (Screens, Changes, Review, Rules, Scans…) | Header row + n rows of the final row height | `.sy-loader` beside the heading | Refetch: old rows dimmed, `--sm` "Updating" |
| **Pictures** (list rows, variants, the sort grid, cards) | `width`/`height` on `<img>`, `aspect-ratio` 16 / 10 on the box; `.sy-thumb--loading` | **None per picture**; one line for the group ("Loading pictures · 2 of 4") | `loading="lazy"`, `decoding="async"` |
| **The picture dialog** | The figure takes the recording's width × height (from the API) before the image | `.sy-loader--block` in the figure after 300 ms | Stepping (T-04) never resizes the foot |
| **Graphs and diagrams** | `.sy-reserve` at the graph's height (layout height, or 520 px embedded) | `--block` "Laying out 19 screens" | The zoom bar is shown but disabled until ready |
| **Nav counts and badges** | `min-width: 3ch`, tabular figures; "·" until the number comes | — | A late count must not push the label |
| **Tabs with counts** | Same as nav counts | — | |
| **Inspector / side sheet** | Its width is fixed; body skeleton lines | `.sy-loader` | Opening it never resizes the main column (it overlays or has its column already) |
| **The assistant drawer** | Sticky, one window high (round 3 Q8) | The drawer's own states | New messages scroll inside the log, never the page |
| **Workbench views** | `.sy-genskel` at the view's final size (as today) | `.sy-genstatus` | Unchanged; already the rule there |
| **Banners** ("As of …", "Back to now", stale data) | Rendered with the page, never inserted above content later | — | If it must arrive late, it overlays (toast) instead |
| **Toasts** | Fixed position (`.sy-toast--fixed`) | — | Never in the flow |
| **Fonts** | Preload the two fonts every page uses (Archivo, IBM Plex Mono Regular) with `<link rel="preload" as="font" type="font/woff2" crossorigin>`; keep `font-display: swap` | — | Self-hosted, small; preloading removes most of the swap shift |
| **Menus, popovers, the As-of menu** | Absolutely positioned, never in the flow | `--sm` inside when their items load | |
| **Error after loading** | The error state takes the skeleton's size | — | Retry keeps the size |

## How to find the jumps (the audit)

1. In Chrome DevTools ▸ Performance, record a cold load and five nav clicks with "Slow 3G" or a 1 s API delay; look at
   **Layout shifts** in the Experience track.
2. Or run the Playwright check below on every route (it fails when CLS > 0.05):

```js
// e2e/cls.spec.ts (sketch)
await page.addInitScript(() => {
  window.__cls = 0;
  new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; })
    .observe({ type: "layout-shift", buffered: true });
});
await page.route("**/api/**", async r => { await new Promise(f => setTimeout(f, 1000)); await r.continue(); });
for (const path of ROUTES) {
  await page.goto(path); await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => window.__cls)).toBeLessThanOrEqual(0.05);
}
```

3. Fix in this order: page bodies (T-10), pictures, counts, graphs, banners.

## Where to look in the package

- `screens/v2-23-loading-screens.html`: the Screens list at 300 ms: real head and filters, skeleton rows of the final
  height with picture boxes, the loader with a count.
- `screens/v2-24-loading-screen.html`: a Screen page loading part by part: the head ready, two variant pictures in, two still
  loading in boxes of their size, the actions as skeleton rows, the map excerpt reserved with a block loader.
- `design-system/loading-lab.html`: press "Load: slow (1.2 s)" and compare the shift numbers (today about 0.015–0.03 per load, depending on the window;
  the rule 0.000).

## Acceptance

- The Playwright CLS check passes (≤ 0.05) on all routes with a 1 s API delay.
- Every place in the table above uses its reserve and loader; a code search finds no "Loading…" plain-text lines left.
