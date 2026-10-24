# Findings: spec 079 (React leftovers)

## Decisions for the owner to review

- **D-1 Thumbnails are cached in the data dir** (`<data_dir>/thumbs/<hash>.webp`, FR-001). The
  dashboard is read-only on the store; this is a file cache beside it, never the database. A
  thumbnail of an eval store's screenshot is cached in the main data dir too (same content
  address). An unwritable cache only means the next request makes it again.
- **D-2 The layout-stability check is a close-out step, not CI** (FR-006): the repo has no hosted
  CI. `pnpm --dir apps/dashboard cls:ci` boots its own dashboard on a seeded temp store (the
  dashboard tests' fixtures, two stores because their ids clash) and checks 35 routes in about
  2 minutes, too slow for the commit hook. Root `CLAUDE.md` lists it in the close-out when
  `apps/web` changed.

- **D-3 Start again needs no second confirm** (FR-002): the press is the person's confirmation
  (the copy is `confirmed_by` the one who pressed), as the designer drew it and the owner chose
  ("definetly"). It runs only what was confirmed once already, re-checks the preconditions, and a
  failed card starts again once (a second press is refused, the button is gone).
- **D-4 "Merged into" is a review comment, not a new revision** (FR-004, spec 078 F-01). A
  revision belongs to a BA analysis session; the console writes to records only through reviews.
  So the merge comments on the absorbed PROC record's latest revision ("Merged into PRC-001 … by
  anna: this process is archived; revise or withdraw this record") and Split back comments again.
  The BA's next session gets both as pending feedback and revises or withdraws the record. A
  comment does not change the revision's status, so a confirmed record is not back in Review ▸
  Records to confirm (the designer's sketch); it shows the comment on the record page.

## Findings

- **F-01** `cls:ci`: 36 measured, all under 0.05, but `/app/` measures 0.049 every time (four
  runs); what moves is a small tag (`span.sy-tag.sy-tag--sm`) on All portals with the seeded two
  stores. Spec 078's 0.016 was measured on the local store. Leftover: find the tag and reserve
  its place. Test idea: `cls:ci --budget 0.03` names it.
- **F-07** Close-out: the crawler's full `pnpm test` was not run on this branch: its gates need
  ports 4200/4201/4400, which the 2.0 branch (spec 080) used at the same time. This branch
  changes only `apps/crawler/evals/harness/agent.ts` and its test, which the fast tier and the
  evals tests (141) cover.
- **F-02** The eval MCP config leak (spec 078 F-07) was 77 files in /tmp tonight; removed by hand
  after the fix (`removeMcpConfig` after every `runAgent`, test `agent-mcp.test.ts`). Eight more
  appeared during the night from the 2.0 branch's worktree (master's harness, before this fix);
  the evals tests on this branch leave none.
- **F-04** Previous / Next from In no process follows the server's order, not the grid's sort
  (Seen / Route / Title are sorted in the browser). Small: pass the sort in `in=loose:<sort>`.
  Left as is.
- **F-05** `Choice` is still not in the designer's catalog (`workbench/a2ui/catalog.json` has
  FixChoices only), so it stays the server's own component; a designer question, R-104 (1).
- **F-06** The live persona card already sent a new sign-in to the vault (spec 075, inline login
  and password fields); the beta card had no way to. Both now use one vault dialog, as the
  designer drew it (19/04 "Store a new credential… opens the vault dialog"). The beta page now
  sends its store's `environment` for it.
- **F-03** The reference Workbench comparison (`reference-compare.md`, R-94 (5)): the reference's
  phases 2–4 (Troubleshoot, Explain, split and focus layouts, `path.attempt`, `mark.add`), seven
  catalog components, As of in the Workbench and model narration are not in ours. All large or the
  designer's / owner's call: leftovers, not this branch.

## Close-out review: feature/079-react-leftovers (2026-10-25)

| # | File:line | Guideline | Finding | Change | Size | Outcome |
| - | --------- | --------- | ------- | ------ | ---- | ------- |
| 1 | apps/dashboard/LAYOUT.md:20,91 | G-30 | new module `thumbs.py` and route `/evidence/{ref}/thumb` not in the layout map | added both to the evidence and helpers lines | small | fixed |
| 2 | apps/dashboard/CLAUDE.md:62 | G-30 | new command `pnpm cls:ci` (and `cls:check`) not in the agent notes | added a line to "Other commands" | small | fixed |
| 3 | apps/web/src/app/VaultDialog.tsx:132 | FA-3 | two form fields (login, password) held as separate `useState`s; the rule asks for React Hook Form from two fields | move to `useForm` + zod, keeping the clear-after-submit of the secret values; re-run the workbench-live tests | large | deferred → follow-up (values are deliberately kept out of the persona form; low risk) |

Frontend (FA-1…FA-7): no other finding. Layers and imports through `index.ts`, no `className`/`style` in pages or features, no `any` or `@ts-ignore`; server data through RTK Query (`useProcessPage` gained a `skip`, `wbWrites.again`); the Previous / Next pager reads its list from the URL (`in=`). Size and complexity warnings in chat (14) and ruff C901/PLR in dashboard are all outside this branch's changed lines.

Checks after fixes: web `pnpm check` ✓ (typecheck, lint, stylelint, knip, jscpd, 244 tests); chat typecheck ✓ lint ✓ (0 errors) test ✓ (390); dashboard ruff ✓ pytest -n auto ✓ (one run saw `test_glossary` red on the new `start-again` entry while the glossary and `tests/test_glossary.py` were being edited in the working tree; green on rerun).
Summary: 3 findings, 2 fixed, 1 deferred, 0 rejected.
