# Feature Specification: Screenshots and Wireframes as Documentation Evidence

**Feature Branch**: `feature/008-r20-r21-screenshots-wireframes`

**Created**: 2026-10-04

**Status**: Done (2026-10-05, signed off by the user; SC-004 Excalidraw open check deferred)

**Input**: User description: "R-20 + R-21: Screenshots and wireframes as documentation evidence. Screenshots per new state at observation time on every environment including production, no masking, with bounding boxes so the dashboard can highlight the regions a record describes; a 'screen region' evidence kind for the BA. Deterministic low-fidelity wireframes per state from the recorded ARIA snapshot as SVG in one fixed style plus an editable .excalidraw file; the wireframe is the fallback where no screenshot exists. Both in the dashboard and in the docs:export SRS. Constitution 2.0.0 lowers the security level: no PII scrubbing requirement, forms may be filled and submitted on sandbox/staging; production stays read-only. Existing data may be wiped; no backfill."

## Context

The first sandbox review of the Docs tab (2026-10-03, `user_input/raw_idea/raw_dashboard_and_documentation.md`)
found the documentation hard to understand without pictures: a reader sees "SCR-007 Kalkulator
OC/AC" and a list of fields, but not what the screen looks like or where on it a rule applies.
Screenshots were deliberately left out of v1 because masking could not redact pixels.

The user has since decided (2026-10-04) that Pathfinder runs almost always against test
environments and that the current safety level costs more usefulness than it protects: screenshots
are not masked, and the crawler may fill and submit forms with test data on non-production
portals. The goal is the business requirements; the data on the target is disposable. This
feature carries that decision into the constitution (2.0.0) and builds the two visual evidence
types on top of it.

Wireframes are not a replacement for screenshots on the reader's side; they are a uniform,
editable sketch of every screen, drawn only from what was recorded (no invented layout), and the
picture shown wherever a screenshot is missing.

## Clarifications

### Session 2026-10-04

- Q: Screenshots on production portals? → A: Yes, always, no masking.
- Q: Screenshots and wireframes in the dashboard only, or also in `docs:export`? → A: Both, in
  both places; screenshots are a vital part of the documentation.
- Q: Excalidraw as the editable wireframe format? → A: Yes (MIT, open JSON format, opens on
  excalidraw.com, the VS Code extension or self-hosted). Written directly; no Excalidraw package.
- Q: States recorded before this feature have no screenshots. → A: No backfill, no re-capture
  run. Existing crawl and documentation data may be wiped (sandbox and production stores) and
  re-crawled.
- Q: Security level in general? → A: Lower it. No PII scrubbing requirement for traces or
  screenshots; on sandbox/staging map and trace mode may fill and submit forms with test data
  (supersedes spec 001 FR-011 and finding I1). Production stays read-only (no submits);
  robots.txt, rate limits and the no-CAPTCHA-solving rule stay.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See what each screen looks like (Priority: P1)

A reader opens a screen record (SCR) or a recorded state in the dashboard and sees a screenshot
of that page exactly as the crawler saw it when it recorded the state, next to the existing
text. Records that cite the state (data items, rules, requirements) show the same screenshot.

**Why this priority**: it is the core complaint from the review; without a picture the rest of
the documentation is hard to follow. Everything else in this feature builds on stored screenshots.

**Independent Test**: run a map run on the reference portal, open any recorded state and any SCR
record that cites it, and see the matching screenshot.

**Acceptance Scenarios**:

1. **Given** a map or trace run on any environment, **When** the crawler records a new state,
   **Then** one full-page screenshot is stored with that state, taken at the same moment as its
   ARIA snapshot.
2. **Given** a recorded state with a screenshot, **When** the reader opens the state page,
   **Then** the screenshot is shown, and clicking it opens it at full size.
3. **Given** a documentation record that cites a state, **When** the reader opens the record,
   **Then** the screenshot of each cited state is shown with the record.
4. **Given** a production portal, **When** a run records a state, **Then** a screenshot is
   stored, unmasked, the same as on sandbox.

---

### User Story 2 - See where on the screen a record applies (Priority: P1)

The BA cites not just a screen but a region of it (a field, a button, a section) when it
documents a data item, rule or requirement. The reader sees the screenshot with that region
highlighted, so "the `Pojemność silnika` field must be a number" points at the actual field.

**Why this priority**: it is what turns a screenshot gallery into documentation; the user asked
for "a highlighter to the points that we describe".

**Independent Test**: after a BA session on the reference portal, open a DI or BR record that
cites a field and see that field outlined on the screenshot.

**Acceptance Scenarios**:

1. **Given** a recorded state, **When** it is stored, **Then** the position and size of every
   interactive element, form field, heading and landmark in the page snapshot is stored with it.
2. **Given** the BA documents a record, **When** it cites a field, action or element of a state,
   **Then** it can cite it as a screen region of that state (evidence kind "screen region").
3. **Given** a record with one or more screen-region citations, **When** the reader opens it,
   **Then** each cited region is outlined on the screenshot and labelled with what it is.
4. **Given** one screenshot cited by several records, **When** each record is opened, **Then**
   each shows only its own highlights on the same stored image (highlights are drawn on top, not
   saved into the image).

---

### User Story 3 - A uniform wireframe of every screen (Priority: P2)

Every recorded state also gets a low-fidelity wireframe drawn from its recorded page structure:
headings, text fields, buttons, links, tables and sections in page order, in one fixed visual
style. It is shown where no screenshot exists and is available as an editable Excalidraw file
that a person can open and change.

**Why this priority**: it gives every screen a consistent sketch for the SRS and covers states
without screenshots, but the screenshots alone already solve the main reader problem.

**Independent Test**: for any recorded state, generate its wireframe twice and get identical
output; open the Excalidraw file in Excalidraw and see the same layout, editable.

**Acceptance Scenarios**:

1. **Given** a recorded state, **When** its wireframe is generated, **Then** it shows the page's
   headings, form fields with their labels, buttons, links, tables and landmarks in page order,
   and nothing that is not in the recorded snapshot.
2. **Given** the same recorded state, **When** the wireframe is generated again, **Then** the
   output is byte-identical.
3. **Given** a wireframe, **When** the reader downloads its Excalidraw file and opens it in
   Excalidraw, **Then** it shows the same elements and labels and can be edited.
4. **Given** a state or record whose state has no screenshot (failed capture), **When** the
   reader opens it, **Then** the wireframe is shown in place of the screenshot, marked as a
   wireframe.

---

### User Story 4 - Pictures in the exported SRS (Priority: P2)

The `docs:export` SRS includes, for each screen, its screenshot with the record's highlights and
its wireframe, so the exported documentation can be read without the dashboard.

**Why this priority**: the export is the deliverable the user shares; screenshots are a vital part
of it. Depends on US1–US3.

**Independent Test**: export the reference portal docs and open the screens section in a Markdown
viewer: every screen shows its screenshot (with highlights) and wireframe; the files are in the
export folder.

**Acceptance Scenarios**:

1. **Given** documentation with screens and region citations, **When** it is exported, **Then**
   each screen section embeds its screenshot and its wireframe, and records with region citations
   embed a highlighted image of their regions.
2. **Given** the same store, **When** it is exported twice, **Then** the exported text and image
   files are identical (deterministic export).
3. **Given** an export folder, **When** it is moved or zipped, **Then** every image link still
   works (links are relative and images are copied into the folder).

---

### User Story 5 - Lower safety level on test environments (Priority: P1)

The operator runs the crawler on a sandbox or staging portal and it fills forms with test data
and submits them, so the BA sees validation messages, confirmation pages and the states behind
forms. On production nothing is submitted. Traces, evidence and screenshots are stored as
recorded, without PII scrubbing.

**Why this priority**: the user's explicit decision; it unblocks better business requirements now
and is a precondition for unmasked screenshots matching the rest of the evidence.

**Independent Test**: map the reference portal (sandbox) and see forms filled with test data and
submitted, with the result states recorded; repeat with a production-flagged portal config and
see no submit happen.

**Acceptance Scenarios**:

1. **Given** the constitution, **When** this feature lands, **Then** it is at 2.0.0 and no longer
   requires PII scrubbing of traces or screenshots, allows filling and submitting forms on
   sandbox/staging, and still requires read-only on production, robots.txt, rate limits and no
   CAPTCHA solving.
2. **Given** a sandbox or staging portal, **When** a map or trace run meets a form, **Then** the
   crawler may fill it with test data and submit it, and the resulting state is recorded.
3. **Given** a production portal, **When** any run meets a submit, **Then** it is refused as
   today.
4. **Given** a run on any environment, **When** evidence is stored, **Then** text in snapshots,
   network bodies and traces is stored as recorded, without scrubbing, unless the portal config
   turns scrubbing on.

### Edge Cases

- **Very long pages**: a full-page screenshot of a very long page is capped at a maximum height;
  the cap is recorded, and regions below it fall back to the wireframe highlight.
- **Capture fails** (timeout, page closed, navigation during capture): the state is still
  recorded without a screenshot, a run-level warning is written, and the wireframe is shown.
- **Elements without a position** (hidden, zero size, off-canvas): stored without a box; the BA
  can still cite them as an element, and the dashboard says "not visible on the screenshot".
- **Same state seen again** (same fingerprint): no new screenshot; the first one stays as the
  state's picture.
- **Region cites an element the state does not have**: the BA tool refuses the citation with a
  clear error, as it does for other unknown evidence.
- **Large storage**: screenshots are stored as compressed image files in the portal's evidence
  folder, not inside the database; a whole reference-portal map fits within a few tens of MB.
- **Old data**: states recorded before this feature have neither screenshot nor boxes; the
  documented path is to wipe and re-crawl (no compatibility shim).
- **Submitting on sandbox triggers a CAPTCHA or a block**: the run records it and stops, as today.

## Requirements *(mandatory)*

### Functional Requirements

**Safety level (constitution 2.0.0)**

- **FR-001**: The constitution MUST be amended to 2.0.0 (MAJOR): remove the requirement that PII in
  traces and screenshots be scrubbed or access-restricted; allow map and trace mode to fill and
  submit forms with test data on sandbox and staging; keep the production read-only policy,
  robots.txt and terms check, rate limits, identifiable User-Agent, and the rule that CAPTCHAs and
  anti-bot defenses are never solved or worked around.
- **FR-002**: On sandbox and staging, map mode MUST be able to fill form fields with test data and
  submit forms when the persona's safety class allows it; spec 001 FR-011 ("without being
  submitted") and finding I1 MUST be marked superseded by this spec.
- **FR-003**: On production, the environment guard MUST keep refusing every non-read action,
  including submits, exactly as today.
- **FR-004**: PII scrubbing of stored text evidence MUST be off by default and MAY be turned on per
  portal in its config.

**Screenshots (R-20)**

- **FR-005**: The crawler MUST capture one screenshot per newly recorded state during map and trace
  runs, on every environment, unmasked, at the same moment as the state's ARIA snapshot.
- **FR-006**: The screenshot MUST be full-page up to a configurable maximum height (default 10 000
  CSS px) at a fixed viewport width; whether it was cut is stored with it.
- **FR-007**: The crawler MUST store, with each new state, the bounding box (position and size in
  screenshot coordinates) of every interactive element, form field, heading and landmark found in
  the state's snapshot, linked to the element's existing identity in the recorded actions/forms.
- **FR-008**: Screenshots MUST be stored as image files in the portal's evidence store, referenced
  from the state, and MUST NOT be re-captured for an already-known state.
- **FR-009**: A failed capture MUST NOT fail the state or the run; it MUST be recorded as a
  run-level warning and in the run trace.
- **FR-010**: The BA tools MUST offer a "screen region" evidence kind that cites one recorded
  element of a state (resolving to its stored box), with an optional note; citing an element the
  state does not have MUST be refused.
- **FR-011**: The BA tools MUST let the BA read which elements of a state have boxes (so it can
  choose what to cite), and the BA skill MUST say when to cite a region instead of a whole state.
- **FR-012**: The dashboard MUST show the screenshot on the state page and on every documentation
  record that cites the state or a region of it, with a full-size view.
- **FR-013**: The dashboard MUST draw each cited region as an outline with a label over the
  screenshot, using the stored boxes; the stored image MUST stay unchanged.

**Wireframes (R-21)**

- **FR-014**: The system MUST generate a wireframe for any recorded state from its recorded
  snapshot only: headings, text fields and other inputs with their labels, buttons, links, tables,
  lists and landmarks, in page order, in one fixed style.
- **FR-015**: Wireframe generation MUST be deterministic: the same snapshot gives byte-identical
  output.
- **FR-016**: Each wireframe MUST be available as an SVG image and as an editable Excalidraw file
  (`.excalidraw`, open JSON format) with the same elements and labels.
- **FR-017**: Wireframe elements MUST be traceable to the snapshot elements they draw, so a cited
  region can also be highlighted on the wireframe.
- **FR-018**: The dashboard MUST show the wireframe on the state page (beside the screenshot or as
  a tab) and in place of the screenshot, marked as a wireframe, where no screenshot exists; both
  files MUST be downloadable.

**Export**

- **FR-019**: `docs:export` MUST embed, per screen, its screenshot and wireframe, and per record
  with region citations, an image with those regions highlighted; images MUST be written into the
  export folder and linked relatively.
- **FR-020**: The export with images MUST stay deterministic: two exports of the same store give
  identical files.
- **FR-021**: The machine-readable export MUST list each screen's screenshot, wireframe and the
  region citations (element, box, record).

**Data and close-out**

- **FR-022**: The schema change (screenshot reference, cut flag, element boxes, screen-region
  evidence kind) MUST ship as a reversible migration; the data model docs and snapshot MUST be
  updated.
- **FR-023**: The quickstart MUST document wiping the existing crawl and documentation data and
  re-crawling; no backfill of old states is provided.
- **FR-024**: The glossary MUST gain or update entries for screenshot, screen region, bounding box
  and wireframe, and the "evidence" entry MUST list the new kinds.

### Key Entities

- **Screenshot**: one image of a recorded state as first seen; belongs to exactly one state; has
  the capture viewport, full height, and whether it was cut at the maximum height.
- **Element box**: position and size of one snapshot element (field, action, heading, landmark) on
  a state's screenshot; linked to the element's identity used by actions and forms; may be absent
  for invisible elements.
- **Screen region citation**: a documentation evidence link from a record revision to one element
  box of one state, with an optional note.
- **Wireframe**: a derived, regenerable sketch of one state's snapshot, as SVG and Excalidraw;
  not stored as source evidence, because it can always be rebuilt from the snapshot.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a fresh map run of the reference portal, at least 95% of recorded states have a
  screenshot.
- **SC-002**: After a BA session on the reference portal, every DI record and at least 80% of BR
  records that concern a specific field cite at least one screen region.
- **SC-003**: For every region citation in that session, the highlight on the screenshot overlaps
  the cited element as seen by a reviewer (spot check of 20 citations: 20 of 20 correct).
- **SC-004**: Every recorded state has a wireframe; generating all wireframes twice gives
  identical files, and each Excalidraw file opens in Excalidraw without errors.
- **SC-005**: The exported SRS of the reference portal shows a screenshot and a wireframe for 100%
  of screen records, and all image links work after zipping and unzipping the folder.
- **SC-006**: On the reference portal (sandbox), a map run reaches at least one state that is only
  reachable by submitting a filled form (e.g. a calculator result or a contact confirmation);
  a production-flagged run of the same portal submits nothing.
- **SC-007**: The user, reviewing the reference portal docs in the dashboard, confirms that the
  screens and rules are understandable without opening the portal itself.

## Assumptions

- Map and trace runs already use Playwright; screenshots and element boxes come from the same page
  at observation time, so no new external tool is needed. Excalidraw is only a file format here.
- The reference portal is the target for verification and the goal measure (live liveinsurer data is
  disposable); a production-flagged copy of its config is enough to check the read-only guard.
- Test data for filling forms comes from the persona config (existing fixtures) or plausible
  generated values; choosing test data well is not a goal of this feature beyond reaching the
  states behind forms.
- Fixed viewport width (desktop, 1280 CSS px) for all screenshots; mobile layouts are out of scope.
- Re-capturing screenshots for known states, comparing screenshots between runs (visual diffs) and
  AI-drawn or free-form wireframes are out of scope.
- Dashboard pan and zoom of large images is R-19, not this feature; a simple full-size view is
  enough here.
- Existing crawl and documentation data (sandbox and production stores) may be wiped; there is no
  data migration for old states beyond the schema migration itself.
