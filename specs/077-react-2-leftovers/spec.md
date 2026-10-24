# Spec 077: React and 2.0 leftovers that need no owner input (R-104, R-105, R-94)

**Branch:** `feature/077-react-2-leftovers` · **Source:** roadmap R-104 (3), (5); R-105 (1), (4);
R-94 (6); the owner, 2026-10-24: "proceed with work related to 2.0 or react that you can do now
without my input … work as long as you can on your own".

## Why

The live Workbench spike (spec 075) and the frontend refactor (spec 076) parked items whose answer
is already settled by a finding or a rule. Every other open React or 2.0 item waits for the owner,
the designer or a paid run (listed under "Not on this branch").

## What this builds

- **FR-001 R-104 (3), spec 075 F-01: a turn whose setup throws says so.** A turn that fails before
  the agent is asked (a conversation row that does not parse, a launch that throws) logs one line
  and sends one `error` event with its reference; AcpChat's own failures keep their single event.
- **FR-002 R-104 (5): a Stop reads as the person's Stop.** After a confirmed `scan.stop` the live
  scan's stop reason is "You pressed Stop." and no page is marked failed (the crawler's refusal of
  its next call, "run … is interrupted; no further actions are possible", is not the reason).
- **FR-003 R-104 (5): event lines show their fact only.** An event the assistant gets is its fact,
  a blank line, then what the assistant should do; the live Workbench's conversation shows the fact
  without the `[event]` marker.
- **FR-004 R-105 (1): route-level code splitting.** Every page is loaded on demand, so the main
  bundle holds the app frame, the design system and the state libraries only.
- **FR-005 R-94 (6), spec 043 F-08: a Content Security Policy on the console.** The dashboard sends
  a CSP header on `/app/` (scripts, styles, fonts, images and connections from its own origin; the
  chat's WebSocket on the same origin); the Storybook and the evidence files keep working.
- **FR-006 R-105 (4): the chat service's size and complexity warnings** go down where a test locks
  the behaviour (R-90's rule); the rest stays listed.
- **FR-007 R-97 (5), (6), (8): eval tooling.** The crawler eval's `--dry-run` boots each MCP
  server on the workspace and lists its tools; the grouping eval allows the read-only
  `workflow_state`; the eval's MCP config file is removed on exit; `createWorkspace` and the BA
  replay share one copy; `classifyPress` split under its complexity limit.

## Not on this branch (needs the owner, the designer or a budget)

- R-104 (1) the live components' look, `Choice` in the catalogue (designer); (2) what "change
  sandbox" means, retiring the beta Workbench (owner); (4) golden-prompt evals (paid); (6) stage 2,
  A2UI v1.0 (upstream).
- R-105 (2) the designer's htmx reference Workbench (owner).
- R-102 (3)–(6), R-103 (6): the designer's round 4 answers.
- R-94 (2) the 40 golden prompts live (paid).

## Acceptance

Every suite green (crawler `pnpm test`, chat + e2e, web `pnpm check` + build + Storybook,
dashboard, workflow, proving ground); `ui:check` on the pages the CSP and the split touch.
