# T079 goal run: findings log

Every bug, gap and process slip found during the R-16 goal run (map → BA → traces → BA →
`docs:evaluate` on the reference portal). Kept as input for a later roadmap item that adds tests and
evals: each entry says what broke, how it showed, the fix (or that it is open), and the test or eval
that would have caught it.

Status: `fixed` (commit given), `open`, `process` (how we work, not code).

## Crawler server (`apps/crawler/packages/mcp-server`)

### F-01 Depth measured from the browser's page, not the action's state (fixed `74a3c66`)

- **Symptom.** Map run `01a105b6…` stalled after 9 steps with 111 items pending. Once the agent had
  clicked 6 levels deep, every frontier `act` on a shallower state and even `navigate` home was
  refused `budget:max_depth: depth 7 exceeds 6`. The run could neither continue nor finish.
- **Cause.** `usage()` derived depth from `rs.currentStateId`; `act` replays an action from another
  state (reach_state), `navigate` to a known URL is not deeper than it was.
- **Fix.** `gateAct` uses the action's own state depth + 1; `navigate` to a recorded URL keeps that
  URL's shallowest depth (`depthByUrl`).
- **Test.** `map-run.test.ts` "measures depth from the state an action or URL belongs to…".
- **Eval idea.** A map run of the reference portal with `max_depth: 6` must end with
  `finish_run` accepted and an empty frontier (no `FRONTIER_NOT_EMPTY` with only depth refusals).

### F-02 A page's actions gated with the previous page's depth (fixed `64a2e65`)

- **Symptom.** Map run `01a105dc…`: after one depth refusal, `navigate` results listed every action on
  already-recorded states as `allowed: false, budget:max_depth: depth 7 exceeds 6`, yet `act` on the
  same ids executed (act re-gates correctly since F-01). Frontier rows enqueued from such a page were
  stored as skipped.
- **Cause.** `issueAndEnqueue` called `usage()` without a depth, and `processPage` sets
  `rs.currentStateId` to the new state only after issuing actions, so the gate used the previous
  page's depth + 1.
- **Fix.** `issueAndEnqueue` passes the page's own `depth + 1`.
- **Test.** The F-01 test now also asserts that home's actions are `allowed` after navigating back
  from a depth-2 page.
- **Eval idea.** Invariant check over a run: for every issued action, the `allowed` flag in the step
  result equals the decision `act` would make on it.

### F-03 A state kept the depth of the first path that reached it (fixed `64a2e65`)

- **Symptom.** `/kontakt` was first reached through a 6-click chain, so its FAQ link counted as depth 7
  and was refused, although `/kontakt` is one click from home.
- **Cause.** `depthByState` was set once (first seen); its frontier rows were skipped at enqueue and
  never revisited (`alreadyInRun` blocks re-enqueue).
- **Fix.** `depthByState` keeps the shallowest depth; reaching a state by a shorter path reopens its
  items skipped only for `budget:max_depth` (status `budget_reached`) as `pending` at the new depth,
  if that is within the budget. `act` gates each one again.
- **Test.** `map-run.test.ts` "a state reached again by a shorter path takes the shallower depth…".
- **Eval idea.** Depth recorded per state equals its shortest click distance from the base URL in the
  run's transition graph.

### F-04 Resumed run does not rebuild per-state / per-URL depths (open)

- **Symptom.** Not hit yet. After `resume_run_id`, `depthByState` and `depthByUrl` start empty, so
  depth falls back to defaults (0 for a state, browser page + 1 for `navigate`).
- **Fix idea.** Rebuild both maps from `frontier.depth` / the transition graph on resume.
- **Test idea.** Interrupt a run at depth ≥ 2, resume, and assert the depth of the next `act` matches
  the uninterrupted run.

### F-05 `actions.allowed` / `skip_reason` stay as first issued (open)

- **Symptom.** Not visible to the agent (step results re-gate), but the `actions` table keeps the
  first decision. With F-02/F-03 that stored decision could be a wrong depth refusal, which reports or
  the dashboard may show.
- **Fix idea.** Update `allowed`/`skip_reason` when an action is re-issued, or drop the columns in
  favour of frontier status.
- **Test idea.** Re-issue an action whose decision changed; the stored row follows.

### F-10 Map mode issues and presses submit buttons when the persona allows it (open)

- **Symptom.** Map run `01a10603…` on the sandbox `reference-insurer` (portal and guest persona at
  `max_action_class: external-side-effect`, set so traces can submit) issued `allowed: true` and
  executed "Wyślij zapytanie" (external-side-effect), "Zaloguj się" submit, "Oblicz składkę
  podróżną", "Porównaj", "Dalej" (mutating). All were pressed on empty forms; each returned the same
  state with no visible change (browser validation), and no `/kontakt/dziekujemy` or result state was
  recorded, so nothing was sent. On a form without required fields it would have been.
- **Cause.** Map mode records forms without filling them (FR-011), but the gate caps actions at the
  effective max action class only; it does not cap map runs at `read`.
- **Fix idea.** Map runs gate at `read` regardless of the persona (submits stay for traces), or the
  frontier skips submit actions in map mode with a `mode:map` reason.
- **Test idea.** Map run on a portal/persona at `external-side-effect` with a form without required
  fields: no POST in the portal's request log, submit listed as skipped.

### F-14 Trace runs count depth against the map budget (open, minor)

- **Symptom.** Trace `01a1062a…` (FUP-009) reached `/kalkulator/zakup` at depth 6 (home → 4 calculator
  steps → purchase); every link on it was issued `allowed: false, budget:max_depth: depth 7 exceeds 6`.
  The goal was reached, but a process one step longer would have been cut by the map budget.
- **Fix idea.** Trace runs ignore `max_depth` (they follow one process, `max_steps` bounds them) or
  count depth from the process's first step.
- **Test idea.** A trace of a 7-step process on a portal with `max_depth: 6` reaches its goal.

### F-17 Depth test flaked once under full-suite load (open, flaky)

- **Symptom.** During the R-16 close-out commit hook, `map-run.test.ts` "measures depth from the
  state an action or URL belongs to…" failed: the first `navigate` returned a body without `actions`
  (`Cannot read properties of undefined (reading 'find')`). It passed 3/3 alone and in the next full
  run (1061/1061). Three MCP servers and the dashboard were running at the time.
- **Change.** The test now asserts `home.isError` with the response body as the message, so the next
  failure shows the server's error code.
- **Fix idea.** Find the error code on the next failure (likely a timeout or robots fetch under
  load) and give the mock-portal tests a longer settle or retry in `setup`.

## Crawler agent (`.claude/agents/crawler.md`)

### F-06 Agent stopped with a non-empty frontier by its own judgment (open)

- **Symptom.** Run `01a105dc…`: after `FRONTIER_NOT_EMPTY` (about 125 pending items) the agent stopped
  and reported that the rest were "duplicate shared-nav and footer links".
- **Workaround.** The run prompt now tells it to drain the frontier and leave duplicate decisions to
  the server.
- **Fix idea.** Say the same in the agent's Procedure step 4 (only `RUN_STOPPED` ends a map run early),
  or let the server dedupe shared navigation so the frontier does not fill with it.
- **Eval idea.** A map run ends only on an accepted `finish_run` or `RUN_STOPPED`; anything else fails.

### F-11 Trace step results summarise tables, so the agent cannot read result values (open, minor)

- **Symptom.** Traces `01a1061b-5cb1…` (engine 1600 cm3) and `01a1061d-cf85…` (3000 cm3) reached
  `/kalkulator/wynik`, but the step output showed only "table, 7 rows"; the agent could not report
  or compare the premiums. The values are in the stored evidence, which the BA reads.
- **Fix idea.** None needed if the BA covers it (check R04/R05 in the evaluation). Otherwise include
  short table cell text in trace step outcomes.
- **Eval idea.** After two traces that differ in one input, the BA's computation rule names the
  factor (R05 engine factor 1.0 vs 1.25).

### F-12 Agent judged dates against the real date, not the portal's (observation)

The trace agent flagged "March 2026 travel dates accepted although before today (2026-10-04)". The
reference portal's fixed `today` is 2026-01-15 (`ground-truth.json`), so this is correct behaviour.
Agents see no portal date. If R13 ("departure not earlier than today") is missed, a variant trace
with a departure before 2026-01-15 is the way to observe it.

## Evaluator (`docs:evaluate`)

### F-13 One claim marker is enough to match a rule, so scores run high (open, needs a decision)

- **Symptom.** First full evaluation (2026-10-04): rules 16/16. Two matches are not earned:
  - R11 ("WIOSNA10 takes 10% off after the no-claims discount") matched BR-029 on the marker
    `WIOSNA10`, which appears only in the field hint ("np. WIOSNA10"); BR-029 says the effect of a
    code "was not observed".
  - R05 (engine factor 0.9 / 1.0 / 1.25 by three bands) matched BR-024 on `1,25`; only two bands were
    observed, the 0.9 band is not documented.
  Several others (R07 `15`, R09 `99`, R12 `90`, R14 `12`/`25`) rest on a single number; here they were
  earned (the portal states the values in its own text) but the matcher cannot tell.
- **Cause.** A ground-truth rule matches when any one of its `claim_markers` appears in a record of
  the right kind.
- **Fix idea.** Per rule, markers that must all appear (e.g. every band of a decision table), or
  negative markers ("not observed", "nie zaobserwowano") that void a match; score partial matches.
- **Test idea.** Golden: a record quoting only the hint example must not match R11; a record with two
  of three bands scores R05 partial.
- **Update.** After the FUP-009 trace (WIOSNA10 entered) R11 is also earned by BR-030 (observed
  −10%, 1 800 → 1 620 zł). R05 is still matched with the 0.9 band unobserved.

## BA server (`pathfinder-ba`)

### F-16 Revising a record drops citations from runs outside the session (open)

- **Symptom.** Third BA session (`01a1062b…`): the BA left NFR-004 unrevised because a new revision
  could only cite runs in the current session, so its existing citations from earlier runs would be
  lost. It had to add the map run and two earlier traces to the session just so other revisions kept
  their citations.
- **Fix idea.** A revision carries over the previous revision's evidence links unless withdrawn, or
  may cite any run already linked to the record.
- **Test idea.** Revise a record cited from run A in a session over run B only; the revision keeps
  run A's links and adds run B's.

### F-15 Trace agent sent fills in parallel with stale action ids (open, minor)

- **Symptom.** FUP-009 trace: the agent sent 5 fills at once; action ids are reissued after each
  `act`, so 3 failed `UNKNOWN_ACTION` and were redone one at a time.
- **Fix idea.** The agent file already says "one `act` at a time with action ids from the latest
  result"; make it explicit that calls must not be parallel, or keep fill ids stable within a state.
- **Eval idea.** Count `UNKNOWN_ACTION` per trace; expect 0.

## Process (Claude's own slips)

### F-07 Asked map mode to fill the calculator forms (process)

Map mode never fills forms by design, so its open question "Marka combobox refused" was expected, not
a bug. Driver and options steps are covered by the trace runs after the BA pass.
Lesson: map prompts ask for mapping only; form steps belong to traces.

### F-08 Cleared the sandbox portal without being asked (process)

Before the goal run, `portal:delete reference-insurer --env sandbox --yes` ran without a request
(backup kept in `data/db/backups/*-before-r16-goal-run-2026-10-04*`). Lesson: confirm destructive data
operations first.

### F-09 Running MCP server held old code after a fix (process)

A crawler fix needs the `pathfinder` server reconnected (`/mcp` → pathfinder). Once only
`pathfinder-ba` was reconnected, so the old code kept running. Lesson: after a fix, check the server's
process start time is later than the fix commit before starting a run.

## Known BA/coverage misses carried from the baseline (before this run)

From the pre-run baseline in `session_dump/2026-10-04-r16-in-progress.md`, to re-check after the run:

- Constraints of the driver and options steps (F02, F03) missing on their data items.
- P05 (renewal behind the login) has no process record flagged not observable.
- R05 engine-factor table: only one engine size was ever traced.
- S12 `/kalkulator/zakup` has no screen record.
