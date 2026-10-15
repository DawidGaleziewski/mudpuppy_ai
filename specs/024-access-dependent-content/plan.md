# Implementation Plan: Content that depends on access (R-33), P1

**Branch**: `feature/024-r33-access-dependent-content` | **Date**: 2026-10-14 | **Spec**: [spec.md](spec.md)

## Scope (owner, 2026-10-14)

"Spec → plan → tasks, build P1 only: attributes, CSV import, per-persona variants with
seen/not seen. Sampling (US4) and the diff UI wait for owner review." So this branch builds:

| Part | What | Stories |
|---|---|---|
| A | Persona `attributes:` (free form, never interpreted), shown in Settings and to the BA | US1.1 |
| B | CSV import: one persona file per row + vault refs, idempotent, no clear passwords anywhere | US1.2, US1.3 |
| C | Access read model: per screen, which personas reached it, each persona's variant (the state it last observed), per element "seen by / not seen by", access-dependent marks on elements and screens | US2.1–US2.3 |
| D | Where it shows: BA read tool `get_access_matrix`, the screen page lists persona variants with their seen/not-seen elements, a portal access matrix page | US3.2 (part), US2 |

Not in this branch (owner review first): side-by-side diff view (US3.1), "unexplained
difference" Review items and their explanation link (US3.3, US3.4), sampling and batch scans
(US4), and revisions per persona variant (US2.4, needs a pipeline change in `record-state`; today a
persona's different content becomes a new observed revision of the shared screen — recorded as a
finding).

## Design

### A. Attributes

`personas/<portal>/<id>.yaml` gets `attributes:` — a map of string keys to a scalar or a list of
scalars (Zod: `z.record(z.string(), z.union([Scalar, z.array(Scalar)]))`). `extends` merges maps
(the child wins per key). No code reads a key: Pathfinder never interprets them (FR-008). A run
keeps the attributes it ran with in `runs.config_snapshot` (persona section), so a later CSV
change does not rewrite history.

### B. CSV import

`pnpm --dir apps/crawler personas:import <portal> <file.csv> [--extends <mixin>]`:
- Header row: `persona_id,login,password,<attribute columns…>`; an attribute cell may hold a list
  as `a|b`. Persona ids are slugs.
- Per row: writes `personas/<portal>/<persona_id>.yaml` (`extends` the given mixin or
  `_mixins/<portal>-login` when present, `auth: { login: ref:<PORTAL>_<ID>_LOGIN, password:
  ref:…_PASSWORD }`, `attributes:`), and stores the two values in the vault
  (`vault.set(portal, environment, ref, value)` for each environment of the portal, or the one
  given with `--environment`). A second import of the same file overwrites the same files and
  vault entries: no duplicates.
- Never prints a password; the summary lists created / updated personas and refs.

### C. Access read model (deterministic, no migration)

Inputs: `screens`, `states` (with `screen_id`), `state_observations` (run, state, persona),
`actions` (state, role, accessible_name) for elements, `runs` (status, persona, mode).
- **Reached**: personas with an observation of any state of the screen.
- **Variant per persona**: the newest state that persona observed of the screen.
- **Elements of a variant**: its actions as `role "name"` keys (role-only when unnamed).
- **Seen by / not seen by**: an element key is seen by the personas whose variant has it; not
  seen by the personas that reached the screen in a completed map run and whose variant lacks it
  (a persona that only reached it in an interrupted run counts as "not reached", not "not shown",
  edge case).
- **Marks**: an element is `depends on access` when seen by ≥ 1 and not seen by ≥ 1; a screen is
  when any element is, or when some persona with a completed map run of the portal never reached
  it.
- Same key, different text (a price) is a content difference, not an access one: keys use role
  + accessible name, so a changed name shows as two keys; v1 records it as seen/not seen (the
  edge case is noted as a finding for the diff UI).

Where: `queries_access.py` (dashboard) and `services/ba/access.ts` (BA tool) compute the same
model; one fixture-driven test per side checks both against the same expected matrix.

### D. Views

- Screen page: an "Access" side tab (next to Amendments / Cited by / History): personas that
  reached the screen with their attributes, each variant's state link, the access-dependent
  elements with seen by / not seen by.
- `/access`: the portal matrix (screens × personas: reached / not reached; access-dependent
  elements count), linking to the screens.
- BA tool `get_access_matrix {portal_id, screen?}` (read-only) returns the same model with
  attributes; `ba-practice` reference gets a short note on documenting access rules with a seer
  and a non-seer as evidence.

## Tests

Config schema (attributes, extends merge); CSV import (files, vault refs, idempotence, no
password in files or output); the read model on a fixture with three personas (basic, premium,
premium+B2B) and two screens (SC-001 shape): one premium-only button, one B2B-only menu entry;
dashboard pages; BA tool.

## P2 (owner 2026-10-15)

Branch `feature/028-r51-r39-r33-relations-access` (with R-51, spec 028, and R-39 round 4). Owner:
"P2 starts with the side-by-side diff and 'unexplained difference' Review items; the /access words
stay 'Differs / Same for all'; the two `extends` merges get one shared fixture (F-06)". Sampling
and batch scans (US4) and revisions per persona variant (US2.4, F-01) stay out.

| Part | What | Stories |
|---|---|---|
| E | Explanations in the access model: per access-dependent element and per "not reached" screen, the BA records that explain it (`explained_by`), in both read models, one shared fixture | US3.4, FR-006 |
| F | Review group "Unexplained differences": one item per unexplained element or reach difference; the nav's Review count includes them | US3.3 |
| G | Side by side on the screen page's Access tab: pick two personas, their screenshots and attributes side by side, elements only one sees, elements whose text differs (paired), the rest counted | US3.1, F-02 |
| H | One persona-merge fixture (YAML tree + expected) checked by the TypeScript loader and the dashboard's Settings | F-06 |

### E. When is a difference explained (deterministic)

The latest revision of a record that is not withdrawn, with these evidence links:

- **Element** (`seen_by` and `not_seen_by` both non-empty): a `business_rule` citing a
  `screen_region` of the element on a seer's variant state (the region key without its `#n`
  suffix equals the element key) **and** a `state` or `screen_region` on a non-seer's variant
  state. That is the `ba-practice` access rule: one persona that sees it, one that does not.
- **Reach** (`not_reached` non-empty): a `business_rule` or an `open_question` (the guidance asks
  for a question here: "never reached" is a coverage fact first) citing a state of the screen
  **and** a state that one of the `not_reached` personas observed.

`explained_by` lists the record keys (sorted); `reach_explained_by` likewise per screen (empty when
nothing is unreached). Reading: one query for the evidence links of such records of the portal and
one for the states each persona observed; no migration.

### F. Review

`queries_review.KINDS` gains `("differences", "Unexplained differences")`. An item names the
screen, the element (or "not reached by …"), who sees it and who does not with their attributes,
and links to the screen's Access tab side by side with a seer on the left and a non-seer on the
right. Deciding means writing the BA record (chat or BA session); the dashboard stays read-only.
The nav count adds them (through the access model, not one SQL query: it needs the set logic).

### G. Side by side

`queries_access.variant_diff(conn, left_state, right_state)`: each state's actions as element keys
in recorded order; `only_left`, `only_right`, `text_differs` (unmatched keys paired by role in order
of appearance, e.g. `link "Cart (1)"` / `link "Cart (0)"`, F-02) and `same` (count). The Access tab
gets a switcher: each persona's variant alone, or side by side (`?left=&right=` personas, default
the first seer and first non-seer of the first difference). Screenshots come from the variant
states.

### H. Merge fixture

`apps/crawler/tests/fixtures/personas/extends/` with mixins and personas (nested `extends`, a list
attribute, a child overriding one key, `auth` refs) and `expected.json` (resolved `attributes` and
`auth` per persona). `packages/config` tests and `apps/dashboard/tests` both load it.
