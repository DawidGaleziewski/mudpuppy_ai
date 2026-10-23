# Q13 · R-96: the 15 Workbench components as an A2UI catalogue

**Question.** For the Workbench spike: which component types and properties, and how live state binds to them.

**Version first.** A2UI's site lists **v0.9.1 as current**, v1.0 as a candidate and v0.8 as legacy. Our earlier note
(`18-design-answers/09-a2ui-carry-over.md`) used v0.8's message names; in v0.9.1 they are `createSurface` (was
`beginRendering`), `updateComponents` (was `surfaceUpdate`), `updateDataModel` (was `dataModelUpdate`), `deleteSurface`, and
the client sends `action`. Everything below is v0.9.1. Check the exact envelope against the spec when the spike starts; if
you adopt v1.0, regenerate.

## Decision

1. **The catalogue is generated, not hand-written.** `workbench/tools/gen_wb_schema.py` now also writes
   `workbench/a2ui/catalog.json` from the same `CATALOGUE` list as the view-spec schema, so ids, patterns, enums and limits
   have one source. Catalog id: `https://mudpuppy.local/a2ui/catalogs/workbench/v1/catalog.json`.
2. **Components carry ids and options; the data model carries every observed value; the server owns the data model.**
   This is D-39 ("the model chooses, the data speaks") in A2UI terms.
3. **The spike compiles view specs to A2UI on the server (stage 1).** The model keeps calling `render_view` with a view
   spec; the server validates it as today and emits A2UI messages to the client. You get A2UI's renderer and wire format
   without teaching the model a second protocol. **Stage 2** (an agent that writes A2UI itself) is possible later: the same
   catalog, plus the server filter below.

## Component types and properties

Every catalogue component keeps its name, its **bind** ids and its **props**, flattened onto the A2UI component (A2UI puts
properties next to `id` and `component`). The server adds `data` (where its live values are). Generated in full in
`catalog.json`; summary:

| Component | Owner | Properties (agent) | `data` path (server) | Actions (client → server) |
|---|---|---|---|---|
| LiveMap | agent | `scan`*, `follow`, `view` (graph · filmstrip), `highlight` | `/scans/{scan}` | page.select · page.ask · map.follow · map.open |
| ScanMeter | agent | `scan`* | `/scans/{scan}/meter` | scan.stop ✎ |
| PageMiniature | agent | `scan`*, `page`*, `size` | `/scans/{scan}/pages` | page.select · page.ask |
| PageDetail | agent | `scan`*, `page`* | `/scans/{scan}/pages` | page.ask · path.switch · mark.add ✎ · screen.open |
| Narration | agent | `scan`*, `every` | `/scans/{scan}/narration` | line.ask · event.open |
| ErrorCard | agent | `scan`* | `/scans/{scan}/stop` | scan.resume ✎ · path.switch · page.ask |
| StepShot | agent | `scan`*, `step`*, `mark` | `/scans/{scan}/steps/{step}` | region.ask |
| EventTail | agent | `scan`*, `step`, `count` | `/scans/{scan}/events` | events.copy · scans.open |
| FixChoices | agent | `scan`*, `step`* | `/scans/{scan}/fixes/{step}` | path.attempt ✎ |
| AttemptList | agent | `scan`*, `step`* | `/scans/{scan}/attempts/{step}` | attempt.open |
| Compare | agent | `change`* | `/changes/{change}` | changes.open |
| DecisionTable | agent | `rule`* | `/rules/{rule}` | rules.open |
| FindingCard | agent | `finding`* | `/findings/{finding}` | review.open |
| RecordCard | agent | `record`* | `/records/{record}` | record.open |
| RecordList | agent | `records`* (1–12), `title` | `/records` | record.open |
| **View** | **server** | root of every surface: `path`, `why`, `children`, `suggestions` | `/view` | view.feedback · path.switch · suggestion.send |
| **CommandCard** | **server** | `command` | `/commands/{id}` | command.confirm · command.cancel · command.undo |

\* required. ✎ = a write: the server answers with a CommandCard on the same surface; nothing runs before `command.confirm`.
Patterns as in the view spec: full scan ids (UUID), record ids (13 prefixes, 3+ digits), routes, plain text without markup.
`id` is `^[a-z][a-z0-9-]{0,23}$`; `root` is reserved for View. Each component schema uses `unevaluatedProperties: false`, so
anything extra (a `style`, a `text`) fails validation. Per-component extras (phase, paths, placement, data path, actions
with their context schemas) are in `x-mudpuppy`.

**Frame components are in the catalog but owned by the server**: View (the generated-view frame, D-40: genmark, Why this
view?, source line, feedback, suggestions) and CommandCard (D-41, including the editable persona card, Q4). An agent message
that places either is dropped (`server_owned`).

## How live state binds

**Surfaces.** One surface per assistant turn for inline cards (`t{turn}`, the same ids as today's frames), or one `stage`
surface in the split and focus layouts whose components a later turn updates in place by id. The server creates surfaces;
the agent never chooses placement.

**The data model** (written only by the server, from the data lane):

| Path | Holds |
|---|---|
| `/view` | phase, source line ("Live · events up to 10:57:05Z"), data time |
| `/scans/{scan}/meter` | status, steps, limit, pages, queued, at |
| `/scans/{scan}/pages` | visits in order: order, route, state, title, at, step, status, side trips |
| `/scans/{scan}/edges`, `/narration`, `/stop`, `/events`, `/steps/{n}`, `/fixes/{n}`, `/attempts/{n}` | as their components need |
| `/records/{id}`, `/rules/{id}`, `/changes/{id}`, `/findings/{id}` | portal-model data |
| `/commands/{id}` | state (proposed · running · done · failed · cancelled · expired · undone), facts, args, result |
| `/ui/selected` | the selected page (client state; sent back in the action context) |

**Rules.**

- **Only changed paths.** Each SSE event becomes the smallest `updateDataModel`: a new step → `/scans/{scan}/meter/steps`;
  a new page → append to `/pages`; never resend a whole scan. Batch per event; throttle the meter to 4 updates a second.
- **Components read, never fetch.** A component renders from its `data` path; there is no client-side fetching of
  content (contract rule 6).
- **Reconnect** replays from `Last-Event-ID` as today; the server resends the affected paths, not the components.
- **Writes are actions.** A write action (✎) never calls an API. The server creates a CommandCard and its
  `/commands/{id}`; Confirm sends `command.confirm {command}`; the server runs the command and updates `/commands/{id}/state`.
- **Editable command cards** (persona.add): the card's inputs bind two-way to `/commands/{id}/args/…`; Confirm sends the
  bound args in its context; the server validates them against the command schema again.
- **Phase and path** stay the server's: a component not on for the person's phase or path is dropped (`not_in_phase`,
  `not_on_path`) before compiling.
- **Errors:** a client `VALIDATION_FAILED` for a component is logged with our code `bad_props`; that component falls back
  to the plain-chat answer, the rest of the view stays.

**Stage 2 filter** (an agent that speaks A2UI): `updateDataModel` from the agent is always dropped (`observed_path`);
View and CommandCard are dropped (`server_owned`); `id: "root"` is dropped (`reserved_id`); unknown components are dropped
(`unknown_type`); a `data` the agent set is replaced by the server's path (`server_prop`); anything that fails the catalog
is dropped (`bad_props`). `workbench/a2ui/check.py` is a reference for these checks and runs in the reference app's tests.

## Files

| File | What |
|---|---|
| `workbench/a2ui/catalog.json` | The catalog (generated) |
| `workbench/a2ui/examples/mapping-live.jsonl` | Server stream for the live mapping view: createSurface, updateComponents (View + LiveMap, PageDetail, Narration), updateDataModel (meter, pages, narration, selection, then one step) |
| `workbench/a2ui/examples/mapping-stopped-resume.jsonl` + `.client.jsonl` | The stopped scan; the person presses Resume on the ErrorCard; the server adds a CommandCard; Confirm; running → done |
| `workbench/a2ui/examples/chat-records.jsonl` | A chat answer with RecordCard and RecordList |
| `workbench/a2ui/examples/refused.json` | Agent messages the server drops, with their codes |
| `workbench/a2ui/check.py` | Validate streams against the catalog; the stage-2 filter. Tested by `reference/tests/test_a2ui.py` |

## What to ask of the spike

- Which React renderer for A2UI v0.9.1, and how custom components register (our 15 + View + CommandCard).
- Whether the renderer lets a custom component read the data model at its `data` path (otherwise pass the values as bound
  properties; the server can add those bindings the same way it adds `data`).
- Bundle size and how the renderer handles 4 updates a second on one surface.

## Acceptance for the spike

- The three example streams render with our classes (`salvage.css`, `genui.css`), identical to today's server-rendered
  fragments at 1280 and 1024.
- The refusals in `refused.json` never reach the client.
- `python3 workbench/a2ui/check.py` and the reference tests pass.
