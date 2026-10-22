# Findings 043 (R-92: Workbench)

Bugs, slips and open points found while building, each with a test or eval idea
(`log-every-bug-for-evals`).

## F-01 The design's stack decision reverses the roadmap row (decided)

The R-92 row named a React island (`packages/chat-ui`, Vite, A2UI-shaped specs); the designer's
ADR-WB-1 (doc 17 § 1) chose htmx + Jinja + SSE with the contract kept React-portable. The owner
chose htmx (2026-10-22). The React question ("if it works, the whole app goes React") is now
answered by ADR-WB-1 § 1.6's triggers, not by this POC.

## F-02 The reference app is missing from the package (open)

`workbench/README.md` says `workbench/reference/` (Starlette + htmx + SSE, scripted assistant,
tests, evals) "ships in the next update of this package". Built without it; when it arrives,
compare its fragments and SSE handling with ours.

## F-03 The design's environment rule assumes names with meaning (adapted, D-6)

OW-1 allows commands on "sandbox" only. Environment names have no meaning of their own here
(spec 030, owner D-1), so the rule became "wherever the chat may start the same scan". Owner to
review D-6.

## F-04 Copying the package over the installed skill dropped our DS_PATH line (fixed)

The package's `SKILL.md` says `DS_PATH = static/salvage`; the installed copy had the repo path
(`apps/dashboard/src/mudpuppy_dashboard/static/salvage`). The copy overwrote it; restored with
the designer's new `genui.css` mention kept. Idea: a test that the installed skill's DS_PATH
exists on disk.

## F-05 Eight-character scan ids collide (adapted, D-9)

The schema's `scanId` is `^[0-9a-f]{8}$`, the first 8 hex characters of a UUIDv7, which is a
timestamp of about 65-second granularity: in the local store two runs started a minute apart
share `01a16388`. The server resolves a prefix among the conversation's bound scans first, then
the portal's newest; the context lists only unique prefixes. Proposal for the designer: allow
12 characters (`^[0-9a-f]{8}([0-9a-f]{4})?$`). Test: two runs with one prefix resolve to the
bound one.

## F-06 The record id pattern is narrower than our keys (open, for the owner / designer)

`recordId` is `^(SCR|PROC|BR|CAP|NFR)-[0-9]{3}$`; our `doc_records.key` is `<PREFIX>-<3+ digits>`
with REQ, UC, DI, GL, ASM, OQ, FUP, API too (`docs-model` `KEY_PREFIX`). A RecordCard for
`REQ-004` or `BR-1001` is dropped as `bad_bind_or_props`. Not changed here (the generator is the
designer's source); proposal: every `KEY_PREFIX` and `[0-9]{3,}`. Eval idea: a Chat prompt about
a requirement must not fall back to plain chat once the pattern is widened.

## F-07 Side trips: the page the crawler just reached looked like one (fixed)

The designer defines side trips as "pages opened from a menu, recorded and left at once"; we
derive them as pages the crawler never acted on (`queries_wb_scan`). The first cut folded the
page the crawler had just reached (no action yet) into the previous page's "+N", so a running
scan showed the crawler one page behind; and "where the crawler is" was the last new page, not
the page of its latest step (an `act` names its page through the action). Fixed: the crawler's
current page is the latest step's page and is never a side trip. Tests: the running fixture on
/kontakt; the stopped one back on /kontakt after its side trips.

## F-08 The design's htmx patterns are htmx 2; the dashboard runs htmx 4.0.0 (adapted)

Doc 17 § 5.3–5.4 names htmx 2.0.4 and htmx-ext-sse 2.2.3: `hx-ext="sse"`, `sse-connect`,
`sse-swap`, `htmx.createEventSource` (overridden for `last_event_id`), `historyCacheSize`,
`allowEval`, `allowScriptTags`. The dashboard vendors htmx 4.0.0 (`static/vendor/README.md`):
`hx-sse:connect`; unnamed messages swap, named ones dispatch DOM events; the extension resends
`Last-Event-ID` itself; partials are `<template hx type="partial">`; `hx-swap-oob` and
`hx-preserve` stay. htmx 4 has no `allowEval` / `allowScriptTags` settings and the dashboard
sends no CSP. Kept: model strings are only ever autoescaped text (test: no `|safe` in the
Workbench templates; markup in `why` renders as text). Open for the owner: a CSP on the dashboard
(the design's § 6 policy) as its own change, since every page would need a check.

## F-09 The smoke test on the real sandbox broke on every new migration (fixed)

`test_smoke.py` renders every page on a copy of `data/db/sandbox.sqlite` without migrating the
copy, so a branch's new migration (0049 adds `chat_conversations.kind`) failed it until the real
store was migrated, which must not happen before the migration is merged (R-54). The fixture
now applies the missing up-migrations to the copy only. Test: the smoke test passes on this
branch with the real store still at 0048.

## F-10 Starting a scan is an agent's work, not an API call (adapted, D-5)

The design's commands call scan APIs; in MudPuppy `request_scan` only checks and returns a
hand-off, and the conversation's assistant starts the crawler subagent with it. So Confirm runs
the checks and hands the prompt to the Workbench assistant; the Workbench fence lets the
assistant start the crawler only with a hand-off a confirmed command produced, once. Test: a
crawler start with any other prompt is refused by the fence.

## F-11 Claude's slips while building (fixed; process)

(a) Two edits with `sed`: one on a new, untracked file (`validate.ts`, an unused import; the
hook only guards tracked files) and one attempt on `apps/chat/package.json` (blocked by the
hook); both redone with the Edit tool. (b) prettier run on all of `apps/chat/src` instead of the
touched files: 13 untouched files were reformatted; restored with `git restore` before the
commit. Eval idea: a check in the commit hook that flags formatting-only diffs in files the task
did not name.

## F-12 The MCP SDK takes Zod only, and validates before the handler (adapted)

`registerTool` needs a Zod schema and rejects input that fails it before the handler runs, so
the designer's strict schema would fail a whole view for one bad component (against WB-UI-31).
The tool schema is `z.looseObject({}).meta(tools.json schema)`: Zod 4 copies the metadata into
the advertised JSON Schema, so the model sees the designer's schema, and the handler gets the
raw input for the drop-don't-fail check. Test: tools/list shows the designer's `$defs`; a view
with a bad component keeps the good one.

## F-13 A replayed stream doubled the answer (fixed)

The dashboard's Workbench stream relays the chat's events and builds the answer from its chunks.
When the relay reconnected and the chat replayed events it had already sent, the chunks were
appended again ("…scan.Starting …scan."). The relay now skips every event id at or below the
last one it handled. Also found: FastAPI's `ServerSentEvent(data=…)` JSON-encodes a string, so
HTML fragments need `raw_data`. Test: `test_wb_stream.py` (escaped text, sent once).

## F-14 The old-styles check reports the R-83 wordmark (open, not this branch)

`apps/dashboard/scripts/find-old-styles.sh src` must report 0 (dashboard CLAUDE.md) but reports
2 on master: the FastAPI app title and `__main__.py` say `mudpuppy://console`, which R-83's rename
made out of `pathfinder://console`, and the check looks for the Console-era wordmark. Proposal:
title "MudPuppy" in both. Left as is here (don't widen).

## F-15 Two accessibility issues in the designer's own Workbench markup (one fixed, one open)

`ui:check` (axe) on the designer's `wb-01` and `wb-06` reports what our pages first did too:
(a) `label-content-name-mismatch`: the filmstrip buttons' `aria-label` ("1 · / · Visited") leaves
out visible text (the side-page chip). Fixed here by dropping the `aria-label`, so the visible
text names the button. (b) `color-contrast`: the `beta` chip (`.sy-chip--dashed`) on the
selected nav item is faint on manila. Not changed: colours are the owner's call (dashboard
rule). For the owner and designer: a darker chip text on `[aria-current]` nav items. Until then
`ui:check` on Workbench pages reports this one issue. Our own `#wb-chips` had an `aria-label`
without a role; fixed with `role="group"`.

## F-16 A fast answer could arrive before its turn was on the page (fixed)

Found by the browser test with the fake agent, which answers in milliseconds: the reply to Send
appends the turn's empty containers, but the stream's fragment for the answer could reach the
page first; its target did not exist and the answer was lost ("Still working" stayed). Fixed: an
empty turn asks for itself 1.5 s after Send (`GET /workbench/turn?c=&n=`, from the store) and
fills its containers. Test: `workbench-browser.e2e.test.ts`, stable over three runs.

## F-17 `rule-drift.e2e.test.ts` failed once under the full suite (open, flaky)

In the close-out's `pnpm test` (2 493 passed, 1 failed) the mcp-server test "a release that
moves the threshold supersedes the confirmed rule by R8" got no superseding hypothesis
(`expected [] to deeply equal ['H-0002']`). Alone it passed three times in a row; this branch
changes nothing in mcp-server or model. Load-sensitive like the dashboard's `serial` tier;
idea: mark it serial or give its replay a monotonic wait (see wsl-clock-jumps), and log each
recurrence here.

## F-18 A portal's first scan cannot start from the Workbench (fixed by spec 044; (b) open in R-94)

2026-10-22, store `local-dev` (empty), commands `WB-edbf581a` and `WB-099af97d` (the second on
`proving-ground-shop-local`, the right portal, same cause): "Start a map scan" → the assistant
proposed `scan.start {type: full_map}` on proving-ground-shop; Confirm failed with "the scan needs
more information". Cause: `prepareStart` (`apps/chat/src/workbench-commands.ts`) takes the persona
only from the portal's newest run, so a portal with no runs has none and `requireFiles` refuses
(`MISSING_INPUT: persona`). Two more problems in the same try: (a) the card shows only the
message, not the missing item ("persona"), so the person cannot tell what to add; (b) the
conversation's portal is the header's choice, which offers every portal, also ones that do not
declare the store's environment (proving-ground-shop declares only sandbox; its `-local` copy is
the local-dev one). Fix idea: fall back to the portal's `guest` persona (the default
`portals.ts check` already loads), show the refusal's reasons on the card. Test idea: a fake-agent
case "Start a map scan" on an empty store must reach `scan.started`; an eval prompt for a first
scan of a portal with no runs.

## F-19 No live card after a confirmed Start: the assistant waits on the crawler (open, owner's hand try)

2026-10-22, store `local-dev`, scan `01a16518` (proving-ground-shop-local as guest): Confirm →
the card says "Done · Started scan 01a16518 · Open in Scans", the scan runs, but no LiveMap or
narration appears. Cause (D-5): the hand-off is an event turn in which the assistant calls the
crawler subagent; that call returns only when the crawler finishes, so the assistant cannot place
a view during the scan, and phase 1 shows a view only from a turn (D-10). The live stream already
binds the new run (`bound_scans` includes started runs), but there is no card to update. The
design expects the live card while mapping (`14-workbench.md` § 5, wb-01; "Scan … started"
announcement). Not caught: the browser test's fake agent never waits on a real crawler. Fix
ideas: (a) the chat service adds a server-composed view (LiveMap filmstrip + Narration bound to the
new run) to the command's turn when a start or resume is done; (b) the assistant starts the
crawler in the background and places the view itself. Test idea: a fake agent whose crawler call
blocks must still show the live card once the run exists; eval: "Start a map scan" ends with a
LiveMap of the started scan.

## F-20 The Workbench's crawler stopped with 180 links queued (open, owner's hand try)

2026-10-22, scan `01a16518` (proving-ground-shop-local as guest, local-dev), started 19:30:44
from a confirmed Start card: after 94 steps (about 8.7 min of work) the crawler subagent returned
without `finish_run`; the assistant reported "It ran out of links it could follow … 180 links are
still waiting to be visited", and the run was later marked `interrupted`. The brief says to drain
the frontier and call `finish_run` only when it is empty. Its only reply came at 19:46:06, when
the crawler call returned, which confirms F-19 (no live card, nothing to read for 15 minutes). Not
diagnosed yet: whether the subagent hit its own turn or context limit, or misread the frontier.
Test idea: a long map scan through the Workbench must end `finished` or say why; eval: compare
queued links at the stop with the run's frontier. Belongs with R-96's background runner, which
owns the crawler's lifecycle.

## Close-out review (code-reviewer, 2026-10-22)

| # | File | Guideline | Finding | Outcome |
| - | ---- | --------- | ------- | ------- |
| 1 | apps/chat/src/api-workbench.ts | G-05 | Two imports from one module | fixed (merged) |
| 2 | apps/chat workbench-service, -cards, -events | G-05 | The turn counter lived in the MCP tools module | fixed (`workbench-turn.ts`) |
| 3 | dashboard web/workbench_actions.py | G-15 | SQL in a router | fixed (`queries_wb.conversation_of_command`) |
| 4 | dashboard web/workbench_stream.py | G-15 | SQL in a router | fixed (`queries_wb_scan.scan_progress`) |
| 5 | dashboard tests/test_wb_frames.py | G-23 | `type: ignore` without a reason | fixed |
| 6 | apps/chat/src/mcp-workbench-tools.ts | G-24 | Bare `throw new Error` in `advertised`, `conversationOf` | rejected: start-up failure on a broken contract; the other cannot be reached |
| 7 | workbench-cards.ts, mcp-workbench-tools.ts | G-05 | The contract loaded once per module | rejected: a shared accessor is more than one extra read at start-up |
| 8 | live.py `watch`, web/portals.py `settings_page` | G-03 | In the complexity report | rejected: on master too; the branch added one line each |
