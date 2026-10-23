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
| FE-V05 | M | Radius 0 and no box-shadows, except the steel rings that separate a marker outline from light content (the assistant highlight, focus on a picture button) and the hard plate offsets of a collapsed node deck. | stylelint rule passes. |
| FE-V06 | M | The page ground shows the 24px yard grid; plates are solid. | Visual check against screenshots. |
| FE-V07 | M | At most one `.sy-btn--primary` and at most one `.sy-plate--intent` per view. | Automated DOM check in e2e tests. |
| FE-V08 | M | Every status renders as `.sy-status[data-status]` with a word, from a single backend→enum mapping. | Unit test for the mapping (`migration/status-map.csv`). |
| FE-V09 | M | Every record ID (SCR-, PROC-, BR-, CAP-, NFR-, REQ-, UC-, DI-, GL-, ASM-, OQ-, FUP-, API-, AMD-, scan ids in their 13-character short form, revision labels) shown as data renders as `.sy-tag` linked to the record, in its stored case. Exempt: IDs inside free text a person typed (chat messages, notes), inside `.sy-mark__label`, `.sy-note__by`, and error references (ERR-…). | DOM check: ID patterns outside `.sy-tag` and the exempt containers = 0. |
| FE-V10 | M | Designed, drafted, inferred and proposed content is dashed blueprint; applied content turns solid. | Visual check against screens 01, 02, 04–06. |
| FE-V11 | M | A picture that opens larger is a `.sy-thumb-btn` (name = alt + ", enlarge"; icon always visible; "Enlarge" on hover, focus and touch); a picture with nothing larger is not a button. | `18-design-answers/01` acceptance. |
| FE-V12 | M | Pictures open in `.sy-dialog--wide`: fit width with scrolling by default, "Whole page" on request, full screen under 640px, Esc returns focus to the thumbnail. | `18-design-answers/02` acceptance. |
| FE-V13 | M | A screen's variants use `.sy-variants`; one variant uses the picture-left layout; `.sy-compare` only for before / after pairs. | One-variant and four-variant screens at 1280, 1024, 390. |
| FE-V14 | M | Graphs sit in `.sy-graphview` with the `.sy-graph__zoom` bar; height capped at the viewport below the header (520px embedded); phones open the map as a list. | `18-design-answers/04` acceptance. |
| FE-V15 | M | Scan ids: full UUID in data, URLs and exports; the 13-character short form on screen with the full id in the title and Copy where people act on it; third group only on a clash. | No 8-character scan ids on screen; Copy test. |
| FE-V16 | M | Chips on a selected nav item meet 4.5:1. | axe `color-contrast` 0 on wb-01…wb-10. |
| FE-V17 | M | Filmstrip items, map nodes and picture buttons have no `aria-label`; their visible text names them. | axe `label-content-name-mismatch` 0. |

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

## F. MudPuppy 2.0 (brief spec 039 · R-81; design `12-v2-ux.md`)

The brief's `UX-R` ids are the requirements; this table maps each to its screen and an acceptance check. P = brief priority.

| ID | P | Screen | Acceptance |
|---|---|---|---|
| UX-R01 | P1 | v2-01, v2-15 | Home shows latest release per part, last scan, changes since previous release (need you / auto), Needs you, processes explored / not. All portals shows the same per portal. |
| UX-R02 | P1 | v2-01, v2-15, v2-13 (6) | A portal without release markers shows the warning and a link to Settings ▸ Hints. |
| UX-R03 | P1 | v2-01 | One click to Changes and to Review ▸ Needs you. |
| UX-R10 | P1 | v2-02 | From = previous release / a date / a scan; To = As of; URL carries both. |
| UX-R11 | P1 | v2-02 | Changes grouped by process then screen; kinds: new screen, new/removed action, leads elsewhere, result changed, rule broke/changed, variant. |
| UX-R12 | P1 | v2-02 | Every change shows its explanation and Needs you / Explained automatically / Overturned. |
| UX-R13 | P1 | v2-03 | Before/after with the changed region marked, three modes, context diff with differing rows marked. |
| UX-R14 | P1 | v2-02, v2-01 | One timeline lane per portal part, rollouts drawn, scans lane, range bracket. |
| UX-R20 | P1 | v2-04 | One queue for findings, rules, removals, processes, same-screen conflicts, records. |
| UX-R21 | P1 | v2-04 | Item: one-sentence finding, evidence, tests and results, Confirm / Reject (reason required) / Comment. |
| UX-R22 | P1 | v2-05, v2-16 | Explained automatically tab with the rule in plain words and Overturn (reason required); overturned items marked everywhere. |
| UX-R23 | P1 | v2-04 | Filters by kind, part, process, age, with counts. |
| UX-R24 | P1 | v2-04 | Group of similar items confirms in one action ("Confirm 12"); one Undo. |
| UX-R30 | P1 | v2-06 | Status (active, merged, retired), variants count with why, last seen, coverage on the current release. |
| UX-R31 | P1 | v2-07 | Variants side by side, each with its why. |
| UX-R32 | P1 | v2-07 | Actions with status (active, not seen since, not checked on this release, retired) and persona. |
| UX-R33 | P1 | v2-07 | History: split from / merged into with the reason and the documentation affected. |
| UX-R34 | P2 | v2-14 | Same / same with different data / different, optional why, keys 1–3, Enter, S. |
| UX-R40 | P1 | v2-08 | Map of the model now; internal actions inside the node. |
| UX-R41 | P1 | v2-08 | Link states drawn and in the legend. |
| UX-R42 | P1 | v2-08 | Process overlay and release overlay. |
| UX-R43 | P1 | v2-08 | "One scan's path" view. |
| UX-R44 | P1 | v2-08 | Menu on every page bundled; families collapse over ~150 screens. |
| UX-R50 | P1 | v2-09 | Proposals appear marked Proposed with Accept, Rename, Split, Merge, Move screens, Reject (reason); edited processes get suggestions, never silent changes. |
| UX-R51 | P1 | v2-10 | Trigger, preconditions, screens in order, outcomes with their screens. |
| UX-R52 | P1 | v2-10 | Paths with case counts; one case's path with the reason. |
| UX-R53 | P1 | v2-09, v2-10 | Explored per release with what's missing and Explore further with an estimate. |
| UX-R54 | P1 | v2-10 | Rules in the process and its PROC record. |
| UX-R60 | P1 | v2-11 | Rules list: where decided, status, last tested, process. |
| UX-R61 | P1 | v2-12 | Decision table readable by BA and developer; "decided on data not visible from the UI" when it applies. |
| UX-R62 | P1 | v2-12 | Boundary tests, rerun history, the release where it last changed. |
| UX-R63 | P1 | v2-12 | Confirm, Reject (reason), Reword (goes into the docs). |
| UX-R70–72 | P2 | notes in `12-v2-ux.md` §10 | — |
| UX-R80–81 | P2 | notes in `12-v2-ux.md` §10 | — |
| UX-R90 | P2 | v2-01 (assistant chips), §1.1 | Assistant proposals marked "from the assistant" in the same queues. |
| §6 states | P1 | v2-13 | Every P1 page handles the eight states as in the matrix. |

## G. Workbench · generative UI beta (spec `14-workbench.md`; engineering `17-genui-architecture.md`)

Screens `wb-01`…`wb-10`; rules `15-genui-guidelines.md`; parts `16-genui-components.md`; contract `workbench/schema/`.
Behaviour rules WB-UI-01…42 are in `14-workbench.md` §5; tickets WB-01… in `17-genui-architecture.md` §9.

| ID | P | Requirement | Acceptance |
|---|---|---|---|
| FE-W01 | M | The Workbench tab exists behind `workbench_beta`, with a `beta` chip in the nav; the kill switch hides it and redirects without breaking other pages | Flag off → no tab, `/workbench` → Home with toast |
| FE-W02 | M | The model's output is a view spec validated against `view-spec.schema.json`; no model-written HTML, CSS or style reaches the page | Contract tests over `workbench/examples/invalid` |
| FE-W03 | M | The server places components by path and phase (Chat always inline); invalid components are dropped and logged; nothing left → plain chat | Drop reasons logged; fallback test |
| FE-W04 | M | Every generated view has the solid frame, "generated" mark, Why this view?, source line and feedback | Snapshot of every component |
| FE-W05 | M | Paths Chat and Mapping (phase 1), Troubleshoot (2), Explain (3); the person's switch wins; the path is in the URL | WB-UI-01…04; Back / Forward |
| FE-W06 | M | Live data reaches the screen over SSE without the model; p95 event → screen < 1 s; reconnects resume from the last id | Load test; drop / replay e2e |
| FE-W07 | M | Narration cites events; numbers must appear in a cited event; failing lines are replaced by templated lines | Grounding tests |
| FE-W08 | M | Every write is a command card; nothing runs before Confirm; states proposed, running, done, failed, undone | Audit: each run has a confirm |
| FE-W09 | M | Point and ask: Ask button, `A`, `@` picker (phase 2); chips sent as structured context, max 3 | Network payload has `ctx[]` objects |
| FE-W10 | M | The text answer never waits for the view (4 s); composing reserves the layout; the view is dropped after 15 s | Timing tests with a slowed model |
| FE-W11 | M | With the model down, live views keep updating and the composer says so | Model off e2e |
| FE-W12 | M | Focus never moves on its own; one announcement per stage change and milestone; single-letter keys follow the shortcuts setting | Keyboard and live-region scripts |
| FE-W13 | M | The Workbench works on Now; As of ≠ Now shows the banner and disables commands | e2e with `as_of=release:9c21` |
| FE-W14 | M | Commands run only for people with `scan:write` on environments allowed for the beta; CSRF, one-time tokens, idempotency | Security tests |
| FE-W15 | M | Scanned page content is passed as untrusted data; vault values and input values never reach the model, logs or telemetry | Injection evals; log scan for secrets |
| FE-W16 | S | PageDetail opens in a non-modal side sheet; Esc closes it and returns focus | WB-UI-38 |
| FE-W17 | S | Inline layout: the live bar pins while the live card is out of view; a stopped or finished card folds to one line (Expand) under a newer card | wb-01 scroll test; fold test |
| FE-W18 | S | Entries: drawer "Continue in Workbench", Scans "Watch in Workbench" (1) and "Troubleshoot in Workbench" (2) | Links land with context |
| FE-W19 | M | Phase 2: LiveMap graph with nodes as buttons in visit order, arrows along edges, follow mode that never turns itself back on | Keyboard-only fixture run |
| FE-W20 | M | Phase 2: Troubleshoot with StepShot, EventTail, FixChoices (variations from the recovery API), AttemptList and `path.attempt` | e2e attempt 3 passes → resume |
| FE-W21 | S | Phase 2: `mark.add` with Undo until a scan uses the mark | Undo test |
| FE-W22 | S | Phase 3: focus mode (`F`), command bar with the latest reply, event strip | wb-05 |
| FE-W23 | S | Phase 3: Explain reuses the 2.0 Compare, DecisionTable and finding layouts; decisions only through "Open in Review" | No decision action reachable |
| FE-W24 | M | Telemetry events and the beta dashboard exist; evals run in CI with the thresholds in §7 | Dashboard; CI job |
| FE-W25 | M | p95 spec → first paint < 300 ms; model calls per scan and per person are capped and shown in Settings ▸ Assistant | Load test; Settings shows use |

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
| FE-Q12 | M | The console store stays read-only from the UI except the existing write endpoints (amendments, scope, chat, credentials, settings) and, in 2.0, the review commands (confirm, reject, overturn, label, accept, rebuild), which go through the command layer. | No other write paths; every 2.0 write is a command with a result the UI shows (toast or alert). |
