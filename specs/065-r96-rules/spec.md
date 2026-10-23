# Spec 065: Business rules in React (R-96, step 16)

**Branch:** `feature/065-r96-rules` · **Owner (2026-10-23):** "Ok proceed I am going out keep on
working at it by yourself as much as you can". The htmx Business rules (`web/rules.py`, designer
screens v2-11 and v2-12, spec 039 T100, spec 040 FR-007, owner answer OV-5) move to the React
console, read over the same read model (`queries_rules`) and the same export
(`rules_export`), so both show the same.

## What this step builds

- **FR-001 The list** (`queries_app_rules.py`, `GET /api/portals/{p}/rules`): every decision rule
  with the key people use (BR once documented, else H), its sentence, where it is decided
  (screen and action), its status mapped (`status_out("rule", …)`), its boundary tests (pass,
  fail, waiting) and when it was last tested; grouped by status, what needs a person first; a
  status filter with counts; the export links; whether the reviewer can start check runs.
- **FR-002 One rule** (`GET /api/portals/{p}/rules/{key}`, by H or BR key): documented as / found
  as, decided on, fit, the "changed" advice; the wording in force and the earlier ones; the
  decision table (inputs, hit policy, rows of conditions and the next screen with its result);
  the boundary tests (inputs, expected, got, verdict mapped); the history (status mapped, actor,
  reason, undone, a person's reason as a note).
- **FR-003 In the export** (`GET /api/portals/{p}/rules/{key}/export`): the rule's Markdown as the
  migration team reads it, loaded after the page (the export is built by a command), or why not;
  the links to its `.md`, `.dmn`, all rules (zip) and `rules.csv` on the htmx export routes.
- **FR-004 The writes:** Reword (`POST …/rules/{key}/reword`: `wording`, `reason`; the chat
  service's `reword`, signed with the reviewer) and Run the rule tests (the existing
  `…/check-runs` with `kind: replay`); each asks first.
- **FR-005 The pages** `/app/portals/:portal/rules` and `/app/portals/:portal/rules/:key`, Rules
  in the menu under Portal model; the design system's `DecisionTable` (`.sy-table--decision`)
  with its story and test. Review's decided rules and Before / after's "Business rules" link here.

## Not in this step

- The htmx rule page's As of menu (past model versions, spec 042): the React console has no As of
  yet.

## Validation

- [x] `pnpm typecheck && pnpm lint && pnpm test` in `apps/web` (121 tests; `tests/rules.test.tsx`:
      groups and links, Run the rule tests asked then sent, no rule yet, the decision table with
      "any" and a result, a person's reason as a note, the export, Reword asked then sent by the
      H key, the export's error, needs data and changed, not found; DecisionTable); `pnpm build`;
      `pnpm build-storybook`.
- [x] Dashboard: ruff; `tests/test_api_rules.py` (groups with mapped statuses and filter, the
      table, tests and history, the BR key, the export's Markdown, Reword signed, 422 and 403);
      the Review API's links to a rule and to Before / after; the whole suite.
- [x] `pnpm --dir apps/dashboard ui:check` at 1280 and 390 px on the list and two rules: no local
      store holds a decision rule, so on a scratch store seeded from the test fixtures (the
      export command cannot run there, so the page shows why): all pass.

## Close-out review: feature/065-r96-rules (2026-10-23)

`Rule.tsx` 290 lines, `Rules.tsx` 130; nothing in the ruff complexity or eslint reports;
`api_rules.py` imports no router and has no SQL (G-13, G-15); pages compose only, the status
filter is links, statuses come from the API, writes go through `useConfirmedWrite`.

| # | File:line | Guideline | Finding | Change | Size | Outcome |
|---|---|---|---|---|---|---|
| 1 | `queries_app_review.py:244` | G-19, G-20 | `_link` rewrote the htmx address in a loop over two prefixes that cannot both match. | One `startswith` with a tuple | small | fixed |

Summary: 1 finding, 1 fixed. The queue emits rule links only as `/rules/{key}`.
