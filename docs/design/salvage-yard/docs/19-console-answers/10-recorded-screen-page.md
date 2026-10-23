# Q10 · The recorded screen page (`/states/{id}`, 1.x screen 08)

**Question.** It has no 2.0 design. Is it now a variant of a model screen (the Screen page and the Picture dialog), or does
it keep its own page? It holds highlights, amendment pins, URLs reached under, the access side-by-side and form probes. Do
you rebuild it or point its links at the Screen page?

## Decision

**Point its links at the Screen page; don't rebuild it as a page.** In 2.0 people work with screens (identity across
releases, personas and visits); a recording is one visit's evidence of a screen. So a recording opens **in the picture
dialog over its Screen page**, and everything the 1.x page did moves to where it belongs in the model.

`/states/{state_id}` stays as a **301 redirect** to `/screens/{screen_id}?variant={r}&recording={state_id}`, which opens the
Screen page with the recording's dialog. Documentation evidence, Scans ▸ States, exports and old bookmarks cite state ids,
so the old URL must keep working. A recording that belongs to no screen yet (before Rebuild model, or unexplained) redirects
to its scan instead: `/scans/{scan}?tab=states&recording={state_id}`, the same dialog over the scan.

## Where each 1.x part goes

| 1.x state page | 2.0 | Part |
|---|---|---|
| The screenshot / wireframe | The **recording dialog**: the picture dialog (`.sy-dialog--wide`) with a facts column. Screenshot / Wireframe switch in its head; ← earlier visit · later visit → in its foot | `.sy-dialog__main` + `.sy-dialog__aside` (new) |
| Highlights (marked by the assistant, elements) | The dialog's **Show on the picture**: Assistant's marks · Amendment pins · Elements (N) | `.sy-mark`, `.sy-mark--note` |
| Amendments (to-be) and their pins | Amendments belong to the **screen**, not one visit: a new **Amendments** tab on the Screen page (list, Add an amendment, Withdraw), kept apart as to-be (manila). Pins show in the dialog on every recording that has the anchored element; if a visit lacks it, the dialog says "AMD-003 · not on this visit" | `.sy-mark--note`, `.sy-note` |
| URLs reached under | Screen page head: **Reached at** `/kalkulator/kierowca · step 1` and "+ 2 more URLs" (a disclosure listing each with its visit count). Per visit in the dialog: Reached at · Also reached at | `.sy-facts`, `.sy-disclosure` |
| Access side by side (what each persona sees) | **Variants**: variants that differ by persona already carry "Persona premium". **Compare r1 and r3** on the variants opens the before / after (v2-03 parts) with the persona row in the context diff | `.sy-compare`, `.sy-differs` |
| Form probes (what each input does, coverage) | A new **Inputs** tab on the Screen page, for screens with a form: the v1 screen 13 content (steps on this URL, what each input does, coverage matrix) in 2.0 parts. Each outcome links to its recording (the dialog) | `.sy-table--dense`, `.sy-status` |
| Store path, settled, first seen, cited by | Dialog facts: Screen · Reached at · Also reached at · Settled · Cited by (records); the store path and fingerprint under a "Details" disclosure | `.sy-facts` |

So the Screen page's tabs become **Variants · Inputs · Actions · Amendments · History** (Inputs only on screens with a form).

## The recording dialog

```html
<dialog class="sy-dialog sy-dialog--wide" aria-labelledby="rec-h">
  <header class="sy-dialog__head">
    <h2 id="rec-h">Kalkulator OC/AC — dane kierowcy · variant r1 · recording</h2>
    <span class="sy-meta">visit 01a110d5-2028#77 · 6 Oct 10:53:40Z · release 5f08 · guest · 1280 × 1460</span>
    Screenshot / Wireframe · ×</header>
  <div class="sy-dialog__main">
    <figure class="sy-dialog__figure" data-fit="width">…picture + marks…</figure>
    <aside class="sy-dialog__aside" aria-label="About this recording">
      <dl class="sy-facts">Screen · Reached at · Also reached at · Settled · Cited by</dl>
      <fieldset>Show on the picture: Assistant's marks (1) · Amendment pins (1) · Elements (14)</fieldset>
      Amendments on this screen · Open in Scans, step 77</aside></div>
  <footer class="sy-dialog__foot">← earlier visit · later visit → · 2 of 12 visits of r1 · Copy link</footer>
</dialog>
```

- The facts column is 320 px (`--sy-dialog-aside`); under 1024 px it goes under the picture (at most 40 % of the window);
  on phones the dialog is full screen and picture and facts scroll as one.
- **Copy link** copies the Screen page URL with `recording=` (the stable way to share a visit).
- Esc closes and returns focus to what opened it; the URL drops `recording=` (Back reopens it).

Demo: `components.html#c-22-recording`.

## What to change

- [ ] Redirect `/states/{id}` (301) as above; point every internal link straight at the Screen page with `recording=`.
- [ ] The recording dialog (extend the Picture dialog with `.sy-dialog__main` + `.sy-dialog__aside`).
- [ ] Screen page: Amendments tab, Inputs tab, Reached at in the head, Compare between variants.
- [ ] Drop the 1.x state page after the redirect is live.

## Acceptance

- Every `/states/{id}` link from the docs evidence lands on the right screen with that visit open.
- Amendment pins appear on every visit that has the element and are listed as "not on this visit" otherwise.
- A persona variant can be compared side by side with the baseline in two clicks from the Screen page.
