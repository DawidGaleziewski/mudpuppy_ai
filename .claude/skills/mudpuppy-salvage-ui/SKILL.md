---
name: mudpuppy-salvage-ui
description: Use for ANY MudPuppy console UI work (pages, templates, components, CSS, statuses, UI copy, migrating a Console-era page) so it follows the Salvage Yard design system. Replaces the old Console design-system rules (JetBrains Mono, amber, scanlines, bracket statuses).
---

# MudPuppy · Salvage Yard UI

You are building or changing the MudPuppy console UI. The look, the class library and the
rules are fixed. Your job is to **compose** from them, not to restyle.

## Paths (edit these two lines to match the repo)

- **DS_PATH** = `apps/dashboard/src/pathfinder_dashboard/static/salvage` (served at `/static/salvage/`): the runtime design system served to browsers (`css/tokens.css`, `css/fonts.css`, `css/salvage.css`, `fonts/`, `tag-icon.svg`). Copied from the design package's `design-system/`.
- **DESIGN_PKG** = `docs/design/salvage-yard`: the whole design package committed to the repo (reference screens, screenshots, wireframes, docs). In the references below, paths like `screens/…`, `screenshots/…`, `migration/…`, `design-system/…` and `docs/…` are relative to DESIGN_PKG.

If DESIGN_PKG is missing, the rules here and in `references/` still apply. Ask the user to commit the package before you rely on reference screens.

## Read before you write (as needed)

| File (in this skill's `references/`) | Read it when |
|---|---|
| `06-screens.md` | Always first: find the target page; then open `DESIGN_PKG/screens/NN-*.html` and copy its structure and classes. Its "Behaviour details" table covers shortcuts, context payload, live updates and conflicts. |
| `04-design-system.md` | Choosing or using any component |
| `03-colour-guide.md` | Before choosing any colour or status |
| `05-css-guide.md` | Files, cascade layers, ARIA state, allowed inline styles, JS duties, lint rules |
| `07-requirements.md` | Writing the PR (cite FE-IDs) |
| `08-migration-guide.md` | Converting a Console-era page; token, status, component and IA maps |
| `10-processes.md` | Anything about processes: lifecycle, variants A/B, revisions, drafts, conflicts, compare and change spec, live per environment, data model, API, rules PR-01–PR-17 |
| `11-map-runs.md` | Anything about the map, marks, probing form states, checkpoints and replay, resume or retry of a stopped scan, scan types, reconciliation of differing states; requirements FE-M01–M13 |
| `02-design-decisions.md` | Before "fixing" something that looks odd: it is probably intentional |
| `01-brand-book.md` | Wordmark, mark, voice |
| `09-qa-checklist.md` | Before saying done |
| `status-map.csv`, `token-map.csv`, `component-map.csv` | Mapping old values to new |

## The eight rules

1. **Every record is a tagged part.** Record IDs shown as data (SCR-, AMD-, CAP-, NFR-, BR-, run ids, revision labels) → `<a class="sy-tag" href=…>ID</a>`, in the ID's real case. Exempt: IDs inside text a person typed, `.sy-mark__label`, `.sy-note__by`, and ERR references.
2. **Orange paint marks intent.** `--sy-intent` = brand, the primary button (**at most one** `.sy-btn--primary` per view; some views have none), "needs you", `.sy-tag--intent`. Never success.
3. **Blueprint is the to-be.** Drafted, designed, inferred or proposed content is dashed blueprint (`.sy-drawn`, `.sy-plate--drawn`, `.sy-proposal`, `data-status="draft|inferred"`). Applied content turns solid.
4. **Humans type, machines print.** Text a person wrote → `.sy-note` (+ `.sy-note__by`). Machine output is never in `.sy-note`.
5. **Grid ground, solid plates.** `body.sy-ground`; content in `.sy-plate`. No texture under data.
6. **Square, no shadows.** No radius, no box-shadow. 1px lines; 2px for selected or focused.
7. **Expanded caps only for short labels.** Titles, labels, nav and primary buttons ≤ 4–5 words. Write sentence case in HTML and let CSS uppercase it. Long names take `.sy-case-normal`.
8. **Shape + word on every status.** `<span class="sy-status" data-status="…">Word</span>`, mapped in ONE helper.

## Status enum

`ok` (■ green: OK, observed, confirmed, saved) · `running` (■ cyan, pulses) · `live` (■ cyan) ·
`needs` (■ orange: a person must act) · `stopped` / `skipped` / `todo` (□ grey) ·
`queued` / `unobserved` (dashed grey) · `draft` / `inferred` (dashed blue) · `failed` (✕ red).
Console mapping: `[ OK ]`→ok · `[RUN.]`→running · `[INT.]`→stopped ("Interrupted") · `[SKIP]`→skipped ·
`[FAIL]`→failed · `[DRFT]`→draft · `[LIVE]`→live. Full table: `references/status-map.csv`.

## Page skeleton

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MudPuppy · Page name</title>
<link rel="icon" href="/{DS_PATH}/tag-icon.svg" type="image/svg+xml">
<link rel="preload" href="/{DS_PATH}/fonts/Archivo-Variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/{DS_PATH}/css/tokens.css">
<link rel="stylesheet" href="/{DS_PATH}/css/fonts.css">
<link rel="stylesheet" href="/{DS_PATH}/css/salvage.css">
</head>
<body class="sy-ground">
<a class="sy-skip" href="#main">Skip to content</a>
<div class="sy-app">
  <header class="sy-header">…wordmark · portal picker · search (Ctrl K) · assistant status · Ask the assistant (Ctrl J) · ?</header>
  <div class="sy-app__body">
    <nav class="sy-nav" aria-label="Portal sections">…7 items, aria-current="page" on the current one…</nav>
    <main id="main" class="sy-main">
      <div class="sy-pagehead"><div class="sy-crumbs">…</div><h1 class="sy-h1">…</h1><p class="sy-meta">…</p></div>
      …plates…
    </main>
    <!-- optional: <aside class="sy-drawer" id="assistant" aria-label="Assistant">…</aside> -->
  </div>
</div>
</body>
</html>
```
Copy the exact header and nav markup from any `DESIGN_PKG/screens/*.html`.

## Class reference (complete list of what you may use)

| Need | Use |
|---|---|
| Shell | `.sy-ground` `.sy-app` `.sy-app__body` `.sy-header` `.sy-header__spacer` `.sy-portal` `.sy-search` `.sy-nav` (`--compact`) `.sy-nav__item` `.sy-nav__count` `.sy-nav__foot` `.sy-main` (`--narrow`) `.sy-skip` |
| Page | `.sy-pagehead` `.sy-pagehead__row` `.sy-crumbs` `.sy-columns` > `.sy-col-main` + `.sy-col-side` |
| Panel | `.sy-plate` > `.sy-plate__head` (`.sy-plate__title`) / `__body` / `.sy-rows` / `__foot`; `--intent` (max 1), `--failure`, `--drawn` |
| List | `.sy-rows` > `.sy-row` (`--current`, `--intent`, `--muted`, `--dashed`; `.sy-row__main`; `aria-selected` / `aria-current="true"`) · `.sy-selected` |
| Workflow | `ol.sy-steps` > `li[aria-current=step]` / `li[data-state=todo]` |
| Facts | `dl.sy-facts` · `.sy-hint` (glossary [?]) · `.sy-kbd` |
| Buttons | `.sy-btn` + `--primary` (≤1/view) · `--strong` (main action in a card) · `--quiet` (+ `--well`) · `--danger` (+ dialog) · `--md` / `--sm` / `--icon`; `aria-busy`, `disabled`; groups `.sy-actions` (`--end`, `--split`, `--nowrap`) |
| Toggle | `.sy-seg` > `button[aria-pressed]` |
| Form | `.sy-field` > `.sy-field__label` + `.sy-input` / `.sy-select` / `.sy-textarea` (`--md`, `.sy-select--drawn`) + `.sy-field__help` / `__error` (`aria-invalid`); `.sy-check`; `fieldset` + `legend.sy-legend-label` |
| Secrets | `.sy-vault`, `details.sy-disclosure` > `summary` + `.sy-disclosure__body`. Never render values |
| Records | `.sy-tag` (`--sm`, `--intent`), `.sy-tags` · `.sy-count` (`--muted`) |
| Status | `.sy-status[data-status]` (`--plain`) |
| People | `.sy-note` (`--sm`, `__by`) · `.sy-annot` > `__target` + `__line` + `.sy-note` |
| To-be | `.sy-drawn` (`--fill`, `[aria-current=true]`) · `.sy-drawn-text` · `.sy-legend` (`__drawn`) · `.sy-diff--removed` · `.sy-diff__change` (`--drawn`) |
| Messages | `.sy-callout` (`--intent`, `--failure`, `--drawn`, `--ok`, `__title`) · `.sy-state` (`--failure`, `__title`) · `.sy-caret` · `dialog.sy-dialog` (`__head/__body/__foot`) · `.sy-toast` (`--fixed`) |
| Table | `.sy-table-wrap` (`--flush` in a plate) > `table.sy-table` (`--interactive`, `--dense`, `--middle`), `th[scope=col\|row]`, `.sy-num` |
| Tabs | `.sy-tabs[role=tablist]` > `.sy-tab[role=tab][aria-selected]` |
| Progress | `.sy-meter[data-status]` (`style="--value: N%"`) > `__label` + `__track[role=progressbar]` > `__fill` |
| Revisions, attempts | `ol.sy-timeline` > `li[data-status=live\|draft\|ok\|failed]` > `__head` + `__body` |
| Map graph | `section.sy-graph` > `.sy-graph__canvas` > `svg.sy-graph__edges` (`path.sy-edge` `--failed` `--frontier` `--blocked` `--planned`, `text.sy-edge-label` `--failed`) + `button.sy-node[aria-pressed]` (`--deck`, `data-state=failed\|unobserved\|frontier\|blocked`; `__route` `__title` `__meta` `__marks`) + `.sy-node-group` (`__label`) · `.sy-chip` (`--fail` `--ok` `--tobe` `--dashed`) |
| Cards, choices, paths | `.sy-card` (`__title`; `--drawn` `--failed` `--muted`; `aria-current`) · `.sy-flow` + `.sy-flow__arrow` · `label.sy-choice` > `input.sy-choice__input` + `.sy-choice__body` · `ol.sy-path` > `li` > `.sy-path__step` (`--here` `--failed`) |
| Assistant | `.sy-chat`, `.sy-chat__log[role=log]`, `.sy-chat__divider`, `.sy-msg` (`--user`, `__who`), `.sy-chips`, `.sy-composer`, `.sy-scanline`, `.sy-proposal` (`__head/__title/__body/__foot`, `--applied`), `aside.sy-drawer` (`__head`, `__context`) |
| Recorded screen | `figure.sy-shot` (`__title`, `__link` for mocks) + `.sy-mark` (assistant highlight; `--overlay`; `__label`) / `.sy-mark--note` (a person's amendment pin) · `.sy-thumb` (`--locked`) · `pre.sy-code` |
| Type | `.sy-h1` `.sy-h2` `.sy-h3` `.sy-label` `.sy-meta` `.sy-small` `.sy-muted` `.sy-prose` `.sy-mono` (`--sm`) `.sy-route` `.sy-num` `.sy-case-normal` `.sy-truncate` `.sy-sr-only` |
| Layout | `.sy-stack` `.sy-cluster` `.sy-split` `.sy-grid` (`--sy-gap`, `--sy-min`) `.sy-grow` |

Anything not in this table is not a library class. Product-only layout classes use the `mp-` prefix and live in `@layer app`.

## Never

- Hex, `rgb()` or named colours, `font-family`, `font-size`, `letter-spacing`, `text-transform`, animations or transitions in templates or app CSS. Use role tokens and classes.
- Amber `#FFB000`, JetBrains Mono, scanlines, glow, round dots, bracket statuses (`[ OK ]`), the `mudpuppy://console` wordmark.
- Marker orange for success; red for anything but failure or destruction; blue for anything real.
- Two primary buttons or two intent plates in one view.
- New `sy-` classes in product code. To extend the library, follow `references/05-css-guide.md` §10.
- Uppercasing long text; text under 11px; any animation other than the running pulse and the loading caret.
- A `<select>` that navigates on change (the portal picker uses a menu of links or an explicit Switch button).
- Inventing data in UI copy. Show stored values exactly (Polish strings, ids, UTC timestamps with Z).

## Voice

Counts first, then the next move: "171 / 400 steps · 113 queued. Resume the scan."
Product nouns stay plain (portal, scan, screen, process, record, amendment, revision, environment).
At most one yard word per screen (parts, lot, scrapped, drawing). Errors give the reference, the
next move and what still works. No emoji, no exclamation marks, no "oops".

## Converting a Console-era page (recipe)

1. Extend the Salvage base template; remove any Console stylesheet from the page.
2. Statuses → the status helper. IDs → `tag`. Human text → `note`.
3. Cards → `.sy-plate`; tables → `.sy-table`; `[action]` links → `.sy-btn` if they change data, underlined links if they navigate.
4. Re-assign amber by meaning: brand or primary → marker; OK → `ok`; decoration → delete.
5. Type: prose → Archivo (default); identifiers → `.sy-mono`; labels → `.sy-label`.
6. Compare with the reference screen, if there is one.

## Verify before you say done

1. `SY_DS_PATH={DS_PATH} bash .claude/skills/mudpuppy-salvage-ui/scripts/find-old-styles.sh <changed paths>` → TOTAL 0.
2. stylelint (rules in `references/05-css-guide.md` §4) → 0.
3. Screenshot the page at **1280** and **390** with reduced motion: no page-level horizontal scroll; compare by eye with `DESIGN_PKG/screenshots/screens/NN-*.png` if a reference exists.
4. axe-core → 0 serious or critical; keyboard pass (focus visible, Esc closes drawer and dialogs, Ctrl/⌘ K and J).
5. Count: one `h1`, at most one `.sy-btn--primary`, at most one `.sy-plate--intent`.
6. In the PR description, list the FE-IDs covered and attach the two screenshots.
