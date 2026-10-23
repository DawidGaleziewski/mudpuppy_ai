# Designer questions, round 4: console navigation and canvases (2026-10-24)

From the owner's hand review of the React console (`2_ui_dislikes.md`, items 1–9) on
`reference-insurer-local`. These are the points where the design is silent, or where the owner wants
something different from what was drawn. Bugs that the design already settles go to the roadmap (R-103),
not here.

Same format as rounds 2 and 3 (`docs/design/salvage-yard/docs/18-design-answers/`,
`19-console-answers/`): for each question, the decision, why, the markup and classes, React notes, and
how to check it. Every page named here exists in React under `/app/` (`apps/web`).

| # | Question | From | Kind |
|---|---|---|---|
| Q1 | Going back after a link between sections ("came from") | item 5 | gap |
| Q2 | The picture dialog as a sorting tool: step through a list, tick, assign to a process | item 3 | gap + change |
| Q3 | Merging two saved processes | item 3 | gap |
| Q4 | Previous / Next on the Screen page, and pictures in the Screens list | item 4 | placement |
| Q5 | A Diagram (Mermaid) component: frame, zoom, full screen | item 6 | gap |
| Q6 | How a canvas moves: drag to pan, the wheel, "engage to zoom" | items 6, 7 | gap + change to D-47 |
| Q7 | Loading a console page without a blink | item 2 | gap |
| Q8 | The header: portal picker and data store side by side | item 1 | check |
| Q9 | A command that fails before it starts anything | item 9 | check |

---

## Q1 · Going back after a link between sections

**Today.** Breadcrumbs are the section tree, as drawn (`v2-07-screen-detail.html` "Screens / …",
`v2-10-process-detail.html` "Processes / …"). The 2.0 pages link across sections all the time:
- Screen → a process that uses it
- Review → a rule, a record or a change
- Changes → a screen
- Docs record → a screen
- Process → a screen

After such a link, the crumbs point to the target's own section, so the person can't get one step back to
where they were. They go to Screens and search for the screen again. The browser's Back works, but the
console doesn't show it, and people don't think of it.

**Owner, 2026-10-24:** "where going into nested route like screen → selecting process. I cannot go one step
back. I have to click screen again. This is general for whole project."

**What we need from you**
1. A **"came from" pattern** for the page head: when a page was opened by a link from another page, show
   the way back to that exact page (its tab, filter and list page kept). For example "← Kalkulator OC/AC —
   dane kierowcy" or "← Back to Screen SCR-012".
   - Where it sits relative to `.sy-crumbs` (above them, in place of the first crumb, or at the end of
     the row).
   - Its words. Should it name the page by its title or by its key?
   - Its look: `.sy-meta`-sized link, an icon, or a quiet button.
2. When it shows: only after a link between sections? Also from the nav? Not when the address was typed?
3. A chain (Screen → Process → Rule): only one step back, or a short trail?
4. On a phone (390 px): does it replace the crumbs?

**Our proposal** (change it freely): one link above the crumbs, "← {title of the page you came from}",
shown only after a link between sections. It takes you to the exact address you left. Nothing shows
when there is no "from".

---

## Q2 · The picture dialog as a sorting tool

**Today.** Processes ▸ "In no process" (`pages/NewProcess.tsx`) lists the loose screens as 96 px
thumbnails, each with a checkbox. Ticked screens become numbered steps on the side (↑ / ↓), and then
"New process from these". The thumbnail opens the wide picture dialog (D-45,
`18-design-answers/02-wide-picture-dialog.md`), which only views:
- Previous / Next and ← / → step through **one screen's variants**, not the list.
- There's no tick in the dialog. Our help text even says "Open a picture to see the screen large; it does
  not tick it."
- Sorting 30 loose screens means: open, look, Esc, find the row, tick, open the next one.

Your `04-processes.html` panel also says "**Drag a screen onto a process**, or select several and choose
'New process from these'". Only the second half is built. Adding loose screens to an **existing**
process is missing (roadmap R-103).

**Owner, 2026-10-24:** "I can see bigger screen in modal. But there is not next or prev button to view
quickly next. I also do not see a checkbox to mark it to a process. I need to work better with UI to mark
processes and lump them together."

**What we need from you**
1. **Stepping through a list.** When the dialog is opened from a list (loose screens, the Screens list, a
   process's steps), Previous / Next and ← / → move through that list.
   - Show the position ("4 of 12").
   - How do list steps and variant steps live together on a screen that has variants (two rows of
     controls? variants as a segmented control inside, the list on the arrows?).
2. **Acting from the dialog.**
   - A tick "In this process" (or "Add to …") in the dialog's head or foot, mirroring the row's checkbox.
   - The step number shown when ticked.
   - A key for it (Space? T?), like Review's J / K / C / R.
   - Is the dialog still `.sy-dialog--wide` view-only by your rules, or does it become a small workspace?
3. **Assigning to an existing process** without a mouse drag:
   - an "Add to process ▾" menu on a loose screen, on the ticked set and in the dialog
   - what the menu lists
   - what it says when the process's as-is (A) is observed-only (10-processes.md § 1). Does the screen go
     into a to-be draft, a scope change, or a suggestion for the next scan?
4. **A sorting mode** for "In no process": bigger thumbnails in a grid, multi-select, then assign. Is it
   worth a view of its own (like v2-09's suggestions), or is the dialog enough?

---

## Q3 · Merging two saved processes

**Today.** Merge and Split exist only for the assistant's **suggestions** (`ProcessSuggestions.tsx`,
v2-09). Two saved processes can't be lumped together.

**What we need from you:** whether merging saved processes is allowed. If it is:
- What happens to each one's A (as-is, observed) and B… (to-be) variants?
- Which name and persona win?
- Is it a new process (and the two archived) or one absorbing the other?
- History and Undo.
- Where the action sits (the process page's actions? the Processes list with two ticked?).

---

## Q4 · Previous / Next on the Screen page, and pictures in the Screens list

**Context.** The owner asked for this in R-71 (b) (2026-10-17): "← Prev / Next → to the neighbour in
the list it was opened from (same filter and order)". The htmx console had it; React lost it. It's
going back in as a bug fix (R-103), so we only need **placement**. React already has it on a Docs record
(`DocRecord.tsx`, in the page head's actions) and on Review items.

**What we need from you**
1. Placement on `v2-07-screen-detail`: in the page head's actions like Docs, or a bar under the crumbs.
2. The words: "← Prev · 4 of 37 · Next →"? Use the neighbour's title on hover?
3. Keys J / K, the same as Review and Before / after: yes or no.
4. **Pictures in the Screens list** (`v2-06-screens.html`): a 96 px `.sy-thumb` per row (as in
   "In no process"). Which column? What does a row without a picture show? Does it change at phone width?
   Also asked by the owner in `1_review_basic.md` item 1 ("miniatures next to url").

---

## Q5 · A Diagram (Mermaid) component

**Today.** `Diagram` (spec 056) draws Mermaid's SVG inline, at the column's width, with no zoom, pan or
full screen. It is used for:
- Docs ▸ **Capabilities** (the capability map) and screen navigation (`pages/Docs.tsx`)
- a process record's map (`DocContent.tsx`)
- a scan's Process tab (`ScanProcess.tsx`)

A big capability map shrinks until its labels can't be read. The design system has no Diagram entry
and no mock for the capability map.

**Owner, 2026-10-24:** "Diagram is unreadable. I would like to view it, zoom in, scroll by drag dropping.
Maybe something that locks my mouse in when I click in it."

**What we need from you**
1. Should Diagram use your `.sy-graphview` frame and `.sy-graph__zoom` bar (D-47) as is, or a variant of
   them?
2. Its height on a page: natural height capped at the viewport? 520 px when embedded?
3. Opening zoom: fit, or "readable first" like the map (R-101 Q3: never below 80 %)? For a wide capability
   map, should it start at its top-left?
4. **Open full screen** for big diagrams: `.sy-dialog--wide` in full-window mode, with the same controls?
5. How a Mermaid diagram meets the Salvage Yard tokens (we theme it already; the colours are in
   `Diagram.tsx`): any rules for node and edge styles, or are the current ones fine?
6. The capability map itself: should it stay a diagram at all, or would a list or tree read better with
   the diagram as the second view (like the Map's List view, FE-M01)?

---

## Q6 · How a canvas moves (Graph and Diagram)

**Today.** The map's Graph (Screens ▸ Map, the recorded map, a scan's Graph tab) has −/%/+/Fit, the keys
+ / − / 0, and the arrows between nodes. It has **no wheel handling and no pointer handling**:
- The wheel scrolls the box or the page.
- Ctrl + wheel isn't built yet (a D-47 leftover; roadmap R-103).
- A drag selects the labels' text.

D-47 says "Ctrl + wheel (or pinch) zooms around the pointer; the wheel alone scrolls the graph box", and
it says nothing about dragging.

**Owner, 2026-10-24:** "I would like zoom in via scroll, and drag and drop similar to Figma. Currently
drag and drop highlights text." Also (for diagrams): "something that locks my mouse in when I click in it."

**What we need from you**
1. **Drag to pan**:
   - drag on empty canvas pans, with cursors `grab` / `grabbing`
   - Space + drag and middle-button drag
   - no text selection while dragging
   - a click without movement still selects a node
   - what a drag that starts on a node does (pan, or nothing?)
2. **The wheel.** Three models; please pick one for all canvases:
   - **(a) D-47 as is:** the wheel scrolls the box or page, Ctrl / ⌘ + wheel zooms at the pointer.
   - **(b) Figma:** the wheel pans the canvas, Ctrl / ⌘ + wheel zooms. This captures the wheel whenever
     the pointer is over the canvas, so a page with a 520 px graph can't be scrolled past it with the
     wheel.
   - **(c) Engage to zoom (the owner's "lock the mouse in"):** a click or focus in the canvas engages it,
     with a visible ring and a hint such as "Wheel zooms · Drag pans · Esc to leave". While engaged, the
     plain wheel zooms. Esc, a click outside, or Tab out releases it. Not engaged = (a).
3. Smooth zoom (any level) vs the steps 50 · 67 · 80 · 100 · 125 · 150 %: does the bar's level round to a
   step?
4. Touch and pen: pinch-to-zoom and one-finger pan, also on the embedded graph?
5. **Full screen** for the embedded scan graph (520 px is small for a long scan). The phone dialog from
   D-47 is also still open.
6. The no-selection rule for canvases in the design system (`user-select: none` on the canvas, text
   still copyable from the inspector).

---

## Q7 · Loading a console page without a blink

**Today.** A nav click blinks:
1. **Our part (being fixed, R-103):** every page draws its own frame, so the header and nav are rebuilt
   on each click.
2. **Your part:** while the page's data loads, the body is one muted line, "Loading screens…". Then the
   full page lands, and the short-then-long page reads as a flash.

You specify the loading state (`04-design-system.md` § States: `.sy-state__title.sy-caret`, "say what is
being read and the counts so far. No spinners"), but not what the page looks like while it loads.
Your Workbench rule is the opposite of what we do (`15-genui-guidelines.md` § 8: "**Reserve the final
size** … don't show … a box that grows when content lands"; `.sy-genskel`).

**What we need from you:** a loading rule for console pages:
1. The page head (crumbs, title) shows at once, and only the body loads: yes or no.
2. The body while loading:
   - (a) the caret state at the body's expected height
   - (b) skeleton blocks at final size, like `.sy-genskel` (tables: n grey rows?)
   - (c) keep the previous page on screen, dimmed, until the next is ready, for loads under ~300 ms
3. A minimum time before any loading state shows (e.g. nothing for the first 150 ms), so fast loads show
   no state at all.
4. Loading a new filter or page inside a list: keep the old rows dimmed with `aria-busy`, or show the
   state?

---

## Q8 · The header: portal picker and data store

**Context.** You specified the portal picker in the header (FE-N01 / FE-N02, `04-design-system.md`),
with "All portals" and "+ New portal" in its menu. React lost it. It's going back in as a bug fix
(R-103), built to your spec. Two related things aren't settled:
1. **The data store menu** is in the header too, next to As of. That's the owner's own call (R-71 (c),
   2026-10-17: "put it near the top, next to the portal picker"); your spec puts it in the nav footer
   and Settings ▸ Data store. Its label is long and wraps the header at 1280 px (R-102 (4)). Please place
   it in the header's order (wordmark · portal · store? · search · …) and give it a short form. The store
   follows the portal (R-71 (d)).
2. **The All portals page** (`/app/`). Today it shows only "Portals" in the nav. Your `v2-15` keeps the
   whole nav. When no portal is chosen yet (a first visit), should the nav show the sections of the last
   portal used, or the sections disabled with a reason?

---

## Q9 · A command that fails before it starts anything

**Context.** A Workbench `scan.start` was confirmed while the portal server was down. The crawler refused
before creating a run ("robots.txt could not be read (network error: fetch failed); no page is opened
until it can"). The card stayed "running", then ended as "Done" with a later scan's id. That bug is
on R-103, and its fix ends the command as failed.

**What we need from you** (short): the card's look for "failed to start, nothing was created". Is it
your generic failed state with the crawler's sentence and a "Start again" button that makes a fresh card?
Or a quieter state, since nothing broke in the portal ("no red when nothing in the scan failed", as for
pictures)? And the live card (`wb-01`): should it appear **at once** when a scan starts (from the run, with
no model involved), with the assistant's words arriving later beside it? R-96 plans it that way.
