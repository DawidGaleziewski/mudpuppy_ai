# Feature Specification: Glossary and BA Wiki

**Feature Branch**: `feature/006-r22-glossary-ba-wiki`

**Created**: 2026-10-03

**Status**: Done (2026-10-03, signed off by the user)

**Input**: User description: "R-22 Glossary and BA wiki. Source: `user_input/raw_idea/raw_glossary_help.md` and the R-22 note in `roadmap.md`. The user (learning BA tooling) is lost on Pathfinder terms and wants them explained in one place: run, route template, confidence, settled, cluster, evidence (what it consists of / can consist of, what exactly is gathered per run), action, persona, safety class, top locator, target, frontier, decision, trace, process. One source of truth for the glossary that the dashboard loads (tooltips on the terms where they appear in the UI, plus a glossary page) and that a README renders. Keep it in sync: a glossary-sync step in the SDD close-out checklist beside the changelog, so each feature updates it. BA terms link to a local BA wiki (no broken external links) whose pages explain BA concepts in our own words, with short quotes and citations to recognised sources (IIBA BABOK, IREB CPRE, ISO/IEC/IEEE 29148) and the original URLs; no wholesale copying of copyrighted texts. Distinct from the BA agent's GL records (those describe a portal's terms, not Pathfinder's)."

## Context

Pathfinder's dashboard and docs use many words that have a specific meaning here (run, frontier,
settled, cluster, top locator, safety class, confidence...). None of them are explained anywhere
a reader would look while using the tool. The meanings exist only in specs, code and the
constitution, often in several places that differ slightly. The intended readers are business
analysts and people who want BA artifacts, and many of them will not read specs.

The **Pathfinder glossary** in this feature explains *Pathfinder's own* vocabulary. It is not the
BA agent's `GL` glossary records, which document the *portal's* terms (e.g. "Składka") as part
of Layer B. The two never share storage or screens, and each one says it is not the other.

## Clarifications

### Session 2026-10-03

- Q: Who writes the glossary entries? → A: Claude writes all of them; the user does not write
  entries. The user rated a proposed term list instead (`term-review.md`).
- Q: Which terms are in v1? → A: the 59 terms rated Must or Nice in `term-review.md`; the 12
  rated Skip are out of v1.
- Q: Tooltip or always-visible text? → A: tooltip by default; a one-line section intro under the
  heading for Run, State, Analysis session and Gaps.
- Q: "Target" has two meanings (link href in the Actions table, cited item in a Docs evidence
  table). → A: rename the Actions table column; keep "Target" for evidence.
- Q: Frontier is still unclear to the user. → A: give it a longer explanation, including that it
  is the standard web-crawler term (the edge between explored and unexplored pages), not a BA
  term, and that Pathfinder's frontier table also keeps the history of each item.
- Q: How deep should "evidence" go? → A: a dedicated explanation: every kind of evidence, what
  it contains, where it is stored, which runs gather it, and how the BA uses it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Look up any Pathfinder term in one place (Priority: P1)

A reader who meets an unfamiliar word ("frontier", "settled", "top locator") opens one glossary
and finds a short definition in plain language, a longer explanation where needed, an example
from a real run, and related terms. The same glossary is readable in the repository (for people
not running the dashboard) and on a glossary page in the dashboard.

**Why this priority**: it removes the main problem in the raw idea, that terms cannot be looked
up anywhere, and it is the source that the tooltips (US2) and the wiki links (US3) build on.

**Independent Test**: with only this story built, the reader finds every Must/Nice term from `term-review.md`
in the repository glossary and on the dashboard glossary page, with the same text in both.

**Acceptance Scenarios**:

1. **Given** the glossary is built, **When** the reader looks up any term rated Must or Nice in
   `term-review.md`, **Then** it has an entry with a one-sentence definition and a longer
   explanation.
2. **Given** the reader opens the "evidence" entry, **When** they read it, **Then** it lists
   every kind of evidence Pathfinder can store, what each contains, where it is stored, which
   kinds a map run and a trace run gather, what is deliberately not gathered (e.g. screenshots
   on production, request bodies), and how the BA reads and cites it.
3. **Given** the reader opens the "frontier" entry, **When** they read it, **Then** it explains
   the idea (seen but not yet followed, the edge of the explored part of the portal), that the
   word is the standard crawler term and not a BA term, and that Pathfinder's frontier also
   keeps each item's history (done or skipped with a reason).
4. **Given** the reader opens the dashboard glossary page, **When** they search or filter by a
   word, **Then** matching entries show, and each entry has a stable link that can be shared.
5. **Given** a term means different things in different places (e.g. "trace" as crawler trace
   mode vs the R-17 run observability trace), **When** the reader opens it, **Then** the entry
   names each meaning separately and says where in the UI each one appears.

---

### User Story 2 - Understand a term where it appears in the dashboard (Priority: P2)

While reading a run page or the Docs tab, the reader hovers over (or focuses, on keyboard) a
column header or label such as "Frontier", "Cluster" or "Safety class" and sees its short
definition, with a link to the full glossary entry.

**Why this priority**: it answers the question at the moment it comes up, without leaving the
page. It needs US1's content.

**Independent Test**: open a run detail page and the Docs tab; every glossary-backed label shows
its definition on hover and keyboard focus and links to the glossary page entry.

**Acceptance Scenarios**:

1. **Given** a run detail page, **When** the reader hovers over or focuses the "Frontier"
   heading, **Then** the short definition appears and a link opens the full "frontier" entry.
2. **Given** a label in the UI uses a term with a glossary entry, **When** the page renders,
   **Then** the label is visibly marked as explainable, without changing the label text.
3. **Given** a template refers to a term that has no glossary entry, **When** the automated
   checks run, **Then** they fail and name the missing term and the template.
4. **Given** the reader uses a phone-width screen or a keyboard only, **When** they activate a
   marked label, **Then** the definition is reachable without a mouse hover.

---

### User Story 3 - Learn the BA concept behind a term from trusted sources (Priority: P3)

Some Pathfinder terms come from business analysis practice (requirement, business rule, use
case, traceability, assumption, open question, confidence of a statement). Their glossary
entries link to a local BA wiki page that explains the concept in Pathfinder's own words, shows
how Pathfinder uses it, and cites recognised sources (IIBA BABOK Guide, IREB CPRE, ISO/IEC/IEEE
29148) with short attributed quotes and the original links.

**Why this priority**: helps readers grow from "what does Pathfinder mean" to "what does the
profession mean", but the tool is usable without it.

**Independent Test**: from a BA term's glossary entry, open its wiki page; the page works with
no network access, and every claim attributed to a source has a citation with the source name,
section where known, and original URL.

**Acceptance Scenarios**:

1. **Given** a glossary entry tagged as a BA concept, **When** the reader follows its "read
   more" link, **Then** a local wiki page opens (no external site needed to read it).
2. **Given** a wiki page, **When** the reader reads it, **Then** it has: an explanation in our
   own words, how Pathfinder applies the concept, at least one citation to a recognised source
   with its original URL, and the date the source was checked.
3. **Given** any wiki page, **When** it quotes a source, **Then** each quote is short (at most
   two sentences), attributed, and no page reproduces a source's text at length.
4. **Given** an original source URL later stops working, **When** the reader opens the wiki
   page, **Then** the explanation and citation are still readable locally.

---

### User Story 4 - Keep the glossary current as features land (Priority: P3)

When a feature adds or changes a term (a new column, status label or record kind), the person
closing the feature updates the glossary as part of the normal close-out, the same way the
changelog is updated.

**Why this priority**: without it the glossary goes stale after the next feature, but it is a
process change more than a product one.

**Independent Test**: the SDD close-out checklist contains a glossary-sync step next to the
changelog step, and the automated check from US2 catches a newly added UI term with no entry.

**Acceptance Scenarios**:

1. **Given** a feature is being closed, **When** the closer follows the close-out checklist,
   **Then** a "glossary sync" step asks them to add or update entries for terms the feature
   introduced or changed.
2. **Given** an entry, **When** the reader views it, **Then** it shows which roadmap item last
   changed it and when.

---

### Edge Cases

- A term has two meanings (trace, process, glossary itself): one entry, each meaning listed
  separately with where it appears; or two entries that point at each other.
- A UI label is a synonym or plural ("States", "Runs"): it resolves to the canonical entry.
- A term is retired by a later feature: the entry stays, marked as retired, with what replaced it.
- Status labels shown as short codes (`[DRFT]`, `[RJCT]`, `[OLD.]`, ...) each have an entry
  giving the full word and what it means.
- The glossary source is malformed or an entry is missing a required part: automated checks
  fail with the entry name; the dashboard still renders pages, without tooltips, rather than
  failing.
- A wiki page has no citable recognised source (Pathfinder-only idea): it is not a wiki page;
  the concept stays a plain glossary entry.

## Requirements *(mandatory)*

### Functional Requirements

**Glossary content**

- **FR-001**: There MUST be exactly one source of truth for the Pathfinder glossary; the
  repository README view and the dashboard glossary page and tooltips are all produced from it.
- **FR-002**: Each entry MUST have: a canonical term, a one-sentence definition (used for
  tooltips), a longer explanation, and the roadmap item and date of its last change. It MAY
  have: synonyms/UI labels it covers, an example (preferably from the reference portal), related
  terms, where it appears in the UI, a link to a BA wiki page, and a "retired" marker.
- **FR-003**: The v1 glossary MUST cover exactly the terms rated Must or Nice in
  `term-review.md` (59 terms; the four-letter status codes entry covers every bracketed code the
  dashboard shows). Terms rated Skip are not added in v1.
- **FR-004**: The "evidence" entry MUST link to a longer explanation that describes each
  evidence kind Pathfinder can store, what it contains, where it is stored, which run modes and
  environments gather it, what is deliberately not gathered and why, and how the BA reads and
  cites evidence in its records.
- **FR-004a**: The "frontier" entry MUST have a longer explanation as in US1 scenario 3.
- **FR-005**: The glossary MUST state that it describes Pathfinder's vocabulary and is not the
  BA agent's portal glossary (`GL` records), and the Docs tab's glossary section MUST state the
  reverse.
- **FR-006**: Definitions MUST be written in plain English for a BA who has not read the specs,
  and MUST agree with the constitution and current behavior; where the code and an older spec
  disagree, the entry follows the code and the discrepancy is listed in the feature's notes.

**Dashboard**

- **FR-007**: The dashboard MUST have a glossary page listing all entries, with a text filter,
  and a stable anchor per entry.
- **FR-008**: Dashboard labels backed by a glossary entry rated "tooltip" MUST show the entry's
  short definition on hover and on keyboard focus, and offer a link to the full entry; the label
  text itself is unchanged.
- **FR-008a**: The sections for Run, State, Analysis session and Gaps MUST show the entry's
  short definition as one always-visible line under the section heading, with a link to the
  full entry.
- **FR-008b**: The Actions table column now headed "Target" (the link's href) MUST be renamed so
  that "Target" is used only for the item a Docs record's evidence cites. The new name is chosen
  in the plan.
- **FR-009**: The glossary page and tooltips MUST follow the existing dashboard design system
  and work at phone width and with keyboard only.
- **FR-010**: Automated checks MUST fail when a template refers to a glossary term that does not
  exist, or when an entry is missing a required part (FR-002), naming the term and location.
- **FR-011**: The dashboard MUST keep working (without tooltips, with a visible notice on the
  glossary page) if the glossary source cannot be read.

**BA wiki**

- **FR-012**: BA wiki pages MUST be stored locally in the repository and readable without network
  access, both as files in the repository and from the dashboard.
- **FR-013**: Each wiki page MUST contain: an explanation in our own words, how Pathfinder
  applies the concept, related glossary entries, and one or more citations each giving source
  title, edition/version, section where known, original URL and date checked.
- **FR-014**: Quotes from copyrighted sources MUST be short (at most two sentences per quote),
  attributed, and used only to support the explanation; no page may copy a source's text,
  tables or figures at length.
- **FR-015**: The v1 wiki MUST include a page for each BA concept behind a BA term in
  `term-review.md` that has a recognised source: requirement, non-functional requirement,
  acceptance criteria, business rule, decision table, use case, data dictionary (data item),
  glossary (as a BA deliverable), assumption, business capability, as-is process modelling,
  traceability, requirements review and validation, and the software requirements
  specification (SRS). Pathfinder-only concepts (confidence label, documentation record, screen
  record) stay plain glossary entries.

**Sync**

- **FR-016**: The SDD close-out checklist (where the changelog step lives, including the `po`
  agent's close-out steps) MUST include a "glossary sync" step before merge.
- **FR-017**: The Glossary MUST be filled for this feature's own scope as part of this feature
  (not left as a template), and roadmap R-22 updated to reflect what was delivered.

### Key Entities

- **Glossary entry**: one Pathfinder term. Canonical term, synonyms/UI labels, short definition,
  explanation, example, related terms, UI locations, BA wiki link, retired marker, last changed
  (roadmap item, date).
- **BA wiki page**: one BA concept. Title, explanation, Pathfinder usage, related glossary
  entries, citations.
- **Citation**: source title, edition/version, section, original URL, date checked, optional
  short quote.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the 59 Must/Nice terms in `term-review.md` have a glossary entry with
  definition and explanation.
- **SC-002**: The user, reading only the glossary, can explain in their own words what a
  frontier is and what evidence a run gathers, where it is stored and how the BA uses it, at
  sign-off (the user's judgement is the test; these were the two items marked unclear or
  under-explained in the review).
- **SC-003**: On any dashboard page, the definition of a marked term is reachable in one action
  (hover, focus or tap) without leaving the page. Accepted limit: below 1024 px stacked tables
  hide their header row, so column tooltips are desktop only; heading tooltips and section intros
  work at every width.
- **SC-004**: 100% of wiki pages open and read correctly with no network access, and 100% of
  citations include source title, original URL and date checked.
- **SC-005**: The automated check catches a deliberately added unknown term in a template in
  the validation run.
- **SC-006**: The repository glossary and the dashboard glossary page show identical text for
  every entry.

## Assumptions

- English is the glossary language, matching the docs; portal terms in examples stay verbatim
  (Polish).
- The 15 user terms plus dashboard labels are the v1 scope; CLI flags and internal code names
  appear only where a reader of the dashboard or docs meets them.
- Examples come from the reference portal (`reference-insurer`) sandbox data, not liveinsurer, so they
  stay stable and safe to show.
- Recognised sources are cited by public pages (publisher pages, standard abstracts, free
  glossaries such as the IREB CPRE glossary); paywalled full texts are cited by edition and
  section without being reproduced.
- Read-only dashboard rules stay as they are: the glossary is read-only content; no write path
  is added.
- Internationalization, user-editable glossary in the UI, and search across BA wiki full text
  are out of scope for v1.
- Related roadmap items R-19..R-21 are not affected; R-16's export may later reuse the glossary,
  but that is not part of this feature.
