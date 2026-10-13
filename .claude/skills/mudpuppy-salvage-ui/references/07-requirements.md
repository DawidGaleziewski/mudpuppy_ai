# 07 · Frontend requirements

Testable requirements for implementing Salvage Yard in the MudPuppy console. IDs are
stable; cite them in PRs. Priority: **M** must, **S** should, **C** could.
Screens referenced are in `screens/`; behaviour comes from the redesign wireframes.

## A. Visual system

| ID | P | Requirement | Acceptance |
|---|---|---|---|
| FE-V01 | M | The console loads `tokens.css`, `fonts.css` and `salvage.css` in that order, self-hosted, before any app CSS. | Network panel shows no third-party font or CSS requests. |
| FE-V02 | M | Components use **role** tokens only; no hex, rgb or named colours in templates or app CSS. | `migration/find-old-styles.sh` and stylelint report 0 violations. |
| FE-V03 | M | Typography follows the three voices: Archivo (UI and prose), IBM Plex Mono (IDs, routes, timestamps, statuses), Special Elite (human-written text only). | Spot-check: no machine-generated text in `.sy-note`; every record ID in mono. |
| FE-V04 | M | No text under 11px; prose ≤ 68ch line length (chat paragraphs included). | Computed font-size ≥ 11px across all screens, excluding the recorded-page mock inside `.sy-shot` (in production that is an image). |
| FE-V05 | M | Radius 0 and no box-shadows, except the assistant highlight's steel ring. | stylelint rule passes. |
| FE-V06 | M | The page ground shows the 24px yard grid; plates are solid. | Visual check against screenshots. |
| FE-V07 | M | At most one `.sy-btn--primary` and at most one `.sy-plate--intent` per view. | Automated DOM check in e2e tests. |
| FE-V08 | M | Every status renders as `.sy-status[data-status]` with a word, from a single backend→enum mapping. | Unit test for the mapping (`migration/status-map.csv`). |
| FE-V09 | M | Every record ID (SCR-, AMD-, CAP-, NFR-, BR-, run ids, revision labels) shown as data renders as `.sy-tag` linked to the record, in its stored case. Exempt: IDs inside free text a person typed (chat messages, notes), inside `.sy-mark__label`, `.sy-note__by`, and error references (ERR-…). | DOM check: ID patterns outside `.sy-tag` and the exempt containers = 0. |
| FE-V10 | M | Designed, drafted, inferred and proposed content is dashed blueprint; applied content turns solid. | Visual check against screens 01, 02, 04–06. |

## B. Shell and navigation

| ID | P | Requirement | Acceptance |
|---|---|---|---|
| FE-N01 | M | The header on every page has the wordmark, portal picker, search, assistant status, Ask the assistant and help, in that order. | Snapshot test of the header partial. |
| FE-N02 | M | The portal picker is the project context; switching keeps the current section and loads its data for that portal. Switching happens on an explicit action (menu of portal links, or select + "Switch"), never on change of a select (WCAG 3.2.2). | e2e: switch portal on Processes → stays on Processes. |
| FE-N03 | M | The side nav has seven sections (Home, Processes, Screens, Docs, Review, Scans, Settings) with `aria-current="page"` on the current one. | e2e + axe. |
| FE-N04 | M | The Review nav item shows a marker count of open decisions; other counts are muted. | Count equals Review inbox total. |
| FE-N05 | M | Ctrl K focuses search; Ctrl J toggles the assistant drawer; Esc closes the drawer and returns focus. | Keyboard e2e. |
| FE-N06 | S | Under 1024px the nav becomes a horizontal strip and the drawer stacks; under 640px a single column, with no page-level horizontal scroll. | Screenshots at 1280, 1023 and 390. |

## C. Assistant

| ID | P | Requirement | Acceptance |
|---|---|---|---|
| FE-A01 | M | Home renders the assistant as the main column (log, suggestions, composer with scan line, Send). | Matches `01-home.png`. |
| FE-A02 | M | Every non-Home page can open the docked drawer with a context switch, **This page** (default) or **Whole yard**. | Matches `02-screen-with-assistant.png`. |
| FE-A03 | M | "This page" sends the screen, its elements, amendments and process with the message; the drawer shows them as tags. | Network payload contains `context: "page"` plus IDs. |
| FE-A04 | M | Assistant proposals render as `.sy-proposal` and change nothing until Apply. Apply creates a new revision and shows the applied state with Undo. | e2e: Apply → new revision row; Undo → another new revision (restore, not delete). |
| FE-A05 | M | When a scan needs a credential, the assistant asks in chat with a vault field; the value is never echoed or rendered again. | e2e: no secret in DOM or logs after submit. |
| FE-A06 | M | If the chat service is down (503), the drawer shows the failure state with the reference ERR-…; read-only pages keep working. | Kill the chat service → pages render and the drawer shows the failure state. |
| FE-A07 | S | Answers can highlight an element on a recorded screen (`.sy-mark--overlay` positioned from the element's box) and link to pages. | Visual check (02). |
| FE-A08 | S | If the page changed underneath the conversation (a new observed revision), the drawer says so and offers to switch the context to the new revision or compare the two. | State 5 in `03-assistant-states.png`. |

## D. Processes, screens, review, scans, settings

| ID | P | Requirement | Acceptance |
|---|---|---|---|
| FE-P01 | M | Processes lists saved processes and the assistant's suggested groupings (inferred) with Accept / Edit first / Dismiss. | Matches `04-processes.png`. |
| FE-P02 | M | The to-be is edited as a draft over the as-is; Save creates `B rN+1`; Discard keeps the last revision. | e2e. |
| FE-P03 | M | Compare shows a step diff (unchanged, removed, merged, added) and a generated, editable change spec; Export spec downloads it. | Matches `06-process-compare.png`; export file contains as-is, to-be, delta, records, migration cut. |
| FE-P04 | M | History shows variants, revisions, which variant is live per environment, and Restore as a new revision. | Matches `07-process-history.png`. |
| FE-P05 | M | A conflict notice appears when someone saved a newer revision than the draft's base; nothing is overwritten. | Concurrency e2e with two sessions. |
| FE-S01 | M | Rescans add observed revisions (r1, r2…) to a screen instead of replacing it. | Data + UI check (08). |
| FE-S02 | M | Amendments carry forward; if their element disappears they are flagged for re-anchoring (needs you), never deleted. | e2e with a fixture where the element is removed. |
| FE-R01 | M | Review lists every open decision (re-anchor, proposals, records to confirm, conflicts) with counts and a detail pane. | Matches `09-review.png`. |
| FE-C01 | M | Scans shows the running scan's progress (`role=progressbar`), pages, queue, and history with what changed. | Matches `10-scans.png`. |
| FE-C02 | M | Chat shows only a one-line scan status that links to Scans. | `01-home.png` (composer). |
| FE-T01 | M | Settings: environments table, add or change form, Revoke with confirmation ("Runs already recorded are kept."). | Matches `11-settings.png`. |
| FE-T02 | M | Credentials are collapsed by default and values are never shown. | DOM check. |

## E. Non-functional

| ID | P | Requirement | Acceptance |
|---|---|---|---|
| FE-Q01 | M | WCAG 2.2 AA. | axe-core: 0 serious or critical issues on every screen; manual keyboard pass. |
| FE-Q02 | M | Visible focus on every interactive element (2px marker, 2px offset). | Keyboard pass. |
| FE-Q03 | M | Interactive targets ≥ 24px everywhere (WCAG 2.5.8); under `pointer: coarse` every control ≥ 44px. | Automated check at desktop and with touch emulation. |
| FE-Q04 | M | `prefers-reduced-motion` stops the pulse and the caret; nothing else animates. | Emulated media test. |
| FE-Q05 | M | Forced-colours mode keeps statuses, tags and focus visible. | Manual check in Windows High Contrast. |
| FE-Q06 | M | Polish text renders in the intended fonts (no fallback glyphs) in all three voices. | Visual check on "Oblicz składkę", "Ubezpieczeń", "Przedłuż polisę". |
| FE-Q07 | M | UI language English; times UTC with Z; browser-native validation messages allowed (current NFR-003). | Spot-check. |
| FE-Q08 | S | CSS ≤ 15 KB gzip; fonts ≤ 300 KB; Archivo preloaded; `font-display: swap`. | Lighthouse. |
| FE-Q09 | S | Works offline on a local console (no CDN). | Disconnect the network → full styling. |
| FE-Q10 | M | Supported browsers: Chrome/Edge 111+, Firefox 115+, Safari 16.4+. | Smoke test. |
| FE-Q11 | S | Visual regression: baselines are generated from the running app with fixture data at 1280px and reduced motion, after a designer signs them off against `screenshots/screens/*.png`. | CI diff ≤ an agreed threshold. |
| FE-Q12 | M | The console store stays read-only from the UI except the existing write endpoints (amendments, scope, chat, credentials, settings). | Unchanged API surface. |
