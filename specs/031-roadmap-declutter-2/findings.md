# Findings 031: Roadmap declutter 2 (R-67)

Bugs, gaps and process slips found while building, with test or eval ideas.

## F-01 why `no-script-edits` let appends through (spec 030 F-14)

- **Cause 1**: a heredoc body with an apostrophe ("the owner's note") made `shlex` raise, and the
  hook returned "no targets", so every heredoc append with prose passed.
- **Cause 2**: targets were resolved against the repo root, not the directory the command runs in:
  `cd docs && echo x >> code-guidelines.md` checked `code-guidelines.md` at the root (untracked).
- **Cause 3**: Python scripts that write files (`python3 - <<EOF … write_text`) were not looked at.
- **Fix** (T001): heredoc bodies are cut out before lexing (fallback lexer on bad quotes), `cd` and
  the session `cwd` are followed, Python scripts with a write call block on tracked path literals.
  `.claude/hooks/test_no_script_edits.py` (11 cases, run by the pre-commit hook when hooks change);
  the old hook fails the heredoc and `cd` cases.
- **Known false positive**: a command that only quotes such a command as text (e.g. `python3 -c`
  holding `cat >> roadmap.md`) is blocked. Write the script to a scratch file instead.

## F-02 the prettier PostToolUse hook never ran

- **Symptom**: `.claude/settings.json` matched `apps/crawler/*` against the Edit tool's
  `file_path`, which is always absolute, so prettier never formatted an edited file (TS stayed
  clean only because edits were careful; 11 docs/JSON files are not prettier-clean).
- **Fix** (T001): the path is made relative to the repo root first; only `.ts/.tsx/.js/.mjs` are
  formatted (docs, YAML and golden snapshots are left alone).
- **Test idea**: a hook self-test feeding a sample PostToolUse JSON.

## F-03 every bank page waits 10 s for a mount that is empty on purpose

- **Symptom** (T006, while writing the F-08@030 gate): after login `/bank/pulpit` and
  `/bank/przelew` take ~10.9 s each; every one has an `mfe_mount_timeout` for
  `[data-mfe="cookies"]` after `scope.mfe_wait_ms` (10 s).
- **Cause**: the cookie banner micro-frontend renders `null` once consent is stored (a common
  pattern: banners, toasts, empty slots), so its mount point never "fills" and the mount wait
  always runs to its limit. The mount wait has only a hard limit, no "nothing is happening" exit.
- **Fix**: G8 (R-60, shared wait): the mount wait ends after a quiet period with no progress
  (no new resource, no DOM growth), so an empty-by-design mount costs the quiet limit, not 10 s.
  The F-08@030 gate is tightened then.
- **Eval idea**: crawl wall time per page in the bank eval; a regression shows as cost.

## F-05 the environment guard's mutation score: 73 % → 96 % (T010)

- Stryker on `config` (whole package 71.0 %, 817 mutants, 5 min, in a worktree): `environments.ts`
  73 %, 20 survivors: the eval-name regex was not anchored by any test, the legacy `environment`
  key and non-object inputs were untested, folders without a portal file, a blank name, the
  "none declared" message and the error's file name. New cases in `environments.test.ts`; rerun on
  the file: 96 %, the 3 left are equivalent (a missing portal file is skipped by the `catch` anyway)
  or killed by the last added case.
- The other config files are not in scope (portal-schema.ts 62 %, rule-ids.ts 14 %): a later
  maintainability pass.

## F-06 a CA file helps Chromium only when the proxy presents that CA (T011)

- Playwright has no "trust this CA" option for the browser; Chromium on Linux trusts its NSS store
  (`certutil` is not installed here and installing it is a machine change). Built instead:
  `--ignore-certificate-errors-spki-list` with the SPKI hashes of the file's certificates, which
  Chromium honours only when one of them is in the presented chain (probe: root-only file and a
  leaf-only chain fails; with the CA in the chain it opens). Node trusts the file fully
  (`tls.setDefaultCACertificates`), so the request gate's `route.fetch` works either way.
- So the file should hold the **issuing** CA; the doctor's `tls.ca-file` reads the presented chain
  (directly or through the proxy tunnel) and says which certificate to put there.
- **Later idea**: when NSS tools exist, a per-run NSS database under a private `HOME` trusts a root
  that is never presented.

## F-07 "drop trailing counts" would have undone an owner decision (T014)

- The proposal to the owner said "drop the trailing `(n)` before comparing link names". Reading
  spec 026 F-04 first: the name check exists by owner decision (a) so that "Koszyk (1)" (a filled
  cart, checkout reachable) is not inferred as the "Koszyk (0)" the run followed (empty cart). Its
  gate F-04@026 would have failed.
- **Built instead** (Claude's call, for the owner to confirm): `linkNameKey` keeps zero apart and
  folds every non-zero count, so "(1)", "(2)", "[3]" are one link; "Koszyk" without a count stays
  its own name. The 16 pending cart links of F-07@026 become one per zero/non-zero.
- **Slip noted**: proposing a change to a decided rule without re-reading its finding.

## F-08 S05: the checkout's labels were not tied to their inputs, so autofill typed "Test" (T012)

- **Cause 1**: the shop's checkout fields are `<div><label>Kod pocztowy</label><input
  placeholder="00-000"></div>` without `for`/`id`, so autofill saw no label: the persona's
  `trace_inputs` ("Kod pocztowy: 00-950") never matched, and the postal code got "Test", which the
  shop refuses ("Kod pocztowy musi mieć format 00-000").
- **Cause 2 (by design)**: the order also needs the CAPTCHA (LO-37), which Pathfinder never solves:
  it hands the page to a human. So S05 is reachable only with a person at hand; an unattended eval
  cannot reach it, whatever autofill does. `crawl_screens` for the shop counts S05 although it is
  not reachable unattended: an eval idea, not changed here (the denominator is a baseline matter).
- **Fix**: autofill takes an unassociated `<label>` that is alone with its field in the wrapper
  (`pfNearLabel`), and a text field without a pattern follows a placeholder format mask ("00-000")
  or a kind its label or name names (e-mail, postal code, phone; PL/EN/DE). Gate `F-08@031`: the
  checkout submit leaves only the CAPTCHA message.

## F-09 LO-27 (script-written pop-ups) needs a second-page observation path: deferred (T019)

- The insurer's "Ogólne warunki" link does `window.open('about:blank')` then `document.write(…)`:
  no URL, so the R-52 path (queue the pop-up's URL as a `navigate` item) cannot visit it.
- To record it as its own screen the run must observe the pop-up page itself before closing it.
  The pipeline is built around one page (`rs.session.page`, 16 uses in `pipeline/`): swapping the
  page for one `processPage` call would record the state, but then `currentStateId` names an
  `about:blank` state that `reachState` can never return to, and the next action from the opener
  breaks. Done properly it needs a side observation: settle → observe → fingerprint → record state
  and an edge from the action's state, without moving the run's position, as its own steps in the
  golden lock.
- **Options for later**: (a) that side observation (the faithful one); (b) record the pop-up's
  title and text as a decision-log note and an evidence file on the action (cheap, not a screen,
  the BA can still cite it). LO-27 stays a gap; R-35 keeps it.

## F-10 the shared wait in settle and the mount wait (G8, R-60, spec 030 F-10)

- **Built**: settle runs on `waitForCondition`: quiet limit = today's `settle_ms` (10 s), so a page
  that never settles costs what it did; a page still loading new parts gets up to `settle_hard_ms`
  (30 s). The mount wait: hard limit = `mfe_wait_ms` (10 s, as before), quiet limit
  `mfe_quiet_ms` 3 s (above LO-53's deliberate 1.5 s silent mount). Navigate and act settle through
  the same `settle` step, so they share it; login already did.
- **Progress** = a request to a path the page has not asked before (`lastNewPathAt`, query
  ignored), a URL change, or a change in the element count of the page or its frames. A poll or a
  cache-busting beacon (`/ok?t=…`) is not progress, and a ticker that rewrites text is not either.
- **Risk kept in view**: an app that mounts after more than 3 s of total silence is now read
  empty; `mfe_quiet_ms` per portal or per URL raises it. The bank's empty cookie mount (F-03) went
  from 10 s to the quiet limit per page (gate F-08@030 tightened: page under 8 s, empty-mount wait
  under 6 s).

## F-11 S07: a screen reached by a click is a different screen when loaded by URL (T013): open

- **Symptom** (spec 026 F-07): "Zaloguj się, aby zobaczyć zamówienia" on `/sklep/konto` was
  settled `unreachable` ("no longer present") in all three shop runs.
- **First guess, wrong**: `reachState` skipped the mount wait. Built and then reverted: a direct
  look at the pages showed the real cause, and the extra wait would only cost time.
- **Cause**: the link exists only on the account screen reached **inside the SPA** ("Moje konto"
  clicked: the account micro-frontend asks `/api/shop/orders`, gets 401 and shows the link). When
  the browser is elsewhere, `act` goes back by **loading the URL**, and `/sklep/konto` loaded
  directly is the shell's own login form ("Zaloguj się do sklepu"), with no such link. Same URL,
  different screen, depending on how it was reached.
- **Not fixed here**: reaching a state by replaying the click path instead of a deep link is
  R-66's design ("a process reachable only by UI navigation is reached by navigation, not by a
  deep link"). Known gap `F-11@031` reproduces it. A visibility check at hand-out (R-58 (2) as
  written) would not help: the element is visible on the screen the run saw.
- **Slip noted**: the first fix was written from the finding's symptom before looking at the page.

## F-12 shared navigation is already cheap for links; buttons are left alone (T015, R-58 (3))

- A global menu link appears on every state, so each state queues its own item. Since spec 013 an
  item whose link target the run already reached (same URL and, since spec 026, same name) is
  settled at pick time as an `inferred` edge: no agent turn, no click. The field's 148 of 165
  wasted turns were `click_failed` refusals (fixed in spec 030), not menu links.
- A menu **button** (no target URL) cannot be inferred the same way: the same button on another
  page may do something else. Nothing built; measure first (turns per state on the bank and shop
  evals) before adding a guess.

## F-13 commits on this branch took another session's work (process slip, Claude)

- Another session worked in the same checkout at the same time (owner decisions on
  `graph_handler`, documentation export, transit zones). `git commit` takes the whole index, and
  `git add roadmap.md docs specs` takes whole files, so these went into this branch's commits:
  - files the owner had staged: `user_input/graph_handler/1_readme.md` and
    `Untitled-2026-09-07-2236.svg` (801fc49), `user_input/outputing_decent_docs/readme.md`
    (837c6c1), `user_input/graph_handler/mudpuppy-salvage-yard (2).zip` (7.4 MB, 931b930);
  - in 931b930, that session's edits: `docs/discussions/r62-transit-zones.md`,
    `specs/030-battle-tested-scars/spec.md`, and in `roadmap.md` the rows R-68 and R-69, the
    R-66 owner note, the R-62 transit-zone decision and open decision 1.
- Nothing was rewritten: the R-62 row holds both sessions' text, and the other session had not
  committed. The branch is not pushed. The owner decides: keep (they are the owner's decisions and
  inputs), or drop them from this branch before the squash merge.
- The same slip as F-08@026. **Idea**: a pre-commit check that refuses a commit while files
  outside the paths named in the command are staged, and `git commit -- <paths>` for every commit
  while another session may share the tree.

## F-04 the F-07 test proves the shim

- `tests/hook-name-shim.e2e.test.ts` starts the server with `tsx` (shared helper
  `tests/spawned-server.ts`, also used by the shutdown test now); tsx compiles a named inner
  function to `function f(){…}__name(f,"f")`. With the `NAME_SHIM` removed the test fails (title
  stays "Strona"); with it, it passes.

## Close-out review (code-reviewer, G-31, 2026-10-16)

| # | File:line | Guideline | Finding | Change | Size | Outcome |
| - | --------- | --------- | ------- | ------ | ---- | ------- |
| 1 | apps/crawler/packages/safety/src/classifier.ts:70 | G-19 | the `classifyAction` doc comment sat above the new `readEvidence`, leaving `classifyAction` undocumented | doc comment moved back onto `classifyAction` | small | fixed |
| 2 | apps/crawler/packages/safety/src/classifier.ts:75 | G-03 | new `readEvidence` has complexity 18 (limit 15) | extracted `readByShape`; same expression, same order | small | fixed |
| 3 | apps/crawler/packages/mcp-server/CLAUDE.md | G-30 | `services/trace-grouping.ts` and the `RunState` options object not in the agent notes | "Spec 031" line added | small | fixed |
| 4 | apps/dashboard/CLAUDE.md | G-30 | new `servers.py` not in the agent notes | line added under `stores.py` | small | fixed |
| 5 | apps/crawler/packages/safety/src/classifier.ts:93 | G-03 | `classifyAction` complexity 20 (the branch lowered it, old hub) | extract the class-claim and form rules | large | deferred → maintainability follow-up |
| 6 | apps/crawler/packages/crawler/src/autofill.ts:84 | G-03, G-06 | `readForm` complexity 28; the branch added `pfNearLabel` and `placeholder` to it | extract the per-field read into an in-page helper | large | deferred (in-page code sent as source; needs a browser test) |
| 7 | apps/crawler/packages/crawler/src/test-values.ts:118 | G-03, G-06 | `testValueFor` complexity 30; the branch added one ternary | table of type → value builder | large | deferred |
| 8 | apps/crawler/packages/mcp-server/src/runtime/browser-runtime.ts:26 | G-02, G-06 | `createBrowserRuntime` 206 lines, `launch` 120 (old; the branch changed 7 lines) | split `launch` into steps | large | deferred (also in the spec 030 review) |
| 9 | apps/dashboard/src/pathfinder_dashboard/queries_docs.py:~700 | G-20 | `process_diagram_input` is now used only by tests (the view uses `process_diagram_inputs`) | delete it and point `tests/test_docs_queries.py` at `process_diagram_inputs` | large | deferred (touches src and tests) |
| 10 | apps/crawler/packages/mcp-server/CLAUDE.md | G-30 | file is over ~60 lines (about 80) | move pipeline detail into `docs/` and link it | large | deferred (also in the spec 030 review) |
| 11 | apps/crawler/packages/crawler/src/autofill.ts:108 | G-03 | nested ternary | n/a | small | rejected: old line, untouched by the branch |
| 12 | stabilizer.ts, mounts.ts, session.ts, pipeline/settle.ts | G-02, G-03 | no lint warnings on changed code | n/a | n/a | rejected: no finding (frozen by the slow tier anyway) |

Checks after fixes: typecheck ✓ lint ✓ (0 errors) test:fast ✓ (43 files, 694 tests). No dashboard code changed (notes only), so pytest not rerun; test:slow not rerun (no runtime file touched).
Summary: 12 findings, 4 fixed, 6 deferred, 2 rejected.
