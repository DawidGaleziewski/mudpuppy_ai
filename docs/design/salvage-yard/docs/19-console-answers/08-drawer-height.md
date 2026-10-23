# Q8 · The assistant drawer's height

**Question.** Our CSS gives the chat log `flex: 1`, but the drawer has no height, so the log grew a page past 6,000 px. You
made the drawer sticky at the window's height with the log scrolling inside. Is that the intent, and should it be in the CSS?

## Decision

**Yes on both.** The drawer is one window high, sticky under the header; the context switch at the top and the composer at
the bottom never leave the screen; only the log scrolls. It is now in `salvage.css`:

```css
:root { --sy-header-h: 65px; }                       /* one header row; 121px below 1200px */
.sy-drawer { position: sticky; top: var(--sy-header-h); align-self: flex-start; height: calc(100dvh - var(--sy-header-h)); }
.sy-drawer .sy-chat__log { min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
@media (max-width: 1023px) {                          /* the drawer stacks under the page */
  .sy-drawer { position: static; height: auto; }
  .sy-drawer .sy-chat__log { max-height: 60dvh; }
}
.sy-drawer--static { position: static; height: auto; }   /* previews and docs only */
```

| | |
|---|---|
| **Header height** | `--sy-header-h` is 65 px from 1200 px and 121 px below (the header wraps to two rows), measured on the 2.0 screens. If your header differs, set the variable, not the drawer |
| **`align-self: flex-start`** | The app body stretches its children; a stretched drawer can't be sticky. This line is what makes your fix work without a JS height |
| **The log** | Opens scrolled to the newest message and stays at the bottom while new messages arrive, unless the person scrolled up (then a "New messages ↓" button). It gets `tabindex="0"` so keyboard users can scroll it |
| **Under 1024 px** | The drawer stacks under the page (as before): not sticky, and the log is capped at 60 % of the window so it can't grow the page by thousands of pixels |
| **Overscroll** | `overscroll-behavior: contain`: scrolling to the end of the log doesn't start scrolling the page |

Seen in `screens/02-screen-with-assistant.html` (now one window high) and `components.html#c-22-drawer` (fixed at 440 px
there to show the inner scroll).

## What to change

- [ ] Copy `salvage.css`; drop your own sticky and height rules (keep `--sy-header-h` if your header isn't 65 / 121 px).
- [ ] Stick-to-bottom behaviour for the log, with "New messages ↓" when scrolled up.

## Acceptance

- With 200 messages, the page is no taller than without them; the composer is on screen at 1280 × 800.
- At 1000 px wide the drawer sits under the page and its log scrolls inside, at most 60 % of the window high.
