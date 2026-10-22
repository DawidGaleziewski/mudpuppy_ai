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
