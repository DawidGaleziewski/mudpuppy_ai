# 14 · Workbench (beta): a screen the assistant composes

What the Workbench is, how it behaves, and how to build it step by step. It covers:
- what the tab is for, and what it leaves to the rest of the console;
- the three layouts, one per rollout phase;
- the four paths (Chat, Mapping, Troubleshoot, Explain);
- behaviour rules you can test, one per line (WB-UI-01…);
- the phased plan, from foundations to out of beta, with exit numbers.

Screens: `screens/wb-01…wb-10` (described in `06-screens.md`). Components: `design-system/genui-components.html` and
`16-genui-components.md`. Rules for anything generated: `15-genui-guidelines.md`. Engineering, the htmx-vs-React decision and
the tickets: `17-genui-architecture.md`. The contract (view spec, narration, commands, tool definitions) is in
`workbench/schema/`, with valid and invalid examples in `workbench/examples/`. A runnable reference implementation
(Starlette + Jinja + htmx + SSE) is in `workbench/reference/`.

CSS: `tokens.css → fonts.css → salvage.css → genui.css`. Every class named here exists in one of them.

## 0. The Workbench in eight decisions

| # | Decision | Why |
|---|---|---|
| 1 | **One beta tab**, behind the flag `workbench_beta`. It does not replace any page | A place to learn what generated screens are good for, without moving existing workflows |
| 2 | **The assistant composes the screen from a fixed catalogue** (15 components). It never writes HTML, CSS, numbers or page content | Generated screens stay predictable, accessible and testable |
| 3 | **Two lanes.** Live scan data reaches the screen without the model; the model only picks and binds components and writes words | Live data is exact and fast; the model can be slow or down without breaking the map |
| 4 | **The server decides where things go**, from the path and the rollout phase. The model never chooses layout | Layout stays stable; one fewer thing to get wrong |
| 5 | **Four paths:** Chat (default), Mapping, Troubleshoot, Explain. The assistant proposes, the person can switch, the person's switch wins | The person stays in charge of what the screen is for |
| 6 | **Every generated view says so**: a solid frame, a "generated" mark, "Why this view?", a source line, "Right view? Yes / No" | Trust needs provenance; feedback tells us when it picks wrong |
| 7 | **Writes only through command cards.** Nothing runs before Confirm, whoever started it | Same safety as the rest of the console ("writes go through commands") |
| 8 | **Ship in three steps:** Inline → Split → Focus + Explain | Prove value with the cheapest layout first; build the map island only once cards prove useful |

---

## 1. What it is, and what it is not

**It is** a tab where you say what you want ("Map the OC/AC calculator", "Why did it stop?", "Explain the banner on wynik") and
the assistant puts the right pieces of the console in front of you: a live map of the scan, the page that failed, the last
events, the fixes to try, a before / after. You can point at anything on the screen and ask about it.

**It is not:**
- **Not Review.** Decisions on findings, changes and rules stay in Review, with a reason. The Explain path links *to* Review
  ("Open in Review"); it never confirms, rejects or overturns.
- **Not the Map.** Screens ▸ Map shows the whole model. The Workbench's LiveMap shows one scan's route as it happens.
  LiveMap links to the full map ("Open full map").
- **Not Scans.** The scan list, history and settings stay in Scans. The Workbench can start, stop and resume a scan through
  the same commands, with a command card.
- **Not the assistant drawer.** The drawer (`Ctrl J`) stays on every page, scoped to that page. The Workbench is scoped to a
  task and has a stage. The drawer can hand a conversation over ("Continue in Workbench").
- **Not a page builder.** No free layout, no custom components, no styling from the model.
- **Not for phones.** Desktop only during the beta: 1280 reference, 1024 floor (like 2.0).

---

## 2. Information architecture

### 2.1 Entry points

| Entry | Phase | Lands on | Why |
|---|---|---|---|
| Nav item **Workbench** with chip `beta` (`.sy-chip--dashed`, ash: a beta is not a drawing), after Home, only with `workbench_beta` | 0 | Last conversation, or the empty state | The only permanent entry; the chip says it is a beta |
| Drawer: **Continue in Workbench** link under an answer that would be better as a view (a scan question, a "show me") | 1 | Same conversation, path proposed by the assistant | The drawer is where people already ask; the hand-off keeps the conversation |
| Scans: **Watch in Workbench** on a running scan's row and monitor | 1 | `path=mapping&scan=…` | Watching a scan live is the Workbench's first job |
| Scans: **Troubleshoot in Workbench** on a stopped scan | 2 | `path=troubleshoot&scan=…&sel=<failed page>` | Arrives with Phase 2's Troubleshoot path |
| Map, Review, Changes, Rules | — | No entry during the beta | Decisions stay in Review; the full map is already a page. Links go *out* of the Workbench to these pages, not in |

Keeping entries few keeps the beta reversible: the kill switch (§9.3) removes the tab without breaking any workflow.

### 2.2 URL

Every view can be linked and reloaded. The path is in the URL; the conversation is on the server.

```
/workbench?portal=reference-insurer&c=wbc_7Q2M&path=mapping&scan=01a110d5-2028-7000-8f3e-5c1a9b27d460&sel=/kalkulator/kierowca:2
```

| Param | Values | Changes the history? |
|---|---|---|
| `portal` | as in the rest of the console | — |
| `c` | conversation id | Push (new conversation) |
| `path` | `chat` (default) · `mapping` · `troubleshoot` · `explain` | **Push** (`hx-push-url`): Back returns to the previous path |
| `scan` | scan id as stored (`01a110d5-2028`) | Push |
| `sel` | selected page: `route` or `route:state` (`/kalkulator/kierowca:2`) | **Replace** (`hx-replace-url`): selecting pages must not fill the history |
| `focus` | `1` = focus mode (phase 3) | Replace |

Reloading `?c=…` restores the last view spec of that conversation and reconnects the live stream.

### 2.3 The Workbench works on Now

The header's **As of** applies to the whole console. The Workbench only works on Now, because it watches live scans and runs
commands. When As of is not Now, the Workbench shows an intent callout (`.sy-callout--intent`): "The Workbench works on now ·
Back to now". Commands are disabled with the reason in `aria-describedby`; reading a conversation is still possible.

---

## 3. Layouts

### 3.1 Regions

| Region | Holds | Class |
|---|---|---|
| **Head** | Title "Workbench", the beta line, the Path switch with its reason | `.sy-wb__head`, `.sy-pathswitch`, `.sy-pathswitch__why` |
| **Conversation** | Messages, narration (inline and split), error cards, command cards, the composer with context chips and suggestions | `.sy-plate.sy-chat.sy-wb__conv`, `.sy-composer`, `.sy-ctxbar`, `.sy-suggest` |
| **Card** (phase 1; Chat in every phase) | A generated view inside an assistant message | `.sy-genview.sy-genview--card` |
| **Live bar** (phase 1) | One pinned line while a scan's card has scrolled out of view | `.sy-livebar` |
| **Stage** (phases 2–3) | The generated views: map, page at a step, events, fixes, before / after | `.sy-wb__stage`, `.sy-genview` |
| **Side sheet** | Details of one selected thing (a page, a step), non-modal | `.sy-sheet` in `.sy-wb__aside` |
| **Command bar** (focus mode) | One-line composer, the latest reply above it | `.sy-cmdbar`, `.sy-cmdbar__reply` |

### 3.2 One layout per phase

Widths below are the content box of `.sy-main` (1280 viewport: 1280 − 190 nav − 56 padding = 1034 px; 1024 viewport: 778 px).

| Layout | Phase | Grid | At 1280 | At 1024 | Screens |
|---|---|---|---|---|---|
| **Inline** `.sy-wb--inline` | 1 (and Chat in every phase) | conversation · side column 320; with no sheet open, one column of at most 960 | conversation 698 · sheet 320, or one 960 column | One column (below 1100 px). The side sheet stacks under the conversation; opening it scrolls to it | wb-01, wb-02, wb-06 |
| **Split** `.sy-wb--split` | 2 | conversation 300–380 · stage | conversation 380 · stage 638 | conversation 340 · stage 422 (the map scrolls inside its frame) | wb-03, wb-04, wb-07 |
| **Focus** `.sy-wb--focus` | 3 | stage + command bar · side column 280 | stage 738 · side 280 | One column; the side column stacks under the command bar | wb-05 |

- The layout follows the **path** and the **phase** (what is switched on for this user). **Chat always uses the inline
  layout**, in every phase: its cards sit inside the conversation. Mapping, Troubleshoot and Explain use the phase's layout
  (inline in phase 1, split from phase 2, focus as a toggle in phase 3). Switching from Mapping to Chat in phase 2 swaps the
  split for the inline layout; the conversation is the same element and keeps its scroll position.
- The side sheet exists in the DOM only while it is open. With no sheet, the server adds `.sy-wb--nosheet` and the inline
  layout is one column of at most 960 px, so a plain chat reads at a comfortable width; opening a sheet adds the 320 px column.
- Focus mode is a **toggle of the split layout** (`F`, or the "Focus" button in the stage head), not a fourth path. It
  collapses the conversation into the command bar and gives the map the room. Off again restores the split as it was.
- The conversation has a fixed height (`--sy-wb-h`, default 820 px) and scrolls inside; the page itself does not scroll while
  a scan runs, so the stage stays in view.

### 3.3 Where each component goes

The server places components with `workbench/schema/catalogue.json`. The model only orders them.

| Component | Inline | Split | Focus |
|---|---|---|---|
| LiveMap | card (filmstrip) | stage (graph) | stage (graph) |
| ScanMeter | card | stage | stage |
| PageMiniature | card | stage | stage |
| PageDetail | side sheet | stage | side |
| Narration | conversation | conversation | side |
| ErrorCard (`.sy-genview--failure`) | card | conversation | side |
| StepShot · EventTail · FixChoices | card | stage | stage |
| AttemptList | card | stage | side |
| Compare · DecisionTable · FindingCard | card | stage | stage |
| RecordCard | card | stage | side |
| RecordList | card | stage | stage |

In the inline layout LiveMap always renders as the filmstrip (`.sy-film`); the graph needs the stage's width.

---

## 4. Paths

A path decides which components the assistant may use, how many, and where they go. The Path switch is a segmented control
(`.sy-seg` inside `.sy-pathswitch`) showing only the paths switched on for the user's phase.

### 4.1 Chat (default)

| | |
|---|---|
| **Picked when** | Questions and lookups: "what's in…", "how many…", "what does … look like", anything that doesn't run or watch a scan |
| **Layout** | Always inline (cards in the conversation), in every phase |
| **Composes** | At most **2** inline cards, only when they say it better than words: RecordCard, RecordList, PageMiniature; from phase 3 also Compare and DecisionTable |
| **Never** | Opens a stage view on its own; starts anything long-running without a command card |
| **Ends / hands over** | When you ask for something long-running ("map…", "continue the scan") the assistant proposes Mapping |
| **Example** | "What does Oblicz składkę OC/AC look like?" → `examples/valid/chat-records.json` (RecordCard PROC-001 + RecordList BR-021…026). A short factual answer → `chat-plain.json` (no components) |

### 4.2 Mapping

| | |
|---|---|
| **Picked when** | "Map…", "continue the scan", "explore Przedłuż polisę", "watch 01a110d5-2028" |
| **Composes** | LiveMap (with its scan meter), PageDetail, Narration, ErrorCard, PageMiniature; ScanMeter only when no map is shown (max 4) |
| **Never** | Changes the selection because a new page arrived; switches to Troubleshoot by itself when the scan stops |
| **Ends / hands over** | Scan finishes → a summary message with the counts (from events) and "Open in Scans". Scan stops → ErrorCard + suggestions "Why did it stop here?", "Troubleshoot with me" |
| **Example** | "Map the OC/AC calculator and what's around it." → `scan.start` command card, then `mapping-live.json`. After the stop → `mapping-stopped.json` |

### 4.3 Troubleshoot (phase 2)

| | |
|---|---|
| **Picked when** | "Troubleshoot with me", "why did it stop?", "Troubleshoot in Workbench" from Scans, the Troubleshoot button on an ErrorCard |
| **Composes** | StepShot (the page at the failing step, target marked), EventTail, FixChoices, AttemptList, ErrorCard, PageDetail, ScanMeter (max 4) |
| **Never** | Invents a fix: the variations in FixChoices come from the recovery API (`wait_longer`, `record_only`, `skip_action`). Runs an attempt without a command card |
| **Ends / hands over** | An attempt passes → "Attempt 3 passed." and a `scan.resume` command card that resumes from the last good checkpoint (/porownanie, step 140) using the passing variation → back to Mapping, resumed. You can leave any time with the Path switch |
| **Example** | "Why did it stop at /kontakt?" → `troubleshoot.json` (StepShot, EventTail, FixChoices, AttemptList at step 171) |

### 4.4 Explain (phase 3)

| | |
|---|---|
| **Picked when** | "Explain the banner on wynik", "show BR-021", "what changed on opcje?" |
| **Composes** | FindingCard, Compare, DecisionTable, RecordCard, StepShot, PageMiniature (max 3) |
| **Never** | Decides. No Confirm / Reject / Overturn here. Every decision link says "Open in Review" |
| **Ends / hands over** | "Open in Review" (keeps the finding selected there), or a new question |
| **Example** | "Explain the banner on wynik" → `explain.json` (FindingCard FND-007 + Compare CHG-019). "Show BR-021" → `explain-rule.json` |

### 4.5 How the path is chosen

1. Each turn, the assistant returns a view spec with `path` and a one-sentence `why`. The switch shows the path and the reason,
   marked as the assistant's (`.sy-pathswitch__why[data-source="assistant"]`, dashed blueprint square).
2. You can switch at any time. Your choice is marked as yours (`data-source="you"`, solid square: "You switched to
   Troubleshoot") and **wins until you send a new message that asks for something else**. The assistant sees your choice as
   context and composes for that path.
3. Switching path swaps the stage; the conversation stays. Back in the browser returns to the previous path.
4. A path that isn't on for your phase isn't shown. If you ask for it ("troubleshoot this" in phase 1), the assistant answers
   in chat and links to Scans.

---

## 5. Behaviour rules

Numbered so tests and tickets can cite them. "Generated view" = a `.sy-genview` placed from a view spec.

### 5.1 Paths and the stage

- **WB-UI-01** A turn produces at most one view spec. The stage (or the card) changes only after a turn, a path switch by
  the person, or a standing reaction (WB-UI-22). Live events never change *which* components are shown.
- **WB-UI-02** The Path switch always shows the current path and its reason. The reason is the spec's `why`, or "You switched
  to …" after a manual switch.
- **WB-UI-03** A manual switch re-composes the stage for that path from the same context (scan, selection) and is logged as a
  path override.
- **WB-UI-04** Changing path never clears the conversation, the context chips or the selection.
- **WB-UI-05** A new view keeps the ids of components that stay (`id` in the spec). A component with the same id and binding
  is updated in place, not re-created, so its scroll position and state (follow, selection) survive.
- **WB-UI-06** At most 4 components per view (chat 2, explain 3). Extra components are dropped by the server and logged.

### 5.2 Selection and point-and-ask

- **WB-UI-07** One page is selected at a time. Selecting in the map, the filmstrip or a narration line selects the same page
  everywhere and fills PageDetail. `sel` is replaced in the URL.
- **WB-UI-08** Live updates never change the selection. A spec's `select` applies only when the person hasn't selected
  anything in this conversation, or when the turn was about that page.
- **WB-UI-09** Anything on the stage that can be asked about is an `.sy-askable` with an **Ask** button (`.sy-ask`, shown on
  hover and keyboard focus, always on touch). Ask, or `A` on the focused item, adds a context chip to the composer and moves
  focus to the message field.
- **WB-UI-10** `@` in the message field opens a picker of pages, steps and events of the current scan (phase 2). Choosing one
  adds a chip; the `@text` is not left in the message.
- **WB-UI-11** Context chips (`.sy-ctxchip`) are sent as structured context (`{kind: "page", scan, route, state}`,
  `{kind: "step", scan, step}`, `{kind: "event", ref}`, `{kind: "view", id}`), never pasted as text. Each chip has a Remove
  button labelled "Stop asking about …". At most 3 chips; a fourth replaces the oldest.
- **WB-UI-12** Suggestions (`.sy-suggest`, max 3) send exactly their text when clicked, with the current chips.

### 5.3 Live data (data lane)

- **WB-UI-13** Scan events update LiveMap, ScanMeter, the live bar, the filmstrip and EventTail directly from the stream,
  with no model call. p95 from event to screen < 1 s.
- **WB-UI-14** **Follow the crawler** (LiveMap, on by default) keeps the crawler's page in view. Panning the map or selecting
  a page turns follow off and says so ("Follow paused · Resume follow"). It never turns itself back on.
- **WB-UI-15** The crawler's page is marked `data-state="here"` (cyan weld) with the status "Crawler here"; a failed page is
  `data-state="failed"` with "Failed here". Colour is never the only signal.
- **WB-UI-16** Inline layout: while a scan's card is out of view, the live bar (`.sy-livebar`) pins to the top of the
  conversation with the status, steps, the current route and "Jump to the live card". It is not a live region.

### 5.4 Narration (words lane)

- **WB-UI-17** Narration (`.sy-narration`) writes at most one line per page visited (`every: "page"`) or per milestone
  (`every: "milestone"`), and at most one line per 5 s. Milestones (started, stopped, resumed, finished) always get a line.
- **WB-UI-18** Every line cites at least one event (`.sy-cite`, label "step 171", linking to the event). Any number in a line
  must appear in a cited event; a line that fails is replaced by the templated line for that event.
- **WB-UI-19** Narration says what happened, not why, unless an event says why. No guessing about the portal's intent.

### 5.5 Errors, commands and hand-offs

- **WB-UI-20** Every write is a command (`commands.json`): `scan.start`, `scan.resume`, `scan.stop`, `path.attempt`,
  `mark.add`, `persona.add` (an editable card, `19-console-answers/04`). Whether the assistant proposed it or you clicked a button (Resume on an ErrorCard, Run attempt in FixChoices),
  it first appears as a **command card** (`.sy-cmd`, `data-cmd-state="proposed"`) that says what will change, what won't, and
  whether it can be undone.
- **WB-UI-21** The card's one primary button is **Confirm** (marker). Cancel folds it to one muted line, `data-cmd-state="cancelled"`,
  "Cancelled · nothing changed". Nothing is sent to the API before Confirm. A proposal expires after 10 min or when its
  preconditions change: `data-cmd-state="expired"`, "No longer applies: 01a110d5-2028 was resumed from Scans".
- **WB-UI-22** Standing reaction: when a scan bound in the current view stops, the server adds the ErrorCard to that view (a
  `.sy-genview--failure` frame titled by what failed, "Next action failed at /kontakt": red, because an action really failed).
  The scan's own status stays **Stopped** (`data-status="stopped"`, ash), per `03-colour-guide.md` §4 rule 5 and posts a short assistant message with
  suggestions ("Why did it stop here?", "Troubleshoot with me"). The path does not change.
- **WB-UI-23** Confirm → `running` (cyan, "Resuming…", the button busy with the caret) → `done` (green, the result with links:
  "Resumed as scan 01a110e7-2068 · continues 01a110d5-2028") or `failed` (red, the command's message and ERR reference, "Try again").
  The result is also a line in the conversation.
- **WB-UI-23a** (2.3, T-13) A command whose run **never starts** (the start call errors, or returns no run id within 30 s)
  ends `failed` with the status word **Didn't start**, the fact **Created: nothing** (no scan, no pages, nothing in Scans),
  the crawler's own sentence quoted under Why, and **Start again** (same arguments). The card binds only to the run id its
  own start call returned; it never adopts another scan. When the run does start, the server places the **Live map** card at
  `scan.started` (data lane, D-39), before any assistant text, with no generated mark and no "Why this view?"; until the
  first page it shows `.sy-loader--block` "Waiting for the first page" in its final size.
- **WB-UI-24** Undo exists only where the API can reverse it: `mark.add` shows Undo until a scan uses the mark → `undone`.
  Scans and attempts are never "undone"; the card says how to stop them instead.
- **WB-UI-25** Commands run only on environments allowed for the beta (sandbox only during the beta, OW-1). Elsewhere the card shows the reason
  and links to Scans.

### 5.6 Provenance and feedback

- **WB-UI-26** Every frame placed from a spec is a solid `.sy-genview` with `.sy-genmark` "generated" and a source line
  (`.sy-genview__source`, e.g. "From events up to 10:58:44Z"). **Why this view?** (`.sy-genview__why`) and the feedback group
  (`.sy-genfeedback`) appear **once per view** (one spec), on its lead frame (the first component); the other frames of the same
  view don't repeat them. A side sheet the person opened by clicking a page is not generated: no mark, no Why.
- **WB-UI-27** Why this view? opens `.sy-genwhy` under the head: the path and its reason, what you asked (message + chips), what
  each component shows and what it is bound to, how fresh the data is, and **Not what you need?** with the other paths
  (`.sy-genwhy__switch`). Esc closes it and returns focus to the button.
- **WB-UI-28** "Right view? Yes / No". No opens reasons (Wrong path · Missing something · Too much · Wrong data · Other) as
  toggle buttons, optional text. One answer per view per person; it can be changed. No thank-you dialog.

### 5.7 Generation states

- **WB-UI-29** **Composing:** when the model's stream starts a `render_view` call (the tool-use block opens, before its input
  is complete), a frame appears where the view will go (the assistant's message for inline cards, the stage for split and focus) at its final size with
  `data-gen-state="composing"`, skeleton blocks (`.sy-genskel`) and the label "Composing view_". No shimmer; nothing moves
  when the view arrives.
- **WB-UI-30** **Answer first:** the text answer is never held for the view; it streams as soon as the model writes it, and the
  view attaches below it when ready. If neither text nor a `render_view` call has started 4 s after Send, the conversation shows
  `.sy-genstatus` "Still working". After 15 s without a valid spec the composing frame is removed with the line
  "No view this time; the answer is above."
- **WB-UI-31** **Fallback:** a spec that fails validation loses the bad components; if none is left, the answer is plain
  chat. This is quiet: no red, no error code in the conversation (it is logged).
- **WB-UI-32** **Stale stream:** if the live stream drops, live views get `data-gen-state="stale"` and the notice
  "Live updates paused at 10:57:05Z · Reconnecting_" (the scan is still running; the status reads "Not live", dashed grey) (`.sy-genview__notice`). Data stays readable. On reconnect the stream
  replays from the last event id and the notice goes away.
- **WB-UI-33** **Model down:** the data lane keeps working (the map keeps updating, commands from buttons still work). The
  composer says "Assistant unavailable — the live map still updates" with the reference; Send is disabled until it is back.
- **WB-UI-34** **Path override:** after a manual switch the stage head shows "You switched to Troubleshoot" in the notice strip
  until the next turn.

### 5.8 Focus, announcements, keyboard

- **WB-UI-35** Focus never moves on its own. It moves only after the person acts: opening the side sheet (to its heading),
  Ask / `A` (to the message field), clicking a button that creates a command card (to the card's heading, never to Confirm).
- **WB-UI-36** One polite live region per page (`role="status"`). It announces a stage change once ("Live map opened") and
  each milestone (table below). Never per event. Command failures use `role="alert"`. The conversation log is `role="log"`
  (implicitly polite), so live-updated content inside it (narration, live cards) carries `aria-live="off"`; notices such as the
  stale strip are not live regions of their own.
- **WB-UI-37** Single-letter shortcuts work only when focus is not in a text field, and follow the console's
  "Keyboard shortcuts" setting (WCAG 2.1.4).
- **WB-UI-38** Esc closes the innermost open thing: the `@` picker, then Why this view?, then the side sheet. Focus returns to
  what opened it.

| Key | Does | Phase |
|---|---|---|
| `Enter` / `Shift Enter` | Send / new line | 1 |
| `A` | Ask about the focused item (adds a chip, focus to the message field) | 1 |
| `Esc` | Close picker → Why → side sheet; focus returns | 1 |
| `Ctrl J` | Focus the message field (the drawer's shortcut; on this page the conversation is the assistant) | 1 |
| `@` | Pick a page, step or event of the current scan | 2 |
| `Tab` / arrows in the map | Pages in visit order / along edges | 2 |
| `F` | Focus mode on / off | 3 |

| Announcement | When |
|---|---|
| "Live map opened" / "Troubleshoot view opened" / "Explain view opened" | The stage changes after a turn or a switch |
| "Scan 01a110d5-2028 started" | `scan.started` |
| "Scan stopped at /kontakt, step 171" | `scan.stopped` |
| "Resumed as scan 01a110e7-2068" | `scan.resume` done |
| "Attempt 3 passed" / "Attempt 2 failed" | `attempt.result` |
| "Scan finished: 42 pages" | `scan.finished` |
| "Live updates paused" / "Live updates back" | Stream stale / reconnected |

### 5.9 Emphasis and the conversation's history

- **WB-UI-39** Marker orange is kept for the one decision on screen: **Confirm** in a command card, or **Open in Review** on a
  finding (Explain). The composer's and the command bar's **Send** is `.sy-btn--strong`, never `.sy-btn--primary`. Enter sends.
- **WB-UI-40** A live card that is **stopped or finished** folds to its one-line summary once a newer card arrives below it in
  the conversation: status, scan id, steps, pages, where it ended, and an **Expand** button (`aria-expanded="false"`,
  `aria-controls` the card body). Expanding shows it as it was; it stays expanded until the person folds it. A running card never
  folds, and folding never moves focus.

### 5.10 Empty and first run

- **WB-UI-41** First visit: the head with Chat selected, a beta line ("Beta: the assistant composes this screen. Tell us when it
  picks the wrong view."), an empty state (`.sy-state`) "Nothing composed yet" and three starters (`.sy-suggest`) built from the
  portal for the paths the person has: "Map the OC/AC calculator", "Why did scan 01a110d5-2028 stop?" and, in phase 1–2,
  "Which processes are accepted?" (from phase 3: "Explain the banner on wynik"). No scans yet → the first starter is
  "Start a map scan".
- **WB-UI-42** A conversation can be renamed and closed; the list of recent conversations is in a menu in the head (last 20).

---

## 6. States

| State | You see | You can | Screen |
|---|---|---|---|
| Live mapping, inline | Live card (filmstrip, meter) in the conversation, narration under it, live bar when scrolled, PageDetail in the side sheet | Select pages, Ask, follow on/off, Stop (command card) | wb-01 |
| Scan stopped, inline | The live card folded to one line, ErrorCard "Next action failed at /kontakt", Resume as a proposed command card, suggestions | Confirm or Cancel Resume, ask why (Troubleshoot arrives in phase 2) | wb-02 |
| Live mapping, split | Graph on the stage, crawler marked, page 4 selected, a context chip "@ /kalkulator/kierowca · step 2", Why this view? open | Ask about the page, switch path, close Why | wb-03 |
| Troubleshooting | StepShot at step 171, EventTail, FixChoices, AttemptList (#1, #2 failed, #3 passed); attempt 3 card done, then a Resume card proposed | Pick a variation, Confirm the attempt, Confirm the resume | wb-04 |
| Focus mode | Big map with the Focus button in its head, event strip (`.sy-evstrip`), command bar with the latest reply and "History (3)", PageDetail and ErrorCard on the side | Same as split; `F` to leave | wb-05 |
| Chat answer with cards | Inline layout in one 960 px column: plain answer + RecordCard PROC-001 + RecordList BR-021…026, suggestions | Open records, ask on | wb-06 |
| Explain | FindingCard FND-007 + Compare CHG-019, "Open in Review" | Open in Review, ask on | wb-07 |
| Composing | Frame at final size, dashed blueprint, skeleton blocks, "Composing view_" | Keep reading, type the next message | wb-08 |
| Stale stream | Dashed grey frame, status "Not live", "Live updates paused at 10:57:05Z · Reconnecting_" | Read; Retry now | wb-08 |
| Fallback to chat | The answer only, no view; nothing red | Ask again, switch path | wb-08 |
| Model down | Live views keep updating; composer notice "Assistant unavailable — the live map still updates" with ERR reference | Watch, use buttons on views | wb-08 |
| Path override | "You switched to Troubleshoot" in the switch and the stage notice | Switch back | wb-08 |
| As of ≠ Now | Intent callout "The Workbench works on now · Back to now"; commands disabled | Back to now, read | wb-08 |
| Command states | `.sy-cmd` proposed / running / done / failed / undone / cancelled / expired | Confirm, Cancel, Try again, Undo (marks) | wb-08 |
| Feedback "No" | Reason toggles under the view | Pick reasons, add text | wb-08 |
| First visit | Beta line, empty state "Nothing composed yet", three starters | Click a starter | wb-08 |

---

## 7. The plan, step by step

Each phase ships behind the flag to a named group, is measured for at least two weeks, and moves on only when its exit
numbers hold. Ticket ids (WB-xx) and sizes are in `17-genui-architecture.md` §9; requirements FE-W in `07-requirements.md` §G.

| Phase | Goal | Users see | Paths | Layout |
|---|---|---|---|---|
| 0 · Foundations | The pipes, the contract and the safety rails | Nothing (staff behind the flag: an empty tab) | — | — |
| 1 · Inline | Prove that composed cards help people watch and recover scans | The Workbench tab, cards in the conversation | Chat, Mapping | Inline |
| 2 · Split | Give live work a stage; add troubleshooting | The stage, the live graph, Troubleshoot | + Troubleshoot | Split |
| 3 · Focus + Explain | Room for long scans; explain review items in place | Focus mode, Explain | + Explain | Split + focus |
| 4 · Out of beta | Decide: keep, extend or stop | The chip `beta` goes (or the tab does) | By evidence | — |

### Phase 0 · Foundations

**Goal.** Everything the UI depends on exists and is tested: events, stream, contract, validation, rendering, commands, flag,
telemetry, evals.

**Scope.** No user-facing UI apart from an empty tab for staff. Tickets WB-01…WB-09.

**Steps, in build order:**
1. **Event model.** One event per scan step, so the citation ref `scan#step` (`01a110d5-2028-7000-8f3e-5c1a9b27d460#171`) names one event. Types and
   payloads: `scan.started`, `page.visited`, `step.recorded`, `links.queued` (counts), `action.failed`, `scan.stopped`,
   `scan.resumed`, `scan.finished`, `attempt.started`, `attempt.result`. The stream adds its own sequence number for
   `Last-Event-ID`. Store them; the store is the replay source.
2. **Live stream.** One SSE endpoint per Workbench tab, keyed by conversation (`/workbench/stream?c=…`); the server
   subscribes it to every scan the conversation binds, so starting a scan needs no reconnect. It carries both lanes as named
   events, renders fragments per connection (selection and phase differ per viewer), supports `Last-Event-ID` replay and sends
   a heartbeat every 15 s. Replay of the fixture scan 01a110d5-2028 must produce the six route pages in order plus 11 side trips
   folded onto them (`13-v2-fixtures.md` §Workbench).
3. **Contract.** Load `catalogue.json` and `view-spec.schema.json` at start-up (generated by `workbench/tools/gen_wb_schema.py`; never
   hand-edit the JSON). Write the validator: schema → semantic checks (ids resolve, path × type, phase, limits) → drop, don't
   fail. Unit tests run over `workbench/examples/valid` (must pass) and `invalid` (must be dropped or repaired with the code
   in `examples/invalid/EXPECTED.json`).
4. **Templates.** Jinja partials for the frames (`.sy-genview` with head, Why, source line, feedback; `.sy-genskel`;
   `.sy-cmd` in all seven states) and one sample component (ScanMeter) to prove the pipe. The other component partials come
   with the phase that ships them. Autoescape on; model strings never `|safe`.
5. **Commands.** A command service: proposal store, one-time confirm tokens, idempotency keys, permission and environment
   checks, mapped to the existing APIs (`POST /runs/{id}:resume`, `POST /paths/{id}/attempts`, `POST /portals/{p}/runs`,
   marks) plus the new `POST /runs/{id}:stop`.
6. **Model adapter.** Tool definitions from `workbench/schema/tools.json`, the system prompt (§4.5 of doc 17), timeouts
   (4 s answer-first, 15 s view), one retry on an invalid spec, record / replay mode for tests.
7. **Flags and kill switch.** The five flags in §9.3, and the nav item with the `beta` chip.
8. **Telemetry.** The events in §9.1 and a first dashboard.
9. **Evals.** 40 golden prompts (10 per path) with the expected path and components, in CI.

**Definition of done.** Examples validate as expected in CI; the fixture replays over SSE with correct ids and reconnects with
`Last-Event-ID`; every frame partial and the sample component render from fixture data; a command can't run without its token; turning the flag
off hides the tab and redirects `/workbench` to Home.

**Exit criteria.** p95 server render of a 4-component spec < 300 ms on the fixture; event → browser < 1 s at 50 viewers of one
scan; eval harness < 5 min in CI.

### Phase 1 · Inline (variant C, ship first)

**Goal.** Show that generated cards answer "where is the crawler, and is it stuck?" faster than Scans, and that people can
resume a stopped scan without leaving the conversation.

**Scope.** Paths Chat and Mapping. Components LiveMap (filmstrip), ScanMeter, PageMiniature, PageDetail, Narration, ErrorCard,
RecordCard, RecordList. Commands `scan.start`, `scan.resume`, `scan.stop`. Frames, provenance, all generation states,
point-and-ask with the Ask button and `A` (no `@` picker yet). Entries: nav, drawer hand-off, "Watch in Workbench".

**Steps, in build order:**
1. **Page shell.** `/workbench` with `.sy-wb.sy-wb--inline`, the head, the Path switch (Chat, Mapping), the conversation plate
   with its composer, the side column. Empty state and starters (WB-UI-41).
2. **Turns.** The composer posts a turn (`hx-post`); the response appends your message and the assistant's message shell; the
   answer streams in; the view arrives as an out-of-band swap. Answer-first timing (WB-UI-30).
3. **Live card.** LiveMap as `.sy-genview--card` with the filmstrip (`.sy-film`, `.sy-film__item`, `.sy-order`,
   `.sy-mini`) and ScanMeter (`.sy-meter`), fed by the stream. Live bar when the card scrolls away.
4. **Narration.** Start with templated lines from events (exact, free), cited with `.sy-cite`. Switch on model narration
   (`narrate` tool, batched per page, grounding check) only when grounding failures are < 1 % on the eval set.
5. **Selection and side sheet.** Clicking a filmstrip item selects it and opens PageDetail in `.sy-sheet`; Esc closes; `sel` in
   the URL.
6. **Stop and resume.** Standing reaction on `scan.stopped` (ErrorCard + message + suggestions). Resume and Stop as command
   cards through the command service. Result lines and announcements.
7. **Point and ask.** `.sy-askable` + `.sy-ask` on narration lines, recorded-page regions and views; filmstrip items and map
   nodes are buttons, so they get `A` and PageDetail's "Ask about this" instead of a nested button. Chips with Remove; chips
   sent as structured context.
8. **Chat cards.** RecordCard and RecordList partials (reuse the record rows and tags of the 2.0 screens).
9. **Provenance and feedback.** Why this view?, source line, Right view? with reasons. Log every answer.
10. **Generation states.** Composing, fallback, stale, model down, As of ≠ Now (wb-08).
11. **Focus and announcements.** WB-UI-35…38; one live region; the keyboard setting.
12. **Entries.** Drawer "Continue in Workbench", Scans "Watch in Workbench".
13. **Tests.** Render snapshots of every component in every state; e2e of the fixture (start → live → stop → resume); axe on
    wb-01, wb-02, wb-06, wb-08; evals for Chat and Mapping.
14. **Roll out.** Staff for one week, then 10–20 beta users (BAs who run scans).

**Definition of done.** wb-01, wb-02, wb-06 and the Phase 1 parts of wb-08 match the screens at 1280 and work at 1024; the WB-UI
rules that apply to phase 1's parts (paths Chat and Mapping, the inline layout, the components and commands in scope) pass
their tests; no write happens without a confirm (audit log check).

**Exit criteria (two weeks, ≥ 10 active users):**

| Measure | Target |
|---|---|
| Time to answer "where is the crawler, and is it stuck?" (task test, 5 people) | median < 10 s (baseline: Scans page) |
| Stopped scans resumed from the Workbench without opening Scans | ≥ 50 % of stops seen in the Workbench |
| Right view? yes-rate | ≥ 70 % |
| Mapping turns that fell back to plain chat | < 10 % |
| Invalid-spec rate (any component dropped) | < 2 % of turns |
| Narration grounding failures | < 1 % of lines |
| p95 spec → first paint / event → screen | < 300 ms / < 1 s |
| Writes without a confirm | 0 |

**Measure also:** point-and-ask use per session, path overrides, Why this view? opens, sessions per user per week.

### Phase 2 · Split (variant A)

**Goal.** Give live work a stage, and let people fix a failing step with the assistant instead of restarting the scan.

**Scope.** Layout `.sy-wb--split`. LiveMap graph as a small Web Component island (pan, follow, keyboard along edges) inside
`.sy-graph`. Path Troubleshoot with StepShot, EventTail, FixChoices, AttemptList. Commands `path.attempt`, `mark.add` (Undo).
The `@` picker. Path in the URL with push / replace. Entry "Troubleshoot in Workbench" from Scans.

**Steps, in build order:**
1. **Split layout.** Stage column; placement switches from card to stage for users in phase 2 (server-side, by flag), except
   on the Chat path, which stays inline.
2. **Graph.** Server lays out nodes and edges (visit order, deterministic); the island only pans, follows and handles keys.
   Nodes are buttons (`.sy-node`, `data-state="here" | "failed"`), edges `.sy-edge`, queue node dashed.
3. **Path switch live.** All three paths for phase 2 users; `hx-push-url` on path, `hx-replace-url` on selection; Back works.
4. **Troubleshoot components.** StepShot from the step's screenshot and DOM box (`.sy-shot` + `.sy-mark--overlay`), EventTail
   (`.sy-evtail`), FixChoices (`.sy-choice`, variations from the recovery API), AttemptList.
5. **Attempts.** "Run attempt" → `path.attempt` command card → running → result; on a pass, propose `scan.resume`.
6. **Marks.** `mark.add` from PageDetail ("Skip next time", "Start here") with Undo.
7. **`@` picker.** A combobox of pages, steps, events of the current scan.
8. **Tests.** wb-03, wb-04 snapshots; keyboard on the graph; e2e "stop → troubleshoot → attempt 3 passes → resume"; evals for
   Troubleshoot.

**Definition of done.** wb-03 and wb-04 match at 1280 and work at 1024; the graph is fully usable by keyboard; Back / Forward
move between paths.

**Exit criteria:** troubleshoot sessions that end in a passed attempt or a resume ≥ 50 %; path override rate < 15 % of turns;
Right view? yes-rate ≥ 70 % on Troubleshoot; no regression of Phase 1 numbers.

### Phase 3 · Focus + Explain

**Goal.** Give long scans the whole width, and explain review items where people already are.

**Scope.** Focus mode (`.sy-wb--focus`, `.sy-cmdbar`, `.sy-evstrip`) as a toggle of split; Explain path with FindingCard,
Compare, DecisionTable (the 2.0 partials, reused), RecordCard, StepShot. Compare and DecisionTable also in Chat.

**Steps:**
1. Focus toggle (`F`, button in the stage head), `focus=1` in the URL, command bar with the latest reply and "History (3)".
2. Event strip under the map.
3. Explain partials: reuse `.sy-compare`, `.sy-table--decision`, the finding layout from Review; every decision link is
   "Open in Review".
4. Evals for Explain (path accuracy, "never decides" check on the answer text).
5. Tests: wb-05, wb-07 snapshots; axe.

**Exit criteria:** Explain yes-rate ≥ 70 %; focus mode used in ≥ 30 % of mapping sessions longer than 5 min (if not, drop it);
no confirm / reject actions reachable from the Workbench (test).

### Phase 4 · Out of beta

**Goal.** Decide whether the Workbench becomes a normal tab.

**Steps:** all phase exit numbers held for four weeks; an accessibility audit of wb-01…wb-08; cost per mapping session within
budget; a review of override and fallback logs to find missing components or paths; then remove the `beta` chip and the flag,
or stop the beta. New paths (candidates: "Plan a run", "Review helper") only when chat logs show repeated requests that fall
back to plain chat.

---

## 8. Acceptance checklist

- [ ] No HTML, CSS or style from the model reaches the page (contract tests over `workbench/examples/invalid`).
- [ ] Every generated frame has the solid frame, the "generated" mark and a source line; every view has Why this view? and feedback on its lead frame.
- [ ] Dashed blueprint appears only on assistant-written or assistant-chosen things; observed data sits in solid frames.
- [ ] Numbers on screen come from events or the model store, never from the model's text (grounding check on narration).
- [ ] Every write shows a command card first; nothing runs before Confirm; the audit log ties each run to a confirm.
- [ ] At most one marker button (Confirm or Open in Review) and one intent plate per screen, plus small needs-you statuses (`03` §4 rule 6); Send is `.sy-btn--strong`.
- [ ] Stopped or finished live cards fold to one line under a newer card, with Expand (`aria-expanded`).
- [ ] The map keeps updating with the model switched off.
- [ ] The text answer is never blocked by the view (4 s / 15 s).
- [ ] Focus never moves on its own; Esc closes the innermost thing and returns focus.
- [ ] One announcement per stage change and per milestone; none per event.
- [ ] Single-letter keys respect the shortcuts setting and never fire in text fields.
- [ ] 1280 and 1024: no horizontal page scroll; the graph scrolls inside its frame.
- [ ] As of ≠ Now disables commands with the reason.
- [ ] The kill switch hides the tab and redirects without breaking other pages.
- [ ] Polish portal content stays Polish; times are UTC with Z; scan ids lowercase as stored.

---

## 9. Measuring the beta

### 9.1 Telemetry events

| Event | When | Properties |
|---|---|---|
| `wb_opened` | The tab loads | `entry` (nav · drawer · scans_watch · scans_troubleshoot · link), `phase`, `path` |
| `wb_turn` | A turn completes | `turn_id`, `path_proposed`, `path_final`, `components[]`, `dropped[]` (type, reason), `fallback` (bool), `ms_first_token`, `ms_spec`, `ms_render`, `tokens_in`, `tokens_out` |
| `wb_path_switched` | The person switches path | `from`, `to`, `turn_id` of the view it overrode |
| `wb_view_feedback` | Yes / No (and reasons) | `view_id`, `turn_id`, `value`, `reasons[]`, `has_text` |
| `wb_why_opened` | Why this view? opened | `view_id` |
| `wb_ask` | A chip is added | `target` (page · step · event · view), `via` (button · key · picker) |
| `wb_cmd` | Command card changes state | `cmd`, `source` (assistant · button), `state` (proposed · confirmed · cancelled · done · failed · undone · expired), `ms` |
| `wb_stream` | Stream state changes | `state` (stale · back), `ms_stale`, `replayed_events` |
| `wb_model_unavailable` | The model call fails or times out | `reason`, `ms` |
| `wb_narration_dropped` | A narration line is replaced | `reason` (schema · grounding) |
| `wb_selection` | A page is selected | `source` (map · film · narration · sheet · spec) |
| `wb_focus_mode` | Focus mode toggled | `on` |

No message text, page content or screenshots in telemetry; conversation content stays in the conversation store.

### 9.2 The beta dashboard

One page per phase with the exit numbers in §7, by week: yes-rate by path, overrides by path pair (which path the assistant
picked vs where people went), drops by component and reason, fallbacks, latency percentiles, commands by state, model cost per
mapping session.

### 9.3 Flags and kill switch

| Flag | Default | Off means |
|---|---|---|
| `workbench_beta` | off; on per user | Tab hidden; `/workbench` redirects to Home with the toast "The Workbench is paused"; drawer and Scans links hidden |
| `workbench_phase` | 1 | Which layout, paths, components and commands the user gets (1, 2, 3) |
| `workbench_model` | on | Data-only mode: live views work; composer disabled with "Assistant unavailable" |
| `workbench_model_narration` | off | Templated narration only |
| `workbench_commands` | on | Command cards show "Commands are paused" and link to Scans |

Scans started from the Workbench are ordinary scans; turning anything off never stops them.

---

## 10. Open items

| ID | Question | Proposed default |
|---|---|---|
| OW-1 | Which environments allow Workbench commands after the beta? | Sandbox only during the beta; staging later by portal setting |
| OW-2 | Model narration in Phase 1, or templated only? | Templated first; model when grounding failures < 1 % |
| OW-3 | How long are conversations, specs and feedback text kept? | 90 days, like scan logs |
| OW-4 | Side sheet below 1100 px: stack or overlay? | Resolved: it stacks under the conversation (`genui.css`); an overlay would need a `.sy-sheet` modifier |
| OW-5 | Citations per step or per event? | Resolved: one event per step, so `01a110d5-2028-7000-8f3e-5c1a9b27d460#171` names both (`13-v2-fixtures.md` §Workbench) |
| OW-6 | May Troubleshoot send screenshots to the model (vision)? | No for the beta: the model gets the DOM summary and events; the person sees the screenshot |
| OW-7 | Model-call caps: per scan, per user, per portal? Who sees them? | Per scan and per user per day; shown in Settings ▸ Assistant |
| OW-8 | `scan.stop` needs `POST /runs/{id}:stop` | Resolved: added to `11-map-runs.md` §10 |
