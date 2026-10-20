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
