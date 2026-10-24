# T-11 · The header: the store rides on the portal picker

**Answers:** Q8.1 · **Size:** S · **Depends on:** your header fix (R-103, FE-N01 / FE-N02) · **Screens:** every `v2-*` and
`wb-*` screen (updated) · **Demo:** `components.html#c-23-header`

## Decision

**Order:** wordmark · **Portal [portal ▾][store ▾]** · As of · Search · **Ask (with the assistant's status)** · ?

| | Rule |
|---|---|
| Store placement | **Joined to the portal picker**, as its second half, under the one label "Portal". The store follows the portal (R-71 (d)), so it sits on it and needs no label of its own |
| Short form | The store's **name** in mono with a small database icon: `sandbox`. Read-only isn't a word in the header: it is in the button's accessible name ("Data store: sandbox, read-only"), its `title`, and the menu |
| Its menu | The stores of this portal (name, path, size, read-only, "writes go through commands"), radio items, then **Data store settings**. One store: still a menu (the facts + settings), so the header doesn't change shape |
| All portals | The store half reads `per portal`, disabled (each portal has its own) |
| Room at 1280 | The assistant's status **moves into the Ask button** as its square (sr-only "Assistant up."). When the assistant is down the button shows the red ✕ and the word: "Ask · down". This and the store make the header one row from **1180 px** (measured: 65 px tall at 1280, 1200 and 1180) |
| The nav foot | "store: sandbox · writes go through commands" leaves the nav (it is in the store menu now) |
| Settings ▸ Data store | Stays, for details and switching defaults |
| `--sy-header-h` | Set it from the header's measured height (`ResizeObserver` on `.sy-header`); the CSS values (65 / 121 px) are fallbacks |

## Markup

```html
<div class="sy-portal sy-portal--compact sy-portal--store" role="group" aria-labelledby="portal-l">
  <span class="sy-label" id="portal-l">Portal</span>
  <select class="sy-select" aria-label="Portal">…reference-insurer · wikipedia · All portals · + New portal…</select>
  <button class="sy-select sy-store" type="button" aria-haspopup="menu" aria-expanded="false"
          aria-label="Data store: sandbox, read-only" title="Data store: data/db/sandbox.sqlite · read-only · writes go through commands">
    <svg …database…/>sandbox</button></div>
…
<a class="sy-btn" href="…"><span class="sy-status" data-status="ok"><span class="sy-sr-only">Assistant up.</span></span>Ask <span class="sy-kbd">Ctrl J</span></a>
<!-- down: <span class="sy-status" data-status="failed">down</span> -->
```

## Acceptance

- The header is one row at 1280 and 1200 with the store present; "reference-insurer" isn't cut.
- Switching the portal switches the store to that portal's last-used one; the store menu lists only that portal's stores.
- The assistant's status is still announced (inside Ask) and visible when down.
