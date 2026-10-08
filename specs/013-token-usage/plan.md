# Plan: Token usage optimisation (spec 013, R-24)

## Technical context

TypeScript (`apps/crawler`, pnpm), crawl pipeline in `mcp-server/src/runtime/pipeline/` (G-18),
services in `mcp-server/src/services/` (G-14), BA reads in `services/ba/reads.ts`. No schema
change: `edges.confidence` already allows `inferred`, `frontier.status = 'done'` already allows a
reason. Chat brief in `apps/chat/src/scan.ts`; agent text in `.claude/agents/crawler.md`,
`.claude/agents/ba.md`, `.claude/skills/ba-practice/SKILL.md`.

## Decisions (research)

- **R1 Known state = observed earlier in this run** (`alreadyInRun`), not `created: false`: a
  re-scan of a portal finds every state in the store, and its first visit still needs the list
  that the frontier is built from. Alternative "omit actions always in map mode" rejected: the
  agent's breadth choices read the list on first visits.
- **R2 Lazy inference at pick time**, not at enqueue time: an item is inferred only once its
  target was actually reached by an executed observed edge, so a failed first attempt falls back
  to executing the next one (AS2.2), and the queue order is unchanged. The lookup is
  `json_extract(edges.action_json, '$.target_url')` per run (runs hold hundreds of edges; no index).
- **R3 Target identity** = `new URL(href, page_url)` with the fragment kept (hash routes are
  pages in SPAs) and only http(s) URLs. Only role `link`, no `input`, no `form`.
- **R4 Inferred edge** = `status 'executed'`, `confidence 'inferred'`, `to_state`, `evidence_ref`
  and `stabilization` of the observed edge, the item's own action JSON (locators, snapshot ref).
  The dashboard live map already draws executed edges; BA citations of such edges come out
  `inferred` through the existing `confidence: 'column'` rule (docs `evidence.ts`).
- **R5 `next` computed after bookkeeping** of the step (the acted item is already `done`), with
  the same function as `get_next_frontier_item` (shared, so inference applies to both).
- **R6 BA shapes**: keys only (the key is `role "name"`, `#n` suffix), plus the unboxed subset;
  page-level `confidence` and null omission. Fix F-01 in the same change.

## Measurement

- Scripted drain: `mcp-server/tests/token-budget.e2e.test.ts` (`TOKEN_BUDGET_OUT=<file>` writes
  the numbers). Baseline 2026-10-08 (commit 2340823): 6 states, 78 calls (38
  `get_next_frontier_item`, 37 `act`), 89,422 result chars, re-read proxy 3,555,695.
- BA reads: `pnpm tokens:ba 01a1083f-5472-7000-928b-af9441a68972 --root <copy>` baseline:
  `get_run_evidence` edges 7 calls / 109,761 chars, actions 8 / 93,227, decisions 8 / 92,241;
  `get_evidence` state 21 / 107,592 (elements 43,895).

## Structure

- `runtime/pipeline/process-page.ts` (result shape), `enqueue.ts` (`target_url`),
  `navigate.ts`/`act.ts` (`next`, `include_actions`), `runtime.ts` (types), `tools/index.ts`
  (args, descriptions), new `services/same-target.ts` (inference) used by `services/frontier.ts`.
