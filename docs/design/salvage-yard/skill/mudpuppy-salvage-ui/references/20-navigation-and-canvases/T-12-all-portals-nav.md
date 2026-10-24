# T-12 · The nav on All portals, and the first visit

**Answers:** Q8.2 · **Size:** S · **Depends on:** T-11 · **Screens:** `screens/v2-15-all-portals.html` (updated) · **Demo:**
`components.html#c-23-allportals`

## Decision

**All portals is a mode of its own, not "no portal".** Its nav shows every section; the ones that work across portals are
live, the ones that need one portal are **disabled with the reason**. Not the sections of the last portal used: they would
show one portal's data under an "All portals" header.

| Section | On All portals |
|---|---|
| Home | Live: the per-portal overview (v2-15) |
| Changes, Review | Live: across portals, with a Portal column (as designed in 2.0, `12-v2-ux.md` §9 answer 1) |
| Processes, Screens, Rules, Docs, Scans | **Disabled** (`aria-disabled`, no `href`), with one line under "Portal model": "Pick a portal to open these." |
| Settings | Live (portal-independent settings; a portal's settings ask which portal) |

**First visit:**
- one portal configured → open it directly (Home of that portal);
- several → **All portals** (`/app/`);
- none → New portal.

**Returning visit:** the last portal used (remembered per user), not All portals.

Pressing a disabled section does nothing; with a keyboard, focus stays and the reason is read (`aria-describedby`).
Picking a portal in the header from All portals keeps the section you'd want: Home → that portal's Home.

## Markup

```html
<div class="sy-nav__group" aria-hidden="true">Portal model</div>
<p class="sy-nav__note" id="ap-why">Pick a portal to open these.</p>
<a class="sy-nav__item" role="link" aria-disabled="true" aria-describedby="ap-why">Processes</a>
```

## Acceptance

- `/app/` with two portals shows Home, Changes and Review live and the portal sections disabled with the reason.
- A user with one portal never sees All portals on first visit.
