# 04 · Design system: Salvage Yard

The reference for building any MudPuppy UI. (How the Processes feature behaves is in `10-processes.md`.) Live versions of everything here are in
`design-system/components.html`. The CSS is `design-system/css/` (see `05-css-guide.md`).
Colour meanings are in `03-colour-guide.md`, and the reasons behind the rules are in `02-design-decisions.md`.

---

## 1. The eight rules

1. **Every record is a tagged part.** Record IDs (SCR-001, AMD-001, CAP-005, run ids, revision labels) sit on manila tags with a punched hole, linked to the record. Routes stay plain mono text.
2. **Orange paint marks intent.** Marker means the brand, the primary action (at most one per view), "needs you", and parts tagged for migration. It never means pass or fail.
3. **Blueprint is the to-be.** Anything designed, drafted or inferred rather than observed is drawn in dashed blueprint blue. When it is applied, it turns solid.
4. **Humans type, machines print.** Anything a person wrote is typewriter on manila, joined to its target by a dimension line. Machine output is Archivo (UI, prose) and Plex Mono (data).
5. **Grid ground, solid plates.** The 24px grid lives on the page only. Data never sits on texture.
6. **Square plates, cut tags.** No radius and no shadows. The tag's cut corner is the only angle. Lines are 1px; selected and focused are 2px.
7. **Expanded caps for labels, prose stays plain.** Archivo Expanded caps only for titles, labels, nav and primary buttons, at or under four or five words.
8. **Inventory voice, shaped statuses.** Counts first, then the next move. Every status is shape + word + colour.

---

## 2. Foundations

### 2.1 Type scale

| Style | Class | Font | Size / line | Weight · width · case |
|---|---|---|---|---|
| Display (wordmark) | `.sy-wordmark--lg` | Archivo | 44 / 1 | 800 · 125% · caps |
| Page title | `.sy-h1` | Archivo | 26 / 1.15 | 800 · 125% · caps · +0.03em |
| Section title | `.sy-h2` | Archivo | 18 / 1.2 | 800 · 125% · caps · +0.04em |
| Plate title | `.sy-h3`, `.sy-plate__title` | Archivo | 14 / 1.3 | 800 · 125% · caps · +0.06em |
| Label / column head | `.sy-label`, `.sy-field__label`, `th` | Archivo | 12 / 1.3 | 700–800 · 112% · caps · +0.06em · ash |
| Primary button | `.sy-btn--primary` | Archivo | 14 | 800 · 112% · caps · +0.06em |
| Body | default | Archivo | 15 / 1.5 | 400 |
| Body small (rows, cells, buttons) | `.sy-row`, `.sy-table`, `.sy-btn` | Archivo | 14 / 1.5 | 400 (buttons 600) |
| Meta | `.sy-meta`, `.sy-crumbs` | Archivo | 13–14 | 400 · ash |
| Mono | `.sy-mono` | IBM Plex Mono | 13 | 400 |
| Mono small / status | `.sy-route`, `.sy-status` | IBM Plex Mono | 12 | 400–500 · status caps |
| Micro (tags, kbd, legends) | `.sy-tag`, `.sy-kbd`, `.sy-legend` | IBM Plex Mono | 11 | 500 · **floor** |
| Note | `.sy-note` | Special Elite | 15 / 1.45 (13 small) | 400 · people only |

Numbers in tables use `.sy-num` (tabular figures). Timestamps are UTC with a Z suffix (`2026-10-11 19:27:29Z`).

### 2.2 Space and size

4px root: `space-1` 4 · `2` 8 · `3` 12 · `4` 16 · `5` 20 · `6` 24 · `7` 28 · `8` 40 · `9` 48.
Rows pad 10px 16px; plates pad 16; columns gap 20; page sections gap 20–24; main padding 24/28.

Controls: **44px** default · 40px secondary in plates · 36px dense in cards. Under `pointer: coarse` every control (buttons, segments, md inputs/selects, checkboxes, linked tags) grows to **44px**. Nothing interactive is ever under 24px (WCAG 2.5.8).

### 2.3 Layout

```
┌ header (plate, sticky) ─ wordmark · portal picker · search · assistant status · Ask the assistant · ? ┐
├ nav 190px ┬ main (flex 999, padding 24/28) ───────────────────────┬ [drawer 400–520px] ┤
│ Home      │ page head (crumbs · H1 · meta)                          │ assistant           │
│ Processes │ ┌ main column (flex 999, min 520) ┐ ┌ side (min 290) ┐   │ (only when open)    │
│ …         │ └─────────────────────────────────┘ └────────────────┘   │                     │
└───────────┴──────────────────────────────────────────────────────────┴─────────────────────┘
```

- Reference width **1280px**; every screen in `screens/` was screenshotted there.
- **Under 1024px:** the nav becomes a horizontal strip under the header and the drawer stacks under main. The side column wraps under the main column whenever the content area is narrower than about 830px (it is width-driven, not a breakpoint).
- **Under 640px:** one column, main padding 16, the h1 drops to 22px, the header wraps, and wide tables scroll inside `.sy-table-wrap` (never the page).
- Use the compact nav (`.sy-nav--compact`, 160px) when the drawer is open and on dense workspaces (process edit, compare).

### 2.4 Shape, lines and elevation

- Radius **0** everywhere. Borders are **1px** (weld) and **2px** for selected or focused.
- Plate edges are `strong`, rows inside plates are `line`, and controls are `edge` (≥3:1).
- Elevation is lightness: ground → well → plate → raised. There are no shadows. The only box-shadow in the system is the steel ring of the assistant highlight.

### 2.5 Iconography

- Inline SVG, 16px (20px max), **2px stroke, square caps, miter joins**, `stroke="currentColor"`, `fill="none"`.
- Icons support a word; they never replace one. The exceptions are close (×), help (?) and search, and those carry an `aria-label`.
- Status shapes are not icons. They are drawn by `.sy-status`.

### 2.6 Motion

Two loops only: the **running** status square pulses (opacity 1 → 0.35, 1.3s) and the **loading caret** blinks (1s, step). Hover changes background only (120ms linear). Nothing slides, fades or bounces. `prefers-reduced-motion: reduce` stops everything.

---

## 3. Components

Each entry gives the classes to use, when to use the component, and the rules that make it correct. The markup is in `components.html`.

### App shell
| Part | Classes | Rules |
|---|---|---|
| Ground | `body.sy-ground` | Once, on `<body>`. |
| Shell | `.sy-app` > `.sy-header` + `.sy-app__body` > `.sy-nav` + `main.sy-main#main` (+ `aside.sy-drawer`) | The skip link `.sy-skip` is the first element in `<body>`. |
| Header | `.sy-header` | Order: wordmark, portal picker, search (Ctrl K), assistant status, "Ask the assistant" (Ctrl J), help. Same on every page. |
| Portal picker | `label.sy-portal` > `.sy-label` + `select.sy-select` (reference look) | The project context. Changing the selection must **not** navigate on its own (WCAG 3.2.2): implement as a menu button listing portals as links, or a select plus an explicit "Switch" button. "+ New portal" and "All portals" are links in that menu. |
| Search | `label.sy-search` > svg + `input` + `.sy-kbd` | Searches parts: screens, processes, records. |
| Side nav | `nav.sy-nav` > `a.sy-nav__item[aria-current=page]`, `.sy-nav__count`, `.sy-count`, `.sy-nav__foot` | Seven sections. The selected item is an inverse chalk plate. Use the marker `.sy-count` only for things that need you (Review). Processes shows "saved·drafted" (e.g. `1·4`); Screens shows the screen count for the picked portal. |

### Page head
`.sy-pagehead` > `.sy-crumbs` + `.sy-pagehead__row` (`h1.sy-h1` + `.sy-actions`) + `.sy-meta`.
One h1 per page. The meta line follows the inventory voice: "sandbox · 3 scans · 21 parts logged · last scan stopped at 171 / 400 steps".

### Plate (panel)
`.sy-plate` > `.sy-plate__head` (`.sy-plate__title` + tools) + `.sy-plate__body` | `.sy-rows` | table + `.sy-plate__foot`.
- `--intent`: marker edge and title, at most one per view ("Needs you").
- `--failure`: red edge (something broke).
- `--drawn`: dashed blueprint (assistant drafts, to-be variant).

### Rows, steps, facts
- `.sy-rows` > `.sy-row` (div, `a` or `button`). Use `--current`/`aria-current="step"` for the current item, `aria-selected`/`aria-current="true"` for a selected item (2px chalk), `--intent` for a needs-you tint, and `--muted` for not-yet rows.
- `.sy-steps` (ol): the portal workflow. Scan → Map screens → Sort into processes → Document as-is → Draw the to-be. The current step takes `aria-current="step"` and is tinted.
- `.sy-facts` (dl): key/value facts (portal, environment, started (UTC)).

### Buttons and links
| Variant | Class | Use |
|---|---|---|
| Primary | `.sy-btn--primary` | The action the view exists for. At most one per view (some views have none). Caps, ≤4 words. |
| Secondary | `.sy-btn` | Other actions. |
| Strong | `.sy-btn--strong` | Main action inside a card when the page already has a primary. |
| Quiet | `.sy-btn--quiet` | Suggestion chips, minor tools (Attach, @ Mention). |
| Danger | `.sy-btn--danger` | Revoke, Remove, Discard data. Always confirm with `.sy-dialog`. |
| Sizes | `--md` 40 · `--sm` 36 · `--icon` | Dense contexts only. |
| Busy | `aria-busy="true"` | Shows the caret. Disable double submit. |

Links are underlined text (chalk with a marker underline); buttons are boxes. Never style a link as plain text without an underline.

### Segmented control
`.sy-seg[role=group][aria-label]` > `button[aria-pressed]`. Used for **This page / Whole yard** and **A / B** variant switches. The pressed segment is an inverse chalk plate.

### Forms
- `.sy-field` > `.sy-field__label` + control (`.sy-input`, `.sy-select`, `.sy-textarea`) + `.sy-field__help` / `.sy-field__error`.
- Errors take `aria-invalid="true"` (red edge), a message in words, and `aria-describedby` pointing to it. Browser-native validation messages are allowed (current console behaviour).
- `.sy-check`: native checkbox with marker accent. Radio groups use `fieldset` + `legend.sy-legend-label`.
- `.sy-select--drawn`: dashed blueprint, for choosing a to-be variant.
- **Vault** `.sy-vault`: secrets show only their state (`Stored`, `Needs you`). Values are never rendered, even masked, after saving.

### Tag
`a.sy-tag` / `span.sy-tag` (`--sm`, `--intent`), grouped in `.sy-tags`. The text is the ID in its real case. Link the tag to the record. `--intent` is only for "Tagged for migration".

### Status
`span.sy-status[data-status]` with a word inside. The enum and its meaning are in `03-colour-guide.md` §3. Use `.sy-status--plain` for sentence-case prose statuses in tables.

### Count
`.sy-count` (marker: this many need you) · `.sy-count--muted` (plain count).

### Note and annotation
- `.sy-note` (+ `.sy-note__by`, `--sm`): text a person wrote.
- `.sy-annot` > `.sy-annot__target` + `.sy-annot__line` + `.sy-note`: a note attached to a step or element.

### Drawn (to-be)
`.sy-drawn` (block), `.sy-drawn--fill`, `.sy-drawn-text` (inline value), `.sy-plate--drawn`, `.sy-callout--drawn`. Use for designed steps, merged steps, new steps, and the selected drawn step (`aria-current="true"` gives a 2px blueprint edge).

### Callout
`.sy-callout` (+ `--intent` open question or conflict · `--failure` · `--drawn` roadmap or illustrative · `--ok` saved) > `.sy-callout__title` + text.

### Table and diff
- `.sy-table-wrap` > `table.sy-table` (`--interactive`, `--dense`, `--middle`). Inside a plate, use `.sy-table-wrap--flush`.
- `th[scope=col]` gives caps labels; `th[scope=row]` gives data-styled row heads; `.sy-num` right-aligns tabular numbers; `tr[aria-selected=true]` is a selected row.
- Diff: `.sy-diff--removed` (strike, ash), `.sy-drawn` cells for changed or new, and `.sy-diff__change` (`--drawn`) for the change label. Add a `.sy-legend` above.

### Tabs
`.sy-tabs[role=tablist]` > `.sy-tab[role=tab][aria-selected]`, with `.sy-count--muted` counts. For page-level section tabs that are links, use `aria-current="page"`.

### Meter (progress)
`.sy-meter[data-status=running|ok|failed|stopped]` with `style="--value: 42.75%"` > `.sy-meter__label` + `.sy-meter__track[role=progressbar][aria-valuenow…]` > `.sy-meter__fill`.

### Timeline (revisions)
`ol.sy-timeline` > `li[data-status=live|draft|ok|failed]` > `.sy-timeline__head` (tag + status) + `.sy-timeline__body`. The newest revision goes first. Restoring creates a new revision, never a rollback. The same component lists retry attempts on a failing path (15), oldest first, with the next attempt as `draft`.

### Map graph (Scans ▸ Map)
| Part | Classes | Rules |
|---|---|---|
| Graph | `section.sy-graph` > `.sy-graph__canvas` (inline `width`/`height` from the layout) | Pans inside its plate; never scrolls the page sideways. Give it an `aria-label`. |
| Edges | `svg.sy-graph__edges[aria-hidden]` > `path.sy-edge` (`--failed`, `--frontier`, `--blocked`, `--planned`) + `text.sy-edge-label` (`--failed`) | Solid = observed · red = the crawler failed on this action · dashed ash = queued / not reached · dotted ash = blocked · dashed blueprint = the next scan's replay path. Decoration only: the node labels and the List view carry the facts. |
| Node | `button.sy-node[aria-pressed]` (inline `left`/`top`, `--sy-node-w`, `height`) > `.sy-node__route` + `.sy-node__title` + `.sy-node__meta` (status + chips) + `.sy-node__marks` (marker tags) | `data-state="failed\|unobserved\|frontier\|blocked"`. `.sy-node--deck` = several pages or states collapsed (always add a count chip). Selected = 2px chalk outline. |
| Route group | `.sy-node-group[role=group]` > `.sy-node-group__label` + nodes | Several states on one URL (form steps), expanded. |
| Chip | `.sy-chip` (`--fail`, `--ok`, `--tobe`, `--dashed`) | Small counts and kinds: "+2", "validation", "+38 queued". Kinds of state are neutral: a recorded technical error is the portal's, not a failure of ours. |

### Cards, choices and paths
- **Card:** `.sy-card` (`__title`; `--drawn`, `--failed`, `--muted`; `aria-current="true"` when selected): a compact plate for a step or an outcome. `.sy-flow` + `.sy-flow__arrow` lines cards up.
- **Choice card:** `label.sy-choice` > `input.sy-choice__input[type=radio]` + `.sy-choice__body` (`<b>` title + `<span>` text). A real radio: arrow keys, one checked, chalk weld when checked.
- **Path:** `ol.sy-path` > `li` > `.sy-path__step` (`--here`, `--failed`): a replay recipe or the way to a failure. Arrows are drawn by CSS.

### Assistant
| Part | Classes |
|---|---|
| Chat | `.sy-chat` > `.sy-chat__log[role=log]` > `.sy-chat__divider`, `.sy-msg--user`, `.sy-msg` (+ `.sy-msg__who`) |
| Suggestions | `.sy-chips` > `.sy-btn.sy-btn--quiet.sy-btn--md` |
| Scan line | `.sy-scanline`: status + counts + "Open in Scans" link |
| Composer | `.sy-composer`: scan line, message field, tools, primary **Send** |
| Proposal | `.sy-proposal` > `__head` (`__title` + revision change) + `__body` + `__foot` (Apply = `--strong`, then quiet actions). Applied: `.sy-proposal--applied` + Undo |
| Drawer | `aside.sy-drawer` > `__head` (title + close) + `__context` (`.sy-seg` This page / Whole yard + context tags) + chat + composer |

Context switch: **This page** sends the screen, its elements, amendments and process (show them as tags). **Whole yard** sends the portal. The placeholder changes with the context ("Ask about this screen" / "Ask about reference-insurer").

### Recorded screen and highlight
`figure.sy-shot` contains the captured `<img>` (light, as recorded). The assistant's highlight is `.sy-mark` (`--overlay`, absolutely positioned from the element's box) + `.sy-mark__label` "Marked by assistant". A **person's** amendment anchored to an element is `.sy-mark.sy-mark--note` (manila outline and label with the amendment ID). `.sy-thumb` (`--locked`) for thumbnails. Text inside the `.sy-shot` mock is part of the captured page and is exempt from the 11px floor.

### States
- Empty: `.sy-state` (dashed). Inventory voice plus one action: "Yard's empty. Add a portal address to start the inventory."
- Loading: `.sy-state__title.sy-caret`. Say what is being read and the counts so far. No spinners.
- Error: `.sy-state--failure`. What broke, the reference (ERR-…), the next move, and what still works.
- Dialog: `dialog.sy-dialog` > `__head`, `__body`, `__foot` (secondary first, then danger or primary).
- Toast: `.sy-toast[role=status]` (`--fixed`): status + message + Undo.

### Disclosure, code, hint, kbd
`details.sy-disclosure` (credentials collapsed by default) · `pre.sy-code` (commands) · `a.sy-hint` `[?]` glossary hint (24px target) · `.sy-kbd` shortcut.

---

## 4. Content rules

- **Inventory voice:** counts first, then the next move. "171 / 400 steps · 113 queued. Resume the scan."
- **Product nouns stay plain:** portal, scan, screen, process, record, amendment, revision, environment, as-is, to-be. Yard words (parts, lot, tag, scrapped, drawing) are seasoning, at most one per screen.
- **Errors** name the reference, the next move and what still works. Never "Something went wrong".
- **Gaps stay visible:** anything not observed is labelled `unobserved` and carries an open question.
- **Times** are UTC with Z. **IDs** are shown as stored. **Polish content** is shown exactly as captured.
- No emoji, no exclamation marks, no "AI-powered", no "magic".

## 5. Accessibility (non-negotiable)

- WCAG 2.2 AA: text ≥4.5:1, UI parts and focus ≥3:1 (all pairs measured in `03-colour-guide.md`).
- Visible focus on everything (2px marker, 2px offset). Never remove outlines without a replacement.
- Targets: ≥24px everywhere (WCAG 2.5.8); 44px default; every control ≥44px on touch (`pointer: coarse`).
- State is ARIA: `aria-current`, `aria-pressed`, `aria-selected`, `aria-invalid`, `aria-busy`, `aria-expanded`.
- Landmarks: header, nav (labelled), main (`#main`), aside (drawer). One h1. Headings in order.
- Chat uses `role="log"`; toasts use `role="status"`; progress uses `role="progressbar"` + values.
- Colour is never the only cue: statuses have shape + word, diffs have strike or labels, selection has a 2px weld.
- Forced colours: shapes and tags stay visible (handled in CSS).
- Reduced motion: all animation stops.
