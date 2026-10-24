# T-05 · Sorting loose screens: a view of their own, and Add to process

**Answers:** Q2.3, Q2.4 (and the missing half of `04-processes.html`: "Drag a screen onto a process") · **Size:** L ·
**Depends on:** T-03, T-04 · **Screens:** `screens/v2-18-loose-screens.html`, `v2-19-picture-browse.html` · **Demo:**
`components.html#c-23-sort`

> Owner, 24 Oct: "I need to work better with UI to mark processes and lump them together."

## Decision

**Yes, "In no process" gets a view of its own** (a tab next to Processes, like v2-09's suggestions), built for sorting:
a grid of tickable pictures, a selection bar, and **Add to process ▾** without dragging. Dragging stays out: it needs a mouse
and a target on screen, and the menu does the same job for everyone.

| Part | Rule |
|---|---|
| **Where** | Processes ▸ tab **In no process (12)** (`/processes/loose`). The panel on the Processes list becomes a link to it |
| **Grid** | `.sy-sortgrid` of `.sy-pick` cards, ≥ 200 px each: checkbox with the screen's title, the picture (opens the dialog, T-04), route, "seen 17 Oct · 2 variants". **Grid / List** switch (List = the table with 96 px pictures, T-03). Sort: Last seen · Route · Part |
| **Ticking** | Checkbox, **X** on a focused card, Shift + click for a range. A ticked card gets a chalk edge and its **step number** (the order you ticked, `.sy-pick__step`), which is the order in a new process |
| **Selection bar** | `.sy-selbar`, sticky at the bottom while anything is ticked: "2 ticked · New process from these · Add to process ▾ · Clear". With the New process panel open (below), "New process from these" isn't repeated in the bar |
| **New process from these** | The side panel (today's `NewProcess.tsx` form): name, persona, the ticked screens as ordered steps (↑ / ↓, start and end), **Create process**. Unchanged rules (BR-011) |
| **Add to process ▾** | On a card's menu, the selection bar and the dialog. See below |

## Add to process: what it does

A person **can't edit A** (the as-is is built only from observations, `10-processes.md` §1, §5). So adding a screen to an
existing process is a **scope change**, never a to-be draft:

1. The screens join the process's **included screens** (its scope).
2. A is **rebuilt from what scans already observed** for the new scope: a new A revision, author "you · scope change". If a
   scan has walked between the process's steps and the new screen, it appears in A at once.
3. If no observed path reaches it yet, the screen sits in the scope as **"Not on the observed path yet"** on the process page,
   with **Explore from here** (a focused scan, as a command) and it is shown in no step. Nothing is invented.
4. To-be variants (B, C…) don't change: drawing the screen into a to-be is a separate, deliberate edit.

Toast after adding: "Kontakt added to Napisz do nas · its as-is follows what scans saw · Undo" (Undo removes it from the scope
and the A revision it caused).

**What the menu lists**

| Group | Items |
|---|---|
| Search | A field when there are more than 8 processes ("Find a process") |
| Last used | The last 1–3 processes you added to |
| Processes · {persona} | Saved processes (accepted or made by hand) whose persona matches, A–Z, with step count. Proposed suggestions are listed too, marked `proposed`: adding to one adds to the suggestion's scope (it stays a suggestion) |
| Disabled | Processes that already contain the screen: "already in" |
| Last | **New process from these…** |

Not listed: archived processes, and processes for another persona (adding a guest screen to a client-only process is a
different question: open the process and use Edit scope).

## Markup

```html
<li class="sy-pick" data-ticked>
  <span class="sy-pick__step" aria-hidden="true">1</span>
  <label class="sy-pick__tick"><input type="checkbox" checked> <span>Kontakt</span></label>
  <button class="sy-thumb-btn" aria-haspopup="dialog">…picture…</button>
  <span class="sy-pick__route">/kontakt</span><span class="sy-pick__meta">seen 17 Oct · 2 variants · step 1 of the new process</span></li>

<div class="sy-selbar" role="region" aria-label="Selection"><span class="sy-selbar__count">2 ticked</span>
  <button class="sy-btn sy-btn--sm" aria-haspopup="menu" aria-expanded="false" aria-controls="add-menu">Add to process ▾</button>
  <button class="sy-btn sy-btn--sm sy-btn--quiet">Clear</button></div>

<div class="sy-menu" role="menu" id="add-menu" aria-label="Add to process">
  <label class="sy-menu__search">…</label>
  <span class="sy-menu__label" aria-hidden="true">Last used</span>
  <button class="sy-menu__item" role="menuitem">Napisz do nas <span class="sy-chip">proposed</span><small>guest · 2 steps · adds to its scope</small></button>
  …
  <button class="sy-menu__item" role="menuitem" aria-disabled="true">Test process <span>already in</span></button>
  <span class="sy-menu__sep" role="separator"></span>
  <button class="sy-menu__item" role="menuitem">New process from these…</button></div>
```

Menu keyboard: ↑ / ↓ move, typing filters, Enter adds, Esc closes and returns focus to the button.

## API (sketch)

`POST /portals/{p}/processes/{id}/scope:add {screens: [...]}` → the new scope, the A revision (or "not on the observed path"
per screen). `DELETE` the same for Undo.

## Acceptance

- 12 loose screens can be ticked from the grid or the dialog and turned into a process without leaving the view.
- Adding Kontakt to "Napisz do nas" creates a scope change and an A revision (or the "not on the observed path yet" state);
  no to-be variant changes.
- The menu never offers a process that already has the screen; "already in" is shown disabled.
