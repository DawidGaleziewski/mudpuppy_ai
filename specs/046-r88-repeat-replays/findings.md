# Findings: spec 046

## F-01 A new member on the same build and audience never asked R5 (T005), 2026-10-23

- **What**: `classify` sent only result and target mismatches to R5. A screen that shows another
  version to the same audience (a `new_member`: exactly what an A/B banner is) went straight to
  `ambiguous`, so no replay could ever explain it. R5 now asks for those too; the replay budget
  caps the cost (three replays per deviation). Stable replays leave it `open` for the agent, as
  before.
- **Test**: `model/tests/interpret.test.ts` (asks, then stable → ambiguous, alternating with a
  cookie → ab_test).

## F-02 Flags for R5 without changing the context (T004), 2026-10-23

- Probe runs now keep every cookie and web storage key on each observation (`flags_json`), so R5
  can name a flag nobody declared. The observation's `context_key` stays the declared experiment
  arm: session cookies would otherwise give every replay a context of its own. Nothing read
  `flags_json` before this spec.
- Session cookies never "separate": their value differs on every replay, and `separatingFlag`
  needs one value per landed state (`store/tests/context-replays.test.ts`).

## F-03 A visit inside a login journey replays from the login page (T006), 2026-10-23

- `walkOf` repeats a visit's journey from its first page. A typed navigation starts its own
  journey, so a visit after `navigate` replays from that address (the e2e case). A visit inside
  the login journey (the landing page right after the login form) would start the replay at the
  login page while already logged in, and land elsewhere: R4 then falls through to R5. Not seen in
  the tests; to watch in real scans. **Idea**: start such a walk from the landing page's own URL.

## F-04 US2.4 and LO-35 (T009), 2026-10-23

- **US2.4** (revisions per persona variant) is covered by 2.0's model: a persona's other page is a
  member of the same screen, and its deviation is now explained as `context_variant` (R4) instead
  of a revision; nothing rebuilt.
- **LO-35** (the shop's random hero banner) is already a gate: both variants fall into one screen.
  "Note the variants" could now come from R5 on the shop (a replay of `/sklep` three times); not
  built here, the shop draws its variant without a cookie the reference portal's way (to check).

## F-05 The dashboard does not show `budget_limited` yet (T009), 2026-10-23

- Both access read models return `budget_limited` (personas mapped only by runs that ran out of
  steps), and those personas are no longer "not reached". The htmx Access page does not list them:
  the dashboard moves to React next (R-96), the list goes there.

## Close-out review: feature/046-r88-repeat-replays (2026-10-23)

| # | File:line | Guideline | Finding | Change | Size | Outcome |
| - | --------- | --------- | ------- | ------ | ---- | ------- |
| 1 | packages/reference-portal/src/server.ts:262 | G-03 | request handler complexity 19 (limit 15) after the login and visit branches | POST routes moved to `handlePost`, login to `logIn` | small | fixed |
| 2 | packages/reference-portal/src/server.ts:218 | G-02, G-06 | `startReferencePortal` grew from 86 to 109 lines (master already over 80) | `abArmPicker`, `logIn`, `handlePost` moved out; no warning left | small | fixed |
| 3 | packages/config/src/persona-sample.ts:34 | G-03 (lint no-nested-ternary) | nested ternary in the id comparator | `byId` comparator, same order | small | fixed |
| 4 | packages/config/src/persona-sample.ts:22 | G-22 | unsafe spread of an `any` array | cast to `unknown[]` before `map` | small | fixed |
| 5 | packages/config/CLAUDE.md | G-30 | new `persona-sample.ts` export missing from the package notes | added a spec 046 line | small | fixed |
| 6 | packages/mcp-server/CLAUDE.md | G-30 | no mention of the spec 046 replay-portal change (`LAYOUT.md` has it) | none | small | deferred: the file map is `LAYOUT.md`; owner call |

No new lint or ruff warning on changed lines elsewhere (store, mcp-server, model, dashboard); `runtime/pipeline/observations.ts` not touched by this review.

Checks after fixes: typecheck ✓ lint ✓ (0 errors) test:fast ✓ for config and reference-portal projects (218 tests); ruff ✓ on queries_access.py; test:slow not run (runtime untouched)
Summary: 6 findings, 5 fixed, 1 deferred, 0 rejected.
