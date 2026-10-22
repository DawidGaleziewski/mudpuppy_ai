---
name: mudpuppy-salvage-ui
description: Use for ANY MudPuppy console UI work (pages, templates, components, CSS, statuses, UI copy, migrating a Console-era page, and the generative UI Workbench beta) so it follows the Salvage Yard design system. Replaces the old Console design-system rules (JetBrains Mono, amber, scanlines, bracket statuses).
---

# MudPuppy · Salvage Yard UI

You are building or changing the MudPuppy console UI. The look, the class library and the
rules are fixed. Your job is to **compose** from them, not to restyle.

## Paths (edit these two lines to match the repo)

- **DS_PATH** = `static/salvage`: the runtime design system served to browsers (`css/tokens.css`, `css/fonts.css`, `css/salvage.css`, `css/genui.css` for Workbench pages, `fonts/`, `tag-icon.svg`). Copied from the design package's `design-system/`.
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
| `12-v2-ux.md` | Anything for MudPuppy 2.0: IA and grouped nav, the As of / From time model, UI vocabulary, review flow and keys, overturn, before/after, decision tables, states; screens `v2-*` |
| `13-v2-fixtures.md` | The 2.0 demo/test data (releases, changes, findings, rules, processes) the v2 screens use, and the Workbench fixture (replay of scan 01a110d5) |
| `14-workbench.md` | Anything in the Workbench (gen UI beta): paths, layouts per phase, behaviour rules WB-UI-01…42, states, the phased plan; screens `wb-*` |
| `15-genui-guidelines.md` | Before designing or reviewing any generated view, narration, suggestion or command card: provenance, writing, stability, trust, a11y |
| `16-genui-components.md` | Using or adding a gen UI component: catalogue components (the model may place them) and frame components (server-owned), props, states, markup |
| `17-genui-architecture.md` | Wiring the Workbench: htmx vs React decision, view-spec pipeline, validation, SSE, commands, security, tests and evals, tickets WB-xx |
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
`queued` / `unobserved` (dashed grey) · `draft` / `inferred` (dashed blue) · `failed` (✕ red) ·
2.0: `overturned` (■ manila, always with the person's reason in a `.sy-note`).
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
    <nav class="sy-nav" aria-label="Portal sections">…7 items in v1 (9 in three groups in 2.0, see below), aria-current="page" on the current one…</nav>
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

### 2.0 skeleton differences
For MudPuppy 2.0 pages (`screens/v2-*`): the header has two compact pickers and a compact search, and the nav is grouped.
As of is a **menu button** (a menu of links, newest first), never a select that navigates on change.
```html
<label class="sy-portal sy-portal--compact"><span class="sy-label">Portal</span><select class="sy-select">…</select></label>
<div class="sy-portal sy-portal--compact"><span class="sy-label" id="asof-l">As of</span>
  <button class="sy-select" type="button" aria-haspopup="menu" aria-expanded="false" aria-labelledby="asof-l asof-v" aria-describedby="asof-help"><span id="asof-v">Now · 17 Oct</span></button></div>
<label class="sy-search sy-search--compact">…<input type="search" aria-label="Search screens, processes and rules" placeholder="Search">…</label>
…
<nav class="sy-nav" aria-label="Portal sections">
  <a class="sy-nav__item" href="…">Home</a> <a …>Changes <span class="sy-nav__count">41</span></a> <a …>Review <span class="sy-count">24</span></a>
  <div class="sy-nav__group" aria-hidden="true">Portal model</div> Processes · Screens · Rules · Docs
  <div class="sy-nav__group" aria-hidden="true">Machine</div> Scans · Settings
</nav>
```
Model pages read `as_of` from the URL; when it isn't Now they open with the "As of release …" banner and disable writes.

### Workbench (generative UI beta) skeleton
`screens/wb-*`: the 2.0 skeleton + `<link rel="stylesheet" href="/{DS_PATH}/css/genui.css">` after `salvage.css`, a "Workbench" nav
item with `<span class="sy-chip sy-chip--dashed">beta</span>`, and one layout in `<main>`:
```html
<div class="sy-wb__head">…<h1 class="sy-h1">Workbench</h1>… <div class="sy-pathswitch">…</div></div>
<div class="sy-wb sy-wb--split">   <!-- --inline (+ --nosheet) in phase 1 and for Chat; --focus as a toggle in phase 3 -->
  <section class="sy-plate sy-chat sy-wb__conv" aria-label="Conversation">…log… …composer…</section>
  <div class="sy-wb__stage" role="region" aria-label="Stage">…<section class="sy-genview">…</section>…</div>
</div>
```

## Generative UI rules (Workbench)

1. **The model never writes markup.** It returns a view spec (`workbench/schema/view-spec.schema.json`); the server validates it,
   resolves ids and renders Jinja partials. Never `|safe` a model string. Unknown or invalid components are dropped, not the view.
2. **The model picks what; the server decides where.** Placement comes from the path and the phase. Chat is always inline.
3. **Every generated frame** is a `.sy-genview` (solid) with `.sy-genmark` "generated", a status if it has one and a source line;
   its heading has an sr-only ", generated". "Why this view?" and "Right view?" appear once per view, on its lead frame.
   DOM id `t{turn}-{id}`. A side sheet the person opened is not generated.
4. **Dashed blueprint only for the assistant's own words and choices:** narration (`.sy-narration`), Why (`.sy-genwhy`),
   suggestions (`.sy-suggest`), a proposed command (`.sy-cmd[data-cmd-state=proposed]`). Observed data stays solid.
5. **Numbers come from events,** never from the model. Narration lines cite events (`.sy-cite`, `scan#step`).
6. **Every write is a command card** (`.sy-cmd`): what changes, what doesn't, undo or not. Confirm is the one marker button;
   the Workbench Send button is `.sy-btn--strong`.
7. **Live data goes over SSE,** never through the model; a dropped stream sets `data-gen-state="stale"` and keeps the data readable.
8. **Calm:** at most 4 components per view (Chat 2, Explain 3); reserve the final size while composing (`.sy-genskel`); focus never
   moves on its own; one polite announcement per stage change or milestone; no new animation.
9. **Point and ask:** context travels as ids in `.sy-ctxchip`s, never as pasted text; `A` asks about the focused item, `@` picks one.
10. **Answer first:** the words never wait for the view; with no view the answer is plain chat, and nothing turns red.
11. **Adding a component** = CSS in `genui.css` + Jinja partial + entry in `workbench/tools/gen_wb_schema.py` (regenerate, never edit
    the JSON) + evals + `16-genui-components.md`. Changing a prompt or the catalogue = run the golden-prompt evals.

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
| Messages | `.sy-callout` (`--intent`, `--failure`, `--drawn`, `--ok`, `__title`) · `.sy-state` (`--failure`, `__title`) · `.sy-caret` · `dialog.sy-dialog` (`__head/__body/__foot`; `--static` for previews) · `.sy-toast` (`--fixed`) |
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

| Gen UI (Workbench, `genui.css`) | `.sy-wb` (`--inline` `--nosheet` `--split` `--focus`; `__conv` `__stage` `__aside` `__head`) · `.sy-pathswitch` (`__why[data-source=assistant\|you]`) · `.sy-genmark` · `.sy-genview` (`--card` `--failure`; `[data-gen-state=composing\|ready\|stale]`; `__head` `__title` `__tools` `__why` `__notice` `__body` `__foot` `__source`) · `.sy-genwhy` (`__switch`) · `.sy-genfeedback` (`__btn[aria-pressed]` `__why`) · `.sy-genskel` (`__label` `__block`) · `.sy-genstatus` (`--done`) · `ol.sy-narration` (`li[data-kind=milestone\|live\|stop]`) · `a.sy-cite` · `ol.sy-evtail` (`__id`) · `ol.sy-evstrip` · `.sy-ctxbar` · `.sy-ctxchip` (`__at` `__remove`) · `.sy-suggest` · `.sy-askable` + `.sy-ask` (`--show`) · `.sy-mini` (`--mock` `--locked` `__img`) · `.sy-order` · `.sy-film` (`__item[aria-pressed][data-state=here\|failed\|frontier]` `__route`) · `.sy-node[data-state=here]` · `.sy-livebar` (`__main`) · `.sy-sheet` (`__head` `__body` `__close`) · `.sy-cmdbar` (`__main` `__reply`) · `.sy-cmd[data-cmd-state=proposed\|running\|done\|failed\|undone\|cancelled\|expired]` (`__head` `__title` `__body` `__foot`) |
| 2.0 | `.sy-nav__group` · `.sy-portal--compact` · `.sy-search--compact` · `.sy-status[data-status=overturned]` · `.sy-releases` (`__lane` `--scans`, `__name`, `__track`, `__span` `--current` `--rollout` `--unknown`, `__scan` `--check`, `__axis`, `__range`) · `.sy-compare` (`__side`, `__head`) · `.sy-differs` · `table.sy-table--decision` (`.sy-dt-group` `.sy-dt-n` `.sy-dt-cond` `.sy-dt-any` `.sy-dt-result`) · `ol.sy-queue` (`__group`, `__item[aria-current]`, `__check`, `__main`, `__claim`, `__meta`) · `.sy-keybar` (`--sticky`) · `.sy-edge--unseen` `--unchecked` `--retired` `--process` `--changed` · `.sy-node--process` `.sy-node--dim` `[data-state=retired]` · `.sy-bundle` |

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
3. Screenshot the page at **1280** and **390** (v1 pages) or **1280** and **1024** (2.0 and Workbench pages, desktop-first) with reduced motion: no page-level horizontal scroll; compare by eye with `DESIGN_PKG/screenshots/screens/NN-*.png` if a reference exists.
4. axe-core → 0 serious or critical; keyboard pass (focus visible, Esc closes drawer and dialogs, Ctrl/⌘ K and J).
5. Count: one `h1`, at most one `.sy-btn--primary`, at most one `.sy-plate--intent`.
6. In the PR description, list the FE-IDs covered and attach the two screenshots.
7. Workbench changes: contract tests pass (`workbench/examples/`), golden-prompt evals pass, and the QA list in `references/09-qa-checklist.md` §Workbench is ticked.
