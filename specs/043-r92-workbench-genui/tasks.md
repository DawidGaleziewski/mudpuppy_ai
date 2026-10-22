# Tasks 043 (R-92: Workbench, phases 0 and 1)

Tags per task (`model-split-per-task`). One commit per task group, ids in the message. Designer's
tickets in brackets (`17-genui-architecture.md` § 9). UI tasks use the `mudpuppy-salvage-ui` skill.

## Setup

- [x] T001 [haiku] Branch; the owner's design package into `docs/design/salvage-yard/` and the
  skill (the repo's DS_PATH line kept); spec, tasks, findings
- [x] T002 [haiku] Roadmap: R-92 `in progress (spec 043)`, the design delivered, owner answers
  (htmx, phases 0 + 1)

## Phase 0 · Foundations

- [x] T010 [opus] Contract package `packages/workbench-contract/`: the generator and its JSON
  (copied from the design package unchanged), the loader, the drift test (WB-03)
- [x] T011 [opus] The check, layers 1–5 (layer 4 through a resolver the chat service passes), and
  the command check; contract tests over `workbench/examples/valid`, `invalid` (`EXPECTED.json`),
  `command` (WB-03, FR-002). Layer 6 comes with the renderer (T034)
- [x] T012 [opus] `db-admin`: migration for Workbench conversations (kind on `chat_conversations`),
  views (turn, spec, dropped), command proposals (token hash, state, idempotency key, audit),
  feedback; schema snapshot, Zod records, dashboard models
- [x] T013 [opus] Scan events derived from the store (D-3): `scan#step` refs, the six phase 1 types,
  sequence, a fixture scan `01a110d5` in the dashboard and chat test seeds (`13-v2-fixtures.md`
  § Workbench) (WB-01)
- [x] T014 [opus] SSE `/workbench/stream?c=…`: data-lane fragments per bound scan, words-lane relay
  from the chat service, `Last-Event-ID` / `last_event_id` replay, heartbeat, resync on lag (WB-02)
- [x] T015 [sonnet] Frame partials: `.sy-genview` (+ `--card`, `--failure`), mark, source line, Why,
  feedback, `.sy-genskel`, `.sy-cmd` in seven states; ScanMeter as the sample component;
  `genui.css` into `static/salvage/css/` (WB-04)
- [x] T016 [opus] Command service in the chat service: proposals, one-time confirm tokens,
  idempotency, preconditions, expiry, audit; `scan.start` / `scan.resume` / `scan.stop` mapped to
  the existing paths (D-5, D-6) (WB-05)
- [x] T017 [opus] Words lane in the chat service: a Workbench session config with the MCP tools
  `render_view` and `propose_command` (input schemas from `tools.json`), the prompt parts
  (doc 17 § 4.5), `<scan_data>` wrapping, timeouts (4 s / 15 s / 30 s), one repair, record / replay
  for tests (D-1) (WB-06)
- [x] T018 [sonnet] Settings `MUDPUPPY_WORKBENCH`, `…_MODEL`, `…_COMMANDS`; nav item with `beta`; the
  kill switch redirect and toast (D-4) (WB-07)
- [x] T019 [sonnet] Telemetry as JSON lines (§ 9.1 events) (D-7) (WB-08)
- [x] T020 [opus] Eval harness: 40 golden prompts (Chat, Mapping, injection), graded on path and
  components; scripted replay in the test suite (D-8) (WB-09)

## Phase 1 · Inline

- [x] T030 [opus] Page shell `/workbench`: `.sy-wb--inline`, head, Path switch (Chat, Mapping),
  conversation, composer, turn endpoint, streamed answer, answer first, empty state and starters
  (WB-10)
- [x] T031 [opus] LiveMap filmstrip card, ScanMeter, live bar; fold of a stopped or finished card
  (WB-11)
- [x] T032 [sonnet] Narration: templated lines with citations (WB-12)
- [x] T033 [opus] ErrorCard and the standing reaction; Resume / Stop / Start as command cards
  (WB-13)
- [x] T034 [sonnet] PageDetail in `.sy-sheet`, PageMiniature, selection, `sel` in the URL (WB-14)
- [x] T035 [sonnet] Point and ask: `.sy-askable`, `.sy-ask`, `A`, chips as structured context
  (WB-15)
- [x] T036 [sonnet] RecordCard, RecordList (WB-16)
- [x] T037 [opus] Generation states (composing, fallback, stale, model down, As of ≠ Now, path
  override), Why panel, feedback (WB-17)
- [x] T038 [sonnet] Live region, focus rules, keyboard setting (WB-18)
- [x] T039 [sonnet] Turn caps and usage in Settings ▸ Assistant (WB-42)
- [x] T040 [haiku] Entries: drawer "Continue in Workbench", Scans "Watch in Workbench" (WB-19; D-10)

## Close-out

- [x] T050 [opus] Browser e2e (`workbench-browser.e2e.test.ts`: live card from the store with no
  model, Confirm stops the scan with an audit row, an answer over the stream; stable over three
  runs); stream replay in `test_wb_stream.py`; model off and As of in the page tests; `ui:check`
  at 1280 and 1024: no overflow, one h1, one primary; axe clean except the beta chip's contrast,
  which the designer's screens share (F-15 b, open). Not done: a run with the real assistant
  (paid, R-94)
- [x] T051 [opus] Close-out suites: crawler `pnpm test` 2 493 passed, 1 load-sensitive failure
  that passes alone three times (F-17); chat 341 + e2e 8; workflow, workbench-contract 29,
  dashboard parallel + serial, miner, proving-ground backend: all passed. `code-reviewer`: 8
  findings, 5 fixed, 3 rejected. Glossary (4 terms), `LAYOUT.md` and notes
- [x] T052 [haiku] CHANGELOG, roadmap (R-92 done, R-94 for what is parked), merge, tag, push,
  session dump
