# Spec 036: Crawler and export fixes from the first real export (R-73)

Branch `feature/036-crawler-export-fixes` · 2026-10-18 · owner request (2026-10-17): "these issues
you mentioned add them on roadmap to be fixed". Sources: spec 034 findings F-11 to F-17, spec 027
F-01, and the clock finding of 2026-10-18.

## Problem

The export of PROC-001 on the reference portal (spec 034) showed what the crawler records wrong:
a blank page after a submit becomes a screen on `/`, hidden boxes count as fields, a radio group
becomes one field per option, the page a trace set off from becomes step 1, and the probes leave
most limits untried (14 of 24 validation messages). Pages that fire a request and ignore the answer
wait the full 10 s settle timeout. And the stabilizer measures its waits with the wall clock, so a
clock that jumps (this machine on 2026-10-18: ±6 s every 5 s) makes pages "never stabilize" or
settle too early.

## Requirements

- **FR-001 Waits use a monotonic clock** (spec 027 F-01, 2026-10-18). The stabilizer, the shared
  condition wait, the network activity tracker, the mount wait and the client-redirect wait measure
  durations with a monotonic clock (`performance.now()`), never `Date.now()`. Timestamps written to
  records stay wall-clock. Test: a wait driven by a clock whose wall time jumps back and forth
  still settles on time and never reports a negative wait.
- **FR-002 A blank page after a submit** (F-11@034). A submit answered with an empty document is
  recorded on the route of the page that submitted, marked blank, and is never a destination of a
  normal action ("Dalej" never leads to `/`). The export labels it "Blank page" and keeps it out of
  where an action leads. Scar: a submit answered with an empty body.
- **FR-003 Hidden controls are not fields** (F-12@034). The form reader leaves out controls that
  are not rendered (`hidden`, `display: none`, `visibility: hidden`, inside a hidden ancestor), so a
  box shown only after a choice is a field of that state only. Scar: a form whose extra box is only
  hidden; its two states record different fields.
- **FR-004 Unread answers do not stall the settle** (F-13@034). A request whose body the page never
  reads counts as finished once its response arrived; a 204 answer is recorded, not reported as
  aborted. Scar: a page that fires `fetch('/ping')` and ignores the answer settles well before the
  timeout.
- **FR-005 Browser tests are steady** (F-14@034). With FR-001 in, `mounts`, `stabilizer` and
  `trusted-ca` pass 20 runs in a row in the fast tier; any that still fails gets a wider margin or
  moves to the serial tier, with the reason in findings.
- **FR-006 Steps start where the process starts** (F-15@034). The export's steps begin at the
  process's start screen; screens the trace walked before it are not steps. The export grader's
  `export_extra_steps` is 0 on PROC-001.
- **FR-007 A radio group is one field** (F-16@034). The form reader records a radio group (same
  `name`) as one field labelled by its group label (fieldset legend or the group's label), with its
  options; required is per group. The export shows "Zakres" as one field with "Tylko OC" and
  "OC + Autocasco (AC)".
- **FR-008 Probes try every limit** (F-17@034). The boundary probes try below the minimum and above
  the maximum of every number and date box with limits, and the format probe every box with a
  pattern, within the per-step budget (raised from 12 to 24 by the owner 2026-10-18; per run
  from 60 to 120); when the budget cuts tries, the cut ones are listed in
  the run's worklist. `export_validation` on PROC-001 rises from 58.3 % with a new probe scan.

Done when the export quality eval (`export-quality.ts`) shows FR-002, FR-006, FR-007 and FR-008
fixed (no extra steps or stray destinations, "Zakres" one field, validation messages complete),
the new scars pass in the gates, and the slow tier passes.

The blueprint is the owner-approved PROC-001 export (`apps/crawler/evals/reference-solutions/
reference-insurer/PROC-001`) and the ground truth; no mock ratings (dropped by the owner 2026-10-18).

Out of scope: changing the export's layout; R-72 observability.
