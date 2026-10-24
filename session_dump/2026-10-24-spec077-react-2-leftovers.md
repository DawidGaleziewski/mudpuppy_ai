# Session dump 2026-10-24: R-105 refactor (v2.9.1) and spec 077 React/2.0 leftovers (v2.9.2)

On `master` at b6afeff4, clean apart from two untracked files (below). Nothing uncommitted,
no feature branch open, no services running (stopped by PID, ports 4200/4201/4310/4400/8765 free).

## Done

- **R-105 (spec 076)**, frontend architecture refactor: squash 2f7d9aea, tag v2.9.1, pushed.
  Atomic layers, tokens → `u-*` utilities, RTK Query, RHF + zod, `pnpm check` in the git hook.
- **Spec 077**, React and 2.0 leftovers needing no owner input: squash b6afeff4, tag v2.9.2,
  pushed, branch deleted. `specs/077-react-2-leftovers/` (spec, tasks all ticked, findings F-01–F-12,
  close-out review). Built:
  - R-104 (3) a failing turn start gets a logged ERR- error (`apps/chat/src/service.ts` `failTurn`).
  - R-104 (5) Stop reads "You pressed Stop." (`queries_wb_scan.py`); event lines show the fact only
    (`queries_wb.event_line`, `[event] fact\n\ninstruction`).
  - R-105 (1) code splitting: every page lazy via `page(...)` in `App.tsx`, main 859 → 230 kB;
    `tests/render-at.tsx` pre-resolves lazy pages.
  - R-94 (6) CSP on `/app/` (`web/spa.py`); `ui-check.mjs` injects axe via `page.evaluate`.
  - R-105 (4) complexity refactors: chat warnings 32 → 14, workflow 4 → 0.
  - R-97 (5) `--dry-run` boots both MCP servers and lists tools (`evals/harness/mcp-check.ts`);
    R-97 (6) grouping eval allows `workflow_state`; R-97 (8) temp MCP config removed on exit.
  - R-98 (3) found already built; roadmap row closed.
- Close-out suites all green (crawler `pnpm test` 2521 + perf, chat 382 + e2e 8/8, web 224 + build
  + Storybook, dashboard parallel + perf/serial, workflow 29, proving ground).

## For the owner to review

- **D-1** grouping eval allows the read-only `workflow_state` (baseline was made without it).
- **D-2** CSP allows inline styles (`style-src 'self' 'unsafe-inline'`), no nonce; scripts `'self'` only.

## Blocked (needs someone else)

- Owner: R-104 (2) what "change sandbox" means; R-105 (2) retire the beta Workbench / keep the
  designer's htmx reference Workbench; R-97 (7) is a decision.
- Designer round 4: R-102 (3)–(6), R-103 (6), R-104 (1). **A new file arrived:
  `user_input/mudpuppy-design-round4-2026-10-24.zip` (5.6 MB, 19:55, untracked, not opened yet)** —
  probably the round-4 answers that unblock these. Next session: unpack, read, plan a spec.
- Paid runs (only when the owner asks): R-94 (2) golden-prompt evals, R-104 (4), R-97 (1)–(4).
- R-98 (1) (replay inside a login journey, spec 046 F-03) deliberately left: never observed, a fix
  would be a guess until a real scan shows it.

## Loose ends

- `/tmp/pf-eval-mcp-*.json`: **~53 files**, not three as findings F-09 says. Most predate the
  cleanup; check whether any newer one (highest PIDs) came after v2.9.2, i.e. whether the
  `process.once('exit')` cleanup misses a path (signal kill, test runs). Then correct F-09's count.
- `personas/reference-insurer-local/agent-anna.yaml` stays untracked and uncommitted (owner's).
