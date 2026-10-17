# Findings: spec 030 (battle-tested scars)

Every bug, gap and slip found while building, with a test or eval idea (memory
`log-every-bug-for-evals`). Newest last.

## F-01 SC-01 did not reproduce with href links: an unnamed form has no ARIA role

- **Symptom**: the first SC-01 page (tiles as `<a href>` inside `<form method="post">`) classified the
  tiles `read` on master already.
- **Cause**: a `<form>` gets the ARIA role `form` only with an accessible name, so the ARIA action
  path never saw the enclosing form; only role-less clickables (spec 015) carry their form. The field
  tiles were script-handled anchors without href, found by the clickable scan.
- **Fix**: the scar now uses role-less anchors (`onclick`, no href); the classifier drops the form's
  method and target for any anchor (ARIA link or `a`/`area` tag), except a `javascript:` href, which
  stays a possible postback of the form (stricter than the fork's C-2, which exempted every anchor).
  The `tag` is carried into both re-classifications (act gate, record-transition), else the act
  re-check derived `mutating` (`SAFETY_CLASS_MISMATCH`).
- **Test/eval idea**: a named-form variant of SC-01 (ARIA path) — covered by the classifier unit test.

## F-02 SC-03 and SC-04 already pass on master

- SC-03 (`javascript:` postback, `mailto:`, `tel:`): the action gate treats a `javascript:` href as a
  click (spec 015), and no route-template parse is reached; the fork's crash (C-7) does not exist
  here. Kept as a gate.
- SC-04 (select by visible label, C-5): Playwright's `selectOption(string)` matches the value or the
  label, so a label works. Kept as a gate. The trace needed a named form for "Show" (a GET submit is
  read only with form evidence); first gate run failed on the gate's own setup (missing `intent`).

## F-03 a 403 sub-resource no longer stops the run (C-1); 429 too

- A 429 on a background call is not a hard stop either. Open question for the owner: should a
  sub-resource 429 slow the limiter down instead of being ignored? (Not built.)

## F-04 process slip (Claude): a catalogue entry inserted with a Python text replacement

- CLAUDE.md forbids editing files with Python/sed replacement scripts. The SC-07 entry of
  `apps/scar-maker/scars.yaml` was inserted that way during the overnight run; it landed correctly
  (the catalogue test checks the ids and order). It happened once more (`sed -i` swapping `gap,` for
  `gate,` in `scars-frontier.test.ts`, checked by the test run); Edit tool only from then on.
- **Test idea**: none; a hook could refuse `python3 -` / `sed -i` on tracked files.

## F-05 SC-07 does not wedge on master; a crash still could

- The field's wedged run (GC-15/GC-18: `INTERNAL` on a `javascript:window.open` link, the item
  handed out again, `finish_run` refusing with FRONTIER_NOT_EMPTY) does not reproduce here: pop-ups
  are queued as navigate items (spec 020), a vanished or covered element settles its item as
  `unreachable` (spec 015/026). SC-07 is a gate from the start.
- Defensive part built anyway (FR-020): an `act` that crashes with a non-refusal error
  (`NAVIGATION_FAILED`, `SAFETY_CLASS_MISMATCH`, any non-ToolError) retires its pending item as
  `unreachable` with `act_failed: …`, so it is never handed out again. **Not covered by a test**:
  no scar makes `act` crash today. Test idea: a scar whose click handler kills the page's
  renderer (`chrome://crash` in a frame) or a mock runtime throwing in `perform`.

## F-06 slow tier ran after the commit for R-58/R-59 (process note)

- The full slow tier takes ~45 min; for the R-58/R-59 group it ran on the committed tree in a
  separate worktree right after the commit (fast tier and the scar, hook and coverage gates ran
  before). Any failure is fixed in a follow-up commit.

## F-07 the `__name` shim for hook bodies has no gate

- Under vitest (the gates) esbuild does not inject `__name`, so a gate cannot reproduce the field
  gotcha; the shim is the crawler's own `NAME_SHIM`, already exercised by every `evalInPage`.
  Test idea: run one hook through a `tsx`-started server in a slow e2e test.

## F-08 typing into an unsettled login page broke later micro-frontends (bank estate)

- **Symptom**: with the new login (condition wait instead of the fixed waits) every logged-in bank
  page settled ~5 s slower (mount wait to its timeout), and LO-30 went over its 60 s budget.
- **Cause** (bisected by timing variants): the new login typed into the login page right after
  `goto`, without the short settle the old code did first. Typing into a shell that is still
  starting left the bank's micro-frontends unmounted on every later page (exact mechanism not
  traced; settling first restores 10.9 s per page). Waiting for the landing page after submit made
  it worse (one page 35 s), so that was not it.
- **Fix**: settle (2.5 s ceiling) after opening the login page, then the condition wait for the form.
- **Test/eval idea**: a gate measuring the settle time of the first logged-in bank page (a perf
  case), so a login change that slows every later page is caught.

## F-09 three login scars were not real reproductions at first

- SC-14 passed on master: Playwright's `fill()` sends only `input`, but the next field's focus
  (and the submit click's mousedown) blurs the field, so `change`/`blur` fired anyway. The field
  case needs a submit button that keeps the focus (`onmousedown="event.preventDefault()"`); with it
  the old login fails and the new one (input/change/blur per field) passes.
- SC-15 passed on master at the gates' 20 requests/s with 120 chunks (~6 s < the old ~7.5 s of
  fixed waits); 300 chunks (~15 s) reproduce the field failure.
- SC-18 (three-step form) already worked on master: kept as a gate.
- **Test idea**: every new scar is first run on the previous commit (a worktree) to prove it fails.

## F-10 the condition wait is used by login only so far

- Owner decision D-2 Q1 was "one shared wait for login, navigate, act and the mount wait". Built:
  `waitForCondition` (crawler) with quiet and hard limits, used by login for the form and for the
  verdict after submit (SC-15, SC-16 gates). Not yet swapped into `navigate`/`act` settling or the
  mount wait: those are R-28 paths with many gates and the bank estate's timing is delicate (F-08);
  doing it safely needs its own pass with the full slow tier. Moved to the end (owner, "if any
  issues happen move them to the end").

## F-11 environment model: what is and is not done (R-61)

- Done: free names everywhere (config, vault, chat-model, store via migration 0021, MCP and chat
  schemas); `PATHFINDER_ENV` required by both MCP servers and the chat (no default; an undeclared
  name is refused naming the declared ones, `eval-*` admitted); every MCP result carries
  `environment`; a server registry (`data/servers/<pid>.json`) warns at start about live servers on
  another environment or from another checkout; the export-fork export no longer pins
  `production`.
- Not done: the dashboard header does not show the environment beyond its store picker; no
  start-up agreement check between dashboard, chat and MCP (the chat passes its own environment to
  the MCP servers it starts, so they agree by construction); the vault CLI keeps a `sandbox`
  fallback (its documented commands rely on it, now validated against the declared names); the
  credentials HTTP endpoint of the chat defaults to `sandbox`; `.mcp.json` names `sandbox`
  explicitly; mutation tests on the guard not run (G-32 runs on the kernel; the guard is in config).
- Later the same night: the operator scripts (`docs:audit|review|export|evaluate`, `audit:pii`,
  `portal:export`, `stability`, `wireframes:build`) also defaulted to `production`; they now take
  `--env` or `PATHFINDER_ENV`, a declared one (`scripts/script-env.ts`).

## F-12 SC-06: the re-render half already held; the slow tile did not

- On the previous commit the re-rendered tiles were clicked right (the path locator checks the
  name; Playwright re-resolves at click time and the name check fails over to text). The slow tile
  (clickable after 8 s) failed the 5 s trial: C-4 (15 s for role-less tiles) is the real fix; text
  first for an unambiguous name (C-3) is kept as a safeguard. The scar's tiles had to be `<a>`
  without href: role-less `div`s are not read evidence, so a read-only guest may not click them.

## F-13 Playwright's `route.fetch` tunnels through the proxy with CONNECT, even for http

- The request gate fetches main-frame navigations itself (`route.fetch`, robots and redirect
  checks); with a context proxy that fetch opens a CONNECT tunnel even for an http URL, so a proxy
  without CONNECT broke every navigation (`net::ERR_FAILED`). Real corporate proxies tunnel; the
  scar proxy now does, and reaches the portal from its own egress address (127.0.0.3), which is
  what the allowlist scar admits (the field's IP allowlist, more faithful than a header).
- **Test idea**: the doctor's `net.proxy` probe could also try a CONNECT tunnel to an http target.

## F-14 the no-script-edits hook caught a heredoc append (process slip, Claude)

- The `PreToolUse` hook `.claude/hooks/no-script-edits.py` (since spec 022) refused a `cat >>`
  append to `findings.md`; earlier appends of the same kind (and the F-04 slips) were not caught,
  so the hook covers some shapes only. All edits since go through Edit/Write.
- **Test idea**: give the hook cases for `cat >> <tracked>`, `python3 - <<EOF` writing a tracked
  file and `sed -i`.

## F-15 the dashboard's review call broke on the strict environment check (fixed)

- **Symptom**: dashboard `test_review.py` (3 tests) answered 500: the dashboard runs
  `pnpm docs:review --env <env> --root <workspace>` on a test or eval workspace that declares no
  portal, and the operator scripts (2dbf482) refused every undeclared environment.
- **Cause**: commit 2dbf482 passed its pre-commit hook, which runs the dashboard suite only when
  dashboard files change; the regression showed up at the next commit.
- **Fix**: an operator script also accepts an environment whose store already exists under the
  root (it cannot create a stray store); servers and the chat stay strict.
- **Test idea**: the pre-commit hook runs the dashboard's review tests when `apps/crawler/scripts/`
  changes.

## F-16 scar-maker eval trial 1: numbered section paths collapse to `/:param` (open)

- Trial 2026-10-16T00:31 (crawler only, $0.81, 57 steps, completed, frontier empty): 16/46
  screens. Two causes. (a) The ground truth wrote the scar entries with a trailing slash
  (`/sc01/`) while the crawler records `/sc01`: fixed in the ground truth (trial 2 follows).
  (b) A real harness finding: after a dozen `/scNN` paths, route-template inference generalised
  them to `/:param` (and `/scNN/<page>` to `/:param/:param`), so different scars became one cluster
  and the trap guard (`cap:same_cluster`, 9 of the last 20 states) stopped the exploration with
  15 items left (`budget_reached`). A real portal with numbered section slugs (`/tarif2`,
  `/bereich01`, `/de01`) would lose screens the same way. Related: R-50 (URL parameters as screen
  identity).
- **Test idea**: a scar with 15 numbered sections whose pages differ completely; expected: distinct
  route templates (or the fingerprint keeps them apart) and no trap-guard stop. Not built: needs
  the owner on R-50 (when is a numbered segment an id, when a section).

## F-17 field: a process documented as one error page, the other runs ignored (open, R-70)

- Reported by the owner 2026-10-17 from the field scans: a BA session recreated a process with an
  error page as its only step, although other runs held the whole journey. The session saw only
  the runs it was handed (`start_session` refuses evidence from other runs), and nothing marks an
  error or transient state as unfit to stand for a process. Related: R-65 (one-step stubs), R-69
  (4), SC-17.
- **Eval idea**: a scar portal task where one run of a journey lands on an error page and two runs
  complete it; the BA is handed all three; expected: the process has every step, with the error
  page as an error branch, never as the only step.
- **Test idea**: the server refuses a process record whose only step cites an error or transient
  state.

## F-18 field: a re-run BA session made the documentation worse (open, R-70)

- Reported by the owner 2026-10-17: re-documenting after new scans replaced richer records with
  poorer ones instead of adding the new evidence. Records persist with revisions, but a revision
  that drops steps or evidence is accepted without a reason, and the session starts without "what
  changed since the last revision". The 16 GB of evidence and many loose runs made picking the
  right runs guesswork.
- **Eval idea**: two BA sessions on the same process, the second with one extra run; grade that no
  step or evidence link from the first session is lost without a change note, and the new run's
  states are added.
- **Test idea**: `revise_record` refuses a revision that drops steps or evidence links without a
  `change_note`.

## Close-out review (code-reviewer, G-31, 2026-10-16)

18 findings: 4 fixed, 13 deferred, 1 rejected. Fixed: G-19 comment wrap in `safety/src/rules.ts`;
G-02 `gateServer` split (`seedScarLogins`); G-03 `detectBlock` (extracted `statusBlock`, same
behaviour); G-30 "Spec 030" lines in the config, crawler, safety and mcp-server agent notes.
Deferred (large; most are old hubs this branch only grew): G-03 `classifyAction` (37, extract the
form-inheritance decision), G-02/G-03 `createRequestGate` (233 lines) and `session.launch`,
G-01/G-06 `store` tracer.ts / db-types.ts / db.test.ts and `docs` `seedDocRecords`, G-02
`processPage` (82), `startRunRecord`, `registerTools`/`registerBaTools`, `createBrowserRuntime`,
G-04 `RunState` constructor (6 parameters), G-30 mcp-server CLAUDE.md over ~60 lines, G-22 an
unsafe `Function` call in `scar-maker/src/scars/sc18-validators.ts`, G-01 two test files over 400
lines. Rejected: a nested ternary in `login.ts` `verdict` moved unchanged from `loginSteps`.
Suggestion: the deferred G-02/G-03 items go to a maintainability follow-up (R-34 style), not this
feature.
