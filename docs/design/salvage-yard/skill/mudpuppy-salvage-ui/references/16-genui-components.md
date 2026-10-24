# 16 · Gen UI components: the Workbench part of the design system

The Workbench adds a small layer on top of Salvage Yard: the parts that exist only because the assistant composes the
screen. This doc lists every one of them, says which the assistant may place and which the server always owns, and gives
the contract a component must meet before the assistant may use it.

| File | What |
|---|---|
| `design-system/css/genui.css` | The classes in this doc. Load order: `tokens.css` → `fonts.css` → `salvage.css` → `genui.css` |
| `design-system/genui-components.html` | Live examples with their markup |
| `workbench/schema/catalogue.json` | The catalogue: paths, phase, placement, bind, props, data, actions per component |
| `workbench/schema/view-spec.schema.json` | What the assistant may send (JSON Schema 2020-12) |
| `workbench/schema/commands.json` | The writes a view may lead to, each confirmed in a command card |
| `screens/wb-01…wb-10` | The Workbench designs that use all of it |

Rules for colour, words and behaviour are in `15-genui-guidelines.md`; the pipeline that renders these is in
`17-genui-architecture.md`. Everything in `05-css-guide.md` applies: `sy-` BEM, state as ARIA, role tokens only, inline
styles for layout plus the hooks listed in §7.

---

## 1. Two kinds of component

- **Catalogue components** (15) are what the assistant may place. It names the type and binds data ids in a view spec; the
  server resolves the ids, renders the component from data, and decides where it goes. They are built from Salvage Yard
  parts (graph, meter, recorded screen, choice cards, compare, decision table, timeline) and from the building blocks below.
- **Frame components** are always server-owned. They never appear in a view spec. They lay out the Workbench, wrap every
  generated view, label it as generated, and carry the person's controls (path, context, feedback, confirm).
- **Building blocks** are small parts used inside catalogue components (miniature, order badge, filmstrip, narration list,
  citation, event tail and strip). They are not placed on their own.

| Part | Kind | Gen-ready | Phase | Classes |
|---|---|---|---|---|
| LiveMap | Catalogue | ✔ | 1 (filmstrip) · 2 (graph) | `.sy-graph` / `.sy-film` + `.sy-node[data-state="here"]`, `.sy-order`, `.sy-mini` |
| ScanMeter | Catalogue | ✔ | 1 | `.sy-meter` (for views without a map; LiveMap has its own meter) |
| PageMiniature | Catalogue | ✔ | 1 | `.sy-card` + `.sy-mini` + `.sy-ask` |
| PageDetail | Catalogue | ✔ | 1 | `.sy-facts`, `.sy-actions` (in `.sy-sheet` or a view) |
| Narration | Catalogue | ✔ | 1 | `.sy-narration` + `.sy-cite` |
| ErrorCard | Catalogue | ✔ | 1 | `.sy-genview--failure` |
| StepShot | Catalogue | ✔ | 2 | `.sy-shot` + `.sy-mark--overlay` |
| EventTail | Catalogue | ✔ | 2 | `.sy-evtail` |
| FixChoices | Catalogue | ✔ | 2 | `.sy-choice` |
| AttemptList | Catalogue | ✔ | 2 | `.sy-timeline` |
| Compare | Catalogue | ✔ | 3 | `.sy-compare` |
| DecisionTable | Catalogue | ✔ | 3 | `.sy-table--decision` |
| FindingCard | Catalogue | ✔ | 3 | `.sy-card` + `.sy-status` |
| RecordCard | Catalogue | ✔ | 1 | `a.sy-card` + `.sy-tag` |
| RecordList | Catalogue | ✔ | 1 | `.sy-table--dense` + `.sy-tag` |
| Workbench layouts | Frame | — | 1 · 2 · 3 | `.sy-wb` (`--inline`, `--nosheet`, `--split`, `--focus`), `__head`, `__conv`, `__stage`, `__aside` |
| Path switch | Frame | — | 1 | `.sy-pathswitch`, `__why[data-source]` + `.sy-seg` |
| Generated view frame | Frame | — | 1 | `.sy-genview` (`--card`, `--failure`), `__head`, `__title`, `__tools`, `__body`, `__foot`, `__source`, `__notice`, `[data-gen-state]`; id `t{turn}-{id}` |
| Generated mark | Frame | — | 1 | `.sy-genmark` |
| Why this view | Frame | — | 1 | `.sy-genview__why`, `.sy-genwhy`, `__switch` (once per view, lead frame) |
| Feedback | Frame | — | 1 | `.sy-genfeedback`, `__btn`, `__why` (once per view, lead frame) |
| Composing skeleton | Frame | — | 1 | `.sy-genskel`, `__label`, `__block` |
| Assistant activity line | Frame | — | 1 | `.sy-genstatus` (`--done`) |
| Context chip and bar | Frame | — | 1 | `.sy-ctxbar`, `.sy-ctxchip`, `__at`, `__remove` |
| Suggestions | Frame | — | 1 | `.sy-suggest` |
| Askable item and Ask | Frame | — | 1 | `.sy-askable`, `.sy-ask` (`--show` for docs) |
| Live bar | Frame | — | 1 | `.sy-livebar`, `__main` |
| Side sheet | Frame | — | 1 | `.sy-sheet`, `__head`, `__body`, `__close` |
| Command card | Frame | — | 1 | `.sy-cmd`, `__head`, `__title`, `__body`, `__foot`, `[data-cmd-state]` (proposed, running, done, failed, cancelled, expired, undone); editable: `__form`, `__wide`, `__data`, `[data-edited]` |
| Command bar | Frame | — | 3 | `.sy-cmdbar`, `__main`, `__reply` |
| Page miniature | Building block | — | 1 | `.sy-mini` (`--mock`, `--locked`), `__img` |
| Visit order badge | Building block | — | 1 | `.sy-order` |
| Filmstrip | Building block | — | 1 | `.sy-film`, `__item[data-state="here\|failed\|frontier"]`, `__route` |
| Narration list and citation | Building block | — | 1 | `.sy-narration > li[data-kind]`, `.sy-cite` |
| Event tail and event strip | Building block | — | 2 · 3 | `.sy-evtail` (`__id`), `.sy-evstrip` |

"Gen-ready" means the component meets the contract in §2 and the assistant may name it in a view spec.

---

## 2. The contract for a gen-ready component

This is how the system grows. A component joins the catalogue only when all of these hold.

1. **Props are data ids, not content.** It binds scans, routes, steps, records, rules, changes or findings by id. Every
   word, number and image it shows comes from the server's data. Text props, if any, are short `plainText` labels.
2. **Every prop is in the schema.** Type, enum, limits and defaults are in `workbench/tools/gen_wb_schema.py`, so `view-spec.schema.json`,
   `catalogue.json` and `tools.json` describe it. `additionalProperties: false` everywhere.
3. **Fixed sizes.** It has known heights per placement (or a reserved canvas), so composing can hold its place and nothing
   jumps when it arrives.
4. **All states are designed:** composing, ready, empty, stale (stream dropped) and error, in each placement it allows.
5. **It works in every placement its catalogue entry lists** (card, stage, aside, conv) at 1280 and 1024.
6. **It renders from server data only.** No client-side fetching of content, no model text inside except narration lines that
   passed the grounding check.
7. **It sits in a generated view frame** (`.sy-genview` or `.sy-genview--card`), so it has the genmark and the data time;
   as the first component of its view (the lead frame) it also carries "Why this view?" and feedback. Its heading reads
   "<title>, generated".
8. **It has an Ask affordance** for the things inside it (`.sy-askable > .sy-ask`, or A on its buttons), and the context it
   adds is structured.
9. **It has a stable id**: the spec `id` is required and unique within the view (duplicates are dropped as `duplicate_id`),
   the frame's DOM id is `t{turn}-{id}`, and live updates swap its inside by that id without re-rendering the view.
10. **Writes go through commands.** If it offers an action that changes something, the action opens a command card.
11. **It is accessible:** names, roles, keyboard, forced colours, reduced motion, 24px targets and 44px on touch (see `15` §7).
12. **It has evals:** golden prompts that should pick it, and invalid examples that must be dropped.

---

## 3. Placement

The server places catalogue components; the assistant only lists them. Placement codes: **card** = inside the
conversation as `.sy-genview--card` · **stage** = the stage column (`.sy-wb__stage`) · **aside** = the side sheet or side
column (`.sy-wb__aside`) · **conv** = a message in the conversation log.

**The Chat path always uses the inline layout**, whatever the phase, so its components are always cards. Mapping,
Troubleshoot and Explain use the phase's layout: inline in phase 1, split from phase 2, focus as a mode in phase 3.

| Component | Paths | Inline | Split | Focus |
|---|---|---|---|---|
| LiveMap | mapping | card (filmstrip) | stage | stage |
| ScanMeter | mapping, troubleshoot | card | stage | stage |
| PageMiniature | chat, mapping, explain | card | stage | stage |
| PageDetail | mapping, troubleshoot | aside | stage | aside |
| Narration | mapping | conv | conv | aside |
| ErrorCard | mapping, troubleshoot | card | conv | aside |
| StepShot | troubleshoot, explain | card | stage | stage |
| EventTail | troubleshoot | card | stage | stage |
| FixChoices | troubleshoot | card | stage | stage |
| AttemptList | troubleshoot | card | stage | aside |
| Compare | chat, explain | card | stage | stage |
| DecisionTable | chat, explain | card | stage | stage |
| FindingCard | explain | card | stage | stage |
| RecordCard | chat, explain | card | stage | aside |
| RecordList | chat | card | stage | stage |

Limits per view: chat 2 · mapping 4 · troubleshoot 4 · explain 3. Within one placement, the spec's order is the reading order.
LiveMap shows the scan meter in its own body; ScanMeter is for views without a map.

---

## 4. Catalogue components

All snippets show the component's inside. The server wraps it in the frame from §5.3, and the fixture is the replay of scan
01a110d5-2028 (`13-v2-fixtures.md` §Workbench). Times are UTC with Z; ids are shown as stored.

### 4.1 LiveMap

| | |
|---|---|
| Purpose | Where the crawler has been, in visit order, and where it is now, with the scan meter in its own body. The answer to "where is it and is it stuck?" |
| Paths · phase | mapping · phase 1 as a filmstrip card, phase 2 as a graph |
| Bind | `scan` (scan id) |
| Props | `follow` boolean, default true · `view` `graph` \| `filmstrip`, default graph (inline cards always use filmstrip) · `highlight` page ref |
| Data | Scan events over SSE (the data lane): pages visited, same-URL steps, queued links, the stop. No model involved. Side trips off the route fold into a chip on the page they came from ("+2 side pages") |
| Actions | Select a page (fills PageDetail) · Ask (A) · Follow on/off ("Follow paused · Resume follow") · Open the full map (Screens ▸ Map) |
| Commands | Stop the scan from its meter (`scan.stop`, command card). Resume is on the ErrorCard |
| States | Composing · Running (crawler's node `data-state="here"`, cyan, "Crawler here") · Stopped (the failed node red, "Failed here"; the meter `stopped`) · Stale ("Not live", dashed grey; the meter neutral; the last page "Last seen here") · Empty: "No pages yet. The first page appears when the crawler opens /." |
| Accessibility | `section.sy-graph[aria-label]`; nodes are buttons in visit order with `aria-pressed`; miniatures `aria-hidden`; edges `aria-hidden`; the queue node is not interactive; the List view and narration carry the same facts |

```html
<div class="sy-meter" data-status="running" style="--value: 25.5%">…</div>   <!-- its own meter, as in 4.2 -->
<section class="sy-graph" aria-label="Pages the crawler visited, in order">
  <div class="sy-graph__canvas" style="width: 506px; height: 330px">
    <svg class="sy-graph__edges" aria-hidden="true" focusable="false"><path class="sy-edge" d="M110 144 C119 144 119 68 128 68"></path></svg>
    <button class="sy-node" type="button" aria-pressed="false" style="left: 0; top: 76px; --sy-node-w: 110px; height: 136px">
      <span class="sy-order">1</span><span class="sy-mini sy-mini--mock" aria-hidden="true" style="--sy-mini-h: 50px">…</span>
      <span class="sy-node__route">/</span>
      <span class="sy-node__meta"><span class="sy-status" data-status="ok">Visited</span><span class="sy-chip">+2 side pages</span></span></button>
    <button class="sy-node" type="button" data-state="here" aria-pressed="true" style="left: 384px; top: 0; --sy-node-w: 110px; height: 136px">
      <span class="sy-order">4</span><span class="sy-mini" aria-hidden="true" style="--sy-mini-h: 50px"><img class="sy-mini__img" src="…/102-thumb.webp" alt=""></span>
      <span class="sy-node__route">/kalkulator/kierowca</span>
      <span class="sy-node__meta"><span class="sy-status" data-status="running">Crawler here</span><span class="sy-chip">step 2</span></span></button>
    <div class="sy-node" data-state="frontier" style="left: 384px; top: 152px; --sy-node-w: 110px; height: 136px">
      <span class="sy-node__route">+66 queued</span><span class="sy-node__title">links found, not visited yet</span>
      <span class="sy-node__meta"><span class="sy-status" data-status="queued">Queued</span></span></div>
  </div>
</section>
```

Filmstrip form (inline card): `.sy-film` with one `.sy-film__item` per page, see §6.3.

### 4.2 ScanMeter

| | |
|---|---|
| Purpose | Steps of the limit, pages, queued links, where the crawler is now. For views without a LiveMap (the map has its own meter) |
| Paths · phase | mapping, troubleshoot · 1 |
| Bind · props | `scan` · none |
| Data | Scan events (data lane) |
| Actions | Stop the scan (command `scan.stop`, asks first) |
| States | Running (cyan fill) · Stopped (`data-status="stopped"`, ash: the failure is the ErrorCard's job, `03` §4 rule 5) · Finished (ok) · Stale (neutral: no `data-status`) |
| Accessibility | `role="progressbar"` with `aria-valuenow`/`max`; update `--value` and `aria-valuenow` together; never a live region |

```html
<div class="sy-meter" data-status="running" style="--value: 25.5%">
  <div class="sy-meter__label"><span>Scan 01a110d5-2028 · now at /kalkulator/kierowca</span><span>102 / 400 steps · 11 pages · 66 queued</span></div>
  <div class="sy-meter__track" role="progressbar" aria-label="Scan progress" aria-valuemin="0" aria-valuemax="400" aria-valuenow="102"><div class="sy-meter__fill"></div></div>
</div>
```

### 4.3 PageMiniature

| | |
|---|---|
| Purpose | One page at a glance: thumbnail, route, status. Used in chat answers and next to explanations |
| Paths · phase | chat, mapping, explain · 1 |
| Bind · props | `scan`, `page` (`@selected` or `{route, state}`) · `size` `sm` \| `md` (default md) |
| Data | Recorded screenshots + the visit's status |
| Actions | Open detail (side sheet) · Ask |
| States | Ready · No screenshot (`.sy-mini--locked`, route and status still shown) · Composing |
| Accessibility | The thumbnail is `alt=""`; the route and status are the name; Ask button labelled with the route |

```html
<div class="sy-card sy-askable" style="width: 180px">
  <span class="sy-mini" style="--sy-mini-h: 80px"><img class="sy-mini__img" src="…/102-thumb.webp" alt=""></span>
  <span class="sy-mono sy-mono--sm">/kalkulator/kierowca · step 2</span>
  <span class="sy-status" data-status="ok">Visited</span>
  <button class="sy-ask" type="button" aria-label="Ask about /kalkulator/kierowca · step 2">Ask</button>
</div>
```
Sizes: `sm` = `--sy-mini-h: 46px`, width 120px · `md` = 80px, width 180px.

### 4.4 PageDetail

| | |
|---|---|
| Purpose | What happened on one page: when, which step, its status, the screen it was recorded as |
| Paths · phase | mapping, troubleshoot · 1 |
| Bind · props | `scan`, `page` (usually `@selected`) · none |
| Data | The portal model (screen) + the visit's events |
| Actions | Ask about this page (`.sy-btn--strong`) · Open the screen · Troubleshoot (failed page only, phase 2; switches path) · Add a mark "Skip next time" / "Start here" (`mark.add`, phase 2; opens a command card) |
| States | Ready · Nothing selected: "Select a page on the map." · Page not in this scan (component dropped, notice in the view) |
| Provenance | Placed by a spec (split stage), it is a generated frame. Opened by the person's click in a side sheet, it is not generated: no genmark, no Why |
| Accessibility | Heading is the route (`.sy-case-normal` on uppercase titles); in the side sheet focus moves to the heading when the person opens it |

```html
<dl class="sy-facts">
  <dt>Visited</dt><dd class="sy-mono sy-mono--sm">#4 · step 102 · 10:55:12Z</dd>
  <dt>Status</dt><dd><span class="sy-status" data-status="running">Crawler here</span></dd>
  <dt>Screen</dt><dd><a href="v2-07-screen-detail.html">Kalkulator OC/AC — opcje</a></dd>
</dl>
<p class="sy-small">Same URL, new screen: recorded as step 2. Submitting it is queued.</p>
<div class="sy-actions" style="--sy-gap: 6px">
  <button class="sy-btn sy-btn--sm sy-btn--strong" type="button">Ask about this page</button>
  <a class="sy-btn sy-btn--sm" href="v2-07-screen-detail.html">Open the screen</a>
  <button class="sy-btn sy-btn--sm sy-btn--quiet" type="button">Skip next time</button>   <!-- phase 2, mark.add -->
  <button class="sy-btn sy-btn--sm sy-btn--quiet" type="button">Start here</button>       <!-- phase 2, mark.add -->
</div>
```

### 4.5 Narration

| | |
|---|---|
| Purpose | What the crawler did, in plain words, one line per page or milestone |
| Paths · phase | mapping · 1 |
| Bind · props | `scan` · `every` `page` \| `milestone` (default page) |
| Data | Events → words. Lines come from the model (`narrate` tool) or from templates; every line cites its events, and model lines whose numbers aren't in the cited events are replaced by the templated line |
| Actions | Ask about a line (A on the line) · open the cited event |
| States | Writing (last line `data-kind="live"` with caret) · Stopped (last line `data-kind="stop"`, bold) · Model down (templated lines only) |
| Accessibility | The list has `aria-live="off"` inside the log so lines are not read one by one; milestones are announced by the status region |

```html
<div class="sy-msg"><span class="sy-msg__who">Assistant · narrating</span>
  <ol class="sy-narration" aria-label="What the crawler did" aria-live="off">
    <li><time datetime="2026-10-06T10:51:02Z">10:51:02Z</time><span>Followed 'Samochód' in the menu to /ubezpieczenia/samochod. <a class="sy-cite" href="#ev-01a110d5-38" title="Event 01a110d5-2028#38">step 38</a></span></li>
    <li data-kind="live"><time datetime="2026-10-06T10:55:12Z">10:55:12Z</time><span>Same URL, new screen: recorded /kalkulator/kierowca as step 2. <a class="sy-cite" href="#ev-01a110d5-102" title="Event 01a110d5-2028#102">step 102</a></span></li>
  </ol>
</div>
```

### 4.6 ErrorCard

| | |
|---|---|
| Purpose | What failed, where, the reference, and what is kept. The title names what failed; the scan's own status is "Stopped" |
| Paths · phase | mapping, troubleshoot · 1 |
| Bind · props | `scan` · none (the stop comes from the scan's events) |
| Data | The scan's stop event: step, time, ERR reference, pages and queue kept |
| Actions | Resume from last checkpoint (command `scan.resume`: opens a command card) · Troubleshoot with me (phase 2; switches path) · Ask why |
| States | Action failed (this card; red because an action really failed) · Resumed (the card stays; a line under it links the new scan) |
| Accessibility | The frame is `.sy-genview.sy-genview--failure`; its heading reads "Next action failed at /kontakt, generated"; "Failed" and "Stopped" are words, not only colour |

```html
<section class="sy-genview sy-genview--card sy-genview--failure" id="t42-err" data-gen-state="ready" aria-labelledby="t42-err-h" aria-live="off">
  <header class="sy-genview__head"><div class="sy-genview__title">
    <h3 id="t42-err-h" class="sy-plate__title sy-case-normal">Next action failed at /kontakt<span class="sy-sr-only">, generated</span></h3>
    <span class="sy-genmark" aria-hidden="true">generated</span><span class="sy-status" data-status="failed">Failed</span></div></header>
  <div class="sy-genview__body">
    <span class="sy-cluster" style="--sy-gap: 6px 10px"><span>Scan 01a110d5-2028</span><span class="sy-status" data-status="stopped">Stopped</span>
      <span class="sy-mono sy-mono--sm">ERR-01M48DVAT5E1GS5K42CTCTTDTJ</span><span class="sy-small sy-muted">step 171 · 10:58:44Z</span></span>
    <p class="sy-small">The next action's element wasn't there after the page settled (waited 10 s). 17 pages and 113 queued links are kept.</p>
    <div class="sy-actions" style="--sy-gap: 6px">
      <button class="sy-btn sy-btn--sm sy-btn--strong" type="button">Resume from last checkpoint</button>
      <button class="sy-btn sy-btn--sm" type="button">Troubleshoot with me</button>  <!-- phase 2 -->
      <button class="sy-btn sy-btn--sm sy-btn--quiet" type="button">Ask why</button></div>
  </div>
</section>
```

### 4.7 StepShot

| | |
|---|---|
| Purpose | The page at one step, with the element the action aimed at marked |
| Paths · phase | troubleshoot, explain · 2 |
| Bind · props | `scan`, `step` · `mark` `target` \| `none` (default target) |
| Data | The step's screenshot and DOM snapshot; the mark's box comes from the snapshot |
| Actions | Ask about the marked region |
| States | Ready · No screenshot ("Not recorded at this step") · Element not found (the mark outlines where it was expected, label "Not found") |
| Accessibility | `figure` with an `aria-label` that says the page, step and what is marked; the overlay is decoration |

```html
<figure class="sy-shot sy-askable" aria-label="Kontakt at step 171, where the next action's element was expected">
  <img src="…/01a110d5-2028/171.webp" alt="">
  <mark class="sy-mark sy-mark--overlay" style="left: 24px; top: 212px; width: 180px; height: 40px"><span class="sy-mark__label">Not found</span></mark>
  <button class="sy-ask" type="button" aria-label="Ask about the marked region">Ask</button>
</figure>
```

### 4.8 EventTail

| | |
|---|---|
| Purpose | The last raw events up to a step, exactly as recorded |
| Paths · phase | troubleshoot · 2 |
| Bind · props | `scan`, optional `step` · `count` 5–50 (default 10) |
| Data | Scan events (raw) |
| Actions | Copy · Open in Scans |
| States | Ready · Live (new lines append at the bottom) · Stale |
| Accessibility | `ol` with an `aria-label`; times in `<time>`; the failed line has the word (not only red) |

```html
<ol class="sy-evtail" aria-label="Last events before step 171">
  <li><time datetime="2026-10-06T10:58:31Z">10:58:31Z</time><span>GET /kontakt 200</span></li>
  <li><time datetime="2026-10-06T10:58:33Z">10:58:33Z</time><span>settled · 4 fields, 1 form</span></li>
  <li><time datetime="2026-10-06T10:58:34Z">10:58:34Z</time><span>next action: submit the form</span></li>
  <li data-status="failed"><time datetime="2026-10-06T10:58:44Z">10:58:44Z</time><span>element not found (10 s) · stop · <span class="sy-evtail__id">ERR-01M48D…</span></span></li>
</ol>
```

### 4.9 FixChoices

| | |
|---|---|
| Purpose | What to try at the failing step next |
| Paths · phase | troubleshoot · 2 |
| Bind · props | `scan`, `step` · none |
| Data | The recovery API. The variations and their descriptions are not written by the model |
| Actions | Run attempt N (command `path.attempt` with the chosen variation: opens a command card) |
| States | Ready · An attempt running (choices disabled) · Passed (the card says so and offers "Back to the map") |
| Accessibility | A real radio group in a `fieldset` with a legend; arrows move; one checked |

```html
<fieldset class="sy-stack" style="--sy-gap: 8px"><legend class="sy-legend-label">Try next</legend>
  <label class="sy-choice"><input class="sy-choice__input" type="radio" name="fix-171" value="wait_longer">
    <span class="sy-choice__body"><b>Wait longer</b><span>Same action, longer wait for the button.</span></span></label>
  <label class="sy-choice"><input class="sy-choice__input" type="radio" name="fix-171" value="record_only" checked>
    <span class="sy-choice__body"><b>Record the form, don't submit</b><span>Keeps the page; the next step stays unvisited.</span></span></label>
  <label class="sy-choice"><input class="sy-choice__input" type="radio" name="fix-171" value="skip_action">
    <span class="sy-choice__body"><b>Skip this action</b><span>Moves on to the queue.</span></span></label>
</fieldset>
<div class="sy-actions"><button class="sy-btn sy-btn--strong" type="button">Run attempt 3</button></div>
```

### 4.10 AttemptList

| | |
|---|---|
| Purpose | The attempts so far at one step and how each ended |
| Paths · phase | troubleshoot · 2 |
| Bind · props | `scan`, `step` · none |
| Data | Attempts (`attempt` table, `11-map-runs.md` §9) |
| Actions | Open an attempt |
| States | One attempt (the original) · Attempt running (`data-status="live"`) · Passed (ok) |
| Accessibility | Ordered, oldest first (as on screen 15); each item has a status word |

```html
<ol class="sy-timeline" aria-label="Attempts at step 171">
  <li data-status="failed"><div class="sy-timeline__head"><b>#1 · original</b><span class="sy-status" data-status="failed">Failed</span></div>
    <div class="sy-timeline__body">10:58:44Z · element not found after 10 s</div></li>
  <li data-status="failed"><div class="sy-timeline__head"><b>#2 · Wait longer</b><span class="sy-status" data-status="failed">Failed</span></div>
    <div class="sy-timeline__body">Same error: the element isn't there. Not a timing problem.</div></li>
  <li data-status="ok"><div class="sy-timeline__head"><b>#3 · Record the form, don't submit</b><span class="sy-status" data-status="ok">Passed</span></div>
    <div class="sy-timeline__body">11:04:10Z · the form and its 4 fields are recorded; nothing submitted.</div></li>
</ol>
```

### 4.11 Compare

| | |
|---|---|
| Purpose | Before and after of one change, the difference marked |
| Paths · phase | chat, explain · 3 |
| Bind · props | `change` (`CHG-019`) · none |
| Data | The 2.0 Changes model |
| Actions | Open in Changes |
| States | Ready · One side not recorded (`.sy-state` on that side) |
| Accessibility | Each side is a labelled section; the region is marked on one side, a dashed box on the other (`04` 2.0 components) |

```html
<div class="sy-compare" style="--sy-min: 320px">
  <section class="sy-compare__side" aria-labelledby="c-before">
    <header class="sy-compare__head"><span id="c-before">Without banner</span><span class="sy-chip">variant r2</span></header>
    <figure class="sy-shot" aria-label="Kalkulator OC/AC — wynik without the banner">…</figure></section>
  <section class="sy-compare__side" aria-labelledby="c-after">
    <header class="sy-compare__head"><span id="c-after">With banner</span><span class="sy-chip">variant r3</span></header>
    <figure class="sy-shot" aria-label="Kalkulator OC/AC — wynik with the banner 'Oferta specjalna'">…</figure></section>
</div>
```

### 4.12 DecisionTable

| | |
|---|---|
| Purpose | A rule as inputs ║ result, with its boundary tests |
| Paths · phase | chat, explain · 3 |
| Bind · props | `rule` (`BR-021`) · none |
| Data | The 2.0 Rules model |
| Actions | Open in Rules |
| States | Ready · Changed (`.sy-differs` on the changed condition) · Broken (failed test row) |
| Accessibility | Real table with `th[scope]`; the caption names the rule; results after the double weld |

```html
<div class="sy-table-wrap sy-table-wrap--flush">
  <table class="sy-table sy-table--decision sy-table--dense">
    <caption class="sy-sr-only">BR-021 decision table</caption>
    <thead><tr><th scope="col" class="sy-dt-n">#</th><th scope="col">Wiek kierowcy</th><th scope="col" class="sy-dt-result">→ Next screen</th></tr></thead>
    <tbody>
      <tr><th scope="row" class="sy-dt-n">1</th><td><code class="sy-dt-cond">&lt; 21</code></td><td class="sy-dt-result">Nie możemy Cię ubezpieczyć</td></tr>
      <tr><th scope="row" class="sy-dt-n">2</th><td><code class="sy-dt-cond">≥ 21</code></td><td class="sy-dt-result">Kalkulator OC/AC — opcje</td></tr>
    </tbody>
  </table>
</div>
```

### 4.13 FindingCard

| | |
|---|---|
| Purpose | One finding: the claim, the proposed explanation, the evidence, and what it is linked to |
| Paths · phase | explain · 3 |
| Bind · props | `finding` (`FND-007`) · none |
| Data | The 2.0 Review model |
| Actions | Open in Review (`.sy-btn--primary`: the one decision on screen is made there). **Decisions stay in Review**: the Workbench never confirms or overturns a finding |
| States | Needs you · Explained automatically (`inferred`) · Decided (`ok` or `overturned` with the person's note) |
| Accessibility | `article` named by the claim; statuses have words |

```html
<article class="sy-card" aria-labelledby="f7-h">
  <span class="sy-cluster" style="--sy-gap: 6px 10px"><span class="sy-status" data-status="needs">Needs you</span><span class="sy-status" data-status="inferred">Proposed: A/B test</span></span>
  <span id="f7-h" class="sy-card__title">Banner 'Oferta specjalna' on 6 of 11 visits</span>
  <dl class="sy-facts"><dt>Where</dt><dd>Kalkulator OC/AC — wynik</dd><dt>Evidence</dt><dd>cookie <code>ab_calc</code> = B on all 6 visits; same release and persona</dd>
    <dt>Linked</dt><dd>Same screen? conflict · process suggestion (decided together)</dd></dl>
  <div class="sy-actions"><a class="sy-btn sy-btn--sm sy-btn--primary" href="v2-04-review.html">Open in Review</a><span class="sy-small sy-muted">Decisions are made in Review.</span></div>
</article>
```

### 4.14 RecordCard

| | |
|---|---|
| Purpose | One record, process or rule as a small card with its status and a link |
| Paths · phase | chat, explain · 1 |
| Bind · props | `record` (`PROC-001`, `BR-021`, `SCR-001`, `CAP-005`, `NFR-001`) · none |
| Data | The portal model |
| Actions | Open the record |
| States | Ready · Not found (dropped) |
| Accessibility | The whole card is one link; the tag inside is a `span`, not a nested link |

```html
<a class="sy-card" href="v2-10-process-detail.html">
  <span class="sy-cluster" style="--sy-gap: 6px 10px"><span class="sy-tag sy-tag--sm">PROC-001</span><span class="sy-status" data-status="ok">Accepted</span></span>
  <span class="sy-card__title">Oblicz składkę OC/AC</span>
  <span>5 screens · 6 rules · Thorough on 9c21</span>
</a>
```

### 4.15 RecordList

| | |
|---|---|
| Purpose | Up to 12 records in a compact table, in the order given |
| Paths · phase | chat · 1 |
| Bind · props | `records` (1–12 ids, unique) · `title` (plain text, ≤60 characters; shown as the view title) |
| Data | The portal model |
| Actions | Open a record |
| States | Ready · Some ids not found (rows dropped, notice "2 records not found") |
| Accessibility | Real table; caption = the title |

```html
<div class="sy-table-wrap sy-table-wrap--flush">
  <table class="sy-table sy-table--dense"><caption class="sy-sr-only">Rules in this process</caption>
    <thead><tr><th scope="col">Rule</th><th scope="col">Status</th><th scope="col">Last tested</th></tr></thead>
    <tbody>
      <tr><th scope="row"><a class="sy-tag sy-tag--sm" href="v2-12-rule-detail.html">BR-021</a> Driver must be 21 or older</th>
        <td><span class="sy-status" data-status="needs">Changed · needs you</span></td><td>17 Oct · 01a1340c-3b97 · pass</td></tr>
      <tr><th scope="row"><a class="sy-tag sy-tag--sm" href="#">BR-026</a> Postal code must be NN-NNN</th>
        <td><span class="sy-status" data-status="failed">Broken</span></td><td>17 Oct · fail</td></tr>
    </tbody>
  </table>
</div>
```

---

## 5. Frame components

### 5.1 Workbench layouts

**Anatomy.** `.sy-wb__head` (h1 "Workbench", meta line, path switch) above `.sy-wb` with two columns. In the side nav the
"Workbench" item carries a `.sy-chip.sy-chip--dashed` "beta" chip.

| Class | Columns | Used by |
|---|---|---|
| `.sy-wb--inline` | conversation (`.sy-wb__conv`) · side sheet 320px (`.sy-wb__aside`) | Chat path always; every path in phase 1 |
| `.sy-wb--split` | conversation 300–380px · stage (`.sy-wb__stage`) | Mapping, Troubleshoot, Explain from phase 2 |
| `.sy-wb--focus` | stage + command bar · side column 280px (`.sy-wb__aside`) | Focus mode, phase 3 |

**Behaviour.** The server picks the layout from the path and phase. In inline, the side sheet exists only while it is open;
with no sheet the server renders `.sy-wb--inline.sy-wb--nosheet`: one conversation column of at most 960px (no `:has()`, so it
works on the Firefox 115 floor). The conversation column fills the viewport under the head (`--sy-wb-h`, default
`max(560px, calc(100vh - 210px))`; static design screens set a fixed value) and its log scrolls inside. When earlier messages are trimmed, the log starts with `.sy-chat__divider` "N earlier messages" (a button that loads
them). Under 1100px inline and focus become one column; under 1024px split stacks.

**Accessibility.** The conversation is a labelled section with `role="log"` on the log; the stage is
`role="region" aria-label="Stage"`; the aside is an `aside` with a heading. The page has one polite live region
(`role="status"`, visually hidden) for the announcements in `15` §7.

```html
<div class="sy-wb sy-wb--split">
  <section class="sy-plate sy-chat sy-wb__conv" aria-label="Conversation">
    <div class="sy-chat__log" role="log" aria-label="Messages">…</div>
    <div class="sy-composer">…</div>
  </section>
  <div class="sy-wb__stage" role="region" aria-label="Stage">… generated views …</div>
</div>
```

### 5.2 Path switch

**Anatomy.** Label "Path" + `.sy-seg` with one button per path **the person has** (phase 1: Chat · Mapping; phase 2 adds
Troubleshoot; phase 3 adds Explain) + the reason `.sy-pathswitch__why`.

**States.** `aria-pressed` on the current path. `data-source="assistant"` (dashed blueprint square: proposed) or
`data-source="you"` (filled chalk square: your choice, wins until you ask for something new).

**Behaviour.** Switching swaps the stage, keeps the conversation, updates the URL (`?path=`), and announces it once: "Live
map opened", "Troubleshoot view opened" or "Explain view opened". The snippet shows phase 3.

```html
<div class="sy-pathswitch">
  <span class="sy-label" id="path-l">Path</span>
  <div class="sy-seg" role="group" aria-labelledby="path-l">
    <button type="button" aria-pressed="false">Chat</button><button type="button" aria-pressed="true">Mapping</button>
    <button type="button" aria-pressed="false">Troubleshoot</button><button type="button" aria-pressed="false">Explain</button>
  </div>
  <span class="sy-pathswitch__why" data-source="assistant">Picked by the assistant: you asked to map.</span>
</div>
```

### 5.3 Generated view frame and generated mark

**Anatomy.** `section.sy-genview` > `header.sy-genview__head` (`__title`: plate title + `.sy-genmark` + status · `__tools`:
toggles, and "Why this view?" on the lead frame) > optional `.sy-genwhy` > optional `.sy-genview__notice` >
`.sy-genview__body` (the component) > `footer.sy-genview__foot` (`__source`, and feedback on the lead frame).

**One view, one lead frame.** A view is what one spec produced. Its first component's frame is the **lead frame**: it alone
carries "Why this view?" in its tools and the feedback group in its foot. The other frames of the same view carry the genmark
and the source line only. A side sheet the person opened by clicking a page is not generated: a plain `.sy-sheet` with no
genmark, no Why and no feedback.

**Ids.** The spec's `id` is required and unique within the view; a duplicate is dropped as `duplicate_id`. On the page the
frame's id is scoped by turn, `t{turn}-{id}` (`t43-map`), because inline cards from several turns share one log. Heading and
panel ids derive from it (`t43-map-h`, `t43-why`). A later view that keeps a component (same spec id and binding) is swapped
onto the existing frame (`outerHTML:#t43-map`), so follow and selection survive.

**Variants.** `--card` (compact, inside a chat message) · `--failure` (red edge and title: ErrorCard only).

**States** (`data-gen-state`): `composing` (dashed blueprint frame, skeleton body, `aria-busy="true"`, §5.6) · `ready` ·
`stale` (see below). There is no fallback frame: when nothing valid is left, the server renders no frame and the answer is
plain chat. Selected as context: `aria-current="true"` (2px chalk weld).

**Stale.** The live stream dropped; the scan may still be running. The frame turns dashed ash, the notice strip says "Live
updates paused at 10:57:05Z · Reconnecting_", the head status reads **Not live** (`data-status="unobserved"`, dashed grey),
the meter goes neutral (no `data-status`), and the crawler's last page reads **Last seen here** instead of "Crawler here".
Never "Stopped": nothing says the scan stopped. Data stays readable. The notice is not a live region; the page's one live
region says "Live updates paused" and, on reconnect, "Live updates back".

**Folded card.** A live card whose scan is stopped or finished folds to its one-line summary once a newer card arrives below
it: status, scan id, steps, pages, where it ended, and an **Expand** button (`.sy-btn--sm.sy-btn--quiet`,
`aria-expanded="false"`, `aria-controls` = the card body). Expanding shows it as it was, and it stays expanded until the person
folds it. A running card never folds, and folding never moves focus.

**Source line.** What the data is and up to when: "From events up to 10:58:44Z", "Model as of now · 17 Oct 12:00Z".

**Accessibility.** The heading carries the word: `Live map<span class="sy-sr-only">, generated</span>`, and the section's
`aria-labelledby` points at the heading, so it reads "Live map, generated". The visible genmark is `aria-hidden="true"` and
always says "generated" and nothing else. Cards inside the conversation log carry `aria-live="off"` (the log is already live).

```html
<!-- lead frame: Why + feedback -->
<section class="sy-genview" id="t43-map" data-gen-state="ready" aria-labelledby="t43-map-h">
  <header class="sy-genview__head">
    <div class="sy-genview__title"><h2 id="t43-map-h" class="sy-plate__title">Live map<span class="sy-sr-only">, generated</span></h2>
      <span class="sy-genmark" aria-hidden="true">generated</span>
      <span class="sy-status" data-status="running">Running</span></div>
    <div class="sy-genview__tools"><label class="sy-check"><input type="checkbox" checked> Follow the crawler</label>
      <button class="sy-genview__why" type="button" aria-expanded="false" aria-controls="t43-why">Why this view?</button></div>
  </header>
  <div class="sy-genwhy" id="t43-why" hidden>…</div>
  <div class="sy-genview__body">… LiveMap …</div>
  <footer class="sy-genview__foot"><span class="sy-genview__source">From events up to 10:55:12Z</span>
    <div class="sy-genfeedback" role="group" aria-label="Was this the right view?">…</div></footer>
</section>
<!-- another frame of the same view: genmark + source line only -->
<section class="sy-genview" id="t43-detail" data-gen-state="ready" aria-labelledby="t43-detail-h">
  <header class="sy-genview__head"><div class="sy-genview__title">
    <h2 id="t43-detail-h" class="sy-plate__title sy-case-normal">/kalkulator/kierowca · step 2<span class="sy-sr-only">, generated</span></h2>
    <span class="sy-genmark" aria-hidden="true">generated</span></div></header>
  <div class="sy-genview__body">… PageDetail …</div>
  <footer class="sy-genview__foot"><span class="sy-genview__source">From events up to 10:55:12Z</span></footer>
</section>
```

Stale (head status and notice):

```html
<div class="sy-genview__title"><h2 id="t43-map-h" class="sy-plate__title">Live map<span class="sy-sr-only">, generated</span></h2>
  <span class="sy-genmark" aria-hidden="true">generated</span><span class="sy-status" data-status="unobserved">Not live</span></div>
…
<div class="sy-genview__notice"><span>Live updates paused at 10:57:05Z · <span class="sy-caret">Reconnecting</span></span>
  <button class="sy-btn sy-btn--sm sy-btn--quiet" type="button">Retry now</button></div>
```

Folded live card:

```html
<section class="sy-genview sy-genview--card" id="t41-live" data-gen-state="ready" aria-labelledby="t41-live-h" aria-live="off">
  <header class="sy-genview__head"><div class="sy-genview__title">
    <h2 id="t41-live-h" class="sy-plate__title">Live map<span class="sy-sr-only">, generated</span></h2>
    <span class="sy-genmark" aria-hidden="true">generated</span><span class="sy-status" data-status="stopped">Stopped</span></div>
    <div class="sy-genview__tools"><button class="sy-btn sy-btn--sm sy-btn--quiet" type="button" aria-expanded="false" aria-controls="t41-live-body">Expand</button></div></header>
  <div class="sy-genview__body"><span class="sy-small">Scan 01a110d5-2028 · 171 / 400 steps · 17 pages · 113 queued · ended at /kontakt</span>
    <div id="t41-live-body" hidden>… the card as it was …</div></div>
</section>
```

### 5.4 Why this view

**Anatomy.** On the lead frame only. The toggle `button.sy-genview__why` (`aria-expanded`, `aria-controls`) opens `.sy-genwhy`
under the head: the path and who picked it, the reason (the spec's `why`), what you asked (message and chips), what each
component shows and what it is bound to, how fresh the data is, and `.sy-genwhy__switch` "Not what you need?" with the other
paths **available to the person** (phase 1: Chat and Mapping only; phase 2 adds Troubleshoot; phase 3 adds Explain).

**Behaviour.** The words are the spec's `why` and the server's description of the components; nothing extra is generated.
Esc closes it (after the `@` picker, before the side sheet) and returns focus to the button.

```html
<div class="sy-genwhy" id="t43-why">
  <dl class="sy-facts"><dt>Path</dt><dd>Mapping · picked by the assistant</dd><dt>Because</dt><dd>You asked to map the OC/AC calculator.</dd>
    <dt>You asked</dt><dd>"Map the OC/AC calculator and what's around it."</dd>
    <dt>Shows</dt><dd>Live map of scan 01a110d5-2028 with its meter · /kalkulator/kierowca step 2 · narration</dd>
    <dt>Data</dt><dd>Events up to 10:55:12Z</dd></dl>
  <div class="sy-genwhy__switch"><span class="sy-small">Not what you need?</span>
    <button class="sy-btn sy-btn--sm sy-btn--quiet" type="button">Switch to Chat</button>
    <button class="sy-btn sy-btn--sm sy-btn--quiet" type="button">Switch to Troubleshoot</button></div>
</div>
```
(Phase 2 example. In phase 1 the switch lists Chat only, and there is no Troubleshoot button anywhere.)

### 5.5 Feedback

**Anatomy.** On the lead frame's foot. `.sy-genfeedback[role=group]` > label "Right view?" + Yes / No
(`.sy-genfeedback__btn`) + `.sy-genfeedback__why` after No: five reason toggles (Wrong path · Missing something · Too much ·
Wrong data · Other) and an optional text field.

**States.** `aria-pressed` on the chosen answer and reasons (inverse chalk fill).

**Behaviour.** Optional. One answer per view per person; it can be changed. It is stored with the view (its turn) and the spec
id. No thank-you dialog; nothing else changes on the screen.

```html
<div class="sy-genfeedback" role="group" aria-label="Was this the right view?">
  <span>Right view?</span>
  <button class="sy-genfeedback__btn" type="button" aria-pressed="false">Yes</button>
  <button class="sy-genfeedback__btn" type="button" aria-pressed="true">No</button>
  <div class="sy-genfeedback__why">
    <button class="sy-genfeedback__btn" type="button" aria-pressed="true">Wrong path</button>
    <button class="sy-genfeedback__btn" type="button" aria-pressed="false">Missing something</button>
    <button class="sy-genfeedback__btn" type="button" aria-pressed="false">Too much</button>
    <button class="sy-genfeedback__btn" type="button" aria-pressed="false">Wrong data</button>
    <button class="sy-genfeedback__btn" type="button" aria-pressed="false">Other</button>
    <label class="sy-field"><span class="sy-sr-only">What was wrong? (optional)</span>
      <input class="sy-input sy-input--md" type="text" placeholder="What was wrong? (optional)"></label></div>
</div>
```

### 5.6 Composing skeleton and assistant activity line

**Anatomy.** A frame with `data-gen-state="composing"` whose body is `.sy-genskel`: a mono caption (`__label`) and dashed
blocks (`__block`) sized with `--sy-skel-h` to the expected components. The activity line `.sy-genstatus` says what is
happening with a caret; `--done` removes the caret.

**Behaviour.**
- The frame appears **when the model opens a `render_view` call** (the tool-use block starts, before its input is complete),
  **where the view will go**: inside the assistant's message for inline cards, on the stage in split and focus. Its blocks
  take the size of the path's usual view and are swapped for the components, by id, as the spec validates. No shimmer.
- **Text is never held for the view.** The answer streams as soon as the model writes it; the view attaches below it.
- If neither text nor a `render_view` call has started **4 s** after Send, the conversation shows `.sy-genstatus`
  "Still working".
- If no valid spec has arrived **15 s** after Send, the composing frame is removed and the line "No view this time; the answer
  is above." takes its place.

```html
<section class="sy-genview sy-genview--card" id="t43-composing" data-gen-state="composing" aria-busy="true" aria-labelledby="t43-composing-h" aria-live="off">
  <header class="sy-genview__head"><div class="sy-genview__title"><h3 id="t43-composing-h" class="sy-plate__title">Live map<span class="sy-sr-only">, generated</span></h3>
    <span class="sy-genmark" aria-hidden="true">generated</span></div><span class="sy-genstatus">Composing view</span></header>
  <div class="sy-genview__body"><div class="sy-genskel">
    <span class="sy-genskel__label">live map · page detail</span>
    <div class="sy-genskel__block" style="--sy-skel-h: 220px">live map</div>
    <div class="sy-genskel__block" style="--sy-skel-h: 140px">page detail</div></div></div>
</section>

<span class="sy-genstatus">Still working</span>
<p class="sy-small sy-muted">No view this time; the answer is above.</p>
```

### 5.7 Context chip and bar

**Anatomy.** `.sy-ctxbar` > label "Asking about" + up to 3 `.sy-ctxchip` (`__at` "@" + the target + `__remove` ×).

**Behaviour.** Added by Ask, by A on a focused item, or (from phase 2) by `@` in the message field, which opens a picker of the
current scan's pages, steps and events. Sent as structured context (`{kind: "page", scan, route, state}`, `{kind: "step", scan,
step}`, `{kind: "event", ref}`, `{kind: "view", id}`), then shown on the person's message. A fourth chip replaces the oldest.
Backspace in an empty field removes the last chip. Phase 1 shows no `@` hints.

**Accessibility.** The remove button's label names the target ("Stop asking about /kontakt · step 171"). On touch, chips and
their remove buttons are 44px.

```html
<div class="sy-ctxbar"><span class="sy-label">Asking about</span>
  <span class="sy-ctxchip"><span class="sy-ctxchip__at" aria-hidden="true">@</span><span>/kontakt · step 171</span>
    <button class="sy-ctxchip__remove" type="button" aria-label="Stop asking about /kontakt · step 171">×</button></span>
</div>
```

### 5.8 Suggestions

**Anatomy.** `.sy-suggest[role=group]` > up to 3 buttons (dashed blueprint: drafted by the assistant).

**Behaviour.** A click sends exactly the text as the person's message, with the current chips. A suggestion never runs a
write directly; a write produces a command card. On the first visit the same component holds three starters for the paths the
person has ("Map the OC/AC calculator", "Why did scan 01a110d5-2028 stop?", "Which processes are accepted?").

```html
<div class="sy-suggest" role="group" aria-label="Suggested questions">
  <button type="button">Why did it stop here?</button><button type="button">Skip /kontakt next time</button>
</div>
```

### 5.9 Askable item and Ask

**Anatomy.** `.sy-askable` (position: relative) wraps a non-button item; `.sy-ask` sits in its top-right corner.

**Behaviour.** The Ask button shows on hover and keyboard focus, always on touch (44px there); `.sy-ask--show` keeps it
visible in docs and screenshots. It adds a context chip and moves focus to the message field. Buttons (map nodes, filmstrip
items) can't contain another button: use A on them, or "Ask about this page" in PageDetail.

```html
<li class="sy-askable">… a narration or event line …
  <button class="sy-ask" type="button" aria-label="Ask about the event at 10:58:44Z">Ask</button></li>
```

### 5.10 Live bar

**Anatomy.** `.sy-livebar` (sticky at the top of the conversation log) > `__main` (label, status, one-line progress) + a
link to the live card.

**Behaviour.** Inline layout only. Appears while a scan runs and its live card has scrolled out of view. It is not a live
region.

```html
<div class="sy-livebar"><div class="sy-livebar__main"><span class="sy-label">Pinned</span>
  <span class="sy-status" data-status="running">Running</span><span>Scan 01a110d5-2028 · 140 / 400 · now at /porownanie</span></div>
  <a class="sy-small" href="#t41-live">Jump to the live card</a></div>
```

### 5.11 Side sheet

**Anatomy.** `aside.sy-sheet.sy-wb__aside` > `__head` (plate title + `__close` ×) + `__body` (usually PageDetail).

**Behaviour.** Non-modal. It exists in the DOM only while it is open: with no sheet the inline layout is rendered
`.sy-wb--inline.sy-wb--nosheet` (one column of at most 960px); opening one adds the 320px column. **A sheet the person opened by
clicking a page is not generated**: no genmark, no Why, no feedback. Opening it moves focus to its heading; Esc (after the `@`
picker and Why) or × closes it and returns focus to the item that opened it. Below 1100px it stacks under the conversation.

**Accessibility.** On touch the close button is 44px.

```html
<aside class="sy-sheet sy-wb__aside" aria-labelledby="sheet-h">
  <header class="sy-sheet__head"><h2 id="sheet-h" class="sy-plate__title sy-case-normal" tabindex="-1">/kalkulator/kierowca · step 1</h2>
    <button class="sy-sheet__close" type="button" aria-label="Close page details (Esc)">×</button></header>
  <div class="sy-sheet__body">… PageDetail …</div>
</aside>
```

### 5.12 Command card

**Anatomy.** `section.sy-cmd` > `__head` (`__title` = the command label + status) + `__body` (facts in a fixed order, then the
reason) + `__foot` (Confirm `.sy-btn--primary`, Cancel quiet, "Nothing runs until you confirm.").

**States** (`data-cmd-state`):

| State | Looks | Words |
|---|---|---|
| `proposed` | Dashed blueprint, status `draft` | "Proposed" · Confirm (marker) · Cancel |
| `running` | Solid cyan, Confirm `aria-busy="true"` | "Resuming…" |
| `done` | Solid green, result with links | "Resumed as scan 01a110e7-2068 · continues 01a110d5-2028" · "Open in Scans" · Undo (marks only) |
| `failed` | Solid red | The command's message, ERR reference, "Nothing changed" · "Try again" |
| `failed`, didn't start (2.3) | Solid red | Status word **Didn't start**; facts **Created: nothing**, Why (the cause quoted), the environment and when, ERR reference · **Start again** (same arguments), Check the address. `genui-components.html#g-start` |
| `cancelled` | Folded to the head line, muted | "Cancelled · nothing changed" |
| `expired` | Folded to the head line, muted (10 min passed, or its preconditions changed) | "No longer applies: 01a110d5-2028 was resumed from Scans" |
| `undone` | Solid line, ash title (marks only) | "Undone · mark removed" |

**Behaviour.**
- Every write is a card, whether the assistant proposed it or the person pressed a button (Resume on an ErrorCard, Run attempt
  in FixChoices, a mark button in PageDetail). A card created by the person's click takes focus on its heading, never on
  Confirm. Nothing is sent to the API before **Confirm**, the one marker button on screen (Send is `.sy-btn--strong`).
- **Undo** is a button on the done card, and only for `mark.add` (the API's `DELETE /portals/{portal}/marks/{mark}`), until a
  scan uses the mark. Scans and attempts are never undone; their card says how to stop them instead.
- Commands run on **sandbox only** during the beta; elsewhere the card shows why and links to Scans.
- **Editable cards** (`persona.add`, R-95): the body is a `form.sy-cmd__form` holding the drafted values; a field the person
  changes gets `[data-edited]` (manila edge); Confirm submits what the card shows. Credentials are picked by vault reference;
  "Store a new credential…" opens the server-owned vault dialog. Undo removes the persona until a scan uses it.
  Demo: `genui-components.html#g-persona`; answer: `19-console-answers/04-add-persona.md`.
- The result is announced once by the page's live region ("Resumed as scan 01a110e7-2068"); a failed command uses `role="alert"`.

Resume, with its facts in this order:

```html
<section class="sy-cmd" data-cmd-state="proposed" aria-labelledby="cmd1-t">
  <header class="sy-cmd__head"><span id="cmd1-t" class="sy-cmd__title" tabindex="-1">Resume from last checkpoint</span><span class="sy-status" data-status="draft">Proposed</span></header>
  <div class="sy-cmd__body">
    <dl class="sy-facts"><dt>Starts</dt><dd>a new scan that continues 01a110d5-2028</dd>
      <dt>From</dt><dd>/porownanie · step 140, last good checkpoint</dd>
      <dt>Kept</dt><dd>17 pages, 113 queued links</dd><dt>Where</dt><dd>sandbox</dd>
      <dt>/kontakt</dt><dd>one more try with the original action</dd>
      <dt>Undo</dt><dd>Not undoable. You can stop the new scan.</dd></dl>
    <span class="sy-small sy-muted">Proposed by the assistant: the page loaded but the form's button never appeared.</span>
  </div>
  <footer class="sy-cmd__foot"><button class="sy-btn sy-btn--sm sy-btn--primary" type="button">Confirm</button>
    <button class="sy-btn sy-btn--sm sy-btn--quiet" type="button">Cancel</button><span class="sy-small sy-muted">Nothing runs until you confirm.</span></footer>
</section>
```
After troubleshooting, the /kontakt fact reads "recorded without submitting" (attempt 3's variation).

Cancelled, and a done mark with Undo:

```html
<section class="sy-cmd" data-cmd-state="cancelled" aria-labelledby="cmd1-t">
  <header class="sy-cmd__head"><span id="cmd1-t" class="sy-cmd__title">Resume from last checkpoint</span><span class="sy-small sy-muted">Cancelled · nothing changed</span></header>
</section>

<section class="sy-cmd" data-cmd-state="done" aria-labelledby="cmd2-t">
  <header class="sy-cmd__head"><span id="cmd2-t" class="sy-cmd__title">Add a mark</span><span class="sy-status" data-status="ok">Done</span></header>
  <div class="sy-cmd__body"><span>/kontakt is marked "Skip next time" for the next scan plan.</span></div>
  <footer class="sy-cmd__foot"><button class="sy-btn sy-btn--sm" type="button">Undo</button></footer>
</section>
```

### 5.13 Command bar (focus mode)

**Anatomy.** `.sy-cmdbar__reply` (the latest reply as a card, with the link "History (3)" to the full conversation) above
`form.sy-cmdbar` > `__main` (context bar + one-line input) + Send.

**Behaviour.** In focus mode the conversation collapses into this bar. Enter sends; Send is `.sy-btn--strong`, like the
composer's. Ctrl J focuses the message field (the drawer isn't shown in the Workbench). F toggles focus mode (not while typing).

```html
<div class="sy-cmdbar__reply" aria-label="Latest reply"><span class="sy-msg__who">Assistant · latest reply</span>
  <p>The scan stopped at /kontakt, step 171. 17 pages and 113 queued links are kept.</p><a class="sy-small" href="#history">History (3)</a></div>
<form class="sy-cmdbar" aria-label="Command bar">
  <div class="sy-cmdbar__main"><div class="sy-ctxbar">…</div>
    <label class="sy-field"><span class="sy-sr-only">Message</span>
      <input class="sy-input sy-input--md" type="text" placeholder="Ask, or tell the crawler: 'resume', 'why did it stop?'"></label></div>
  <button class="sy-btn sy-btn--strong" type="submit">Send</button>
</form>
```

---

## 6. Building blocks

### 6.1 Page miniature and visit order

`.sy-mini` holds a thumbnail (`img.sy-mini__img`, `alt=""`). `.sy-mini--mock` draws page bars for wireframes (`b` heading,
`i` text, `i.l` link, `i.f` field). `.sy-mini--locked` = no screenshot. Height via `--sy-mini-h` (default 56px). The miniature
is decoration: the route next to it is the name. `.sy-order` is the visit number badge, top-left of its positioned parent.

```html
<span class="sy-mini" style="--sy-mini-h: 46px"><img class="sy-mini__img" src="…/171-thumb.webp" alt=""></span>
<span class="sy-mini sy-mini--mock" aria-hidden="true"><b style="width: 60%"></b><i style="width: 90%"></i><i class="l" style="width: 40%"></i><i class="f" style="width: 55%"></i></span>
```

### 6.2 Narration list and citation

See 4.5. `li[data-kind="live"]` adds the caret to the newest line while the scan runs; `li[data-kind="stop"]` is bold.
`.sy-cite` links one event (`scan#step`); its text is "step 171" and its title "Event 01a110d5-2028#171".

### 6.3 Filmstrip

`.sy-film[role=group]` > `button.sy-film__item[aria-pressed]` (+ `data-state="here"` cyan or `"failed"` red) > `.sy-order` +
`.sy-mini` + `.sy-film__route` + status. The queue ends the strip as a non-interactive dashed tile,
`.sy-film__item[data-state="frontier"]`. Side trips fold into a chip on the page they came from ("+2 side pages"). Scrolls
sideways inside itself; new pages append on the right, before the queue tile. Width via `--sy-film-w`.
**Naming (F-15 a).** Filmstrip items and map nodes carry **no `aria-label`**: their visible text names them (order, route,
status, side-trip chip), so the accessible name contains what people see (WCAG 2.5.3). The miniature is `aria-hidden`. Text
that helps but isn't shown (a node's screen name) goes in a `.sy-sr-only` span after the route.

```html
<div class="sy-film" role="group" aria-label="Pages visited, in order">
  <button class="sy-film__item" type="button" aria-pressed="false"><span class="sy-order">1</span>
    <span class="sy-mini sy-mini--mock" aria-hidden="true" style="--sy-mini-h: 46px">…</span>
    <span class="sy-film__route">/</span><span class="sy-status" data-status="ok">Visited</span><span class="sy-chip">+2 side pages</span></button>
  <button class="sy-film__item" type="button" data-state="here" aria-pressed="true"><span class="sy-order">5</span>
    <span class="sy-mini sy-mini--mock" aria-hidden="true" style="--sy-mini-h: 46px">…</span>
    <span class="sy-film__route">/porownanie</span><span class="sy-status" data-status="running">Crawler here</span></button>
  <div class="sy-film__item" data-state="frontier"><span class="sy-film__route">+97 queued</span>
    <span class="sy-status" data-status="queued">Queued</span></div>
</div>
```

### 6.4 Event tail and event strip

`.sy-evtail` (see 4.8) lists events top to bottom; `li[data-status="failed"]` turns the text red and keeps the word.
`.sy-evstrip` is the horizontal timeline under the map in focus mode: one column per page (`--sy-evstrip-n`, default 6;
3 under 1100px), top weld cyan for `running`, red for `failed`.

```html
<ol class="sy-evstrip" aria-label="Event timeline">
  <li><time datetime="2026-10-06T10:49:31Z">10:49:31Z</time><span>Opened / · 15 links queued</span></li>
  <li data-status="failed"><time datetime="2026-10-06T10:58:44Z">10:58:44Z</time><span>/kontakt · next action failed · stopped</span></li>
</ol>
```

---

## 7. Inline style hooks (gen UI)

In addition to the hooks in `05-css-guide.md` §4, gen UI markup may set these custom properties inline:

| Hook | On | Default | Set by |
|---|---|---|---|
| `--sy-wb-h` | `.sy-wb__conv` | `max(560px, calc(100vh - 210px))` | Static design screens only (fixed height for full-page screenshots) |
| `--sy-wb-conv` | `.sy-wb--split` | 380px | Page template |
| `--sy-wb-aside` | `.sy-wb--inline`, `.sy-wb--focus` | 320px / 280px | Page template |
| `--sy-skel-h` | `.sy-genskel__block` | 80px | Server, from the component's known height |
| `--sy-mini-h` | `.sy-mini` | 56px | Component template (size preset) |
| `--sy-film-w` | `.sy-film` | 112px | Component template |
| `--sy-evstrip-n` | `.sy-evstrip` | 6 | Component template |

Graph positions (`left`, `top`, `--sy-node-w`, canvas size, edge `d`) and mark overlay boxes come from the server, as for the
2.0 map.

---

## 8. How to add a new component

1. **Prove the need.** At least two real requests (evals, feedback "Missing something") that no existing component or
   combination answers. Compose before you create (`05` §10).
2. **Design every state** (composing, ready, empty, stale, error) in every placement it will allow, at 1280 and 1024, using
   existing classes first. Add the examples to `design-system/genui-components.html`.
3. **CSS**, only if needed: add to `genui.css` in `@layer sy.components`, role tokens only, with forced-colours and
   `pointer: coarse` rules. Document new inline hooks in §7.
4. **Server partial:** one template per type that takes resolved data only, rendered inside the generated view frame, whose
   element id is `t{turn}-{id}`.
5. **Contract:** add the entry to `CATALOGUE` in `workbench/tools/gen_wb_schema.py` (type, phase, paths, placement, bind, required bind,
   props, data, actions, shows) and regenerate. Never edit the JSON by hand. Add valid and invalid examples.
6. **Resolver and data lane:** map each bind id to data, define the drop reason when it doesn't resolve, and list the events
   that update it in place.
7. **Commands:** if it offers a write, use an existing command or add one to `COMMANDS` (API, effects, undo).
8. **Evals:** golden prompts that should pick it (and on which path), and prompts that should not.
9. **Review** with the checklist in `15` §9 (contract, design, words, behaviour, accessibility, safety).
10. **Docs:** an entry in §4 of this doc, a row in §1 and §3, a `FE-W` requirement in `07-requirements.md`, and a decision in
    `02-design-decisions.md` if it changes a rule.
11. **Ship behind its phase flag** and watch "Right view?" answers and drop reasons for it before widening.

Adding a component or an optional prop is a backward-compatible change to view spec version "1". Removing or renaming a
type or prop needs version "2", and the server keeps accepting "1" until prompts and evals have moved.
