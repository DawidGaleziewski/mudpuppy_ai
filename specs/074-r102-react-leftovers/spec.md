# Spec 074: R-100, R-101 and R-103 leftovers (R-102)

**Branch:** `feature/074-r102-react-leftovers` · **Source:** roadmap R-102 (1)–(9),
`specs/071-r100-react-spa/spec.md` (Close-out review), `specs/072-r101-designer-answers/spec.md`
(Leftovers), `specs/073-r103-console-bugs/spec.md` (Close-out review, F-14).

## Why

The htmx pages are gone but some of their read-model helpers and tests stayed; a few owner-facing
gaps of the React port were parked; the chat service's browser tests still drive the htmx pages.

## What this builds

- **FR-001 (1) Dead read-model helpers go.** Every helper only the htmx pages called, with its
  tests: `queries_scans.py` but `max_steps`, `db.data_version`, `as_of.first_seq`,
  `queries_chat.target_state_id`, `queries_screens.screen_ids`, `queries_wb`'s
  `conversation_of_command` / `current_turn` / `type_word`, `queries_wb_scan.scan_progress`,
  `stores.store_for_portal`, `visuals.has_picture`, `wb_frames.path_word`, the
  `queries_model_screens` link helpers, `queries.portal_summaries` / `list_runs`,
  `queries_chat.superseded_counts` / `amendment_portals`, `queries_docs.doc_portals` /
  `portal_known` / `process_diagram_input`. Each is checked unused before it goes.
- **FR-002 (2) `glossary._load` split by section** (G-02: complexity 30 → under 15), behaviour
  unchanged (its tests and the mutation-tested module stay green).
- **FR-003 (3) "Changed underneath you"** in the assistant drawer: when the screen in the page's
  context has a newer revision than the one the conversation was about, the drawer says so, as
  the htmx drawer did.
- **FR-004 (7) Off-tree arc labels don't overlap**: labels over the top row are spread so two
  never share a place.
- **FR-005 (8) `apps/web/LAYOUT.md`**: the page-by-page map moves out of `apps/web/CLAUDE.md`
  (G-30).
- **FR-006 (9) The chat service's browser tests drive the React console** under `/app/`.

## Built besides (found while deleting and porting; findings F-01–F-08)

- The record card's type word reaches the console (a field, not a property).
- As of on one screen, rule or process offers only the versions it is in (spec 042 F-09).
- The data store follows the portal (R-71 (d)): `/api/stores` names `follow`; the frame moves.
- "Ask the assistant to regroup" says its request in the drawer (R-78 (6)).
- A message sent while the assistant is busy waits and is sent when it is free.
- An applied proposal offers Undo (FE-A04).

## Close-out review (code-reviewer, 2026-10-24)

| # | File | Guideline | Finding | Outcome |
| - | ---- | --------- | ------- | ------- |
| 1 | apps/web/src/pages/Processes.tsx | G-19 | The page's doc comment sat above the new `REGROUP` constant | fixed |
| 2 | apps/web/tests | G-27 | No web unit test clicks Apply then Undo on a proposal | no change: `proposals-browser.e2e.test.ts` does it end to end (r3 restores r1), and `test_api_review_items.py` covers the relay |
| 3 | apps/web/tests/overview.test.tsx | G-19 | A double blank line | no change: there is one |

Size and complexity (`glossary._load` split, nothing over the limits in `glossary.py` or
`map_edges.py`), layers (no router imports another, no SQL in routers), suppressions, tests for
the new logic, the file maps: no findings.

## Not in this spec

- (4) the data-store label's place and short form, and (6) a Compare frame of its own: the
  designer's (round 4 Q8, Q10's rest).
- (5) the vault dialog inside the persona card: a new credential's values belong in the vault
  form, which the card would have to host; it waits for the designer's card (19/04 says the card
  holds names only).

## Acceptance

Every app's suite, `pnpm --dir apps/chat test:e2e` green, `ui:check` on the pages touched.
