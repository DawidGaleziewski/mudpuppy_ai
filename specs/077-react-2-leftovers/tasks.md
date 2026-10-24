# Tasks: spec 077

- [X] T001 FR-001 `ChatService.runTurn`: a setup failure without an AcpChat error logs and sends
  one `error` event (test in `error-flow.test.ts`)
- [X] T002 FR-002 `queries_wb_scan.scan_live`: a confirmed Stop is the reason, no failed page
  (test in `test_wb_scan.py`)
- [X] T003 FR-003 event texts as fact + blank line + instruction (`liveConfirmedText`,
  `launchText`); `queries_wb.event_line` in the live Workbench's messages (test in
  `test_workbench_live.py`)
- [X] T010 FR-004 route-level code splitting (React Router's object `lazy` per page); main bundle
  859 → 230 kB
- [X] T020 FR-005 the console's CSP header (dashboard), tests; `ui:check` with the header on
- [X] T030 FR-006 chat and workflow size/complexity warnings with the behaviour locked by their
  tests (chat 32 → 14, workflow 4 → 0)
- [X] T050 R-97 (5) the eval's dry run boots the MCP servers; (6) the grouping eval allows
  `workflow_state`; (8) the MCP config temp file removed, `copyParts` shared
- [X] T051 R-97 (8) `classifyPress` complexity (runtime: `pnpm test:slow` green)
- [X] T060 Close-out: every suite (crawler `pnpm test` 2521 passed + perf; chat 382, e2e 8 / 8;
  web `pnpm check` 224, build (main 230 kB), Storybook; dashboard parallel + perf/serial;
  workflow 29; proving ground), `ui:check` on 19 pages at 1280 and 390 px with the CSP,
  code-reviewer (findings.md), roadmap, glossary, changelog, merge
