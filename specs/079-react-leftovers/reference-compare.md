# Our Workbench against the designer's reference app (spec 079 FR-010, R-94 (5))

Reference: `docs/design/salvage-yard/workbench/reference/` (Starlette, Jinja2, htmx, one SSE stream,
scripted assistant, in-memory stub engine), with `schema/`, `examples/`, `a2ui/` and docs 14-17.
Paths below are relative to `docs/design/salvage-yard/workbench/reference/` unless they start with
`apps/` or `packages/`.

Ours, beta: `apps/web/src/pages/Workbench*.tsx`, `apps/dashboard/.../wb_*.py`, `queries_wb*.py`,
`apps/dashboard/.../web/api_workbench.py`, and the chat service's `apps/chat/src/workbench-*.ts`.
Ours, live: `apps/web/src/features/workbench-live/`, `web/api_workbench_live.py`,
`web/workbench_live.py`.

The reference is a demo on a fixture. Where it is simply a stub (the replay engine, the scripted
assistant, `fixture.py`, demo reset and drop), it is not a gap and is left out.

## 1. What the reference does that ours does not

Size: small = under a day, one place. Large = a phase of its own.

| # | Reference behaviour (file:line) | Ours | Size | Proposed home |
|---|---|---|---|---|
| 1 | Paths Troubleshoot and Explain, per phase (`catalogue.py` `PATH_PHASE`; `app.py:220-231` default views) | Missing. `PHASE = 1`, paths `chat, mapping` only (`apps/chat/src/workbench-service.ts:23`, `workbench-context.ts:137`) | Large | Roadmap leftover (R-94 phases 2-4) |
| 2 | Seven components: StepShot, EventTail, FixChoices, AttemptList, Compare, DecisionTable, FindingCard (`templates/components/`, `render.py` `vm_*`) | Missing. Live catalog registers them as placeholder text (`workbench-live/catalog.tsx:14-22`); the beta draws none | Large | Roadmap leftover (with 1) |
| 3 | Commands `path.attempt` and `mark.add` with undo of a mark (`commands.py:23, 137-141, 149-154`) | Missing. Both refused as `NOT_IN_PHASE` (`workbench-commands.ts:172`). Ours has `persona.add` instead | Large | Roadmap leftover (needs 1) |
| 4 | Split and focus layouts, the focus toggle, "Show the conversation" link (`app.py:149-158, 592`; `templates/layouts/split.html.j2`, `focus.html.j2`) | Missing. One layout: conversation plus a side sheet (`WbLayout`, `design-system/organisms/WbParts.tsx:185`) | Large | Roadmap leftover (phase 2/3) |
| 5 | As of: time travel, and writes refused while it is not Now (`app.py:595`; `commands.py:112-113`) | Missing. Context is fixed to `as_of: now` (`workbench-context.ts:137`) | Large | Designer question: is time travel wanted at all before the model supports it? |
| 6 | Path switch composed without a model call, per path default views (`app.py:206-244`) | Partly. A path switch exists (`api_workbench.py:112`, telemetry `wb_path_switched`) but only chat and mapping | Small once 1 exists | Falls out of 1 |
| 7 | "Still working" line when nothing has started 4 s after Send (`app.py:34, 350-354`) | Missing | Small | This branch if cheap, else leftover |
| 8 | View deadline 15 s and turn deadline 30 s, then a quiet words-only fallback (`app.py:35-36, 296, 301-307, 359`) | Fallback to words exists (stored `fallback` flag, `workbench-events.ts:24-28`). No wall-clock deadlines found | Small | This branch if cheap, else leftover |
| 9 | Model-written narration checked against cited events: every number must appear in a cited event, else a templated line (`app.py:493-512`; `catalogue.py` `check_narration`; `schema/narration.schema.json`) | Different. Narration is built from the events by code (`wb_render.py:195-222`), never by the model. The narration schema is loaded but unused (`packages/workbench-contract/src/contract.ts:58`) | Large | Designer question: is model narration wanted? If not, drop the schema from our use |
| 10 | Scan narration reacts to events: a stop becomes a new assistant turn without the person asking (`app.py:455-465, 468-490`) | Partly. Standing reactions exist (`wb_render.py:280`), no assistant turn is started by a scan stop | Small to large | Designer question: should the assistant speak up on a stop? |
| 11 | Open the cited event: a page per step with the raw events (`app.py:654-658`; `event.html.j2`) | Partly. Narration lines carry cites (`catalog-scan.tsx:127`); no page for the raw event found | Small | Roadmap leftover |
| 12 | Point-and-ask chips validated against the model (`app.py:330-336`) | Ours has chips and `wb_ask` telemetry (`workbench-service.ts:94`). Validation of each chip against the model not checked | Small | Check in the review, not a known gap |
| 13 | Telemetry as a read route, last 200 records (`app.py:680-681`) | Ours writes JSONL files only (`workbench-telemetry.ts`) | Small | Nothing: files are what R-94 exit numbers need |
| 14 | Ordered words lane plus data lane in one stream, resumable by one cursor `outbox|event` (`app.py:391-397, 400-440`) | Different design: a fresh snapshot on reconnect, words resume from `chat_after` (`api_workbench_live.py` header) | n/a | Not a gap, see section 3 |
| 15 | Reference evals: 19 golden cases over path, required and forbidden components, command (`evals/golden.jsonl`, `run_evals.py`) | Ours has its own golden set and grader (`apps/chat/evals/workbench/golden.yaml`, `grade.ts`), phase 1 only | Small | Grow with 1 and 3 |
| 16 | Playwright run and unit tests of render, catalogue, A2UI, HTTP (`tests/`) | Ours covers contract, commands, live, browser e2e (`apps/chat/tests/workbench-*.test.ts`); the reference's `test_render.py` view-model checks have no counterpart | Small | Not needed |

## 2. What ours does that the reference does not

- Real data: a stored conversation, turns, views, commands and feedback in SQLite, not in memory.
- Real model: the chat service runs the assistant with `render_view`, `propose_command` and
  `ask_choice`, with a fence and a daily turn cap (`workbench-service.ts:58`).
- Real scans: `scan.start`, `scan.resume`, `scan.stop` run the crawler through the chat service.
- Command cards hash the confirm token, check preconditions again on Confirm, expire after 10
  minutes by a timer, and settle a confirmed scan when its run starts or never does
  (`workbench-commands.ts`, `workbench-settle.ts`).
- `persona.add` with an editable card, and `ask_choice` frames for portal, store, persona.
- Live Workbench: AG-UI events over a WebSocket, shared state as JSON Patch, A2UI v0.9.1
  compiled on the server (`wb_a2ui.py`), reconnect with backoff, a heartbeat watchdog, a scan
  graph drawn from the stored map.
- Feedback with reasons stored per view; telemetry as day files.
- The design system's React parts with stories; the tokens come from the design package.
- Generator and drift test keep our copy of the contract equal to the designer's folder
  (`packages/workbench-contract/tests/drift.test.ts`).

## 3. Contract differences

| Topic | Reference | Ours |
|---|---|---|
| Transport | SSE `frag` and `heartbeat` events carrying HTML out-of-band swaps (`app.py:417, 428, 437`) | WebSocket frames of AG-UI events, each with `seq` (`workbench-live/protocol.ts`) |
| Event names | `frag`, `heartbeat`; data events `scan.started`, `scan.resumed`, `page.visited`, `action`, `scan.stopped`; `attempt.started`, `attempt.result` (`events.py:1-9`) | `STATE_SNAPSHOT`, `STATE_DELTA`, `MESSAGES_SNAPSHOT`, `TEXT_MESSAGE_START/CONTENT/END`, `RUN_STARTED`, `RUN_FINISHED`, `CUSTOM` (`a2ui`, `notice`, `heartbeat`). Beta chat stream: `wb_composing`, `wb_view`, `wb_no_view`, `wb_command` |
| Assistant stream | `text`, `view_start`, `view`, `command` (`assistant.py:12-14`) | Tool calls `render_view`, `propose_command`, `ask_choice` (`mcp-workbench-tools.ts`); composing starts on `tool_started` (`workbench-events.ts:22`) |
| Up messages | HTTP forms with a CSRF header | `{type: 'action', action}` and `{type: 'say', text}` on the socket; same origin only |
| A2UI | Spike only: `a2ui/catalog.json` v0.9.1, 15 agent components plus `View` and `CommandCard` (server-owned) | Same catalog id and v0.9.1, plus our own server-owned `Choice` (not in the designer's catalog), `RecordCard`, `RecordList` in the drawn set |
| Catalog components | 15: LiveMap, ScanMeter, PageMiniature, PageDetail, Narration, ErrorCard, StepShot, EventTail, FixChoices, AttemptList, Compare, DecisionTable, FindingCard, RecordCard, RecordList | Drawn: the phase 1 set (LiveMap, ScanMeter, PageMiniature, PageDetail, Narration, ErrorCard, RecordCard, RecordList). Placeholders: the other seven |
| Command names | `scan.start`, `scan.resume`, `scan.stop`, `path.attempt`, `mark.add` (`commands.py:23`) | `scan.start`, `scan.resume`, `scan.stop`, `persona.add`; the other two refused |
| Command states | `proposed`, `running`, `done`, `failed`, `cancelled`, `expired`, `undone` (`commands.py:3-5`) | The same seven (`workbench-commands.ts:25`) |
| Command lifecycle detail | One in-memory token per card; undo only for `mark.add` | Token hashed, re-issued per card shown (the previous stops working), precondition hash, idempotency key, undo for `persona.add`; `running` ends by the settle timer |
| Refusal codes (commands) | A plain sentence from `precondition` (`app.py:247-257`) | `NOT_FOUND`, `NOT_PROPOSED`, `BAD_TOKEN`, `EXPIRED`, `PRECONDITION`, `NOT_IN_PHASE`, `PAUSED` |
| View reason codes | `repaired_why`, `repaired_suggestions`, `repaired_path`, `unknown_type`, `missing_id`, `bad_bind_or_props`, `not_on_path`, `not_in_phase`, `id_not_found`, `duplicate_id`, `duplicate`, `too_many` | The designer's codes through `createViewChecker`; the `idExists` layer is ours (store lookup) |
| Phase | `WB_PHASE` default 2, switchable by `?phase=` | Constant 1 |
| Layout | Server picks inline, split or focus from path, phase and focus flag | Inline with a side sheet |
| Session | Cookie plus CSRF token, in memory | Stored conversation id, same-origin check on the socket |

## 4. R-105 (2) proposal

`packages/workbench-contract/workbench/reference/` is a byte-for-byte copy of the designer's
reference app (the drift test compares the whole `workbench/` folder with
`docs/design/salvage-yard/workbench/`). Nothing in `apps/` or the package's `src/` reads it; only
the drift test touches it. It duplicates a few thousand lines (Python, templates, vendored htmx) of tooling we do not run (Python,
htmx, vendored scripts).

Proposal: remove the `reference/` folder from the package copy and change the drift test to compare
only the parts the contract uses (`schema/`, `examples/`, `a2ui/`, `tools/`). The designer's
original stays in `docs/design/salvage-yard/workbench/reference/` as the readable guide.

Reason: the copy is read by nobody, and the original already holds it. Keep it only if the owner
wants the package to run the reference's own tests (`reference/tests/`); none of our suites do.

This comparison needs the original, so the original stays whatever the owner decides.
