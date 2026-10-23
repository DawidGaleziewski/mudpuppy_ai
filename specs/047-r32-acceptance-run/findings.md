# Findings: spec 047 (R-32 acceptance run)

## F-01 One record cites evidence outside the process scope, 2026-10-23

- NFR-001 ("every page sends a page-view to analytics") cites the analytics call made from the
  home page, outside the calculator's scope; the other 65 records cite only the four scoped
  routes. The BA server checks a scoped session's states, not its network calls.
- **Idea**: the scope check also covers network calls and actions (their state's route); or an
  NFR about every page may cite one in-scope call.

## F-02 A release read as a decision point: the reference visit came from the same run (fixed), 2026-10-23

- **Bug**: after the release, the home page's two "Oblicz składkę" links led to a changed vehicle
  step. The rules compare a deviation's visit with a reference visit: for anything but a new
  member, the screen's latest visit against the one before it. A map scan opens the home page many
  times, so the visit before it was from the same run and the same release: no build change, and
  rule R7 wrote two `decision_point` findings for a person ("leads to different screens depending
  on data"). The assistant itself said the simpler reading is a page change.
- **Fix**: the reference is the latest visit before the deviating visit's run started; only when
  no earlier run saw the page (a decision point inside one run) is it the run's own earlier visit
  (`store/src/deviation-visits.ts`). Test: `mcp-server/tests/model-release-link.e2e.test.ts` (two
  home visits in the second scan: structural drift by R2, no decision point). Side effect, right:
  in the persona-variant scenario the premium button's new action is now explained by R4 too.
- **Why the scenario tests missed it**: they visit each page once per run.

## F-03 A changed form step became a new screen, not a new version of the old one, 2026-10-23

- With a new field and a renamed submit, the vehicle step fell outside its cluster: the model made
  it a new screen (`new_screen`, open, no rule explains it), and the documentation update kept
  "the same step" only because the BA's hypothesis H-0003 said so. R2 cannot explain a new screen:
  it has no earlier member to compare builds with.
- **Idea**: a new screen whose route template and form step match a screen that was not seen in
  this run is a candidate `replaces` (lineage), explained by R2 when the release changed.

## F-04 The documentation update went beyond the process, 2026-10-23

- Asked to update "Kalkulator OC/AC", the update also documented every recorded screen no record
  mentioned (15 screens, 5 capabilities, 2 processes): $4.02 of the $9.20. `open_process_update`
  lists the unmentioned screens of the session's runs, and the BA wrote them.
- **Idea**: a process update lists only the process's own screens; the others go in the session's
  gaps as "not documented yet".

## F-05 The assistant asked about images before a scan nobody asked to tune, 2026-10-23

- "Scan the whole portal as guest" was answered with a question (load images or skip them). It
  costs a turn ($0.31 here) and stalls an unattended run. **Idea**: take the default and say so.

## F-06 What the run did not cover

- SC-007 and SC-008 (amendments, superseded after a re-scan): out of the re-scoped run.
- Only the guest; the logged-in customers (spec 046) were not scanned through the chat.

## Close-out review (G-31), 2026-10-23

No findings (G-01–G-06, G-19, G-25, G-27, G-28, G-30 checked on `deviation-visits.ts` and the two
e2e files; ESLint clean). Idea from the review: a fast-tier unit test for `visitPair`'s "earlier
run first, same-run fallback" (today only the e2e tests cover it).
