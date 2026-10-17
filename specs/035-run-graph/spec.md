# Spec 035: A graph of each scan, where it failed, and restart it there (R-74)

Branch `feature/035-run-graph` · 2026-10-18 · owner request: "prioritize ui upgrades especially one
for graphs on runs so I know where something fails and are able to restart it".

## Problem

A scan's page is tables (states, actions, frontier, forms, network, decisions, trace). The map
(R-69 (5), Scans → Map) draws every scan of a portal at once; one scan can only be greyed in.
The restart actions of R-66 (Resume, Retry this path, Skip) sit on a recovery page reached by a
small "Pick up" link in the scan history, and only for a stopped scan; there the failed actions
are a flat list without the screen they happened on or the way there. So the owner cannot see
where a scan broke, nor restart it from that place.

## Requirements

- **FR-001** A scan's page has a **Graph** tab: the screens this scan observed and the moves it
  made, laid out like the map (discovery tree from its first screen, `map_layout`), in the map's
  look (`sy-graph`, `sy-node`, `sy-edge`).
- **FR-002** A screen where this scan had an action fail (edge with an error) or a control it could
  not find again (frontier `unreachable`) is red (`data-state="failed"`) with chips (N failed, N
  not found, +N queued, N blocked); a move that failed is a red line. The screen a stopped scan
  ended on carries **Stopped here**.
- **FR-003** A status plate above the graph: steps, screens, failed actions, controls not found,
  queued; for a stopped scan why it stopped, the **path from the first screen to the stop screen**
  (design screen 15 "Path to the failure") and **Resume** (the continue scan of R-66).
- **FR-004** Picking a screen (a link, `node=`; no JavaScript needed) fills a side panel: its failed
  actions with their error, each with **Retry this path** (variation) and **Skip it in the next
  scans**; its not-found and queued counts; **Mark Start here** for the next focused scan.
- **FR-005** Restarts sent from the graph come back to it on the same screen with their note.
- **FR-006** A scan that stopped or had something fail opens on the Graph tab; a clean one on
  States. The scan history links such a scan's graph as **Where it stopped** or **N failed**.
- **FR-007** On a phone the graph gives way to the table of screens in the order seen (the same
  facts), as the map does; no page-level horizontal scroll; one h1, one primary button.

Out of scope: drawing the moves of every action (only the discovery tree and failed moves, as the
map); live animation of a running scan (the region refreshes on store change as other tabs do);
attempts stay on the recovery page.
