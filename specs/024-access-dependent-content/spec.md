# Spec 024: Content that depends on access (R-33)

Branch `feature/024-r33-access-dependent-content` · Created 2026-10-13 · Status: Draft

**Input**: roadmap R-33 (must have, user 2026-10-08): the user's work staging portal has ~100
test users whose tariffs, contracts and feature access decide what they see. Portal-agnostic, no
insurance-specific code. Decisions in the 2026-10-13 session: a free-form `attributes:` map on a
persona that Pathfinder never interprets, and a CSV import that creates personas plus vault refs.
On differences the user said: "I definitely would want then to have ability to see that they
differ. And on which personas they differ. This then can be annotated by BA to reconcile why it
differs. It is very important that we store these differences and mark that different personas
see different things and can see these variants." The model was confirmed: one screen with
persona variants, element-level "seen by / not seen by", an access-dependent mark, a variant
switcher and side-by-side diff on the screen page, and "unexplained difference" items in Review
until the BA explains them with a rule or decision table citing a persona that saw it and one
that did not. The work portal uses plain form login.

## Problem

Pathfinder scans as one persona at a time. When two users see the same screen with different
content (an extra button, a hidden section, a whole menu entry), nothing records it: the
fingerprint either merges the two (the difference is lost) or splits them into unrelated states
(the link is lost). The BA cannot see which users see what, and cannot document the access
rules behind it.

## User stories

### US1 Personas carry what decides access — P1

1. A persona file may have `attributes:` (any keys and values, e.g. `tariff: premium`,
   `contract: B2B`, `features: [export, invoices]`); Pathfinder stores and shows them but never
   interprets them.
2. A CSV (one row per test user: persona id, login, password, then attribute columns) creates
   or updates one persona file per row under `personas/<portal>/`, with credentials stored in
   the vault as refs; passwords never reach the persona files, logs or the DB in clear.
3. Re-importing the same CSV updates attributes and credentials without duplicating personas.

### US2 Scans by several personas build one screen with variants — P1

1. **Given** two personas scanned the same screen, **then** it is one screen with two persona
   variants; each variant keeps its own screenshot, elements, fields and actions.
2. **Given** an element seen by some personas and not others, **then** it is stored with "seen
   by" and "not seen by" and the element is marked **depends on access**.
3. **Given** a screen only some personas reach, **then** the screen itself is marked depends on
   access, with who reached it.
4. Persona variants are independent of scan revisions (spec 022): a rescan by persona A adds a
   revision to A's variant only.

### US3 The BA sees and reconciles the differences — P1

1. The screen page has a variant switcher (persona A / B / side by side) that highlights what
   differs; each persona's attributes are shown next to it.
2. An access matrix per portal (screens and elements × personas, with attributes) is available
   to the BA (dashboard view and BA read tool).
3. Each unexplained difference is an open item in Review ("unexplained difference") until the
   BA documents it.
4. The BA documents a difference as a rule or decision-table record that cites evidence from a
   persona that saw it and one that did not; the difference then shows as explained, linked to
   that record.

### US4 Choosing whom to scan — P2

1. Given the imported personas, Pathfinder proposes a sample: one persona per distinct attribute
   combination, plus pairs that differ in exactly one attribute, instead of all users.
2. The BA can scan the sample (or any chosen set) as one batch; each persona is its own run.

## Edge cases

- Same element with different text per persona (e.g. a price) → same element, the text differs;
  shown as a content difference, not an access difference.
- Element order differs only → not a difference.
- A persona whose login fails → its runs are marked login-blocked; it does not count as "not
  seen by" anywhere.
- A screen not reached by a persona because the scan's budget ran out → "not reached", distinct
  from "not shown"; only full scans count as evidence that something is not shown.
- Attributes change between imports → the variant records the attributes it was scanned with.

## Requirements

- **FR-001**: Persona `attributes:` map, free-form, validated only as YAML scalars or lists;
  shown in the dashboard and given to the BA tools.
- **FR-002**: CSV import command (and dashboard upload) creating personas and vault refs,
  idempotent per persona id.
- **FR-003**: A screen identity that groups the observations of different personas (shared with
  spec 022's revisions); per persona a variant of the screen.
- **FR-004**: Per element and per screen, the set of personas that saw it and that reached the
  screen but did not see it; derived deterministically from stored observations.
- **FR-005**: Access-dependent marks on elements and screens; the access matrix as a read model
  for the dashboard and the BA server.
- **FR-006**: Review items for unexplained differences; explained when a BA record cites a
  seer and a non-seer for that difference.
- **FR-007**: Sampling proposal and batch scan of a chosen set of personas.
- **FR-008**: Portal-agnostic: no attribute name or value is known to code.

## Success criteria

- **SC-001**: A proving-ground portal with three test users (e.g. basic, premium, premium+B2B)
  scanned by all three yields: one screen per page, the premium-only button marked with seen by
  premium and premium+B2B and not seen by basic, and the B2B-only menu entry likewise.
- **SC-002**: The BA, given the access matrix, writes a decision table that the LLM judge or
  ground truth matches for both differences.
- **SC-003**: Importing a 100-row CSV creates 100 personas and 200 vault refs in under a minute;
  no password appears in any file or table in clear.
- **SC-004**: The sample for the proving-ground users has fewer runs than users and still finds
  every difference in SC-001.

## Assumptions

- Form login (existing login step and vault) works on the work portal; SSO/MFA is out of scope.
- Cost per persona scan follows R-24; the sampling exists to keep it down.
- Depends on spec 022 for the screen identity and the Review inbox; on spec 023 only if a
  portal needs a hook per persona (e.g. a feature cookie), which hooks already allow.
