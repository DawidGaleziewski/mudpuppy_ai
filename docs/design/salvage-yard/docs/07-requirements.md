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
| FE-P06 | M | Assistant suggestions carry name (from link text), path, screen count and a Why line; locked ones say what blocks them. Nothing is saved until accepted (`10-processes.md` 6.1, PR-09, PR-10). | Regroup → suggestions appear dashed; DB has no new process. |
| FE-P07 | M | Accept creates the process and A r1; Edit first opens the prefilled scope; Dismiss hides it and is remembered (6.2). | e2e for all three; dismissed suggestion not re-suggested. |
| FE-P08 | M | New process keeps BR-011: name required ≤ 200 and unique, persona required, exactly one start and one end, notes ≤ 2000; "New process from these" from loose screens (6.3, PR-01, PR-02). | Form validation e2e; toast "Saved · “Test process”, 2 screens." |
| FE-P09 | M | Only scans create A revisions; a changed path or first end reached → A r(n+1); "End not reached" marker when the end was never observed (6.4, PR-03, PR-11). | Fixture rescan creates A r2; B untouched. |
| FE-P10 | M | Diff pairs steps by identity → built-from → screen/route, labelling Unchanged, Changed, Merged, Split, Added, Removed, Moved (section 8). Change spec sections are editable and exportable as Markdown. | Unit tests on the pairing; export contains all seven sections. |
| FE-P11 | S | Live per environment is detected by scans (match against each variant) or marked manually with confirmation; a later scan overrides a manual mark (6.11, PR-13). | Fixture: scan walking B sets "B live in sandbox". |
| FE-P12 | M | Existing chat scopes migrate to processes (source `migrated_scope`, A r1 from start/end/selected screens, comments → annotations); the workflow step "Sort into processes" is done when one process is scoped (PR-17). | "Test process" appears as Scoped with A r1 of 2 steps. |
| FE-P13 | M | Revisions are immutable; restore, rebase and accept create new revisions; processes are archived, never deleted (PR-05, PR-16). | No UPDATE/DELETE on revision rows in the API layer. |
| FE-S01 | M | Rescans add observed revisions (r1, r2…) to a screen instead of replacing it. | Data + UI check (08). |
| FE-S02 | M | Amendments carry forward; if their element disappears they are flagged for re-anchoring (needs you), never deleted. | e2e with a fixture where the element is removed. |
| FE-R01 | M | Review lists every open decision (re-anchor, proposals, records to confirm, conflicts) with counts and a detail pane. | Matches `09-review.png`. |
| FE-C01 | M | Scans shows the running scan's progress (`role=progressbar`), pages, queue, and history with what changed. | Matches `10-scans.png`. |
| FE-C02 | M | Chat shows only a one-line scan status that links to Scans. | `01-home.png` (composer). |
| FE-T01 | M | Settings: environments table, add or change form, Revoke with confirmation ("Runs already recorded are kept."). | Matches `11-settings.png`. |
| FE-T02 | M | Credentials are collapsed by default and values are never shown. | DOM check. |

## D2. Map runs (spec: `11-map-runs.md`)

| ID | P | Requirement | Acceptance |
|---|---|---|---|
| FE-M01 | M | Scans ▸ Map shows nodes, edges and states for the picked portal, with scan, persona and layer filters, a legend, and a Graph / List toggle (the list carries the same facts). | Matches `12-map-graph.png`; List view lists every node with kind, status, queue and marks. |
| FE-M02 | M | Nodes are `button`s with an `aria-label` that states route, state and marks. Click selects (`aria-pressed`) and fills the inspector; Shift-click adds to the selection; arrow keys move along edges; `M` opens the marks. | Keyboard-only pass on the map; screen reader reads a node's route, status and marks. |
| FE-M03 | M | Marks (Start here, Focus, Probe, Retry, Recheck, Skip) can be set on nodes and edges, show as `.sy-tag--intent` on the node, collect in the Next scan plan (remove one, clear all), persist per portal until used or cleared, and pre-fill Plan next scan. | e2e: mark → tray count +1 → reload → still there → Plan next scan shows it. |
| FE-M04 | M | Steps rendered on the same URL are separate states ("step 1, 2, 3") inside a route group; collapsed, they show as a deck with a count. | Fixture: a React multi-step form produces 3 states on one route (`13-screen-states.png`). |
| FE-M05 | M | Probing records validation, branch and technical outcomes as states of the step, with evidence (screenshot, messages, network), deduplicated by fingerprint. Technical states use neutral chips, never failure red. | Matches `13-screen-states.png`; probing twice adds no duplicate states. |
| FE-M06 | M | Technical probes are browser-side simulations and are off on production unless the portal allows them; submit probes respect the environment limit; actions whose side effects aren't allowed are recorded as blocked, never probed. The safety callout shows the rule for the current environment. | Unit tests on the probe planner per environment limit; production run has no technical probes. |
| FE-M07 | M | Every state has a checkpoint. A scan can start by replay; each replayed step is checked against its fingerprint, and a mismatch stops the scan with "Replay diverged at step N" and a diff. | Fixture with a changed page between runs stops with the diff. |
| FE-M08 | M | A stopped scan can be resumed from the last good checkpoint as a new scan linked "continues <id>", keeping the stopped scan's queue. | `15-run-recovery.png`; queue count carried over. |
| FE-M09 | M | A failing path can be retried as attempts, one variation each (wait longer, record without submitting, other inputs, skip); attempts are listed with results; the path is solved when one passes. | e2e on a fixture with a missing selector. |
| FE-M10 | M | Plan next scan offers Full map, Continue frontier, Focused, Probe forms, Recheck and Retry path, shows the start points with their replay recipes, the excluded nodes, the probes, persona, environment and limits, and a plain "What will happen" preview before Start scan. | Matches `14-plan-run.png`. |
| FE-M11 | M | Reconciliation groups different outcomes of one graph point, shows evidence per outcome and the reasons checked in order, and records a verdict per outcome proposed by the agent (inferred) and confirmed by a person in Review. | Matches `16-reconcile-states.png`; Review gets a "Differing states" kind. |
| FE-M12 | M | Documentation follows `11-map-runs.md` §7.5: a step is documented by its main state; an error page is never the step; an error-only step is "not observed" with an open question and a recheck. | Generated doc for the fixture lists the 503 under environment issues, not as a step. |
| FE-M13 | S | Validation messages, branches and technical states produce inferred rule, process-variant and NFR candidates, linked to their evidence, that land in Review. | Probe fixture creates candidates with evidence links. |

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
