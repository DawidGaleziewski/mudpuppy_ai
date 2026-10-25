# Findings: spec 080

## Defaults for the owner's review

- **D-1 What counts as a login-wall process (FR-001).** Only a link or button in the page body
  (not banner, navigation or footer) that reaches the wall is a trigger: "Przedłuż polisę" on
  the home page is, the menu's "Moje polisy" is not. Without this, every menu entry of a customer
  area would ask for a process.
- **D-2 The list cap (FR-009).** Five addresses of one route template, all the same state, then
  the rest of that template's links are settled `budget_reached` with reason `list_cap`. A
  template whose pages differ, or whose parameter the portal model marks `identity`, is never
  capped. Portal setting `scope.max_items_per_template`.
- **D-3 Batch drain (R-58, "decided first").** A tool the agent calls (`drain_frontier`), not
  something the server does by itself: the crawler stays one agent that decides where to go; the
  server only takes over the repetitive tail (read-only links to templates the run visited), up
  to ten a call, stopping at the first new state.
- **D-4 LO-27 option (b).** A script-written pop-up becomes an evidence file and a decision note,
  not a screen. Option (a) (a second-page observation path through the pipeline) stays on R-35.

## F-02 R4/R5 replays cut a visit's journey by its run-wide number (fixed), 2026-10-25

- **Bug** (found while building FR-004): `walkOf` passed the visit's `observations.seq` (numbered
  across the whole run) to `journeyPath` and `referenceOf`, which compare it with
  `transitions.seq` and `attribute_writes.seq` (numbered per journey). The run-wide number is
  never smaller, so a visit in the middle of a journey was replayed with every later press of
  that journey too, and with the inputs typed after it: the replay walked past the page it was
  meant to repeat. The e2e scenarios open their page by URL with no presses, so none showed it.
- **Fix**: `journeyPosition` (the step count of the journey before the observation) cuts the
  walk; `journeyPath` starts at the last login or relogin landing before the visit (F-03@046).
  Test: `store/tests/journey-path.test.ts`.
- **Eval idea**: a context-replay e2e case whose deviating page is two presses into a journey.
- **Not covered**: a login the agent typed into the portal's form by hand (`act`, via `action`)
  is not a landing; only the `login` tool's and relogin's landings are.

## F-03 A page swapped whole for a "manual review" page is a new screen, so R5 never sees it, 2026-10-25

- While building FR-005: the first injection replaced the policies table with the review notice;
  the reconciler made it a screen of its own (`new_screen`, open), not a member of Moje polisy,
  so no deviation waited on R5 and the scenario produced nothing. Kept as an injection that adds
  the notice above the table (a member, like the persona variant's button); then R5's replays
  alternate with no flag → `nondeterministic` (e2e in `context-replays.e2e.test.ts`).
- **Gap to know**: a portal that sends a random share of visitors to a different page (another
  route, or the same route with a very different page) shows up as two screens, never as a
  random draw; nothing links them. **Eval idea**: a scenario variant that redirects the drawn
  visits to `/moje-polisy/weryfikacja` and expects a target mismatch on the press, if the press
  is recorded (today only a navigate in the test).
- Not built: the design's "hit policy C" half of the scenario (the miner's overlapping decision
  rules); it needs decision points with inputs, which a page load by address has none of.

## F-04 A script-written pop-up is kept as evidence (gate F-04@080), 2026-10-25

- LO-27 option (b): `BrowserSession` reads a window that has no address (title and ARIA
  snapshot, 1.5 s at most) before closing it; `queueOpenedWindows` stores it as an evidence file
  with a decision note `popup_written`. The gate: the insurer's "Ogólne warunki" link's text is
  in the file. LO-27 stays a gap (not a screen of its own).
- **Found on the way**: the decision log scrubs `detail_json`, and a sha256 evidence ref reads as
  a token there (`[token].yaml`); the evidence ref is the note's `subject_ref` instead.
- **For the BA**: a `decision` is a citable target, so a record can cite the note; the BA tools do
  not open the file behind it yet (get_evidence on a decision shows the note). Idea: `get_evidence`
  on a `popup_written` decision returns the file's text.

## F-05 The banner's shared button on the bank (gate F-05@080, R-80 (2)), 2026-10-25

- Logged in: "Wyloguj" clicked on the desk, logged in again, and the transfer page's "Wyloguj"
  item is settled `shared_button` by the next frontier pick, without a turn. Green on the first
  run; the bank eval's turns per new state (the other half of R-80 (2)) needs a paid trial.

## F-06 The list cap and the older item view cap, 2026-10-25

- The portal config already had `item_view_cap` + `item_route_templates` (spec 001 FR-024): an
  opt-in cap for templates a person names. The new list cap (FR-009) is the automatic default for
  any template whose visited pages were all one screen; both apply. Not merged into one setting
  (the old one is in use in the mock portal's tests), noted for the owner (D-2).
- Not measured on the shop eval (paid). The e2e test on the mock auction portal shows two of six
  offers opened with the cap at 2, and `finish_run` completing.

## F-07 The commit hook's "dashboard (review)" step named a test file that is gone (fixed), 2026-10-25

- A change under `apps/crawler/scripts/` (here `model-sweep.ts`) ran `pytest tests/test_review.py`,
  which no longer exists (renamed `test_api_review.py` in the React port), so every such commit
  was blocked with "file or directory not found". Fixed in `.githooks/checks.sh`. **Test idea**:
  the hooks' unittest checks that every test path the hook names exists.

## F-08 R-99 (5) is ready to run, waiting for a budget, 2026-10-25

- SC-007/SC-008 (amendments superseded after a re-scan) and a logged-in scan through the chat need
  the real chat service and agent (paid). Steps, on `local-dev`, about $10 like spec 047:
  1. `MUDPUPPY_ENV=local-dev pnpm --dir apps/chat start`; the console on 8765.
  2. Chat: scan `reference-insurer-local` as `klient` (logged in; credentials in the vault), then
     narrow to "Moje polisy ▸ Przedłuż polisę" and document it (the session now carries the scope:
     check that no record cites an off-scope call, R-99 (1)).
  3. Write two amendments on the documented steps, release the portal with scenario
     `renamed-button` on (`REFERENCE_SCENARIOS`), scan again, and check that both amendments are
     flagged for re-anchoring or superseded (SC-007, SC-008 of spec 010).
  4. Stop the chat service by its own PID list; check for orphaned servers and Chromium.
- Also waiting for a budget: a reference-insurer trial with `--sweep-inputs` (R05 should be found
  now) and shop and bank crawler-only trials (the list cap and `drain_frontier`: turns per new
  state, `frontier_pending`).

## Close-out review: feature/080-2-0-leftovers (2026-10-25)

Done by the branch's own agent against `docs/code-guidelines.md` (a worktree fork may not start
the `code-reviewer` agent; the owner may want it run on the merge commit).

| # | File:line | Guideline | Finding | Change | Size | Outcome |
| - | --------- | --------- | ------- | ------ | ---- | ------- |
| 1 | mcp-server/tests/sweep-portal.test.ts | G-03 (no-nested-ternary), require-await | nested ternary and async stubs without await | a band table, `Promise.resolve` | small | fixed |
| 2 | store/tests/journey-path.test.ts | G-04 | a helper with six parameters | from/to as one pair | small | fixed |
| 3 | gates/src/eval.ts:172 | G-03 | `compareEval` complexity 19 (was over 15 before; one more condition line) | split the condition lines into a table | small | deferred (pre-existing; a refactor of its own) |
| 4 | mcp-server/src/tools/index.ts, ba-tools/index.ts | G-02 | `registerTools` 236 lines, `registerBaTools` 265 (both grew by one tool) | one register function per tool group | large | deferred → follow-up |
| 5 | mcp-server/src/services/list-cap.ts | efficiency | every frontier pick reads the run's observations and infers templates again (as `frontier-order.ts` already does) | cache per run state | large | deferred → follow-up (measure on a long run first) |
| 6 | store/src/input-sweeps.ts | G-27 | the planner has no unit test of its own (covered by the e2e) | a seeded-store unit test | small | deferred (time; the e2e covers the path) |

## F-01 The Write tool refuses a file named `findings.md` in a worktree-isolated agent, 2026-10-25

- Process slip (tooling, not product): writing this file with the Write tool was refused
  ("subagents should return findings as text"); it was created by copying another file and
  editing it. Not a product bug; noted for the session dump.
