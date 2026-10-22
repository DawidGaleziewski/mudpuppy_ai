# Contract: Workbench between the dashboard and the chat service (spec 043, D-2)

The browser only talks to the dashboard. The dashboard reads the Workbench tables from the store
(read-only, like every page) and calls the chat service server-side for every write and for the
words-lane stream. Bodies are JSON; errors are `{ref, message}` with the usual status codes.

## Chat service (127.0.0.1:4310)

| Method and path | Body | Answer | Does |
|---|---|---|---|
| `POST /workbench/conversations` | `{portal}` | 201 `{conversation_id}` | A Workbench conversation (`chat_conversations.kind = 'workbench'`, path chat) |
| `POST /workbench/conversations/{c}/turns` | `{text, ctx: [chip…], by}` | 202 `{turn}` | Sends a turn to the assistant; 409 while a turn runs; 429 at the day's cap |
| `POST /workbench/conversations/{c}/path` | `{path, by}` | 200 `{path, path_source: 'you'}` | The person's switch (WB-UI-03); logged as `wb_path_switched` |
| `GET /workbench/conversations/{c}/events` | — | SSE | Words lane, below |
| `POST /workbench/commands` | `{conversation_id, turn, command, args, by}` | 201 `{id}` | A command card the person opened from a button (`source: 'button'`) |
| `POST /workbench/commands/{id}/token` | `{by}` | 200 `{token}` | A fresh one-time confirm token (the previous one stops working); only while `proposed` |
| `POST /workbench/commands/{id}/confirm` | `{token, by}` | 200 `{state}` | Checks token, expiry, preconditions, idempotency; runs the command |
| `POST /workbench/commands/{id}/cancel` | `{by}` | 200 `{state: 'cancelled'}` | |
| `POST /workbench/views/{v}/feedback` | `{by, value, reasons, text}` | 200 | Right view? (one row per view and person) |
| `GET /workbench/usage` | — | 200 `{turns_today, cap}` | For Settings ▸ Assistant and the composer |

`ctx` chips (WB-UI-11): `{kind: 'page', scan, route, state?}`, `{kind: 'step', scan, step}`,
`{kind: 'event', ref}`, `{kind: 'view', id}`; at most 3.

### Words-lane events (SSE, `id:` = per-conversation sequence)

| `event:` | `data` | When |
|---|---|---|
| `answer` | `{turn, text}` | The answer so far, coalesced (whole text, not deltas) |
| `composing` | `{turn, path}` | The model opened a `render_view` call |
| `view` | `{turn, view_id, fallback}` | A checked view was stored |
| `no_view` | `{turn, reason}` | 15 s without a valid spec, or nothing left after the check |
| `command` | `{id, state}` | A command changed state (proposed, running, done, failed, …) |
| `turn_done` | `{turn, stop_reason}` | |
| `model` | `{state: 'up' \| 'down', ref?}` | The assistant became unavailable or came back |
| `heartbeat` | `{}` | Every 15 s |

The dashboard renders each into fragments for its tab; the data lane (scan events) it reads from
the store itself (`queries_wb_scan`), so the chat service is not in that lane.

## Dashboard (browser-facing)

| Route | Does |
|---|---|
| `GET /workbench?c=&path=&sel=` | The page (inline layout, phase 1) |
| `POST /workbench/turn` | Form post: forwards the turn, answers the person's message and an empty assistant message `#turn-t{n}` |
| `GET /workbench/stream?c=` | One SSE per tab: words lane relayed and rendered, data lane from the store, heartbeat |
| `POST /workbench/path` | The Path switch |
| `GET /workbench/select?c=&sel=` | The layout with the side sheet for the selected page |
| `POST /workbench/commands/{id}/confirm`, `…/cancel` | Card buttons; answer the card in its new state |
| `POST /workbench/views/{v}/feedback` | The feedback group in its new state |
