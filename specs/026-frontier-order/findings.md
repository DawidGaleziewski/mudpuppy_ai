# Findings: frontier order (spec 026, R-35)

## F-01 The run's templater makes every queued product look new, 2026-10-14 (T001)

- **What**: the first build asked the run's templater (`RunState.peekRouteTemplate`) for each
  link target's template. That templater collapses a path segment into `:param` only after more
  than ten distinct values were *visited*, so early in a run each product slug is its own
  template, and every product link would rank first: the opposite of the owner's intent.
- **Fix**: `frontier-order.ts` infers templates at pick time over the visited URLs and all
  pending link targets together; twelve queued products collapse at once. The runtime wiring
  was dropped (FR-002, FR-003 rewritten).
- **Test idea**: the unit test seeds one visited product and eleven queued ones and expects all
  of them in tier 2.

## F-02 The pipeline golden lock changed on purpose, 2026-10-14 (T001)

- **What**: `pipeline-golden.e2e.test.ts` (spec 012 SC-005) records the mock portal's map run in
  order. With the new order the run visits the offer page (`/oferta/:id`, an unvisited template)
  before the search results; the states, edges and decisions are the same set, in another order.
  Snapshot updated with `-u`, then stable over two more runs.
- **Same-target test AS2.3**: its first pick is now the link to an unvisited page, not the
  button queued before it; the assertion was changed to the new order, the rest of the case
  (nothing inferred, both items pending) still holds.

## F-03 A catalogue's product and page links crowd out the rest of the shop (spec 015 F-17), 2026-10-14 (T002)

- **What**: the shop eval spent its budget on 152 catalogue-page and product links (spec 015
  F-17); this spec reorders the frontier so links to unvisited templates go first.
- **Gate**: `F-03@026` in `packages/gates/tests/shop.test.ts`: on the proving-ground shop, with
  one product visited and the catalogue's product and page links queued, the next item handed
  out is not one of them.

## F-04 The shop's cart is reached empty first, so checkout is never seen, 2026-10-14 (T003)

- **What**: shop eval `2026-10-14T17-15-15-697Z` (guest, $4.75, 76 steps, crawler completed, 0
  pending): `crawl_screens` 3/6, missing S04 checkout, S05 and S07 login (spec 015 F-17 had 4/6
  with S04 reached). The new order hands out the "Koszyk (0)" link (an unvisited template)
  before the "Dodaj do koszyka" buttons (tier 1), so `/sklep/koszyk` is first reached empty.
  Every later cart link, also "Koszyk" after an item was added, is then settled by same-target
  inference (spec 013 US2) as the same empty cart, so the checkout behind a filled cart is never
  opened. The login link on `/sklep/konto` was `unreachable` ("no longer present").
- **Cause**: the order is right for item lists but meets a page whose content depends on what
  the run did before (state-dependent target); same-target inference treats the URL as enough.
- **Owner decision 2026-10-14: (a)**, same-target inference only when the link's visible name
  matches the followed one too ("Koszyk (1)" ≠ "Koszyk (0)"); (b) a tier swap and (c) both were
  not chosen. Built in `same-target.ts` (T005); the golden lock changed again: two links with a
  new name are now followed (`observed`) and merge into the same state, the rest stay inferred.
- **Gate**: `F-04@026` in `shop.test.ts`: "Koszyk (0)" followed, an item added, then the
  "Koszyk (1)" link is handed out, not inferred.

## F-07 Shop re-run with the name check: 4/6, S05 and S07 for other reasons, 2026-10-14 (T006)

- **What**: shop eval `2026-10-14T18-38-16-796Z` ($6.02, 108 steps, budget ended, 90 links
  pending): `crawl_screens` 3 → 4/6 (checkout S04 reached again), fields 80 %, rules 37.5 %,
  screens 66.7 %; SC-002 (≥ 5/6) not met.
- **S05 (order confirmation)**: "Zamawiam i płacę" was pressed five times; every time the run
  stayed on `/sklep/zamowienie` (the form was not filled, so the shop's validation kept the
  page). A crawler-agent behaviour (fill before submit), not the frontier order.
- **S07 (login)**: "Zaloguj się, aby zobaczyć zamówienia" on `/sklep/konto` is `unreachable`
  ("no longer present") in all three shop runs of this spec: the link is gone when the item is
  handed out. A separate obstacle, not the order.
- **Cost of the name check**: cart links carry the count in their name ("Koszyk", "Koszyk (0)"
  … "(3)"), so each new count is a new link; 16 cart links were still pending at the end.
- **Owner**: merge as is (4/6 like spec 015's best, the item flood gone), or first look at S05
  (fill-before-submit) and S07 (vanishing link) in this spec.

## F-05 Reference BA wrote field code names as `name_verbatim`, 2026-10-14 (T003)

- **What**: reference eval `2026-10-14T17-42-05-731Z`: crawl identical to the baseline (33
  steps, 17/17, 28 forms, 35 states), but fields 100 → 23.1 %, constraints 100 → 16.3 %, rules
  62.5 → 43.8 %. The BA wrote 23 data items with the inputs' `name` attributes (`rok_produkcji`,
  `marka`) instead of their labels ("Rok produkcji", "Marka"). A BA variance, not this spec's
  change (the crawl evidence is the same).
- **Eval idea**: a check counting data items whose `name_verbatim` is snake_case or equals the
  form field's `name` attribute but not its label.

## F-06 Bank eval cannot run from a worktree: vault credentials are local, 2026-10-14 (T003)

- **What**: `start_run` refused with `CONFIG_INVALID` "missing credential refs: PG_BANK_LOGIN,
  PG_BANK_PASSWORD": the vault lives in the main checkout's data folder, not in the worktree.
  Not a crawler problem; the bank eval has to run from the main checkout after the merge.

## Close-out review: feature/026-r35-frontier-order (2026-10-14)

| # | File:line | Guideline | Finding | Change | Size | Outcome |
| - | --------- | --------- | ------- | ------ | ---- | ------- |
| 1 | apps/crawler/packages/mcp-server/CLAUDE.md:34 | G-30 | package note did not name `frontier-order.ts` nor the same-name rule of inference (F-04) | added both to the services bullet | small | fixed |
| 2 | apps/crawler/packages/mcp-server/src/services/frontier-order.ts:12 | G-05 | `PendingRow` duplicates the private `FrontierRow` of `same-target.ts` | one shared row type (export or a types file) | large | deferred (optional) |

Checks after fixes: typecheck ✓ lint ✓ test:fast ✓ (the reviewer's commit was blocked by the
dashboard test that expects the chat service down while one ran on 4310; stopped with the
owner's consent, then committed)
Summary: 2 findings, 1 fixed, 1 deferred, 0 rejected.

## F-08 Slip: the squash commit took a file the owner had staged, 2026-10-14 (merge)

- **What**: the main checkout had `user_input/review/1_review_basic.md` staged (empty) by the
  owner; `git merge --squash` + `git commit` put it into the R-35 commit. Caught before the
  push: the file was removed from the commit (`git rm --cached`, amend) and the owner's index
  restored (empty version staged, edits unstaged), so nothing of theirs changed.
- **Eval idea**: before a squash merge, `git status --short` must be empty or the merge
  commits only the branch's paths (`git commit -- <paths>`); a pre-merge check in the
  close-out list.
