# Spec 013: Token usage optimisation (R-24)

Branch `feature/013-r24-token-usage` · Created 2026-10-08 · Status: done, SC-001–SC-004 met (findings.md); merged 2026-10-08, tag v1.0.12

**Input**: roadmap R-24 start set P1–P5 (`specs/008-screenshots-wireframes/token-usage.md`,
`specs/010-acp-chat-orchestrator/findings.md` F-16). User, 2026-10-08: "Focus on lowering token
usage but try to preserve all functionality and efficiency."

## Problem

A drained map run of the reference portal re-read 38–78M cached tokens (Sonnet crawler,
372–407 tool calls, context up to 486k). 94 % of `act` result characters described pages the run
already knew, and 319 executed frontier items had only 13 distinct link targets (shared header
and footer). Every frontier item costs two calls (`get_next_frontier_item` + `act`). The BA's
largest reads are `get_run_evidence` pages (edges, actions, decisions) and the `elements` list of
`get_evidence`.

## User stories

### US1 (P1) Slim results for pages the run already knows — priority P1

In map mode, a `navigate`/`act`/`login` result for a state already observed earlier in the same
run carries no `actions` list; it says how many it left out. Trace runs are unchanged (the agent
needs the current page's action ids).

- **AS1.1** Map run, revisit of a known state → result has `state_id`, `title`,
  `route_template`, `cluster_id`, `forms`, `edge_id`, `actions_omitted: <n>` and no `actions`.
- **AS1.2** First visit in the run (even of a state recorded by an earlier run) → full `actions`.
- **AS1.3** `include_actions: true` on `navigate`/`act` → full `actions` on any page.
- **AS1.4** Trace run → full `actions` every time.

### US2 (P2) One execution per link target — priority P1

When the next frontier item is a plain link whose resolved target URL this run already reached by
an executed, observed transition, the server does not hand it out: it settles it `done` with the
reason `same_target: <edge id>` and records an `inferred` edge from the item's state to the state
that transition reached (evidence of that transition). Everything else is handed out as before.

- **AS2.1** Shared header link "Kontakt" on 20 pages → executed once; 19 inferred edges.
- **AS2.2** The first attempt failed (unreachable, refused, no target state) → the next item
  with that target is executed normally.
- **AS2.3** Buttons, form submits, fill/select controls, links without an http(s) target and
  items of trace runs are never inferred.
- **AS2.4** Coverage is unchanged: a drained run reaches the same states as before.

### US3 (P5) The next item rides on the result — priority P1

In map mode, `navigate` and `act` results carry `next`, the same value `get_next_frontier_item`
would return now (`{ item, reason? }`). The agent acts on `next.item` directly; calling
`get_next_frontier_item` still works and returns the same item.

- **AS3.1** Drain loop of `act` calls only: one call per executed item instead of two.
- **AS3.2** Budget exhausted / frontier empty → `next: { item: null, reason }`.
- **AS3.3** The crawler agent definition and the chat's crawler brief describe the loop.

### US4 (P3) Compact state elements for the BA — priority P2

`get_evidence` on a state returns `elements` as the list of element keys (strings; the key already
holds role and name) and `elements_without_box` as the keys the layout could not place.
Screen-region citing works as before.

### US5 (P4) Leaner evidence pages for the BA — priority P2

`get_run_evidence` page items omit fields whose value is null. A page states the values most of
its items share once, as `defaults` (states: observed, settled; edges: read, executed, observed;
actions: read, allowed, observed; forms and network calls: observed), and items leave out a field
equal to its default; a missing field is null or the default. Actions keep their real `role` and
`name` (F-01: they came back null).

## Requirements

- **FR-001** Map-mode known-state results omit `actions` and carry `actions_omitted` (US1).
- **FR-002** `navigate`/`act` accept optional `include_actions` (US1).
- **FR-003** Issued link actions store `target_url` (absolute, resolved against the page URL) in
  their action JSON; edges copy it with the rest of the action (US2).
- **FR-004** Frontier pick infers same-target link items as in US2; one trace event per inferred
  item; no new decision-log kind; no schema migration (edges already allow `inferred`).
- **FR-005** Map-mode `navigate`/`act` results carry `next` (US3).
- **FR-006** BA `get_evidence` element shape per US4; BA skill and agent text updated.
- **FR-007** BA `get_run_evidence` item shape per US5.
- **FR-008** A slow-tier test measures a scripted drain (calls, result characters, re-read proxy)
  and holds a budget; `pnpm tokens:ba <run>` measures the BA reads of a recorded run.
- **FR-009** No behaviour other than result shape and inferred same-target links changes: safety
  gates, refusals, budgets, evidence, the trace view and the golden step order stay as they are
  (the golden snapshot may only change by the inferred items).

## Success criteria

- **SC-001** Scripted drain of the insurer mock: ≥ 40 % fewer calls and ≥ 60 % less re-read proxy
  than the baseline (78 calls, 3.56M re-read chars), same number of states.
- **SC-002** BA reads of the reference run `01a1083f…`: `get_evidence` state results ≥ 25 %
  smaller, `get_run_evidence` actions pages ≥ 30 % smaller.
- **SC-003** `pnpm test` in `apps/crawler` (all tiers, gates) and the dashboard and chat suites
  are green.
- **SC-004** One real crawler-agent drain of the reference portal (Sonnet) finishes with the same
  states as the baseline run (21) at under 25 % of its 78M cache-read tokens.

## Out of scope

Workflow levers W1–W3 of the token analysis (they are working habits, not product), screenshots
and wireframes (cost 0 tokens), the BA's own record-writing calls.
