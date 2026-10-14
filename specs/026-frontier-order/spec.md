# Spec 026: Frontier order for item lists and pagination (R-35)

Branch `feature/026-r35-frontier-order` · Created 2026-10-14 · Status: Draft

**Input**: roadmap R-35, the frontier stopping rule for item lists and pagination (spec 015
F-17: the shop eval spent its budget on 152 catalogue-page and product links, 214 items pending,
checkout S05 and login S07 never reached). Owner decision 2026-10-14 (rating page
`r35-frontier`): **"Order only: prefer links to unvisited route templates, skip nothing."** A
per-template cap was rejected because it would starve query-routed legacy pages (R-50).

## Problem

The frontier hands out items by priority (depth, novelty boost), then FIFO. A catalogue page
queues a link per product and per page number; they share one or two route templates, but each
is a new frontier item at the same depth as the checkout button, so breadth goes to items of a
template the run has already seen many times.

## User story — P1

A crawler mapping a shop with a 10-page catalogue reaches every distinct screen before it walks
the remaining product and page links.

1. **Given** pending items at any depth, **when** the server picks the next one, **then**
   a plain link whose target route template this run has not visited yet goes first, then items
   whose target is unknown (buttons, forms, controls, navigates), then links whose target
   template the run already visited.
2. **Given** only links to visited templates are pending, **then** they are still handed out,
   in the old order: nothing is skipped or settled by this rule.

## Requirements

- **FR-001** `getNextFrontierItem` ranks pending items in three tiers, in this order: (0) plain
  link (`linkTarget`) to a route template with no page visit in this run, (1) any item without a
  link target, (2) plain link to a visited template. Within a tier: priority desc, then id asc
  (the old order). Same-target inference (spec 013 US2) still applies to the item picked.
- **FR-002** Templates are inferred at pick time over this run's visited URLs (`page_visits.url`)
  and every pending link target together, so a catalogue's product links collapse into one
  template as soon as they are queued. (The run's own templater collapses a segment only after
  more than ten distinct values were visited, so early in a run every product would look new.)
- **FR-003** The order lives in the frontier service alone (`services/frontier-order.ts`); the
  runtime and the tools are unchanged, so browserless test runtimes get it too.
- **FR-004** The `frontier_pick` trace event carries the tier.
- **FR-005** No frontier row changes status because of the order; `finish_run`'s pending rule is
  unchanged.

## Success criteria

- **SC-001** A gate on a proving-ground catalogue: with its pagination and item links pending,
  the checkout and login screens are reached before the remaining item links (the
  F-17 test idea).
- **SC-002** Shop eval: `crawl_screens` ≥ 5/6 (was 4/6), no regression on the reference portal
  (17/17) or the bank (10/11).

## Known limit

Query-routed legacy pages (`index.php?page=x`) share one template, so their links rank in tier 2
after the first visit; they are reordered, never skipped. Screen identity by parameter stays R-50.

## Out of scope

LO-27 (`about:blank` pop-ups), LO-35 (A/B clusters), bank S11 and the parameter-only frontier
growth (spec 019 F-08): the rest of R-35, not decided.
