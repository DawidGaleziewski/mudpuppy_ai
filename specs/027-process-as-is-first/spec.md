# Spec 027: Processes, as-is first (R-54)

Branch `feature/027-r54-process-as-is-first` · Created 2026-10-14 · Status: In build (2026-10-18)

**Scope as built (2026-10-18).** US5 (downloads) moved to R-68 by the owner (2026-10-16) and was
built in spec 034 (`/processes/{PRC}/export`, `/docs/{portal}/{PROC}/export`, folder and zip);
US6.1 (a PROC record's download) is that export too. This branch builds US1–US4 and US6.2–6.3.

**Over the design package (`10-processes.md`), by the owner's word here:** A can be edited by a
person (PR-03 said only scans change A; US4.2 adds signed `edit` revisions; rescans still add
`observe` revisions on top), and the stage is moved by a person's sign-off (PR-14 said stages are
derived; US3 makes them a signed choice, the existing `stage` change of the chat API).

**Input**: user, 2026-10-14, after using the Processes pages of spec 022:

- "On this page I would like to see miniatures next to url. And after click I would like to see
  bigger screen and wireframe from popup. It is hard to select these just from url." Same on the
  process page.
- "I am not sure what 'selected' does on A as-is."
- On the change spec export: "This seems quite poor … Where are screenshots? Wireframes? Steps
  of the process one by one … I would like to setup the process and just download full blown
  spec as is. With all the info on this process."
- "What if I change my mind? I would like to for example delete the process … or delete a
  screen if I made a mistake."
- Then: "I don't want to delete ANY of the data there. I just want to get rid of a process I
  created by mistake. Or remove a screen I added into a process by mistake." "Download current
  DETAILED information on the process (whole business, functional requirements, context of
  where this is etc.) AS WELL as have an OPTION to add TO BE … 'download as is spec', 'download
  to be spec', 'download delta spec' and 'download all' … We gather much more details. Screens,
  wireframes, other data we gather is very useful here."
- "I always [seem to] go from selecting a process to deciding what it should be on the spot.
  While this usually will require time. I will need to discuss the as-is state with business.
  Someone needs to review it. UX needs to prepare something … So it is more iterative work. And
  me getting as-is detailed documentation of the process is an important part of it." "Most
  likely I will have to download the documentation and discuss with them. Sometimes just drop it
  to another harness which is UX specific to redesign it … Sometimes I may need to select part of
  the monolith, to be done by AI in a microfrontend / moved to another technology."

Decisions in the same session: archive, never delete; requirements are exported **as stored**
(Given/When/Then acceptance criteria, no EARS rewriting); both formats (one HTML file and a zip);
one roadmap item. Business review happens **outside** MudPuppy (download, discuss, enter the
corrections). Out of scope by the user's word: anything about UX hand-off on to-be steps and
business people commenting inside MudPuppy.

## Problem

Spec 022 built the Processes workspace around the to-be: a new process opens with the variant
switch, "+ Variant" and Compare in front, while the as-is is a bare list of titles and routes.
The real work is the other way round: the as-is is documented, reviewed with the business over
days or weeks, and handed to people and to other agents; a to-be may follow much later. Today:

1. Screens are picked by route and title only, although every recorded screen has a screenshot
   and a wireframe (spec 008). Ticked screens keep the list order, not the order a person walks.
2. Selecting an as-is step opens an almost empty inspector (annotations are read-only there and
   an as-is step has no "built from").
3. A process created by mistake cannot be removed, and a wrong screen cannot be taken out of A.
4. The only download is the change spec (`/processes/{key}/spec.md`): scope, a one-line as-is, a
   one-line to-be, delta, record keys, migration cut. No pictures, no step-by-step content, none
   of the fields, rules, requirements or terms the BA recorded.
5. The stages (`scoped → as_is_documented → to_be_design → migrating → migrated`) exist in the
   store and the chat API, but the page has no way to move a process through them.

The SRS export (`pnpm docs:export`, spec 004 `contracts/srs-export.md`) already renders every
record kind with evidence, diagrams, traceability and `records.json`, and can be limited to a set
of screens (R-30 process scope). It is organised by record kind, has no pictures (FR-054 copies no
raw evidence files) and is not reachable from the process page.

## User stories

### US1 See the screen before picking it — P1

1. **Given** the "In no process" list, **then** every screen shows its screenshot thumbnail
   (wireframe when there is no screenshot, a "no picture" placeholder when there is neither)
   next to its title and route.
2. **When** the BA clicks a thumbnail, **then** a dialog opens with the large screenshot, a
   Screenshot / Wireframe switch, the title, route, how many scans saw it, and "Open screen
   page". Esc and the close button return focus to the thumbnail. Clicking the thumbnail never
   ticks the screen.
3. **Given** the BA ticks screens, **then** the selection shows them in a numbered list in the
   order they were ticked, with ↑ / ↓ and remove; "New process from these" creates A in that
   order.
4. The same thumbnail and dialog appear on every step card of a process (A and to-be). A
   designed step (not observed) keeps its dashed "Designed, not observed" frame and has no
   picture.

### US2 The process page leads with the as-is — P1

1. **Given** a process at stage `scoped` or `as_is_documented`, **when** the BA opens it,
   **then** the page shows A as documentation: per step in order, the picture, title, route and
   query parameters seen, the transition to the next step, the fields (data items with
   constraints), the business rules, requirements, NFRs and open questions citing that screen,
   and its amendments. Each record links to its Docs page.
2. Selecting an as-is step shows that step's documentation in the side panel (not an empty
   inspector).
3. To-be controls ("+ Variant", Compare, History of variants) are secondary on these stages:
   one quiet "Start a to-be design" action. On `to_be_design` and later the page leads with the
   to-be as it does now.
4. The head shows what is still open for the as-is: open questions, unconfirmed records,
   amendments waiting for re-anchoring, follow-ups.

### US3 Stage sign-off — P1

1. **When** the BA chooses "Mark as-is documented", **then** the process moves to
   `as_is_documented` as a signed process revision (`change: 'stage'`, existing API), recording
   which A revision was signed off.
2. The BA can move the stage back or on at any time (the stage control lists all five stages);
   each move is a signed revision shown in History.
3. **Given** a rescan adds a new A revision after sign-off, **then** the page shows "As-is
   changed since documented (A r2 → r3)" with a link to the A-to-A compare, until the BA signs
   off again.

### US4 Fix mistakes without losing data — P1

1. **Archive.** "Archive process" (confirm dialog) hides the process from the list; its screens
   return to "In no process"; its revisions, variants, drafts, annotations and change specs stay
   in the store. An "Archived" filter lists archived processes with "Restore". Archive and
   restore are signed process revisions. Nothing is ever deleted.
2. **Edit A's screens.** The BA can add a screen (from the same picker as US1), remove a step
   and reorder steps of A; each change is a signed new A revision (`change: 'edit'`), so History
   can restore any earlier one. Removing a step never touches the screen, its scans or records.
3. A to-be variant branched from an older A revision keeps working; Compare shows it against
   the A revision it was branched from and against A's head.

### US5 Detailed downloads — P1

1. The process page has **Download**: As-is spec, To-be spec (only when a to-be exists; one per
   to-be variant), Delta spec (the current change spec, extended), and All. Each in two formats:
   **HTML** (one self-contained file, images embedded, prints cleanly to PDF) and **zip**.
2. **As-is spec** content, in this order:
   - Context: portal, environment, persona, process goal, trigger and outcome, stage and who
     signed it off, which scans observed it (id, mode, date), observed extent, generated-at.
   - Process map (the Mermaid flowchart the dashboard draws) and the capabilities and use cases
     it belongs to (main, alternate and exception flows).
   - **Per step, in order**: screenshot and wireframe; title, route template, every query
     parameter and redirect seen (R-37/R-38); the action and transition to the next step,
     including the API calls observed; data items (verbatim label, English name, type, required,
     format, length, allowed values, client and server validation messages); business rules
     with decision tables; requirements with acceptance criteria as stored; NFRs; glossary terms
     shown on the screen (verbatim and English); amendments and annotations; each record with
     its status and confidence line and its evidence list (the SRS statement format).
   - Assumptions, open questions and crawler follow-ups for these screens.
   - Traceability: requirement ↔ rule ↔ data item ↔ step ↔ evidence.
3. **To-be spec**: the same structure for a to-be variant's latest saved revision; observed
   steps carry their as-is content; designed steps are marked "designed, not observed" and carry
   their annotations; merged steps list what they were built from.
4. **Delta spec**: the current change spec sections (scope, as-is, to-be, delta, records,
   migration cut, open questions, with the BA's saved edits), plus before/after pictures for
   every changed, merged, added or removed step.
5. **All**: as-is, every to-be and every delta in one HTML file, or one zip with all of them.
6. **Zip layout** (for people and other agents): `README.md` (what the export is, the files,
   how ids link, the status and confidence legend, written so another agent can use it without
   MudPuppy), the Markdown chapters, `images/` (screenshots and wireframes named by step and
   screen id), and `process.json` (canonical, sorted keys: process, variants, steps, and for each
   step the records, evidence ids and image paths). Same store + same choice → byte-identical
   files, except the generated-at line.
7. Records are rendered as the SRS export renders them ("all, drafts marked": a draft carries
   the DRAFT callout). No ARIA snapshots, request bodies or raw evidence files other than the
   screenshots and wireframes are included.

### US6 Processes the BA documented get the same export — P1

User, 2026-10-14, on `/docs/reference-insurer/PROC-001`: "These would be great to export also as
full requirements. Same as the one I can select by myself. With all other artifacts."

A `process` record (PROC) is written by the BA agent from the scans (goal, persona, trigger,
outcome, observed extent) and cites trace steps or map edges as evidence. It is not a workspace
process (PRC) and has no variants.

1. **Given** a PROC record's page in Docs, **then** it has the same **Download** (As-is spec,
   HTML or zip) as a workspace process. The steps are the screens resolved from its evidence, in
   walking order: trace process steps when it cites a trace, otherwise its cited edges chained
   from the trigger screen (an optional loop, e.g. "Zmień opcje" back to `/kalkulator/opcje`, is
   shown as a transition, not as a repeated step). The context section uses the record's goal,
   trigger, outcome and observed extent.
2. **Given** a PROC record, **when** the BA chooses "Open in Processes", **then** a workspace
   process is created with A in that order, linked to the record (the PRC shows "documented as
   PROC-001"; the PROC page links back), so sign-off, archive and to-be work apply. A second
   click opens the existing linked process instead of creating another.
3. The as-is spec of a workspace process linked to a PROC record includes that record's goal,
   trigger, outcome and use cases in its context section.

## Functional requirements

- **FR-001** Thumbnails come from the existing screenshot and wireframe evidence (`/evidence/…`);
  no new capture.
- **FR-002** The picker order is the tick order; the create request sends `state_ids` in that
  order.
- **FR-003** Archive and unarchive are process revisions (`ba_process_revisions.change` gains
  `archive` and `unarchive`; the process gets an archived flag or an equivalent status). Nothing in any process table is deleted by this feature.
- **FR-004** Edits of A are A revisions (`process_variant_revisions.change` gains `edit`, author
  is the reviewer). A rescan (`observe`) still adds revisions on top.
- **FR-005** The sign-off records the A revision it covers; the "changed since documented"
  notice compares it with A's head.
- **FR-006** One generator renders all four downloads for both the CLI and the dashboard, built
  on `@pathfinder/docs` (`exportSrs` with the process's screens as scope) so record rendering,
  evidence lines, diagrams and statuses stay identical to the SRS export.
- **FR-007** A CLI command produces the same files, so the export can be scripted or handed to
  other harnesses without the dashboard (e.g. `pnpm docs:process-spec <portal> <PRC-key> [--part
  as-is|to-be:B|delta:B|all] [--format html|zip] [--out <path>]`).
- **FR-008** The dashboard stays read-only on the store: downloads are generated to a temporary
  folder and streamed; writes (archive, A edits, stage) go through the chat service like the
  other process writes.
- **FR-010** A PROC record's steps are resolved from its evidence links (`process_step`, `edge`,
  `state`) in one shared function used by the download and by "Open in Processes"; screens it
  cannot place in order are listed after the ordered steps under "Also cited".
- **FR-009** Every new control follows the Salvage Yard design system (`.sy-thumb`, `.sy-dialog`,
  `.sy-shot`, buttons, statuses) and the FE-A accessibility requirements (keyboard, focus
  return, labels).

## Success criteria

- **SC-001** A BA picks the screens of a 6-step process by looking at pictures, in walking order,
  without opening another page.
- **SC-002** From a process page, one click downloads an as-is HTML file that contains a picture
  and the cited records for every step, and a zip whose `process.json` validates against its
  schema and whose `README.md` names every file.
- **SC-003** A process created by mistake is gone from the list in two clicks and comes back with
  Restore; the store still holds every row it had.
- **SC-004** On the reference portal, the as-is spec of the login process lists every record the
  current change spec lists, plus their fields, rules and requirements in full.

## Open questions (defaults taken 2026-10-18, owner away; listed for review)

1. Pictures in exports: settled by R-68 (the process export carries screenshots and wireframes);
   the SRS export stays without pictures.
2. The stage control lives in the page head, next to the stage tag (one form: a stage select and
   **Set stage**, plus **Mark as-is documented** as the one primary action while the stage is
   `scoped`); every move shows in History.
3. Archived processes' screens count as "in no process" everywhere, the assistant's grouping
   inputs included (an archived process is out of the BA's cut).
