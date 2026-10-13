# Spec 022: Salvage Yard redesign with versioning (R-43 + R-44)

Branch `feature/022-r43-salvage-redesign` · Created 2026-10-13 · Status: Draft

**Input**: user, 2026-10-13: "R-42, R-43 I already done analysis and I have ready design
mudpuppy-salvage. I will like to kickoff start of implementation for this on new branch." The
design package is `user_input/mudpuppy-salvage-yard.zip` (brand book, design system, 11 detailed
screens, 12 wireframes, requirements FE-xx, migration guide, frontend skill), committed under
`docs/design/salvage-yard/`. Decisions in the same session: the whole design, **R-44 folded in**
(revisions, variants, compare, history, amendment carry-forward); editors are the configured
reviewer name with a base-revision check (no accounts); a process variant is marked live per
environment by the BA; interim merges to master behind the `UI_SALVAGE` flag, one close-out at
the end; wordmark `[MUD]PUPPY`; O-3 (glossary behind "?") and O-4 (ids as stored) take the
package defaults; the `mudpuppy-salvage-ui` skill replaces the Console design-system rules. O-1
is answered by spec 021 (product rule: records as-is, people draw the to-be, the assistant only
proposes). Sources: roadmap R-43, R-44; `user_input/redesign/readme.md`; the self-scan of
2026-10-11 (`data/exports/pathfinder-dashboard-sandbox-srs/`).

## Problem

The dashboard works but has become cumbersome (R-43):

- The chat, the most important element, is buried in a tab; it cannot see or change the page
  the BA is looking at.
- Credentials are always on screen.
- Process scope is a great feature in the wrong place: it lives in the chat, not in a
  workspace where the BA groups screens into processes and edits, annotates and revises them.
- Five tool-shaped top tabs; decisions (superseded amendments, records to confirm) are
  scattered.
- The Console look (one monospace, amber for both brand and OK, bracket statuses, scanlines)
  scored 14/30 in the design review against 24/30 for Salvage Yard.

And data is lost or overwritten (R-44):

- A re-scan replaces what the BA saw: a changed page becomes a new state, and amendments on the
  old one are marked superseded instead of carried forward. The user: dropping annotations after
  a new scan was "in hindsight a bad idea".
- Processes change and get swapped back and forth (A replaced by B and back), by someone else;
  nothing records revisions, variants or which one runs where.

## User stories

### US1 The new look everywhere (Track 1, FE-V01–V10, FE-Q01–Q12) — P1

A BA opens any page and sees it in Salvage Yard: steel ground with the yard grid, square plates,
three type voices, statuses as shape + word, record ids as manila tags, human text as
typewriter notes, offline fonts.

1. **Given** the `UI_SALVAGE` flag is on for a route, **when** it renders, **then** it loads
   only the Salvage stylesheets (never both), and passes the screen-level acceptance criteria of
   `docs/06-screens.md` (one h1, ≤ 1 primary, ≤ 1 intent plate, every status a word, every id a
   tag, axe 0 serious, no horizontal scroll at 390 px).
2. **Given** a backend status, **when** it is shown, **then** it goes through one status mapping
   (`migration/status-map.csv`), tested.
3. **Given** the flag is off, **then** the route renders as today (rollback).

### US2 Portal as context, seven sections (FE-N01–N06) — P1

1. The header has wordmark, portal picker, search (Ctrl K), assistant status, Ask the assistant
   (Ctrl J), help "?", in that order.
2. Switching portal keeps the current section, on an explicit action.
3. The side nav has Home, Processes, Screens, Docs, Review (count of open decisions), Scans,
   Settings; old URLs redirect to their new place (`docs/08-migration-guide.md` §6).

### US3 Chat first, with page context (FE-A01–A08, D-13) — P1

1. Home is the assistant for the picked portal (log, suggestions, composer with a one-line scan
   status, Send), plus "Where this portal is" and "Needs you".
2. Every other page opens a docked drawer (Ctrl J, Esc closes) with **This page** (default) or
   **Whole yard**. "This page" sends the page's context (screen id + revision + element ids +
   amendment ids + process; or process id + variant + revision + step; or the selected Review
   item / scan) and the drawer shows it as tags. Settings has no page context.
3. The assistant can read that page's data, answer, highlight an element on a recorded screen,
   link and navigate to pages, and **propose** changes to the page's data; a proposal changes
   nothing until the BA applies it; Apply creates a new revision and shows Undo (a restore,
   itself a new revision).
4. When a scan needs a credential, the assistant asks in chat with a vault field; the value is
   never echoed.
5. When the page changed under the conversation (a new observed revision), the drawer says so
   and offers to switch to it or compare.
6. When the chat service is down, the drawer shows the failure state with its ERR reference;
   read-only pages keep working.

### US4 Nothing is overwritten (R-44, FE-S01, FE-S02) — P1

1. **Given** a screen scanned again with a changed page, **when** the scan records it, **then**
   the screen gets a new **observed revision** (r1, r2, …) instead of a new, unrelated screen;
   the revision strip shows which scans saw each revision.
2. **Given** an amendment on a screen that changed, **then** it carries forward to the new
   revision; if its element is gone it is flagged **re-anchor** (needs you, in Review), never
   deleted or silently superseded.
3. **Given** any edit (amendment, process, change spec), **then** it creates a revision stamped
   with the reviewer name and time; restore and withdraw create revisions too; nothing is
   deleted.

### US5 Processes workspace (FE-P01–P05, D-15) — P2

1. Processes lists saved processes and the assistant's **suggested groupings** (dashed,
   inferred) with Accept / Edit first / Dismiss; dismissed groupings are not suggested again for
   the same screens; loose screens are listed under "In no process".
2. A process has variants (A as-is observed; B, C… to-be drawn by people). The to-be is edited
   as a draft over the as-is (steps added, removed, merged, annotated); Save creates `B rN+1`;
   Discard keeps the last revision.
3. Compare shows a step diff (unchanged, removed, merged, added) and a generated, editable
   **change spec** (scope, as-is, to-be, delta, affected records, migration cut, open
   questions); Export downloads Markdown; Save to Docs stores it as a doc record.
4. History shows variants, revisions, the variant the BA marked live per environment, a
   scan-by-scan timeline, and Restore as a new revision.
5. Saving on top of a revision that is no longer the latest shows the conflict notice
   (Compare / Rebase); nothing is overwritten.

### US6 One review inbox (FE-R01, D-17) — P2

Review lists every open decision: re-anchor amendments (replaces "superseded"), assistant
proposals, records to confirm, edit conflicts; counts per kind and a detail pane with evidence.

### US7 Scans monitor (FE-C01, FE-C02) — P2

Scans shows the running scan (progress meter, pages, queue, page map, Resume), the history with
what changed per scan (linking to Review), and the run detail tabs (restyled). Chat shows only a
one-line scan status linking here.

### US8 Settings and credentials (FE-T01, FE-T02, D-16) — P2

Settings: environments table and form, Revoke with confirmation ("Runs already recorded are
kept."), credentials collapsed with values never shown, personas, crawl rules, data store.

### US9 The harness builds in Salvage (migration guide §9) — P3

The `mudpuppy-salvage-ui` skill is installed and named in `CLAUDE.md`; `frontend-dev` uses it;
`revamp-dashboard`'s Console references are marked deprecated; `find-old-styles.sh` runs in the
dashboard's test suite and reports 0 on migrated templates.

## Edge cases

- A screen whose route template stays the same but whose content changes between scans → new
  observed revision of the same screen; a page that moves to another route → a new screen
  (linked by the BA if they are the same).
- Two tabs saving the same process draft → the second gets the conflict notice.
- An amendment whose element was renamed but kept its role → matched by role and position,
  flagged for confirmation.
- Assistant proposal on a page whose data changed since the proposal → shown as stale, Apply
  disabled until re-proposed.
- Chat service down while a proposal is open → Apply is disabled, the draft is kept.
- Portal with no scans yet → Home shows the empty state with the first step.

## Requirements

- **FR-001**: Every requirement FE-V01–V10, FE-N01–N06, FE-A01–A08, FE-P01–P05, FE-S01–S02,
  FE-R01, FE-C01–C02, FE-T01–T02 and FE-Q01–Q12 of `docs/design/salvage-yard/docs/07-requirements.md`
  is in scope, with its acceptance check. Amended (owner, 2026-10-14, F-08): FE-A06 shows no
  `ERR-…` reference when the chat service is down; the failure state names the cause and the
  start command instead, since only the chat service mints and logs references.
- **FR-002**: The redesign ships behind `UI_SALVAGE` (per route), so each route can fall back to
  the Console page until the clean-up; the clean-up removes Console styles and the flag.
- **FR-003**: Screens get a stable identity across scans; every scan that observes a screen
  records which revision it saw; a changed observation makes a new revision of the same screen.
- **FR-004**: Amendments, processes, process variants, change specs and the live marker per
  environment are revisioned: every change is a new revision with author (reviewer name), time
  and base revision; restore and withdraw are revisions; no row is updated in place or deleted.
- **FR-005**: A save whose base revision is not the latest is refused with a conflict that the
  UI shows (Compare / Rebase).
- **FR-006**: The chat service accepts a page context with each message (`context: "page" |
  "portal"` plus ids) and gives the assistant tools to read that page's data, highlight an
  element, navigate, and propose changes as revisionable proposals; applying a proposal goes
  through the same revision path as a BA edit.
- **FR-007**: The assistant drafts process groupings from recorded screens; accepting creates
  a saved process (as-is variant A r1); dismissing is recorded and not re-suggested.
- **FR-008**: The change spec is generated from the A/B diff and records, editable per section
  (each save a spec revision), exportable as Markdown and saveable as a doc record.
- **FR-009**: Old URLs redirect to their new place.
- **FR-010**: The design package is committed as reference; its fixtures (reference-insurer,
  wikipedia) back the visual checks; screenshots at 1280 and 390 are attached per migrated page.
- **FR-011**: The dashboard keeps reading the crawler store read-only; every new write goes
  through the chat service (as amendments do today, constitution and FE-Q12 extended to
  processes, revisions and proposals).

## Success criteria

- **SC-001**: All 11 screens of the package exist in the app and pass their acceptance list.
- **SC-002**: A rescan of a changed reference-insurer page shows r2 on the same screen, with the
  r1 amendment carried forward or flagged for re-anchoring; zero amendments lost.
- **SC-003**: From any page a BA can ask about that page and get an answer that cites its ids;
  a proposed change applied and undone leaves three revisions and the original content.
- **SC-004**: A to-be variant can be drawn, compared with the as-is and exported as a change
  spec in one session without leaving the Processes section.
- **SC-005**: `find-old-styles.sh` reports 0 on the app after clean-up; axe-core reports 0
  serious or critical issues on every screen.
- **SC-006**: Every existing dashboard and chat test passes, or is rewritten for the new page
  with the same behaviour checked.

## Assumptions

- Server rendering with Jinja and htmx stays; JS only for the jobs in the CSS guide §8.
- The dashboard stays local, single-machine; "people" are reviewer names, not accounts.
- Screen identity defaults to portal + persona-independent route template + cluster; R-50 (URL
  parameters as identity) may refine it later.
- Persona variants of a screen (R-33) are a second axis next to revisions; this spec leaves room
  for it but does not build it.
- Docs, the screen list, "All portals", server activity, new portal and run detail tabs are
  restyled only (out of redesign scope per `06-screens.md`).
