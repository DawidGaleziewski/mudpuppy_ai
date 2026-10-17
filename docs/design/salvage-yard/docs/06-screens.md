# 06 · Screens: wireframes → detailed design

Every screen exists three ways:

| What | Where | Use it for |
|---|---|---|
| Wireframe (grayscale, interactive) | `wireframes/NN-Name.dc.html` (opens via `wireframes/support.js`; fonts fall back offline) and `screenshots/wireframes/NN-Name.png` | Structure and behaviour agreed in the redesign |
| Detailed design (Salvage Yard, static HTML) | `screens/NN-name.html` | Exact markup and classes to implement from |
| Screenshot (1280px) | `screenshots/screens/NN-name.png` | Visual reference, review and visual-regression baseline |

Wireframe numbers are offset by one because wireframe 01 is the IA overview:

| Screen | ← Wireframe |
|---|---|
| 01-home | 02-Main |
| 02-screen-with-assistant | 03-ChatDrawer |
| 03-assistant-states | 04-ChatStates |
| 04-processes | 05-Processes |
| 05-process-edit | 06-ProcessDetail |
| 06-process-compare | 07-ProcessCompare |
| 07-process-history | 08-ProcessHistory |
| 08-screen-detail | 09-ScreenDetail |
| 09-review | 10-Review |
| 10-scans | 11-Runs |
| 11-settings | 12-Settings |
| 12–16 (map runs) | none: designed straight in Salvage Yard (canvas page "Map runs", boards MapGraph, MapStates, MapRunPlan, MapRecovery, MapReconcile) |

The screens show different moments of the same project: Home is before the first grouping is
accepted (1 saved process, 4 drafted), Processes is just after accepting "Oblicz składkę OC/AC".
All screens use real scan data from the `reference-insurer` portal (Towarzystwo Ubezpieczeń
Wzorcowych, sandbox) and, for Settings, `wikipedia`. Keep that data in fixtures for tests.

## Information architecture (wireframe 01-IA)

**Before:** five tool-shaped top tabs; chat buried; credentials always on screen.
**After:** the portal is picked once in the header (project context), and seven portal-scoped sections sit in the side nav. Nothing is removed.

| Section | Contains | Screen(s) |
|---|---|---|
| Home | The assistant for this portal, workflow steps, needs you | 01 |
| Processes | Process list, AI groupings, to-be editing, compare, history | 04, 05, 06, 07 |
| Screens | Recorded screens, revisions, amendments, assistant drawer | 02, 03, 08 |
| Docs | Generated BA documentation (not redesigned in this package) | — |
| Review | One inbox for every decision | 09 |
| Scans | Live monitor and history | 10 |
| Settings | Environments, credentials, personas, crawl rules, data store | 11 |

Global, on every page: search (Ctrl K), assistant status, **Ask the assistant** (Ctrl J), help and glossary (?).

---

## 01 · Home: chat first — `screens/01-home.html`
- **Grievance solved:** chat was buried in a tab. Home *is* the assistant for the picked portal.
- **Regions:** page head (portal, legal name, environment, scan counts, last scan status) → assistant plate (conversation picker, New conversation, log with suggestion chips, the assistant's **drafted** process groupings as a dashed blueprint plate, composer with the scan line and **Send**) → side column: *Where this portal is* (5 workflow steps, the current one tinted with **needs you**), *Needs you* (the one intent plate: stopped scan, draft records to confirm, drafted processes), *Processes*.
- **Primary:** Send.
- **Acceptance:** the drafted groupings stay dashed and "Inferred · not saved" until accepted in Processes; the scan line links to Scans; each Needs-you row links to where it is resolved (records → Review, drafted processes → Processes, stopped scan → Scans), see D-17.

## 02 · A screen with the assistant drawer open — `screens/02-screen-with-assistant.html`
- **Grievance solved:** the assistant is available on every page, with a **context switch**.
- **Regions:** compact nav → screen page (breadcrumb, title "Ubezpieczenia dla Ciebie", route `/`, cluster, status, revision, recorded screenshot with the **Marked by assistant** highlight on "Na skróty") → `aside.sy-drawer`: header + close, context switch **This page / Whole yard** (This page shows the screen, AMD-001 and CAP-005 tags), chat with a **proposed change** (AMD-001 r1 → r2, target "whole screen" → link "Zaloguj się", the amendment note in typewriter, Apply as r2 / Pick another element / Discard), composer.
- **Behaviour:** Ctrl J opens; Esc closes; toggling the context swaps tags, summary and placeholder (script included).
- **Acceptance:** applying creates a new amendment revision (never overwrites) and shows the applied state with Undo (see 03).

## 03 · Assistant drawer: every state — `screens/03-assistant-states.html`
Six states side by side, each at real drawer width:
1. **Empty:** what the assistant can do here, plus suggestions.
2. **Working:** caret loading, running status, Stop.
3. **Credential needed:** a vault field right in the chat; the value is never shown after saving.
4. **Change applied:** solid green, Undo (restores r1 as r3).
5. **Page changed underneath you:** a new revision (r2) was observed, so the answer may be stale; switch the context to r2 or compare r1 and r2.
6. **Assistant not running:** failure state with the reference recorded in the alert (ERR-01M48DVAT5E1GS5K42CTCTTDTJ in the fixture), the start command (a placeholder: fill it from the deployment's alert text), Retry, and a note that the unsent message is kept and read-only pages keep working (the current console's 503 behaviour).

## 04–07 · Processes
How the whole process feature works (lifecycle, flows, rules, diff, data model, API, migration of today's scope form) is in **`10-processes.md`**, with a visual overview in `10-processes-flow.html`. The four screens below are its UI.

## 04 · Processes: list and AI suggestions — `screens/04-processes.html`
- **Grievance solved:** process scope doesn't belong in chat; it gets its own workspace.
- **Regions:** process table ("Test process", the saved scope `/` → `/faq`, persona guest; "Oblicz składkę OC/AC" just accepted) → stage legend → the assistant's **suggested groupings** as dashed blueprint plates with Accept / Edit first / Dismiss → *In no process* (loose screens to assign).
- **Primary:** New process.
- **Acceptance:** accepting turns a suggestion into a saved process (solid); dismissing keeps it in history.

## 05 · Process: editing the to-be — `screens/05-process-edit.html`
- **Regions:** variant switch (A · As-is r1 observed / **B · To-be r1 draft open** / + Variant) → draft bar ("Draft of B r2 · 3 changes since B r1 · autosaved 22:41Z · only you see this draft", Discard draft, **Save as B r2**) → section tabs (Flow, Screens, Requirements and rules, Amendments, Change spec) → **B flow**: step cards (1 start unchanged; 2 *changed* and selected, built from 2 as-is steps; 3 end *added*; + Add step) → "Removed from A" strip → ghosted **A as-is** flow with "end not reached" → step inspector (built from, annotations as typewriter notes, new annotation, Ask the assistant about this step, Remove step from B).
- **Rules shown:** drawn steps are dashed blueprint; the selected one has a 2px blueprint edge; saving creates a revision; nothing is overwritten.

## 06 · Process: compare A and B — `screens/06-process-compare.html`
- **Regions:** left/right variant pickers (to-be picker dashed) → legend → diff table (unchanged; *removed* `/ubezpieczenia/samochod`; *2 steps merged into 1* `/oc-ac/wycena`; *added* `/oc-ac/oferta`; "end not reached" needs you) → step-2 annotation with dimension line → **change spec** plate (scope, as-is, to-be, delta, affected records as tags, migration cut `/ubezpieczenia/samochod`, `/kalkulator/*` → `/oc-ac/*` with rollback, open question callout).
- **Primary:** Export spec. Also Save to Docs.
- **Why it matters:** this is the document handed to the team that cuts the process out (for example into a microfrontend).

## 07 · Process: history, variants, live per environment — `screens/07-process-history.html`
- **Regions:** conflict notice ("The reviewer saved B r3 while your draft was based on B r2. Your draft is kept; nothing was overwritten." with Compare / Rebase) → *Which variant runs where* (sandbox: live A r2, swap "Mark B as live…"; staging and production not configured) → scan-by-scan timeline grid (A, B, live in sandbox) → revisions per variant (`.sy-timeline`, Restore as r4).
- **Note:** scans 1–3 are real; scans 4–6 and B's revisions are an illustrative future (marked with a dashed roadmap callout).

## 08 · Screen: observed revisions and amendments — `screens/08-screen-detail.html`
- **Grievance solved:** rescans add **observed revisions** (r1, r2, r3) instead of replacing the screen.
- **Regions:** page head with statuses and glossary hints → revision strip (r1 seen unchanged by scans 01a10eb9 and 01a110d5) → recorded screenshot mock with an amendment pin on "Zaloguj się" → amendment AMD-001 r2 (typewriter note, revision timeline) → Add amendment form (primary).
- **Rule:** amendments carry forward; if their element disappears they are flagged for **re-anchoring** (needs you, in Review), never deleted.

## 09 · Review inbox — `screens/09-review.html`
- **Grievance solved:** decisions were scattered. One inbox: re-anchor amendments (replaces "superseded"), assistant proposals, records to confirm, edit conflicts.
- **Regions:** filter tabs with counts → *Records to confirm* (the intent plate; CAP-005 selected) → empty states for the other groups → detail pane (evidence, Confirm rev 1 primary).

## 10 · Scans: live monitor and history — `screens/10-scans.html`
- **Regions:** live monitor for 01a110d5 (progress meter 171 / 400 steps, 17 pages, 113 queued, page map from `/` to `/kontakt`, Resume primary) → history table (01a1083f OK 320 steps · 01a10eb9 interrupted 84 · 01a110d5 interrupted 171) → *What changed* per scan, linking to Review.
- **Rule:** scan progress and the live map live here, not in chat. Chat shows only a one-line scan status that links here.
- **Links:** the map plate's "Open map" goes to 12; the stop reason's "Recover" goes to 15.

## 11 · Settings: environments and credentials — `screens/11-settings.html`
- **Grievance solved:** credentials were always on screen. They are now collapsed, never shown, and requested by the assistant only when a scan needs them.
- **Regions:** section links → environments table for **wikipedia** (production `https://www.wikipedia.org/` "only look, never submit"; staging `http://127.0.0.1:4010/` "fill and submit forms (everything)"; sandbox not configured), add-or-change form (Save environment primary), Revoke (danger, confirm dialog: "Runs already recorded are kept.") → Credentials (`details` collapsed, "none stored · values are never shown") → personas → crawl rules (robots.txt) → data store (read-only SQLite path).


## 12–16 · Map runs

How mapping works now: what the crawler records beyond the happy path, how to restart or narrow a scan without starting from `/`, how nodes steer the next scan, and how the BA agent reconciles a screen that came out differently. Spec: **`11-map-runs.md`**. In the UI a run is called a **scan**.

### 12 · Map: graph, inspector, marks — `screens/12-map-graph.html`
- **Need:** a graph of what was mapped, and nodes that steer the crawler.
- **Regions:** page head (17 pages, 113 queued, 01a110d5 stopped at `/kontakt`) → Scans · **Map** · Server activity → filters (scans, persona, layers, Graph / List) → **graph** (`.sy-graph`): `/`, a collapsed family deck (+10 pages), Samochód, `/porownanie`, `/kontakt` (failed ✕ 01a110d5), `/logowanie`, the `/kalkulator/kierowca` route group with step 1 → step 2 → step 3 (not reached), step 2's validation and technical states, the gap after `/kontakt`, `/moje-polisy` (blocked) → legend + keyboard hint. Side: **inspector** for the selection (screen, route, status, seen in, outcomes, checkpoint, six mark buttons) and the **Next scan plan** (intent plate, one row per marked node, Remove, Clear all, Plan next scan primary).
- **Rules:** nodes are buttons; selection is `aria-pressed`; marks are `.sy-tag--intent` (a person's intent); the next scan's replay path is a dashed blueprint edge (`.sy-edge--planned`); a failure is red only where the crawler failed. The interactive version is the canvas board MapGraph.

### 13 · One URL, many states — `screens/13-screen-states.html`
- **Need:** record every state of a form step, not only the happy path.
- **Regions:** steps on this URL (step 1 · dane kierowcy, step 2 · opcje selected, step 3 not reached) → **what each input does** on step 2 (happy path, required empty, each option, HTTP 500, block request, delay 30 s, offline: what happened and what it is recorded as) → **coverage** matrix (probe group × step) → side: the selected outcome (error page shot, facts, how the BA agent uses it) and the probe-safety callout for the environment.
- **Rules:** technical states are neutral chips, not failure red (the portal's error, not ours). Inferred candidates (rule, variant, NFR) are dashed blueprint statuses.

### 14 · Plan next scan — `screens/14-plan-run.html`
- **Regions:** 1 scan type (six choice cards; Focused picked) → 2 where it starts (each Start here / Focus mark with its replay recipe, excluded Skip marks) → 3 probes (validation, branch, technical; allowed-on-sandbox callout; budget) → 4 persona, environment, limits. Side: **What will happen** (intent plate: plain steps, type, estimate, Save plan, Start scan primary).
- **Rule:** nothing runs until Start scan. Marks a scan uses are cleared when it finishes.

### 15 · Stopped scan: recover — `screens/15-run-recovery.html`
- **Regions:** where it stopped (failure plate: path `/ → /kontakt → ✕ next action · step 171`, stop reason with ERR reference and Copy, inferred failure class, last good checkpoint) → **pick up from here** (Resume primary · Retry this path · Skip it) → **attempts on this path** (timeline: #1 original failed, #2 wait longer failed, #3 draft with one variation) → side: failure classes and their defaults, other stopped scans.

### 16 · Why does this differ? — `screens/16-reconcile-states.html` (Review section)
- **Regions:** the graph point (`/` → "Oblicz składkę OC/AC" → outcomes A step 1, B 503, C sign-in) → evidence table → reasons checked in order (persona, input, temporary, session, flag, data) → documentation preview (drawn) → side: **verdicts** (intent plate, one select per outcome, Recheck first, Confirm verdicts primary) and the rule "An error page is never the step".
- **Rule:** the agent proposes (inferred), a person confirms. Review gets a fifth kind, **Differing states**.

---

## Screen-level acceptance criteria (all screens)
1. Matches the screenshot at 1280px within normal font-rendering differences.
2. No horizontal page scroll at 390px. Wide tables scroll inside their wrapper.
3. One h1; at most one primary button; at most one intent plate.
4. Every status is a `.sy-status` with a word. Every record ID is a `.sy-tag`. Every human-written text is a `.sy-note`.
5. Keyboard: everything reachable, visible focus, Esc closes drawer and dialogs, Ctrl K and Ctrl J work.
6. axe-core reports 0 serious or critical issues.

---

## Behaviour details (all screens)

| Topic | Spec |
|---|---|
| Shortcuts | Ctrl K (⌘K on macOS) focuses search; Ctrl J (⌘J) toggles the assistant. Call `preventDefault()` (both are browser shortcuts). On Home, Ctrl J focuses the composer instead of opening a drawer. Show the platform's key in `.sy-kbd`. |
| Ask the assistant button | `aria-expanded` reflects the drawer; `aria-controls` points at the drawer's id. Esc closes and returns focus to the button. |
| Context payload | Each message sends `context: "page"` or `"portal"` (shown as **This page** / **Whole yard**). "This page" carries: screen pages → screen id, revision, element ids, amendment ids, process id; process pages → process id, variant, revision, selected step; Review → the selected item; Scans → the selected scan. Settings has no page context: the drawer opens on Whole yard with This page disabled. |
| Running scan updates | Server-sent events (preferred) or polling every 5 s. Update `--value` and `aria-valuenow` together. Announce only state changes (started, stopped, finished) in a polite live region, never every step. |
| Save conflicts (05) | On Save, if the base revision is no longer the latest, show the conflict notice from 07 in place of the draft bar. **Rebase** creates a new draft on top of the latest revision and keeps your changes as proposals to re-apply. Nothing is overwritten. |
| Change spec (06) | "Generated · editable": each section is editable inline (textarea on click, saved as a new spec revision). **Export spec** downloads Markdown; **Save to Docs** stores it as a doc record. |
| Credentials (11, 03) | After saving, a credential shows only its state: name, environment, saved time, Replace and Delete. Never the value, not even masked. |
| Amendments | **Withdraw** marks an amendment withdrawn; it stays in history and can be restored as a new revision. Nothing is deleted. |
| Suggestions (04) | **Edit first** opens the grouping as a draft process; **Dismiss** hides it and records the dismissal in the process history, so it is never suggested again for the same screens. |
| Map (12) | Positions come from the server's layout; the client pans (and zooms) inside `.sy-graph`. Over ~150 nodes, collapse route families by default. Below 720px open in List view. Marks save immediately (optimistic) and persist per portal. |
| Probing and replay (13–15) | Live progress like any scan. "Replay diverged at step N" stops the scan and opens a reconciliation item with the expected and seen states. |
| Toasts | A toast with Undo stays until dismissed or the user navigates; other toasts auto-dismiss after at least 10 s. |
| Out of scope (restyle only, use the library) | Search results, the Screens list page, the "All portals" overview, Server activity (Scans tab), Docs sections, New portal, Run detail tabs. |
