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
