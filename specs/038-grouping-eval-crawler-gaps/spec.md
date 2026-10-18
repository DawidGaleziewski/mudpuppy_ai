# Spec 038: Grouping eval and lost click (R-78), crawler gaps (R-35, R-36, R-58), API endpoints (R-65)

Branch `feature/038-grouping-eval-crawler-gaps` · 2026-10-18 · owner request (2026-10-18, before a
walk): "Start working on these on common branch", the "can work now" list of the roadmap board:
R-78 (6), R-78 (5), R-35 LO-35 and S11, R-36 LO-47 and LO-48, R-58 shared menu buttons, R-65 (5).
Owner: "Work on it as much as you can. Any questions move them to the end." Built without
questions; the open points are in findings.md and the session dump.

## Problem

- **R-78 (6).** "Ask the assistant to regroup" on Processes is a link to `/chat` that also says its
  text through `assistant.js`. With the drawer closed no assistant is wired on the page, so the
  link just opens the chat and the text is lost; with the assistant busy (a scan running) the click
  is dropped without a word. The owner saw a scan and no grouping.
- **R-78 (5).** Nobody has measured how well the assistant cuts a portal's scans into processes.
- **R-35 LO-35.** The A/B hero variants of the shop catalogue are reported as two clusters (gap).
- **R-35 S11.** The bank's `szczegoly.do` is linked only by an icon (an image without `alt`); the
  frontier describes the item as `link`, so the agent has no reason to open it.
- **R-36 LO-48.** The parcel-locker list loads after the city is chosen; the gap says only a trace
  can choose the city.
- **R-36 LO-47.** The claim date has no limit in the page; only the server knows the 30-day window.
- **R-58 (3).** A button of the shared navigation (the banner's "Wyloguj") is a frontier item on
  every page; the bank eval spent 14 agent turns on it, all landing on the same page.
- **R-65 (5).** Captured network shapes (`network_calls`) never become documentation: no
  `api_endpoint` record kind.

## Requirements

- **FR-001 A said request is never lost** (R-78 (6)). A link with `data-chat-say` hands its text to
  the next page (sessionStorage); the first assistant wired there sends it. A request made while
  the assistant is busy (on the page, or answered 409 by the service) is shown as waiting and sent
  when the assistant goes idle. Without a running service it is shown as not sent, text kept.
- **FR-002 Grouping eval** (R-78 (5)). An eval task that measures the assistant's grouping of the
  reference portal's recorded scans into processes against the ground truth: each ground-truth
  process found, no navigation or error screens inside, no duplicates or one-screen stubs, a `why`
  that cites the links. A baseline of today's behaviour, before any prompt work.
- **FR-003 One screen with variants** (R-35 LO-35, owner 2026-10-15). A run's fingerprint index is
  seeded, per route on first sight, with the clusters earlier runs recorded, so a page that varies
  between runs (an A/B banner, one more button for another persona, a changed portal) joins the
  known screen as its next revision instead of opening a new screen in every run.
- **FR-004 Unnamed links say where they go** (R-35 S11). An unnamed link's frontier description is
  `link (no name) to <path>`; the agent's action list carries `link_to`; the crawler prompt says
  such icons are worth acting on.
- **FR-005 Unnamed fields carry their visible label** (R-36 LO-48). An input candidate ARIA leaves
  unnamed gets the label the DOM form reader found (`label`), matched by document order only when
  the counts agree; it is stored with the action, shown to the agent and used for test data.
- **FR-006 Dates the page does not limit are tried** (R-36 LO-47). A `date-range` validation probe
  types a far past and a far future date into a date field without `min` / `max`.
- **FR-007 A shared menu button is clicked once** (R-58 (3)). A button in the banner, navigation
  or footer whose earlier clicks in this run all led to one other page is settled as an inferred
  move to that page, without an agent turn.
- **FR-008 API endpoints are documentation** (R-65 (5)). An `api_endpoint` record kind for the BA,
  written from captured network shapes with their evidence.

## Out of scope

- R-78's core (the agent saving its own groupings, C1–C7): owner discussion first.
- R-33 F-01's History labels ("variant" vs "portal changed") on top of FR-003.
