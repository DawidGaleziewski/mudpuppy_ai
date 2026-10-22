# Spec 043: Workbench, the generative UI beta, phases 0 and 1 (R-92)

Branch `feature/043-r92-workbench-genui` · 2026-10-22 · owner request (2026-10-22): "I want you to
see gen ui roadmap item. Can we kickstart this? It should have already new design ready." The
design is the owner's package `user_input/genui/mudpuppy-salvage-yard-genui.zip`, now copied into
`docs/design/salvage-yard/` (docs 14–17, screens `wb-01`…`wb-10`, `genui.css`, the contract in
`workbench/`). Owner answers 2026-10-22: **htmx as designed** (the designer's ADR-WB-1, doc 17 § 1),
not the React island the roadmap row named; **this branch builds phases 0 and 1**.

## Problem

R-92 asked for a chat that composes screens instead of only writing text, to learn whether
generated views help a BA. The designer turned it into the **Workbench**: a beta tab where the
assistant picks components from a fixed catalogue (15) and the server renders them; live scan data
reaches the screen without the model; every write is a command card a person confirms. The design
assumes a product we are not (many users, permissions, a telemetry stack, a Messages API adapter, a
scan event store). This spec builds phases 0 and 1 on what MudPuppy is: one local person, the
dashboard (Python, read-only) and the chat service (TypeScript, the only writer, the model through
the person's Claude Code login).

## Scope

**In (designer's phase 0 and phase 1, `14-workbench.md` § 7, tickets WB-01…WB-19, WB-42):**

- **Contract:** the designer's generator and JSON (`workbench/tools/gen_wb_schema.py`,
  `workbench/schema/*`) as the single source; the validator (layers 1–6, drop, don't fail) with
  contract tests over `workbench/examples`; a drift check.
- **Data lane:** scan events from the store, one per step (`scan#step`), streamed over SSE with
  replay from the last id and a heartbeat; no model in that lane.
- **Words lane:** the chat service gives a Workbench conversation the tools `render_view` and
  `propose_command`; the answer streams first, the view follows.
- **Page:** `/workbench`, the inline layout (`.sy-wb--inline`, `--nosheet`), the head with the Path
  switch (Chat, Mapping), the conversation, the composer with context chips and suggestions, the
  side sheet; first visit and starters.
- **Components (phase 1):** LiveMap (filmstrip), ScanMeter, PageMiniature, PageDetail, Narration
  (templated lines), ErrorCard, RecordCard, RecordList; the frames (`.sy-genview` with the mark,
  source line, Why this view?, Right view?), the composing skeleton, the live bar, fold of a stopped
  card.
- **Commands:** `scan.start`, `scan.resume`, `scan.stop` as command cards in all seven states, with
  one-time confirm tokens, idempotency, the environment check and an audit row.
- **Generation states:** composing, answer first (4 s / 15 s), fallback, stale stream, model down,
  As of ≠ Now, path override.
- **Point and ask:** Ask buttons and `A`, chips as structured context (max 3).
- **Entries:** the nav item with the `beta` chip; drawer "Continue in Workbench"; Scans "Watch in
  Workbench".
- **Flags, caps, telemetry, evals:** the flags as settings, the kill switch, turn caps, telemetry
  events as a local log, the eval harness with 40 golden prompts (scripted replay in CI; a live run
  only with the owner's budget).

**Out:** phases 2–4 (split layout, graph island, Troubleshoot, `@` picker, marks, focus mode,
Explain, out of beta); model narration (`narrate`, OW-2: templated first); the beta metrics
dashboard (telemetry is logged, not charted); multi-user permissions; HTTP/2; the designer's
`workbench/reference/` app (not in the package yet, "ships in the next update").

## Adaptations to MudPuppy (D-1…D-9, for the owner to review)

The design is followed as drawn except where it assumes infrastructure we don't have. Each change
below keeps the designer's behaviour rule and replaces only the mechanism.

| # | Design says | Here | Why |
|---|---|---|---|
| D-1 | A model adapter calling the Messages API with `tools.json` (doc 17 § 4.4–4.6) | The chat service's ACP session (the person's Claude Code login), with `render_view` and `propose_command` as MCP chat tools whose input schemas come from `tools.json`; the full schemas validate again | The model already runs there; no API key, no second model path |
| D-2 | One Workbench server validates, places and renders | Chat service (TS): receives tool calls, validates layers 1–5 (layer 4 against the store), stores the view, owns commands; the check lives in `packages/workbench-contract`. Dashboard (Python): applies `select` against the person's selection (layer 6), places, renders Jinja partials; a bind that no longer resolves renders as not found | The dashboard is read-only and owns templates; the chat service is the only writer (constitution) |
| D-3 | A scan event store with ten event types (WB-01) | Events derived from the store: a run's `call` spans are its steps (`steps_used` counts them), `state_observations` give `page.visited`, refused and failed calls give `action.failed`, the run row gives started/stopped/finished; the sequence is the span order | Every fact is already recorded; a second copy would drift |
| D-4 | Per-person flags and `scan:write` permission | Settings: `MUDPUPPY_WORKBENCH` (beta on/off; kill switch), phase fixed at 1, `MUDPUPPY_WORKBENCH_MODEL` and `MUDPUPPY_WORKBENCH_COMMANDS` (on/off); the person is `MUDPUPPY_REVIEWER` | One local person; the reviewer name already signs writes |
| D-5 | Commands map to `POST /runs/{id}:resume`, `POST /portals/{p}/runs`, `POST /runs/{id}:stop` | A scan here is the crawler agent working, started by the conversation's assistant from `request_scan`'s hand-off. So Confirm of `scan.start` / `scan.resume` (a `continue` run, spec 034) runs `request_scan`'s checks in the chat service and records the step; the hand-off goes to the Workbench assistant as an event turn ("The person confirmed …; start the crawler with exactly this prompt"). The Workbench fence lets the assistant start the crawler only with a hand-off a confirmed command produced, once; `request_scan`, `stop_scan` and every other write tool are not offered to it. The command is done when the new run is in the store (its id is the result). `scan.stop` calls the chat's run stop directly, no model | Same effects through the existing paths, and the fence makes "nothing runs before Confirm" hold for an agent, not only for an API |
| D-6 | Commands allowed on sandbox only during the beta (OW-1) | No check by environment name: a command is allowed wherever the chat may start the same scan today; the environment's `max_action_class` and the safety gates limit what the scan does | Environment names have no meaning of their own (spec 030, owner D-1); the limit is `max_action_class` |
| D-7 | Telemetry events and a beta dashboard (WB-08) | The § 9.1 events as JSON lines in `data/logs/workbench/`; no dashboard | Nothing to send them to; the log is enough to compute the exit numbers later |
| D-8 | 40 golden prompts in CI against the model | The harness and the 40 prompts; CI runs them on recorded turns (scripted replay); a live run costs money and runs only with the owner's budget | Paid runs need the owner (rule) |
| D-10 | Entries land with the conversation or scan in context: "Continue in Workbench" keeps the drawer's conversation, "Watch in Workbench" opens `path=mapping&scan=…` | Both open a new Workbench conversation; Watch fills in "Watch scan 01a110d5." for the person to send, so the assistant composes the live view | A Workbench conversation is its own kind, and a view comes only from a turn; the dashboard writes nothing itself |
| D-9 | Scan ids like `01a110d5` (the schema allows exactly 8 hex) | Binds carry the first 8 characters of our UUIDv7 run id; the server resolves the prefix, first among the scans the conversation binds, then the portal's newest; the context tells the model only prefixes that are unique (F-05) | The schema is the designer's; UUIDv7 prefixes collide for runs started within about a minute |

### Owner review of D-1…D-10 (2026-10-22, questionnaire page)

| # | Answer | Follow-up |
|---|---|---|
| D-1 | Accepted, with a constraint: "I cant use api key in work env. For now it has to be in the cli when i log in to claud. And best if at least for some time it would be easy for me to switch to something like kiro. So it is mainly agent driven/subagent. We dont own the agent loop for now" | R-96 keeps the agent behind ACP on the CLI login and stays agent-neutral: no Claude Agent SDK adapter, the shared-state bridge reads ACP events |
| D-2 | Accepted | — |
| D-3 | Accepted | — |
| D-4 | Accepted | — |
| D-5 | Replace as planned in R-96 (background crawler runner; the agent never blocks and never starts the crawler) | R-96 |
| D-6 | Only environments the owner switches on (a per-environment setting, e.g. on for local-dev and sandbox, off elsewhere) | To build (R-94 (8)) |
| D-7 | Accepted | — |
| D-8 | The paid live run after R-96, on the new format | R-96 |
| D-9 | Switch to full scan ids now (changes the designer's schema) | To build (R-94 (8)); tell the designer |
| D-10 | In R-96: Watch opens the live view at once; Continue keeps the conversation | R-96 |

## Requirements

Each cites the designer's ids (WB-UI rules in `14-workbench.md` § 5, FE-W in `17-…` § 10).

- **FR-001 Contract (FE-W02, WB-03).** The view spec, command and narration schemas and the
  catalogue are the designer's generated JSON, read at start-up by both services. A drift test
  regenerates them with `gen_wb_schema.py` and fails if they differ.
- **FR-002 Validation (FE-W03, doc 17 § 5.1).** Layers 1–6; a failing component is dropped with its
  reason code, the view keeps the rest, nothing left → plain chat (WB-UI-31). Every file in
  `examples/valid` passes; every file in `examples/invalid` gets the code in `EXPECTED.json`.
- **FR-003 Model strings are text.** No model string reaches markup, an attribute or a URL; Jinja
  autoescape, never `|safe`; `htmx.config.allowEval = false`, `allowScriptTags = false` on the page.
- **FR-004 Data lane (FE-W06, WB-UI-13).** One SSE stream per Workbench tab keyed by conversation;
  it carries data-lane fragments for every scan the conversation binds and the words-lane messages;
  `Last-Event-ID` (and `last_event_id`) replay; heartbeat every 15 s; event → screen p95 < 1 s on
  the fixture.
- **FR-005 Turn (WB-UI-01, -29, -30; FE-W10).** Send posts a turn; the answer streams as it is
  written; a composing frame appears when `render_view` starts; "Still working" after 4 s with no
  text or view; the view is dropped after 15 s; one view per turn.
- **FR-006 Placement (WB-UI-05, -06; doc 14 § 3).** Phase 1: every component is a card in the
  assistant's message, PageDetail in the side sheet; chat at most 2 components, mapping at most 4;
  frame ids `t{turn}-{id}`; a kept component is swapped in place.
- **FR-007 Paths (WB-UI-02…04; FE-W05).** Chat and Mapping; the switch shows the reason with its
  source (assistant, you); the person's switch wins until a new message asks for something else;
  the path is in the URL.
- **FR-008 Components.** The eight phase 1 components and the frames, drawn as in `wb-01`, `wb-02`,
  `wb-06` and `genui-components.html`, with data from our stores keyed by the binds.
- **FR-009 Narration (WB-UI-17…19, FE-W07).** Templated lines from events, one per page or
  milestone, at most one per 5 s, each citing its event.
- **FR-010 Commands (WB-UI-20…25; FE-W08, FE-W14).** Proposal → card (proposed) → Confirm with a
  one-time token → running → done | failed; Cancel; expired after 10 min or a changed
  precondition; nothing reaches a scan before Confirm; an audit row per confirm; the same scan
  checks as the chat (D-6).
- **FR-011 Standing reaction (WB-UI-22).** A bound scan that stops adds an ErrorCard to the view
  and a message with two suggestions; the path does not change.
- **FR-012 Provenance and feedback (WB-UI-26…28; FE-W04).** Lead frame: Why this view? and Right
  view? Yes / No with reasons; one answer per view, changeable; stored.
- **FR-013 States (WB-UI-31…34; FE-W11, FE-W13).** Fallback, stale stream, model down (data lane
  keeps working), path override notice, As of ≠ Now disables commands.
- **FR-014 Selection and side sheet (WB-UI-07, -08, -38; FE-W16).** One selected page; `sel` in the
  URL (replace); live updates never change it; Esc closes the sheet and returns focus.
- **FR-015 Point and ask (WB-UI-09, -11, -12; FE-W09).** Ask button and `A`; chips are structured
  context, at most 3, each removable; suggestions send their text with the chips.
- **FR-016 Live bar and fold (WB-UI-16, -40; FE-W17).**
- **FR-017 Focus, announcements, keys (WB-UI-35…38; FE-W12).** One polite live region; one
  announcement per stage change and milestone; single-letter keys follow the shortcuts setting.
- **FR-018 Entries and kill switch (FE-W01, FE-W18).** Nav item with `beta`; with the beta off the
  tab is hidden and `/workbench` redirects Home with "The Workbench is paused"; drawer and Scans
  links.
- **FR-019 Caps (FE-W25, WB-42).** At most 200 turns per day; a quiet composer line when reached;
  usage under Settings ▸ Assistant.
- **FR-020 Untrusted page text (FE-W15).** Page text in the context goes inside `<scan_data>`,
  `<`/`>` escaped, truncated to 4 000 characters; vault and input values never in prompts or logs.
- **FR-021 Telemetry (D-7).** The § 9.1 events, no message text.
- **FR-022 Evals (D-8).** 40 golden prompts (Chat and Mapping, plus injection cases), graded on path
  accuracy and component recall/precision; scripted replay in the test suite.

## Success criteria

- SC-001 Contract tests green over `workbench/examples`; drift test green.
- SC-002 On the fixture scan: start → six pages → stop → Resume card → Confirm → done, in a browser
  test; the map keeps updating with the model off; a dropped stream replays.
- SC-003 `wb-01`, `wb-02`, `wb-06` and the phase 1 parts of `wb-08` match at 1280 and work at 1024;
  `ui:check` clean (one h1, at most one primary, axe).
- SC-004 No write without a confirm (audit test).
- SC-005 Every suite green; `code-reviewer` findings fixed or deferred.

## Ids

Designer's: WB-UI-xx, FE-Wxx, WB-xx tickets, OW-x. Ours: D-x adaptations above, F-x findings in
`findings.md`.
