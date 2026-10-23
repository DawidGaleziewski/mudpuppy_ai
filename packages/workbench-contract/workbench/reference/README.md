# Workbench reference app

A small, working Workbench: htmx + server templates + one SSE stream, no React, no build step. It runs the beta's
whole story on the fixture (scan 01a110d5-2028, see [docs/13 · Workbench fixture](../../docs/13-v2-fixtures.md#workbench-gen-ui-beta-fixture))
with a scripted assistant, so you can click through it without an API key, then plug in a real model and the real scan
engine. It is meant to be read in an hour; it is not a framework.

What it proves: the recommendation in [docs/17](../../docs/17-genui-architecture.md) (ADR-WB-1) works with the stack you
already have, and the rules in [docs/14](../../docs/14-workbench.md), [15](../../docs/15-genui-guidelines.md) and
[16](../../docs/16-genui-components.md) can be built as written.

## Run it

```bash
cd workbench/reference
pip install -r requirements.txt
uvicorn app:app --reload            # → http://127.0.0.1:8000/workbench
```

| Variable | Default | What it does |
|---|---|---|
| `WB_PHASE` | `2` | Rollout phase shown first: 1 inline · 2 split + Troubleshoot · 3 focus mode + Explain (also `?phase=` on the page) |
| `WB_REPLAY_INTERVAL` | `2.5` | Seconds between replayed scan events (0.3 for a quick demo) |
| `WB_COMMAND_DELAY` | `0.8` | How long a confirmed command shows "Running" |
| `WB_COMPOSE_DELAY` | `0.4` | Scripted assistant: time between "view started" and the view (so you see the composing frame) |
| `WB_ASSISTANT`, `ANTHROPIC_API_KEY`, `WB_MODEL` | scripted | `WB_ASSISTANT=anthropic` + a key uses the real model (see below) |

### Try this

1. *Map the OC/AC calculator* → a command card asks first → **Start scan**. The confirmed start comes back as a new turn,
   and the assistant opens the live map in it. Pages, the meter and the narration fill in from the stream.
2. Click a page: the detail opens (phase 1: in a side sheet you opened, so it isn't marked generated). **Ask about this**,
   or press <kbd>A</kbd> on a focused page, adds a context chip. Try *What did you do here?*
3. Let it stop at /kontakt: the stop arrives as a turn with **Next action failed at /kontakt** (red); the scan itself
   is *Stopped* (ash). The earlier live card folds to one line with **Expand**.
4. Phase 2: **Troubleshoot with me** → run attempt 2 (*Wait longer*, fails), then attempt 3 (*Record the form, don't
   submit*, passes) → the assistant proposes **Resume** → the map follows scan 01a110e7-2068.
5. Phase 3: *Explain the banner on wynik*; *Show BR-021*; *How many processes are accepted?* (Chat is always inline);
   **Focus mode** (<kbd>F</kbd>).
6. The fallbacks: *demo: invalid view* (answer in words, the stage stays) · *demo: assistant down* (the map keeps
   updating) · *demo: slow* ("Still working" at 4 s) · **Drop the stream 5 s** (stale notice, then it catches up).

## Tests

```bash
python3 -m unittest discover -s tests -t .     # contract, rendering, turns, commands, HTTP + SSE (starts its own server)
python3 evals/run_evals.py                     # golden prompts and system events → path, components, command
python3 tests/e2e_playwright.py                # optional: the story above in Chromium; saves screenshots/workbench/ref-*.png
```

The contract tests read `workbench/examples/`: every `valid/` spec passes untouched; every `invalid/` spec gives the
reason code in `invalid/EXPECTED.json`. `evals/golden.jsonl` runs against the real model too when the key is set.

## How it works, in five rules

1. **One ordered stream per conversation.** `#wb-live` (outside the swapped layout) holds
   `sse-connect="/workbench/stream?c=…"`. Every change to the page arrives on it as htmx out-of-band swaps: turns, answer
   text, the composing frame, views, command states, live data. HTTP responses carry only headers (`HX-Push-Url`,
   `HX-Replace-Url`). So a view never arrives before its layout and a data event never targets a region that isn't there.
2. **Two lanes, one id.** Message ids are `<outbox entries delivered>|<last scan event>` (`14|01a110d5-2028-…#102`). The browser
   resends `Last-Event-ID` on its own reconnects; after a hard reconnect `wb.js` appends `?last_event_id=`. The server
   resumes both lanes from that one id.
3. **The model never writes markup.** It returns a view spec; `catalogue.py` checks it in layers (repair the envelope,
   drop bad components with a reason code, check path, phase and ids, limits), `render.py` places it (the path and phase
   decide the layout, not the model) and Jinja renders it with autoescape on.
4. **Live regions are template blocks.** A block named `live_<name>` wraps an element with id `<frame id>-<name>`
   (`t5-map-canvas`). The stream re-renders only those blocks, so scroll, focus and the open "Why" panel stay put.
   Frame ids are `t{turn}-{component id}`, so cards from different turns never collide.
5. **Writes ask first.** Every write is a command card; Confirm carries a one-time token; the outcome comes back as a
   new turn (which may bring a view). A stopped scan, an attempt result and a confirmed command are all "system events"
   the assistant may react to.

## Files

| File | What it is | Phase · ticket ([docs/17 §9](../../docs/17-genui-architecture.md)) |
|---|---|---|
| `app.py` | Routes, sessions, the turn (`/workbench/turn`), the stream (`/workbench/stream`), system events, commands | 0–3 · WB-02, WB-10, WB-17 |
| `catalogue.py` | Loads `../schema`, layered validation with reason codes, placement, narration grounding, command check | 0 · WB-03 |
| `events.py` | Stub scan engine: in-memory step log (one event per step), replay, attempts, scan state fold, SSE format | 0 · WB-01, WB-02 |
| `assistant.py` | `Assistant` protocol; `ScriptedAssistant` (no key); `AnthropicAssistant` (tools.json, Messages API) | 0 · WB-06 |
| `commands.py` | Proposals, one-time confirm tokens, idempotent Confirm, running → done/failed, cancel, expiry, Undo for marks | 0 · WB-05, WB-24 |
| `render.py` | View-models per component, frames, live blocks, folded views | 1–3 · WB-04 |
| `fixture.py` | The fixture: pages, events, attempts, records, findings, changes | — |
| `templates/workbench.html.j2` | Page shell: header, nav (Workbench · `beta`), path switch, layout, stream element, the one live region | 1 · WB-07, WB-10 |
| `templates/layouts/` | `inline` (phase 1 and Chat), `split` (phase 2), `focus` (phase 3); `#wb-log` and `#wb-composer` are `hx-preserve` | 1–3 · WB-10, WB-20, WB-30 |
| `templates/frames/` | `genview` (mark, Why on the lead frame, feedback, source), `turn`, `view_slot` (composing / cards / folded), `cmd`, `composer`, `pathswitch`, `livebar`, `suggest`, `why`, `feedback`, `composing_stage` | 1 · WB-04, WB-15, WB-17 |
| `templates/components/` | One partial per catalogue type (15), plus `_meter`, `_mini` | 1–3 · WB-11…WB-16, WB-22, WB-23, WB-31 |
| `static/wb.js` | Toggles, point and ask (<kbd>A</kbd>, Ask buttons, `@` picker), Enter to send, stale notice, resume id, scroll pinning, focus keeping | 1 · WB-15, WB-18, WB-25 |
| `static/sy-livemap.js` | `<sy-livemap>` island: follow the crawler, arrow keys in visit order. The map works without it | 2 · WB-21 |
| `static/vendor/` | htmx 2.0.4 and htmx-ext-sse 2.2.3, vendored, with their 0BSD licences | — |
| `tests/` | `test_catalogue`, `test_render`, `test_turns`, `test_commands`, `test_http`, `test_evals`; `e2e_playwright.py` | 0 · WB-09 |
| `evals/` | `golden.jsonl` (messages and system events → expected path, components, command), `run_evals.py` | 0 · WB-09 |

CSS is not copied: the app serves the package's `design-system/` (tokens, fonts, `salvage.css`, `genui.css`) as-is, and
links to the 2.0 screens in `screens/` for "Open in Review" and friends.

## What is stubbed

- **The scan engine** replays 01a110d5-2028 (and 01a110e7-2068 for a resume). Starting a scan always replays it.
- **The portal model** is `fixture.py` (PROC-001…003, BR-021…026, FND-007, CHG-019). `resolve()` in `app.py` is the
  id check; production asks the model store, as of Now, for this person.
- **The assistant** is scripted by default: a keyword router over `../examples`. It mirrors what the prompt asks for,
  including "not every message recomposes the screen".
- **One conversation per browser session** (cookie). Production keeps conversations (`c=wbc_…` in the URL, docs/14 §2.2).
- **Sessions, outboxes, commands and telemetry live in memory**; restart = empty.

## Plug in a real model

`AnthropicAssistant` sends `../schema/tools.json` (`render_view`, `propose_command`, and a forced `narrate` for
narration batches) with the context: path, phase, selection, chips, scan summary, ids it may bind. To make it
production-ready:

- **Stream.** Use the streaming Messages API and yield `("text", …)` as text deltas arrive (coalesce every 250 ms) and
  `("view_start", None)` on the `content_block_start` of a `render_view` tool_use block. The server already handles the
  rest: composing frame, the 4 s "Still working" line, the 15 s view deadline.
- **Tool results.** Answer `propose_command` at once with a tool_result ("proposed k004, waiting for the person to
  confirm"); the Confirm outcome is a new turn (`on_event`). Answer `render_view` with what was dropped, so the model
  learns; allow one repair call inside the 15 s budget.
- **Untrusted text.** Page content goes inside `<scan_data>…</scan_data>` and is never followed as instructions.
  Screenshots never go to the model in the beta.
- **Narration** uses a small, fast model, one call per page batch, capped per scan; the grounding check stays.

## Plug in the real scan engine

Replace `Engine` with a tail of the event store (the same `Event(id, scan, step, type, data)` shape, one event per
step) and make the command executors call the API in [docs/11 §10](../../docs/11-map-runs.md):
`POST /portals/{p}/runs`, `POST /runs/{id}:resume`, `POST /runs/{id}:stop`, `POST /paths/{id}/attempts` (the server
finds the path from scan + step), `POST /portals/{p}/marks` and `DELETE …/marks/{mark}` for Undo.

## Production notes

- **Auth.** The stream checks that `c` belongs to the cookie's session; production checks the person, their portal
  permission (`scan:write` for commands) and the environment (beta: sandbox only).
- **CSRF.** Every POST carries `X-CSRF-Token` from `<body hx-headers>`; use your framework's equivalent if it has one.
  Confirm also needs the card's one-time token and sends an `Idempotency-Key`.
- **Rate limits and cost.** Turns per person per day, narration calls per scan, context size: [docs/17 §4.7](../../docs/17-genui-architecture.md).
- **Logging.** `track()` writes one JSON line per event (`view.rendered`, `view.drop` with its code, `view.fallback`,
  `path.override`, `ask.pointed`, `feedback`, `command.*`, `narration.rejected`, `assistant.error`, `stream.open`); map
  them to the telemetry in [docs/14 §9.1](../../docs/14-workbench.md). `/workbench/telemetry` is for local use only.
- **Scale.** Keep each conversation's outbox in a shared store (Redis stream) so any server can serve its stream; render
  data-lane fragments once per event and fan them out; drop a client that lags by more than 200 messages to a resync.
  Serve over HTTP/2 (one EventSource per tab).
- **History.** `historyCacheSize: 0`: conversation text never goes to localStorage; Back re-requests the URL.
- **CSP.** All script is in files; the templates use `style` attributes only for layout hooks (`left`, `top`, `--value`).

## Where it is simpler than docs/17

| docs/17 says | The reference does | Why |
|---|---|---|
| Stream answer text as deltas, coalesced every 250 ms | The scripted assistant sends the text in one piece | No model here; the slot (`t5--text`) is the same |
| `<sy-livemap>` moves along edges (`data-next` / `data-prev`) | Arrow keys move in visit order | Good enough for six pages |
| `@` picker filled by `hx-get="/workbench/pick?q="` | Built in the browser from the pages on screen | No search index here |
| Command states pushed, proposals expire after 10 min | Same, expiry checked when someone confirms | No timer service |
| Model down disables Send until a health check passes | Send stays on; each turn says so | No health check here |
