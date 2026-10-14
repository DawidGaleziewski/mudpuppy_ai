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
