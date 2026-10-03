# The frontier, explained

Short version: the frontier is the crawler's to-do list of things it has **seen but not yet
followed**, together with a record of what happened to each one. Back to the
[glossary entry](../README.md#frontier).

## Where the word comes from

"Frontier" (or "crawl frontier") is the standard term in web crawlers and graph search. It is not
a business-analysis term and Pathfinder did not invent it. The image is a border between explored
and unexplored land: everything behind the border has been visited, and the frontier is the line
of places you can see from there but have not stepped into yet.

If you think of it as fog of war in a strategy game, you have it right. Each page the crawler
visits clears a bit of fog and reveals new links and buttons. Those go onto the frontier. Taking
the next item and following it pushes the border further.

## How an item moves through it

1. **Seen.** The crawler is on a state and the server extracts every action on the page (links,
   buttons, fields). Each action is checked for safety, scope, denylist, robots.txt and budget.
2. **Queued or skipped right away.** An action that passes the checks is queued as `pending`,
   with a priority and a depth. One that fails is written down straight away with its reason:
   `skipped_unsafe`, `out_of_scope`, `denylisted`, `robots_disallowed` or `budget_reached`.
3. **Picked.** When the agent asks for the next item (`get_next_frontier_item`), the server, not
   the AI agent, chooses: the highest priority first, and among equals the one queued first.
4. **Followed.** The agent performs the action. The item becomes `done`, or `unreachable` if the
   page could not be reached. Whatever new actions the result reveals start again at step 1.

The run ends when no `pending` items are left, or when a budget (states, depth, time, steps)
runs out. In the second case the remaining items are marked `budget_reached`, so you can see what
a larger budget would have explored.

## Why the table also keeps history

A textbook frontier only holds what is still to do. Pathfinder keeps every item, done or
skipped, in the same table, so the frontier also answers "what did the crawler decide not to do,
and why?". That matters for documentation: a skipped `mutating` button is a known part of the
portal that the map run deliberately did not press, not something that does not exist.

## A real example

The map run `01a0fe67…` on the reference portal (`reference-insurer`, sandbox) queued
**201** frontier items:

| Status | Count | Meaning |
|---|---|---|
| `[DONE]` done | 195 | Followed. Many lead back to states already known (the main menu is on every page). |
| `[SKIP]` skipped_unsafe | 6 | Form buttons such as "Porównaj", "Oblicz składkę podróżną" and "Dalej", classified `mutating` because nothing proved them read-only, above the run's ceiling `read`. |

Those 195 followed items produced **12 states** in **10 clusters**. The 6 skipped buttons are
why the calculator results (for example `/porownanie/wynik`) do not appear on the map: the BA
asked for trace runs (follow-up tasks) to record those processes instead.

## What to look at on a run page

- **Status**: done, pending or the skip reason. Many `[SKIP]` items with the same reason usually
  point to one rule (a ceiling, a denylist entry) rather than many problems.
- **Priority** and **Depth**: why an item was picked when it was, and how far from the start page
  it is.
- **Reason**: the rule that skipped it, in the same words as the decision log.

Related: [Budget](../README.md#budget), [Decision](../README.md#decision),
[Safety class](../README.md#safety-class), [Scope / denylist](../README.md#portal-scope).
