# Session dump: 2026-10-03, R-13 BA server built (T009–T028)

Branch `feature/004-r13-ba-documentation`, pushed, not merged. Overnight run, no questions asked;
everything that needs your decision is in "For you to decide" below.

## Done

T009–T016 and T018–T028 of `specs/004-ba-documentation/tasks.md`, all ticked `[X]`. R-13 is at 31 of
32 tasks; only the BA half of T032 is open.

| Commit | Tasks | Contents |
|---|---|---|
| `b3be122` | T009–T016 | Layer B schema tests; `@pathfinder/docs`: `keys`, `status-engine`, `relations`, `observed-rule`, `evidence`, fixture store |
| `4a864e1` | T018–T026 | `pathfinder-ba` server: `services/ba/{sessions,records,reads,feedback}.ts`, `ba-tools/index.ts`, `ba-server.ts`, `ba-main.ts`, 8 error codes, 4 test files, `.mcp.json` entry |
| this commit | T027–T028 | `docs/src/audit.ts`, `scripts/docs-audit.ts`, `docs:audit` script, `ba-e2e.test.ts`, roadmap note, this dump |

Checks before the last commit, from `apps/crawler`: `pnpm typecheck`, `pnpm lint` clean; `pnpm test`
75 files, 961 tests passed (was 64 files, 833 tests). The dashboard (`apps/dashboard`) was not touched
and its checks were not run.

Checked by hand: the real BA server started over stdio on `data/db/sandbox.sqlite`, listed 13 tools,
and `list_runs` returned run `01a0fe67-…` (12 states, 195 edges, 5 forms, 201 actions, 3 open
questions, 2 rule candidates). `pnpm docs:audit reference-insurer --env sandbox` exits 0 with 0
records (nothing documented yet).

## Next session: what to do

1. **Finish T032.** In a new Claude Code session (this one cannot: MCP servers load at session start
   and `pathfinder-ba` was added to `.mcp.json` during it):
   - `cd apps/crawler && pnpm reference-portal` is not needed for the BA; it reads the store only.
   - "use the ba agent to document portal `reference-insurer` from run
     `01a0fe67-3a93-7000-9fc4-035a144567ff`"
   - `cd apps/crawler && pnpm docs:audit reference-insurer --env sandbox` must exit 0.
   - Record the session id, record counts by kind and the FUPs in `roadmap.md`, tick T032.
2. Close R-13 with `po`: validation checkboxes, changelog skill (before the merge), merge to `master`,
   delete the branch. Merging was not approved for this run, so nothing was merged.
3. Then R-14 (T033–T050, trace mode).

## For you to decide

Deviations from the plan as written:

1. **Commit groups 2 and 3 are one commit.** The plan had "failing BA tests" (T018–T021) as its own
   commit. The commit hook runs `pnpm test` and refuses a commit with failing tests, so the tests
   landed together with the code that makes them pass.
2. **T015 fixture portal id.** The task says the fixture seeds portal `reference-insurer`.
   `no-portal-names.test.ts` scans every package's `src/`, and the fixture lives in
   `docs/src/testing/`, so the id is an option (`makeFixtureStore({ portalId })`, default
   `fixture-insurer`) and the tests pass `reference-insurer`. T072's golden export directory
   (`reference-insurer-all/`) still works that way.
3. **T018 `status` input.** The task says no BA tool input has a `status`. The contract gives
   `list_records` a `status?` filter. Kept the filter (read only); the test asserts it is the only
   tool with one, and that a `status` passed to a write is dropped (the revision is a draft).

Decisions I took where the spec is silent. Each is easy to change; say which you want different:

4. **`not_observable` needs a question.** data-model.md asks for an `answers` relation or a crawler
   question link. The relation table allows `answers` only from assumption, requirement and
   business rule, so a not-observable process or screen could never comply. Accepted: a crawler
   open question in the evidence, an `open_question` record cited as evidence, any relation to an
   `open_question` record, or the record itself being an `open_question`.
5. **Actions and network calls always count as observed evidence.** Their tables have no
   `confidence` column. A refused action (e.g. `Kup polisę`) qualifies too: the server saw the control.
6. **Withdrawing a follow-up leaves its task `open`.** research §11 lets only the operator cancel.
   Effect: the crawler would still trace a withdrawn FUP in R-14. Suggest: withdraw sets the task
   `cancelled`.
7. **A withdrawn record can be revised again**, which un-withdraws it. Not forbidden anywhere.
8. **`start_session(resume_session_id)` accepts a `running` session as well as an `interrupted` one.**
   An agent that crashed an hour ago leaves its session `running` until the 24 h sweep; refusing the
   resume would block it for a day.
9. **Several sessions can run on one portal at once.** No rule in the spec; no check added.
10. **PII check covers every string in `content`**, verbatim fields included, plus evidence notes,
    change notes, pass summaries, session summary and gaps. A UUID in prose is refused (the scrubber
    reads it as a token); `data_item.seen_in[].target_id` is exempt.
11. **Unknown content fields are refused** (`SCHEMA_INVALID`), so a misspelt field is not silently lost.
12. **Pending feedback bound is inclusive** (`>=` the previous session's end), so a review written
    in the same millisecond is shown twice rather than never.
13. **`address_crawler_question` on a record that does not cite the question** returns
    `MISSING_EVIDENCE` (the contract names no code).
14. **`doc_record` evidence accepts a key or an id**; the stored link holds the id.
15. **`get_evidence` for a state returns the state's first snapshot**, not the snapshot of one
    particular run's observation (the contract has no `run_id` input there).
16. **Audit status check is order-free**: it derives each revision's expected status from its
    reviews and later revisions instead of replaying events by timestamp.

Gaps:

17. **The BA server writes no observability trace.** `trace_boots.server` allows only `pathfinder`
    (CHECK and Zod). Tracing BA calls needs a migration (db-admin). The `SubagentStop` hook also
    imports transcripts only for `crawler`.
18. **Reviews in tests are written directly** (`seedReview` in `tests/ba-harness.ts`), because
    `docs:review` is R-15 (T065–T066). Replace it with `applyReview` when that lands (T070).
19. **Recorded form fields carry the input `name`, not the label** (`kod_pocztowy`, not
    "Kod pocztowy"). The label is only in the ARIA snapshot, which the BA reads with `get_evidence`.
    The evaluator (R-16) matches on verbatim labels, so this is a likely cause of misses. Not
    changed; suggestion: add the label to the crawler's recorded field shape.
20. **`CLAUDE.md` still says** "The user is learning and wants to do some of the work." You replaced
    that on 2026-10-02; the file was not edited.
21. T015 seeds network calls in the fixture although the real reference portal makes none, as you
    asked ("follow as written").
22. **My mistake, corrected:** commit `30c9a8b` picked up two empty files,
    `.claude-trace/log-2026-10-02-22-13-*.jsonl`, through `git add -A`. Something outside this work
    created them during the session (0 bytes each, no content). The next commit takes them out of the
    repo again and leaves them on disk; they stay in the history of `30c9a8b`. `.claude-trace/` is
    not in `.gitignore`; I did not add it, since that is your call.

## Things that cost time, for the next session

- The PostToolUse prettier hook matches relative paths only; with absolute paths it does not run.
  Run `pnpm exec prettier --write <files>` from `apps/crawler` before committing.
- The MCP SDK validates tool arguments before the service sees them. A missing required argument
  comes back as SDK text, not as `{ error: { code } }`; tests that parse the body as JSON must not
  send one.
- `git commit` from the repo root; the hook takes about four minutes.

## Environment

- `.mcp.json`: `pathfinder` and `pathfinder-ba`, both `PATHFINDER_ENV=sandbox`.
- Nothing is left running. The reference portal and the dashboard were not started this session.
