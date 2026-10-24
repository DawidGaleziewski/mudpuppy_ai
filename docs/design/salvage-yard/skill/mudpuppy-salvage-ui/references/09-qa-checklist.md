# 09 · QA and PR checklist

Copy this into the PR template for any UI change.

## Every UI pull request

**System**
- [ ] Uses `sy-` classes and role tokens only: no hex, rgb or named colours, no font or letter-spacing overrides (stylelint is green).
- [ ] `migration/find-old-styles.sh <changed files>` reports 0.
- [ ] No radius, no shadows, no new animations.
- [ ] At most one `.sy-btn--primary` and at most one `.sy-plate--intent` in the view.

**Meaning**
- [ ] Every status is `.sy-status[data-status]` with a word, mapped by the shared helper.
- [ ] Every record ID is a `.sy-tag`, linked, in its stored case.
- [ ] Every human-written text is a `.sy-note`; no machine text in typewriter.
- [ ] Drafted, inferred or proposed content is dashed blueprint; applied content is solid.
- [ ] Orange is used only for intent; red only for failure or destruction; nothing real is blue.

**Content**
- [ ] Inventory voice: counts first, then the next move. No emoji or exclamation marks.
- [ ] Times are UTC with Z; IDs and Polish strings shown exactly as stored.
- [ ] Long names (more than about five words) are not uppercased (`.sy-case-normal`).

**Accessibility**
- [ ] axe-core: 0 serious or critical.
- [ ] Keyboard: every control reachable, focus visible, Esc closes the drawer and dialogs, Ctrl K and Ctrl J work.
- [ ] Landmarks, one h1, headings in order; inputs labelled; icon buttons have aria-label.
- [ ] State is ARIA (`aria-current`, `aria-pressed`, `aria-selected`, `aria-invalid`, `aria-busy`).
- [ ] Reduced motion: nothing moves.
- [ ] Targets ≥ 24px everywhere; ≥ 44px under touch emulation (`pointer: coarse`).

**Visual**
- [ ] Screenshot at 1280 attached; matches `screenshots/screens/NN-*.png` if the page has a reference.
- [ ] Screenshot at 390 attached; no page-level horizontal scroll.
- [ ] Polish diacritics render in the intended fonts.

**Traceability**
- [ ] PR lists the FE-IDs from `07-requirements.md` it implements.

## Release checklist (per migrated route)

- [ ] Route extends the Salvage base template; the Console stylesheet is not loaded on it.
- [ ] Old URL redirects to the new section.
- [ ] Visual-regression baseline updated.
- [ ] `UI_SALVAGE` flag can switch the route back (until Phase 5).

## Map runs (screens 12–16)
- [ ] Every node is reachable with Tab and the arrow keys, announces route, state and marks, and toggles `aria-pressed`.
- [ ] The List view shows the same nodes, statuses, queue counts and marks as the graph.
- [ ] Red appears only for crawler failures; recorded technical states use neutral chips.
- [ ] Marks persist after reload and appear in Plan next scan; marks a scan used are cleared when it finishes.
- [ ] On production, technical probes are off and the safety callout says so.
- [ ] A replay mismatch stops the scan with "Replay diverged at step N" and a diff.
- [ ] Generated documentation never uses an error page as a step (fixture with a one-off 503).

## MudPuppy 2.0 (screens v2-*)
- [ ] The As of picker changes every model page and the URL (`as_of`); not-Now pages show the banner and disable writes.
- [ ] Review opens on Needs you; Explained automatically and Decided are one click away with counts.
- [ ] Every Reject and Overturn requires a one-line reason; the reason shows wherever the item appears (Changes, Screens, Map inspector, Process, Rule, export, Decided).
- [ ] Overturned items show the manila Overturned status and the note everywhere, survive a rescan and a model rebuild, and Undo works.
- [ ] Keyboard: J/K, X, C, R, M, O, Shift C, U, / and ? work in Review; focus moves to the next item; outcomes are announced.
- [ ] Bulk confirm of a group is one command with one Undo.
- [ ] Explained automatically uses blueprint (inferred); a recorded portal error is a neutral chip; red only for broken rules, failed tests and failed writes.
- [ ] Decision tables: inputs ║ result, provenance and hit policy under the table, boundary tests per release; the export has the same table in Markdown.
- [ ] The eight states of `v2-13-states.html` exist on every P1 page as in its matrix.
- [ ] 1024 px: no page-level horizontal scroll; the header may wrap to two rows.

## Workbench · gen UI (screens wb-*)
- [ ] The model never sends markup: every view comes from a valid view spec (`workbench/schema/`), rendered by server templates with autoescape; no `|safe` on model strings.
- [ ] Every generated frame has the solid frame, the "generated" mark and a source line, and its accessible name ends in ", generated"; each view has Why this view? and Right view? once, on its lead frame.
- [ ] Numbers, routes and statuses inside views come from events or the portal model store, never from the model's text. Every narration line cites at least one event; lines with ungrounded numbers are replaced by the templated line.
- [ ] Invalid components are dropped (and logged), not the whole view; an empty view falls back to plain chat with no red.
- [ ] Writes only through command cards: nothing runs before Confirm; running/done/failed/undone/cancelled/expired states show; Undo works for marks; commands run on sandbox only.
- [ ] Data lane works with the assistant down: the live map keeps updating; the composer says so.
- [ ] SSE drop → stale notice with the last event time; reconnect with Last-Event-ID catches up without duplicates.
- [ ] Composing reserves the final size (no layout shift > 0.1 CLS); text is never held for the view; "Still working" after 4 s with nothing; the view is dropped after 15 s.
- [ ] Focus never moves on its own; Esc closes picker → Why → sheet and returns focus; A, @ and F work; exactly one polite live region, narration and live cards inside the log are `aria-live="off"`; one announcement per stage change or milestone, never per event.
- [ ] The path switch shows who chose the path; your switch wins until a new request; the path is in the URL and reloads to the same view.
- [ ] As of ≠ Now shows the "works on now" banner and disables writes.
- [ ] Golden-prompt evals pass (path accuracy, required components, no forbidden components) before any prompt or catalogue change merges.
- [ ] 1280 and 1024: no page-level horizontal scroll; the graph and filmstrip scroll inside their frames.

## 2.1 · Pictures, variants, graph view, ids (`18-design-answers/`)
- [ ] Picture buttons: icon visible at rest, "Enlarge" on hover / focus / touch, focus ring visible on light pictures, Enter opens, Esc returns focus.
- [ ] Wide dialog: fit width scrolls inside with head and foot fixed; Whole page fits the height; full screen at 390px; ← / → between variants.
- [ ] Variants: one variant shows picture-left; several keep one-column width; no card stretched across the row.
- [ ] Graph view: zoom bar visible while any of the graph is on screen; box never taller than the viewport below the header (520px embedded); phones open the list.
- [ ] Scan ids: 13-character form on screen, full id in title / Copy / URLs / JSON; no 8-character ids anywhere.
- [ ] axe: `color-contrast` and `label-content-name-mismatch` 0 on the Workbench pages and the map.
- [ ] Recorded map: no retired / unseen lines; off-tree lines have arrowheads and one label per page pair; more than six into a page → chip; layers don't move nodes; "Other scans' moves" off on load; forced colours keep all five legend lines apart.

## 2.2 · Console answers (`19-console-answers/`)
- [ ] Phase bar: every phase ≥ 24 px wide and named; Waiting for you is the only orange; pressing filters the trace with a status line; forced colours show the pressed phase in Highlight.
- [ ] Map: opens at ≥ 80 % scrolled to the start page; Fit fits all; under 50 % the overview keeps state borders and accessible names.
- [ ] Persona card: drafted values editable, edited ones marked, Confirm sends what is shown; no secret field anywhere; the vault dialog stores values directly.
- [ ] Before / after: "Not here" line for inserted regions, box for floating ones; overlay slider works by keyboard; marks stay at full strength.
- [ ] Time axes at 390 px: only the two ends; the range label inside the timeline's box.
- [ ] Decision tables: facts above, `aria-describedby`; caption only names the table.
- [ ] Drawer: one window high, the log scrolls; stacked under 1024 px with the log ≤ 60dvh.
- [ ] "This page" disabled on pages without a subject: focusable, reason read, click ignored.
- [ ] `/states/{id}` lands on the Screen page with the recording dialog open.
- [ ] Scan lines: kind word, 13-character id, "no new step for N min" only after 2 min.

## 2.3 · Navigation, canvases, loading (`20-navigation-and-canvases/`)

- [ ] Came from: after a cross-section link, "← {Kind} {title}" above the crumbs returns to the same tab, filter, page and scroll; none after nav, search or a typed URL (T-01).
- [ ] Pager: only when opened from a list; J / K; the disabled end doesn't move the layout; Back returns to the list (T-02).
- [ ] Pictures in rows: rows keep their height before pictures arrive; "No picture" names why (T-03).
- [ ] Picture dialog from a list: ← → / J K move through the list, Shift ← → through variants, X ticks, A adds; keys ignored in fields (T-04).
- [ ] Add to process: menu groups (search past 8, last used, persona A–Z, "already in" disabled, New process); added screens show "Not on the observed path yet" (T-05).
- [ ] Merge: different personas disabled with the reason; Undo 10 s restores both; Split back from History (T-06).
- [ ] Canvas: scrolling the page past a graph never zooms it; click to engage, wheel zooms at the pointer; drag pans from a node after 4 px; Esc releases (T-07).
- [ ] Full screen: F / button, Esc back to the same zoom and position, focus returns (T-08).
- [ ] Diagram: our theme, opens readable top-left; List and Diagram show the same items (T-09).
- [ ] Loading: no state under 300 ms; skeleton at the final size from 300 ms, ≥ 300 ms; refetch dims old rows with `aria-busy`; no spinner, no bare "Loading…" (T-10).
- [ ] **CLS ≤ 0.05 on every route** (Playwright layout-shift check with a 1 s API delay) (T-14, FE-V45).
- [ ] Header: one row at 1280 and 1200 with the store; Ask carries the assistant's status (T-11).
- [ ] All portals: portal sections disabled and focusable with the reason (T-12).
- [ ] Didn't start: portal down → failed card "Didn't start" in ≤ 30 s, nothing in Scans; portal up → live map card before any assistant text, no generated mark (T-13).
- [ ] Forced colours: engaged canvas ring, ticked picks, loader beads and disabled nav items are visible.

## Visual regression setup (Playwright)

```js
// playwright.config: use: { viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' }
test('home', async ({ page }) => {
  await page.goto('/portal/reference-insurer/home');
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot('01-home.png', { fullPage: true, maxDiffPixelRatio: 0.01 });
});
```
Seed the database with the reference-insurer and wikipedia fixtures used in `screens/`.
Playwright writes its own baselines (`*-snapshots/`); generate them from the running app, compare them by eye
with `screenshots/screens/*.png` once (the package PNGs are design references, not pixel baselines), then commit them.
