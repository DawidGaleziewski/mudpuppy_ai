# Findings: R-47 LLM judge

Bugs and slips found while building R-47, each with a test or eval idea.

## F-01 Eval outcomes cannot be found again (planning, 2026-10-11)

- **What**: the 30 eval workspaces under `/tmp/pf-eval-*` (2026-10-10) hold no documentation
  records; they were created in pairs at the same minutes, so they come from dry runs or tests
  (`--dry-run` calls `createWorkspace`), and nothing deletes them. No trial result
  (`data/evals/<portal>/*.json`) records its workspace, so a real trial's outcome (its store and
  documentation) cannot be found or re-graded later; `/tmp` may also be cleared.
- **Impact**: the judge's labelling pairs can only come from the main store today; exercise 5.3
  (compare the code matcher and the judge on the last 3 runs) is impossible for past runs.
- **Fix in R-47**: the result records `workspace` (research R5); the drawer and `eval:judge`
  take any store path (R7).
- **Left open**: dry-run workspaces are never deleted (and dry runs could skip creating one or
  remove it at the end). Test idea: a dry run leaves no new `/tmp/pf-eval-*` folder.

## F-02 Judge token setup is easy to get wrong (setup, 2026-10-11)

- **What**: the owner's first `claude setup-token` copies were clipped (103 chars) and then
  saved with surrounding single quotes; both give a 401 (`OAuth access token is invalid`,
  `Invalid bearer token`) only when the first call is made.
- **Fix in R-47**: the login loader trims whitespace, rejects a value that is not `sk-ant-` plus
  token-safe characters with a message naming the file (never the value), and `--dry-run` /
  `eval:judge-check` surface the problem before a trial spends tokens.
- Test idea: loader unit tests for quoted, clipped-with-space and valid fake tokens
  (`sk-ant-test-key-not-real`). Done: `evals/tests/judge-login.test.ts`.

## F-03 "Reason first" is not enforced by the answer schema (T004, 2026-10-11)

- **What**: in 2 of 3 real calls the model wrote `verdict` before `reason`, although the JSON
  schema lists `reason` first: the CLI delivers the answer as a `StructuredOutput` tool call and
  the model picks the order of the fields. Research R4 assumed the order would hold.
- **Impact**: the "explain, then decide" benefit is not guaranteed; parsing is unaffected.
- **Kept**: the system prompt still asks for the reason first. Eval idea: during calibration
  (T022), compare agreement of calls where the reason came first with the others; if it matters,
  rename the fields so the order is forced (e.g. `a_reason`, `b_verdict`) or ask for the reason
  in prose before the structured answer.

## F-04 A linked login may be refreshed inside the judge's folder (T008, 2026-10-11, risk)

- **What**: with no token file, the judge's config folder holds a symlink to the owner's
  `~/.claude/.credentials.json`. If Claude Code refreshes the login during a judge call and
  writes the file by replacing it (not through the link), the new credentials land in the temp
  folder, which is deleted, and the owner's stored refresh token may be the old one. Not
  observed; not verified how Claude Code writes the file.
- **Mitigation**: the owner's token file is the first choice (in use since 2026-10-11); the
  linked login is only the fallback. Test idea: run 50 judge calls on the linked login across a
  token expiry and check `claude` still works afterwards.

## F-06 The eval's ground-truth reader dropped rule statements (T012, 2026-10-11)

- **What**: `GroundTruth` in `@pathfinder/docs` is a non-strict Zod object, so fields it does not
  score are stripped on read, including each rule's `statement`, which every ground-truth file
  has and a rules judge must show the model. Fixed: `statement` is now an optional field (not
  scored).
- Test idea: a reader test that the statement survives `readGroundTruth()`.

## F-07 Substring matching in the example judge's selector (T013, 2026-10-11, caught by test)

- **What**: the first selector treated "one term contains the other" as related, so "OC" matched
  "Autocasco" (aut-oc-asco). Fixed to whole-word overlap. Lesson for the owner's rules selector:
  short labels and markers need word boundaries (the code matcher's `hasMarker` already does).

## F-05 Two misleading probes while setting up (2026-10-11, slip)

- **What**: a hand-written probe meant as a `fail` case left out the judge's question; the model
  answered `unknown` ("the item has no stated criterion"). Kept as fixture
  `unknown-no-question.jsonl`. Lesson: always build probes with `systemPrompt()`, as
  `eval:judge-check` does.

## F-08 The example judge asked a question the code already answers (T017, 2026-10-11)

- **What**: labelling, the owner judged each pair by "is the definition correct?", while the judge
  asked "does the record name the same term?". The name question mostly repeats the code matcher;
  nothing checked the meaning. Calibration would have measured two different questions.
- **Fix**: the owner chose the meaning (option B). Ground-truth terms got `meaning` (the portal's
  /slowniczek text, kept equal by a reference-portal test), the judge's item shows it, the wording
  changed (a new wording version). The owner's 10 labels were kept: they already answer the new
  question.
- **Noticed**: the real BA records quote the portal's definition (`portal: "…"`), so real pairs
  are easy passes; the hard cases are all hand-made.
- **Lesson / eval idea**: write the judge's question at the top of the label file, so the person
  labelling answers the same question. Also, with one label per pair, `T06~GL-007@1` (Suma
  ubezpieczenia vs the OWU record) was labelled pass while `T07~GL-007@1` stayed empty: likely
  shifted by one; asked the owner to check.

## Close-out review (T034, G-31, 2026-10-11)

`code-reviewer` agent on `master...feature/017-r47-llm-judge` at `578efad`: **0 findings**
(no size, complexity, nesting, `any`, suppression, sleep or dead-code issues in the branch's
lines; new files at most 156 lines; judge tests 1.2 s for 18 files). Its caveat: lint-driven
plus targeted greps, so G-05, G-19 and G-27 were spot-checked only. Follow-up candidates it
raised, outside this branch: the older nested ternaries in `gates/src/eval.ts` (`show`,
`comparisonMarkdown`) and the complexity of `compareEval`; whether `evals/` (a folder of the
crawler app, covered by `evals/README.md` and the crawler `CLAUDE.md`) wants its own `CLAUDE.md`.

### Re-review of `578efad..HEAD` (meaning-judge change, 2026-10-11)

| # | File:line | Guideline | Finding | Change | Size | Outcome |
| - | --------- | --------- | ------- | ------ | ---- | ------- |
| - | none | - | no finding in the six changed TS files | - | - | - |

Checks after fixes: typecheck ✓ lint ✓ (only older warnings outside the changed lines) prettier ✓; tests not run (full suite running elsewhere)
Summary: 0 findings, 0 fixed, 0 deferred, 0 rejected.
