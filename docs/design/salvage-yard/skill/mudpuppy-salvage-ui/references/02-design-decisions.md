# 02 · Design decisions

Why Salvage Yard looks and behaves the way it does. Each entry is a decision record:
**context → decision → why → consequences**. If you want to change one, write a new
entry that supersedes it; don't silently "fix" an intentional choice.

Status key: **Accepted** (build it) · **Open** (needs a product decision, see end).

---

## Direction

### D-01 · Dark theme only — Accepted
- **Context.** The audience (legacy developers, BAs, QAs on enterprise portal migrations) sits in this tool for hours, next to tools like Sitecore and AEM. The product owner rejected light dashboards outright.
- **Decision.** One dark theme. `color-scheme: dark`. No light tokens are defined.
- **Why.** One theme is cheaper to keep accessible and consistent; every contrast pair in this package is measured for it.
- **Consequences.** Exported documents (change specs, docs) are a separate print style, not a light theme of the app. Recorded screens of the target portal stay as captured (often light) inside a `.sy-shot` frame.

### D-02 · Salvage Yard is the direction — Accepted
- **Context.** Seven directions were explored on the same wireframes: Rig Shed, Murk, Salvage Yard, Console (today), Console refined, Lanternfish, Dung Exportfork, plus Salvage in Console colours (C2). Usability scoring put Salvage (24/30) far above Console (14/30).
- **Decision.** Salvage Yard, original palette (steel, marker orange, manila, blueprint).
- **Why.** Its metaphor is the job: walk the old portal like a scrapyard, log the parts, tag what to keep, draw the new build over it. Each device carries a product meaning (tags = records, blueprint = to-be, typewriter = people). It has character without costing readability, and it is serious enough for an architecture review.
- **Consequences.** Console's phosphor amber, scanlines and glow are retired (D-12). The `mudpuppy://console` wordmark is replaced (D-23).

## Type

### D-03 · Three voices instead of one monospace — Accepted
- **Context.** Console set everything in JetBrains Mono. Long prose (chat answers, requirements, change specs) in monospace is slow to read, and nothing showed *who* produced a piece of text.
- **Decision.** Archivo for UI and prose (the machine's voice), IBM Plex Mono for data (IDs, routes, timestamps, statuses), Special Elite typewriter for anything a person wrote.
- **Why.** Product rules say evidence first and inferred is not observed. Type is the cheapest way to show at a glance whether text came from the crawler, the assistant or a person.
- **Consequences.** Special Elite is never used for machine output, placeholders or decoration. All three fonts cover Polish (verified glyph by glyph: ą ć ę ł ń ó ś ź ż).

### D-04 · Expanded caps for short labels, sentence case for everything else — Accepted
- **Context.** Console banned tracked-out capitals. Salvage's signage feel comes from Archivo Expanded caps.
- **Decision.** Caps (Archivo 800, 125% width) for page titles, section and plate titles, field labels, primary buttons and nav, all at or under four or five words. Prose, chat, table content, long names and secondary buttons are sentence case.
- **Why.** Caps make short labels easy to scan; they make long text hard to read.
- **Consequences.** Long Polish process names used as titles take `.sy-case-normal`. Write HTML in sentence case and let CSS uppercase it, so screen readers don't spell words out.

### D-25 · Text floor is 11px — Accepted
- **Context.** Console allowed 10px captions.
- **Decision.** Nothing under 11px. Tags (500), kbd hints and legends (400) are 11px Plex Mono. Text inside a recorded-screen mock (`.sy-shot`) is part of the captured page and is exempt.
- **Why.** Tired eyes, and Plex Mono at 10px blurs on standard-density screens.

## Colour

### D-05 · One paint, one job — Accepted
- **Context.** Console's amber did two jobs (brand and "OK"), and in the redesign it would have done five (brand, primary, focus, active nav, needs you). Users couldn't scan for "what needs me".
- **Decision.** Every paint has exactly one meaning: marker = intent, manila = tags and human notes, blueprint = drawn not built, inspected = OK, coolant = active now, failure = failure. Steel, chalk and ash are neutral. See `03-colour-guide.md`.
- **Why.** On a busy screen, colour becomes a search tool: look for orange to find what needs you, look for blue to find what is only drawn.
- **Consequences.** Success is green, not brand. "Warning" doesn't exist as a colour: if a person must act it is *needs you* (marker); otherwise it is ash text with a word.

### D-24 · Failure red is #FF5A5F, not barn red — Accepted
- **Context.** The mission doc proposed barn red `#C0392B`, untested.
- **Decision.** `#FF5A5F`.
- **Why.** Barn red measures 3.42:1 on steel-900 and 3.18:1 on plates, so it fails body text. `#FF5A5F` measures 6.10 on ground and 5.12 on raised (hover).

### D-06 · Every status is shape + word, drawn in CSS — Accepted
- **Context.** In colour-blind simulation (Viénot deuteranopia/protanopia), OK vs failure and running vs to-be come out close in both hue and lightness. None of the three fonts contains ■ □ ✕ (checked against the font files), so Unicode glyphs would fall back to whatever font the OS has.
- **Decision.** `.sy-status` draws its shape with `::before`: filled = it happened or is happening, hollow = it didn't (yet), dashed corners = unconfirmed, cross = it broke. The word is always present.
- **Why.** Meaning survives colour blindness, forced-colours mode and greyscale printing, and renders identically on every OS.

### D-07 · Dashed means "not settled" — Accepted
- **Context.** Console and the mission doc already used dashed for pending or unobserved.
- **Decision.** A dashed line always means not settled: to-be, drafts, assistant proposals, inferred records, unobserved gaps, queued work. Blue (blueprint) is added when something was *drawn* by a person or the assistant.
- **Consequences.** Once a proposal is applied it turns solid (`.sy-proposal--applied`). Never use dashed lines for decoration.

### D-22 · The assistant's highlight gets a steel inner ring — Accepted
- **Context.** Recorded portal pages are often light. Marker orange on a light page measures 2.0:1, under the 3:1 needed for a meaningful outline.
- **Decision.** The highlight is a marker outline plus a 2px steel ring inside it, a 12% marker tint and a "Marked by assistant" label.
- **Why.** The steel ring gives 16:1 against any light page, and the orange still reads as "the assistant's attention".

## Shape and texture

### D-08 · Record IDs are manila tags — Accepted
- **Context.** Traceability is a product rule; IDs (SCR-001, AMD-001, CAP-005, run ids) are how people follow a line back to evidence.
- **Decision.** Every record ID renders as `.sy-tag`: manila, cut corner, punched hole, Plex Mono, linked to the record. IDs keep their real case.
- **Why.** IDs become physical, findable, clickable objects. The cut corner is the only angle in the system, so a tag can't be mistaken for a button.

### D-09 · Humans type, machines print — Accepted
- **Decision.** Notes, annotations and amendment text are `.sy-note`: Special Elite on manila, with author and time in `.sy-note__by`. An annotation is joined to its target by a dimension line (`.sy-annot`).
- **Why.** It is the strongest possible signal of who wrote what, and the visual voice of the brand.

### D-10 · Square everything, no shadows — Accepted
- **Decision.** Radius 0 everywhere. Elevation comes from lightness steps (ground → well → plate → raised), never from shadows. Console's "round means alive" dot is replaced by a pulsing square.
- **Why.** One shape grammar. Shadows on dark UIs smear and add nothing.

### D-11 · Grid on the ground, plates solid — Accepted
- **Decision.** The 24px yard grid (chalk at 3.5%) is drawn on the page background only. Every panel is a solid plate.
- **Why.** Texture gives character, but the mission doc's rule stands: no grain, texture or grime over data.

### D-12 · Scanlines and phosphor glow are retired — Accepted
- **Context.** They are Console's (felix's) identity, a CRT terminal. The product owner liked them, but chose Salvage original.
- **Decision.** No scanlines and no glow. The yard grid is the only texture.
- **Consequences.** If they are ever wanted back, that is direction C2 (Salvage in Console colours), a separate decision.

## Product and IA (from the redesign wireframes)

### D-13 · Chat first, and on every page — Accepted
- **Grievance.** Chat was buried in a tab.
- **Decision.** Home *is* the assistant for the picked portal. On every other page "Ask the assistant" (Ctrl J) opens a docked drawer with a context switch: **This page** (sends the screen, its elements, amendments and process) or **Whole yard** (the portal).

### D-14 · The portal is the project context — Accepted
- **Decision.** The portal is picked once in the header. Five tool-shaped top tabs become seven portal-scoped sections: Home, Processes, Screens, Docs, Review, Scans, Settings. Nothing is removed; everything moves to where you'd look for it (see wireframe 01-IA).

### D-15 · Processes are a workspace; saving never overwrites — Accepted (see Open O-1; full spec in `10-processes.md`)
- **Decision.** Processes have variants (A as-is, B to-be) and revisions. The assistant drafts groupings that you accept, edit or dismiss. Editing the to-be is a draft over the as-is; saving creates a new revision; restore creates a new revision; a conflict notice appears when someone saved first.

### D-16 · Credentials only when needed — Accepted
- **Decision.** Credentials live in Settings, collapsed by default, values never shown (`.sy-vault`). The assistant asks for one in chat only when a scan needs it.

### D-17 · One review inbox — Accepted
- **Decision.** Decisions about **records** land in Review: re-anchoring amendments, assistant proposals for records or amendments, draft records to confirm, and edit conflicts. The Review nav count is that inbox only.
- **Home "Needs you"** is wider: it aggregates everything that waits for a person, with each row linking to where it is resolved (Review items → Review, drafted process groupings → Processes, a stopped scan → Scans). Its total can therefore be larger than the Review count.

### D-18 · Attention budget: at most one primary, at most one intent plate — Accepted
- **Decision.** At most one `.sy-btn--primary` and at most one `.sy-plate--intent` per view. A view may have none (state boards, history). The main action inside a card uses `.sy-btn--strong`.
- **Why.** Orange only works as "look here" while it stays rare.

## Motion

### D-19 · Two loops, nothing else — Accepted
- **Decision.** The running status square pulses (1.3s), and the loading caret blinks (1s step). Hover changes background (rows, buttons) or text colour (links, tabs, hints) in 120ms; nothing moves. Under `prefers-reduced-motion` everything stops. Console's mark bounce is dropped, because the wordmark is text.

## Engineering

### D-20 · Fonts are self-hosted and subset — Accepted
- **Decision.** WOFF2 files ship in `design-system/fonts/` (≈250 KB total), subset to Latin, Latin-1 and Latin Extended-A plus UI symbols. No Google Fonts requests.
- **Why.** Privacy, air-gapped enterprise networks, and an offline local console.

### D-21 · Plain CSS, ARIA-driven state, data-status enums — Accepted
- **Context.** The console is server-rendered (forms, 303 redirects, query-param tabs).
- **Decision.** One framework-agnostic stylesheet, `sy-` prefix, BEM-ish names, cascade layers. State comes from ARIA attributes (`aria-current`, `aria-pressed`, `aria-selected`, `aria-invalid`, `aria-busy`); enums from `data-status`.
- **Why.** If the state isn't announced to assistive tech, it isn't styled either, so accessibility and visuals can't drift apart. Works in templates and in any component framework.

## Brand

### D-23 · New wordmark; existing pixel mark recoloured; tag icon for small sizes — Accepted
- **Decision.**
  - **Wordmark:** `[MUD]PUPPY` (marker paint block on MUD, chalk PUPPY, Archivo Expanded 800), always live text. It replaces `mudpuppy://console`.
  - **Mark:** the existing pixel mudpuppy on its survey grid, recoloured pixel by pixel to Salvage tokens. It is used on brand surfaces only, not in the app header.
  - **Tag icon:** a marker tag with a punched hole, used under 24px (favicon). This closes the mission doc's open item for a small mark.

## Map runs (`11-map-runs.md`)

### D-26 · The map is a graph of buttons over decorative edges — Accepted
- **Decision.** Nodes are real `button`s positioned from the server's layout; edges are an `aria-hidden` SVG behind them. A List view carries the same facts. Several pages or states collapse into a **deck**: offset plates drawn with hard, unblurred offsets. They depict stacked plates, not elevation, so D-10 still holds.
- **Why.** Clickable nodes are the point (they steer the crawler), so they must work with a keyboard and a screen reader. A canvas or SVG-only graph would not.

### D-27 · Red means the crawler failed, not that the portal showed an error — Accepted
- **Decision.** An error page, toast or timeout that probing provoked or recorded is a **state** with a neutral chip ("technical"). Failure red is kept for our own failures: a stopped scan, a failed action, replay divergence.
- **Why.** One paint, one job (D-05). Probing produces many error states on purpose; painting them red would make a healthy probe run look broken.

### D-28 · Marks are a person's intent, the replay path is a drawing — Accepted
- **Decision.** Marks (Start here, Focus, Probe, Retry, Recheck, Skip) are marker tags on the nodes and collect in the Next scan plan, the view's one intent plate. The path the next scan will replay is a dashed blueprint edge.
- **Why.** Marks are instructions from a person, like "needs you"; the planned path is a to-be that hasn't happened yet.

### D-29 · In the UI a run is a "scan" — Accepted
- **Decision.** Screens say scan ("Plan next scan", "Resume scan"). Specs and the API say run. The scan types are Full map, Continue frontier, Focused, Probe forms, Recheck and Retry path.

## MudPuppy 2.0 (`12-v2-ux.md`)

### D-30 · Grouped navigation; Changes and Rules are sections; Map moves under Screens — Proposed
- **Decision.** Nav groups: Home · Changes · Review / Portal model: Processes · Screens (List · Map) · Rules · Docs / Machine: Scans · Settings.
- **Why.** "What changed" is the BA's first job after a release and needs its own filters and timeline. Rules are read across processes by the migration team. In 2.0 the map is the model, not a scan.

### D-31 · One time control: As of in the header, From on Changes — Proposed
- **Decision.** The header's **As of** (Now · a release · a scan) sets the model every page shows; Changes adds a **From**. No other date pickers.
- **Why.** Time is first-class but must not multiply controls. Every view stays linkable (`as_of`, `from` in the URL).

### D-32 · Review opens on Needs you; Explained automatically is one tab away — Proposed
- **Decision.** Review keeps its name (v1 D-17) with tabs Needs you · Explained automatically · Decided. Only the Needs you count is orange.
- **Why.** "Reviewing should be an option" (owner, 18 Oct) and "nothing hidden" (brief §4) both hold.

### D-33 · Overturned is manila — Proposed
- **Decision.** `data-status="overturned"` draws a manila square, always next to the person's reason in a `.sy-note`.
- **Why.** Manila already means "a person's hand" (tags, notes). An overturn is a person replacing the machine; it must look different from Confirmed (green) and from the system's own inference (blueprint).

### D-34 · Explained automatically is blueprint (inferred) — Proposed
- **Decision.** An automatic explanation uses `data-status="inferred"`; it turns green only when a person confirms it.
- **Why.** It is the system's inference, like any other drawn/proposed content (D-07). Green would claim certainty nobody gave.

### D-35 · Decision tables: inputs ║ result, tests under the table, same shape in the export — Proposed
- **Decision.** `.sy-table--decision` with a double weld before the result columns, provenance and hit policy under the table, boundary tests and history below; the export is the same table in Markdown plus one sentence.
- **Why.** BAs read the conditions; developers read the same rows as a spec; testers read the boundaries. One shape for all three.

---

## Open items (need a product decision)

- **O-1 · Product rule 4 "As-is only" vs the to-be workspace.** The mission doc says MudPuppy describes the current state and does not propose the target design. The redesign, at the product owner's request, adds drawing the to-be, variants and a change spec. Update the rule (for example "MudPuppy *records* the as-is; people *draw* the to-be in it; the assistant only proposes"), or scope the to-be features out.
- **O-2 · Wordmark scope.** Use `[MUD]PUPPY` alone, or `[MUD]PUPPY console` when other surfaces exist (CLI, docs site)?
- **O-3 · Glossary entry point.** The wireframes had a "Glossary and BA wiki" nav link. The screens fold it into the header "?" button. Confirm this.
- **O-5 … O-8 · Processes.** Who may mark live, what "Migrated" means per portal, export formats, auto-documenting accepted suggestions. See `10-processes.md` §14.
- **O-M1 … O-M5 · Map runs.** Technical probes outside sandbox, captchas and one-time codes, where test data per persona lives, the probe budget, approval for rechecks on production. See `11-map-runs.md` §12.
- **OV-1 … OV-5 · MudPuppy 2.0.** Who may overturn, A/B cookies into Settings automatically, retention of retired screens, Decided per portal or global, decision-table export formats. See `12-v2-ux.md` §12.
- **O-4 · Run-id casing in the UI.** Ids are shown as stored (lowercase hex, e.g. `01a110d5`). Confirm that no uppercase display convention exists elsewhere (docs exports, CLI).
