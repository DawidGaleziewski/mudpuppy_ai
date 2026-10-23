# Spec 049: an overturn stands (R-87)

**Branch:** `feature/049-r87-overturn` · **Owner (2026-10-22 night answers):** "ok" to the
proposal: the rule never explains that change on that screen again, Undo puts the automatic
explanation back, and Changes shows "overturned by X" with Undo. Decided earlier: any BA may
overturn (OV-1), Decided is per portal (OV-4).

## What existed

`pnpm model:decide … overturn` (spec 039) rejects a derived fact with the person's reason
("overturned: …"); `model:decide … undo` / `POST /portals/{p}/model/undo` (spec 040 T010) puts a
decision back; Review shows the overturn's reason. What was missing: the stickiness. A rule could
derive the same explanation again for the same kind of change on the same screen.

## Requirements

- **FR-001** When a person's overturn is the latest event of a derived fact, the same rule never
  derives the same kind of explanation again for the same kind of change on that screen (and,
  for an action, that element): the new explanation waits for a person, with the note "<who>
  overturned the same explanation here before ("<reason>"): a person decides". Applied wherever a
  rule decides (interpretation, R1, R4/R5 and R8 replays): `store/src/overturn-guard.ts`.
- **FR-002** Undoing the overturn lifts it: the overturn is then no longer the latest event.
- **Out of scope here:** the Changes page's "overturned by X" with an Undo button: the dashboard
  moves to React (R-96); the read model (Review's reason) and the undo route exist already.

## Validation

- [x] `store/tests/model-writer.test.ts`: a derived fact passes; after an overturn the same rule's
      explanation on that screen is for a person, with the note; another screen is not touched;
      after Undo it is derived again.

## Close-out review: feature/049-r87-overturn (2026-10-23)

| # | File:line | Guideline | Finding | Change | Size | Outcome |
| - | --------- | --------- | ------- | ------ | ---- | ------- |
| 1 | apps/crawler/packages/store/tests/model-writer.test.ts:242 | G-22 | `expect.stringContaining` inside `toMatchObject` gave a new `no-unsafe-assignment` lint warning | assert `derived: false` and the note text separately | small | fixed |

Checks after fixes: store tests ✓ (162 passed, 2 skipped) eslint ✓ (only the old max-params warning at line 47) prettier ✓ tsc ✓
Summary: 1 findings, 1 fixed, 0 deferred, 0 rejected.
