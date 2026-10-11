# Tasks: LLM judge mechanism (spec 017, R-47)

**Input**: `specs/017-llm-judge/` (spec.md, plan.md, research.md, data-model.md,
contracts/commands.md, contracts/judge-definition.md, quickstart.md). Branch
`feature/017-r47-llm-judge`.

**Model tags**: `[opus]` judgment and subtle code (isolation, login, the call and its parsing,
concurrency and retries, agreement maths, judge wording, real runs and their verdicts, reviews);
`[sonnet]` code-touching but fully specified (schemas, file readers/writers, CLI entries, wiring,
unit tests on given fixtures); `[haiku]` text edits from an exact list (docs, scripts lines,
roadmap). `[owner]` = the owner's hand-work, never done by Claude (labels, judges of their own).
Sonnet/Haiku run as background subagents from a brief naming the exact files; they never stash,
checkout, reset, add or commit, and format only the files they touched. Opus reviews, runs the
checks and commits per group.

**Rules**: Edit tool only, re-read after editing; log every bug or slip in `findings.md` with a
test/eval idea; every commit: `pnpm typecheck && pnpm lint && pnpm test:fast` in `apps/crawler`;
the group that changes `packages/gates/**` also runs `pnpm test:slow` (ports 4200/4201 free).
No unit test calls the model; real calls happen only in the tasks that say so. Fake secrets only
(`sk-ant-test-key-not-real`).

**Order note**: the phases run US4 → US2 → US3 → US1, not in spec priority order, so the owner can
label the example judge's pairs (after Phase 4) while the calibration and trial wiring are built.

`[P]` = can run in parallel with the other `[P]` tasks of its phase (different files).

## Phase 1: Setup

- [x] T001 [opus] Roadmap R-47, branch, spec, plan, research, data model, contracts, quickstart,
  findings (F-01, F-02), tasks; `.specify/feature.json` → `specs/017-llm-judge`.
- [x] T002 [haiku] In `apps/crawler/package.json`: add devDependencies `zod` and `yaml` at the
  versions already used in the workspace (`packages/docs/package.json` for `yaml`, `packages/core`
  for `zod`), and scripts `"eval:judge": "tsx evals/judge.ts"`, `"eval:draw": "tsx evals/draw.ts"`,
  `"eval:calibrate": "tsx evals/calibrate.ts"`, `"eval:judge-check": "tsx evals/judge-check.ts"`;
  then `pnpm install` at the repo root (never inside the app).

## Phase 2: Foundations (blocking: every story calls a judge)

- [x] T003 [sonnet] [P] `apps/crawler/evals/graders/model/definition.ts`: types
  `JudgeDefinition` (`id` kebab-case, `category`, `question`, `pass`, `fail`, `examples` "0–5",
  `model` default `'sonnet'`, `selectPairs(ctx: SelectContext) => Pair[]`), `JudgeExample`
  (`item`, `record`, `verdict: 'pass' | 'fail'`, `reason`), `Pair` (`id` =
  `<item id>~<record key>@<rev>`, `itemId`, `item`, `record: { key, rev, kind, text }`),
  `SelectContext` (`groundTruth`, `records: EvalRecord[]`), and `judgeVersion(def)` = first 12 hex
  of sha256 over `question`, `pass`, `fail`, `examples`, `model` (data-model.md). Test
  `evals/tests/judge-definition.test.ts`: version stable, changes when any of the five changes,
  not when `selectPairs` changes; at most 5 examples enforced by a `defineJudge()` check.
- [x] T004 [opus] [P] `evals/graders/model/answer.ts`: `VERDICT_SCHEMA` (JSON schema: object,
  `reason` string then `verdict` enum `pass|fail|unknown`, both required,
  `additionalProperties: false`); `parseCallOutput(stdout)` over `--output-format stream-json
  --verbose` lines → `{ init: { model, claudeCodeVersion, tools, mcpServers, plugins, skills,
  agents, memoryAuto }, answer: { reason, verdict } | null, rawResult, isError, authError,
  limitHit, usage: { input_tokens (fresh + cache read + cache write), output_tokens, usd } }`,
  Zod-validated; `authError` on `401`/`Invalid bearer token`/`OAuth access token is invalid`,
  `limitHit` on the usage-limit text `harness/agent.ts` already matches. Fixtures in
  `evals/tests/fixtures/judge/` saved from real runs (pass, unknown, 401, schema miss, non-JSON
  garbage); test `evals/tests/judge-answer.test.ts`.
- [x] T005 [opus] [P] `evals/graders/model/prompt.ts`: `systemPrompt(def)` (role: strict grader
  of one documentation record against one ground-truth item; the question; pass and fail
  definitions; "give a one-sentence reason first, then the verdict"; "answer unknown when the
  record lacks the information to decide"; "if the record does not clearly state it, fail"; the
  examples as delimited blocks with their reasons) and `userMessage(pair)` (`<item>` and
  `<record>` blocks only: no code score, no transcript, FR-004). Test
  `evals/tests/judge-prompt.test.ts`: both texts snapshot-free assertions (contains the question,
  each example, the leniency line; user message has exactly the two blocks).
- [x] T006 [sonnet] [P] `evals/graders/model/score.ts`: `summarise(pairs, verdicts)` →
  `{ covered, total, pct, counts: { pass, fail, unknown, error } }`; an item is covered when ≥ 1
  of its pairs is `pass`; items with no pairs count in `total` as not covered (edge case);
  `unknown` and `error` never cover. Test `evals/tests/judge-score.test.ts`.
- [x] T007 [opus] `evals/graders/model/login.ts`: `resolveJudgeLogin(env, home)` → `{ source:
  'token-file', path, token } | { source: 'linked-login', credentials }` in the order
  `PATHFINDER_JUDGE_TOKEN_FILE` → `~/.config/pathfinder/judge-token` → `~/.claude/.credentials.json`;
  trims whitespace; a present file whose value is not `sk-ant-` plus `[A-Za-z0-9_-]` throws
  `JudgeSetupError('TOKEN_MALFORMED')` naming the file, never the value (F-02); nothing at all →
  `JudgeSetupError('NO_LOGIN')`. Test `evals/tests/judge-login.test.ts` with temp dirs and
  `sk-ant-test-key-not-real` (valid shape, quoted, with inner space, missing file → fallback).
- [x] T008 [opus] `evals/graders/model/call.ts`: `callJudge({ def, pair, login, timeoutMs: 120000 })`
  (async `spawn`, not `spawnSync`): per call a fresh `mkdtemp` config folder as
  `CLAUDE_CONFIG_DIR` (with only a `.credentials.json` symlink for `linked-login`) and a fresh
  empty `mkdtemp` cwd, both under `os.tmpdir()` and removed afterwards; env = `process.env` minus
  `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_CONFIG_DIR`, plus
  `CLAUDE_CODE_OAUTH_TOKEN` for `token-file`; args `-p <userMessage> --model <def.model>
  --system-prompt <systemPrompt> --tools "" --strict-mcp-config --no-session-persistence
  --output-format stream-json --verbose --json-schema <VERDICT_SCHEMA>` (research R1/R2);
  returns `parseCallOutput` + duration. An `authError` with a token file throws
  `JudgeSetupError('TOKEN_REJECTED')` (no fallback, R3). No unit test of the spawn itself.
- [x] T009 [opus] `evals/graders/model/isolation.ts`: pure `checkIsolation(init, usage,
  { configDir, forbiddenSkills, forbiddenAgents })` → list of `{ check, ok, detail }` for: tools
  exactly `['StructuredOutput']`; `mcp_servers` empty; every plugin `source` ends with `@builtin`;
  no skill/agent name from `forbidden*`; `memory_paths.auto` inside `configDir`; input tokens
  < 2000 (data-model.md); plus `forbiddenNames(home, repoRoot)` reading `~/.claude/{skills,agents}`
  and `<repo>/.claude/{skills,agents}`. Test `evals/tests/judge-isolation.test.ts` on the init
  fixtures (clean, and a hand-made leaky one with `Bash` tool, an MCP server, a user skill).
- [x] T010 [sonnet] `evals/judge-check.ts` (entry, `pnpm eval:judge-check`): resolve login, one
  `callJudge` with a fixed tiny pair (term "Autocasco" vs record "Autocasco (AC)") and a fixed
  built-in definition, print each isolation check, model id, Claude Code version, login source;
  exit 0 / 1 (a check failed) / 2 (`JudgeSetupError`) (contracts/commands.md).
- [x] T011 [opus] Real run: `pnpm eval:judge-check` on the owner's machine (one paid call); all
  checks ok (SC-007); save its stream-json output as the clean init fixture if T004 did not.
  Record the result in `findings.md` only if a check fails. Commit group T002–T011.
  (As built, 2026-10-11: all 7 checks ok on the token file, 1029 input tokens, $0.0054, 4 s.
  Also: `setup-error.ts` holds `JudgeSetupError` (codes `NO_LOGIN`, `TOKEN_MALFORMED`,
  `TOKEN_REJECTED`, `CLI_MISSING`); a rejected linked login also stops the run;
  `checkIsolation(init, usage, configDir, forbidden)`; `REPO_ROOT` exported from `config.ts`;
  fixtures saved in T004 from real calls (paths normalised). Findings F-03..F-05.)

**Checkpoint**: an isolated judge call works and is checked.

## Phase 3: User Story 4 – the example judge (P2, built first)

**Goal**: one small judge, `glossary-terms`, as the pattern the owner copies.
**Independent test**: its `selectPairs` gives the expected pairs on the reference portal's
ground truth and a fixture record set; the judge runs in Phase 6's trial.

- [x] T012 [sonnet] [P] [US4] `evals/graders/model/selectors.ts`: `ofKind(records, ...kinds)`,
  `citingRoute(record, route)`, `screenRoute(gt, screenId)`, `recordText(record)` (readable
  `key: value` lines of `content` without `kind`, arrays joined by `, `), re-export `normalise`
  from `@pathfinder/docs`. Test `evals/tests/judge-selectors.test.ts`.
- [x] T013 [opus] [US4] `evals/graders/model/judges/glossary-terms.ts` (contracts/judge-definition.md):
  question "Does this glossary record name the same portal term as the ground-truth term?",
  pass/fail wording, `examples: []`, `selectPairs`: per ground-truth term, the `glossary_term`
  records whose normalised `term_verbatim` (or a `synonyms_verbatim` entry) shares a word with the
  term, contains it or is contained in it (research R11), stable order by term id then record key;
  and `evals/graders/model/judges/index.ts` with `JUDGES = [glossaryTerms]`;
  `evals/graders/model/index.ts` as the public surface. Test
  `evals/tests/judge-glossary-terms.test.ts` (Autocasco vs "Autocasco (AC)" selected; "OC" vs
  "NNW" not; deterministic order).

## Phase 4: User Story 2 – draw pairs for labelling (P1)

**Goal**: real pairs in a YAML file the owner fills in.
**Independent test**: `pnpm eval:draw glossary-terms --portal reference-insurer --store
../../data/db/sandbox.sqlite` writes `evals/labels/glossary-terms.yaml`; a second run adds 0.

- [x] T014 [sonnet] [US2] `evals/graders/human/labels.ts`: Zod `LabelFile` (`judge` = file name;
  `pairs[]`: `id` unique, `split` in `dev|test`, `source` (`<store path>#<portal>` or
  `hand-made`), `item`, `record: { key, rev, text }`, `label` empty or `pass|fail`, `why`
  required when `label` is set) (data-model.md); `readLabels(path)`, `writeLabels(path, file)`
  (YAML with a leading comment naming the judge and portal and how to label, block scalars for
  `text`); `mergePairs(file, pairs, source)` keeps every existing id untouched and appends new
  ones; `splitOf(id)` = dev/test from the parity of a sha256 byte of the id. Test
  `evals/tests/labels.test.ts` (merge keeps edits, split stable and roughly half on 40 ids, schema
  rejects `why` missing on a labelled pair).
- [x] T015 [sonnet] [US2] `evals/draw.ts` (entry, `pnpm eval:draw <judge-id> --portal <p> --store
  <path> [--store ...]`): for each store open read-only (`query_only`), `loadEvalInput`, the
  task's ground truth via `tasks.ts`, `selectPairs`, `mergePairs`, write; print `added N, kept M,
  dev D / test T, labelled L` and, under 40 pairs, how many are missing with the hint to draw
  from another store or add `hand-made` pairs (contracts/commands.md); exit 2 on an unknown judge,
  portal or store.
- [x] T016 [opus] [US2] Run the drawer on the main store for reference-insurer, read the file,
  check the pairs make sense (readable record text, sensible candidates); commit
  `evals/labels/glossary-terms.yaml` with the code (group T012–T016). Tell the owner how many
  pairs there are and how to label.
  (As built, 2026-10-11: 11 pairs from 123 records, dev 4 / test 7; 10 are exact-term matches,
  one natural mismatch candidate `T06~GL-007@1` "Suma ubezpieczenia" vs the OWU record (shared
  word via its synonym). 29 short of 40: the owner adds `hand-made` pairs (T017). Also:
  `store-pairs.ts` (`pairsFromStore`, `categoryItemIds`) shared by draw, judge and the trial
  step; `GroundTruth.rules[].statement` kept (F-06); selector uses whole words (F-07);
  `evals/tests/fixtures/judge/records.ts`.)
- [ ] T017 [owner] [US2] Label every pair in `apps/crawler/evals/graders/human/labels/glossary-terms.yaml`
  (`label: pass|fail`, one-sentence `why`); add `hand-made` pairs for tricky cases real output
  lacks (variant spellings, a broader term, a synonym-only match, a different term with a shared
  word) until there are about 40 with both verdicts in each split.
  (2026-10-11: the owner labelled 10 of the 11 drawn pairs by the definition's correctness, which
  became the judge's question (F-08). Claude then added `meaning` to the ground-truth terms, the
  meaning to every pair's `item`, and 32 drafted `hand-made` pairs (`HM-01`…`HM-32`, label empty,
  split by `splitOf`) for the owner to label: 43 pairs in all.)

**Checkpoint**: the owner has a file to label; Phases 5–6 do not wait for it.

## Phase 5: User Story 3 – calibrate (P1)

**Goal**: agreement with the owner's labels, as TPR, TNR and flip rate, with every disagreement.
**Independent test**: on a fixture label file and recorded verdicts, the report numbers are
right; with the owner's labels, `pnpm eval:calibrate glossary-terms --split dev` prints and saves
a report.

- [x] T018 [opus] [P] [US3] `evals/graders/model/calibration.ts` (pure): `majority(verdicts[3])`
  (`unknown`/`error` count as fail; ties impossible with 3 binary votes); `agreement(labelled,
  runs)` → `table { tp, fn, fp, tn }`, `tpr` = tp/(tp+fn) and `tnr` = tn/(tn+fp) (null on a zero
  denominator), `flip_rate` = share of pairs whose 3 verdicts are not all equal, `disagreements`
  with label, `why`, majority and the three reasons; `skipped` = pairs without `label` or `why`.
  Test `evals/tests/judge-calibration.test.ts` (judge-passes-everything gives TPR 1, TNR 0; a flip
  counted; zero denominators).
- [x] T019 [sonnet] [P] [US3] `evals/graders/model/reports.ts`: Zod `CalibrationReport`
  (data-model.md: `judge`, `version`, `model`, `claude_code_version`, `split`, `at`, `runs: 3`,
  `table`, `tpr`, `tnr`, `flip_rate`, `skipped`, `disagreements`, `repeat_test_use`, `cost`);
  `saveReport` to `data/evals/judges/<judge>/<timestamp>-<split>.json`; `isCalibrated(def,
  dir)` = newest `test` report with the current version has `tpr ≥ 0.9` and `tnr ≥ 0.9` (FR-011);
  `hasTestReport(def, dir)`. Test `evals/tests/judge-reports.test.ts` (temp dir).
- [x] T020 [opus] [US3] `evals/graders/model/run.ts`: `runJudge(def, pairs, { login, runs = 1,
  concurrency = 4 })` → verdicts per pair per run with `attempts`, retry once on `answer: null`,
  `isError`, timeout or spawn failure (FR-008), `error` verdict with the cause and ≤ 300 chars of
  the raw answer after the retry; `limitHit` or `JudgeSetupError` stops the whole run; summed
  cost `{ usd, input_tokens, output_tokens, calls }`; the init's model and Claude Code version.
  Test `evals/tests/judge-run.test.ts` with an injected fake `callJudge` (pool limit honoured,
  retry once then error, a setup error stops).
- [x] T021 [sonnet] [US3] `evals/calibrate.ts` (entry, `pnpm eval:calibrate <judge-id> --split
  dev|test`): read labels, refuse (exit 2) when a `test` pair equals one of the judge's examples
  (same item and record text), `runJudge` with `runs: 3`, `agreement`, print the table, TPR, TNR,
  flip rate, every disagreement, `calibrated: yes|no (bar 0.90/0.90)`, and on a repeat `test`
  run "the test set was used again for this wording"; save the report; exit 0 either way
  (contracts/commands.md). Commit group T018–T021.
  (As built, 2026-10-11: only labelled pairs are sent to the judge; a usage limit stops the run
  (`JudgeSetupError('USAGE_LIMIT')`); the pool starts no new call after a stop. Smoke with 2
  throwaway pairs × 3 runs (not committed, not the owner's labels): 6 calls, 8.5 s, $0.029,
  TPR 1 / TNR 1, flip rate 0. A real calibration waits for T017.)
- [ ] T022 [opus] [US3] After T017: `pnpm eval:calibrate glossary-terms --split dev`; go through
  every disagreement with the owner; refine the example judge's wording or examples (taken from
  dev labels) or the owner fixes a label; repeat until the owner is satisfied (target ~90 %).
- [ ] T023 [owner] [US3] Decide the dev result is good enough and ask for the one `test` run.
- [ ] T024 [opus] [US3] `pnpm eval:calibrate glossary-terms --split test` once; write TPR, TNR,
  flip rate, cost and the version into `findings.md` whatever they are (SC-005); commit the
  reports and the final judge wording.

## Phase 6: User Story 1 – judges in an eval trial (P1)

**Goal**: every trial runs the judges after the code graders and stores verdicts beside the
scores; judges can be switched off; an existing store can be judged without a trial.
**Independent test**: `pnpm eval reference-insurer` writes `judges` and `workspace`;
`--no-judges` gives a result whose `scores`, `checks` and comparison equal the code-only path.

- [x] T025 [sonnet] [US1] `apps/crawler/packages/gates/src/eval.ts`: `EvalResult` gains
  `workspace: z.string().min(1).optional()` and `judges: z.array(JudgeRunResult).optional()` with
  `JudgeRunResult` strict: `id`, `version`, `model`, `claude_code_version`, `calibrated`,
  `covered`, `total`, `pct`, `counts { pass, fail, unknown, error }`, `skipped_pairs`,
  `cost { usd, input_tokens, output_tokens, calls }`, `verdicts [{ pair_id, verdict, reason }]`
  (data-model.md); `compareEval` untouched (judges never regress, R5); `comparisonMarkdown` adds
  one line per judge. Tests in `packages/gates/tests/eval-compare.test.ts`: old results still
  parse, the new fields parse, comparison identical with and without `judges`. Run
  `pnpm test:slow` before this commit.
- [x] T026 [sonnet] [US1] `evals/config.ts`: `--no-judges` (`judges: boolean`, default true) in
  `OPTIONS`, `EvalConfig` and `USAGE`; test in `evals/tests/config.test.ts`.
- [x] T027 [opus] [US1] Judge step: `evals/graders/model/judge-step.ts` `judgeTrial({ config,
  ws, groundTruth })`: skipped when `crawlerOnly` or `!judges`; for each judge in `JUDGES` whose
  `category` has ground-truth items, pairs from the trial's store (read-only), cap 10 pairs per
  item in selector order (`skipped_pairs` counts the rest), `runJudge` (1 run), `summarise`,
  `isCalibrated`, one console line per judge (contracts/commands.md); a `JudgeSetupError` prints
  and returns no judges (the trial result is still written). Wire it in `evals/index.ts` after
  `grade()` and into `evals/results.ts` (`TrialRecord.judges`, `workspace` = `ws` unless
  `--in-place`), so `buildResult` writes both. Test the result building in
  `evals/tests/results.test.ts` (with and without judges).
- [x] T028 [sonnet] [US1] `--dry-run` resolves the judge login (no call) and prints its source,
  or the `JudgeSetupError`, in `evals/index.ts` `dryRun()`; `preflight` unchanged.
- [x] T029 [sonnet] [US1] `evals/judge.ts` (entry, `pnpm eval:judge <portal> --store <path>
  [--judge <id>]`): judges an existing store, prints per judge the summary line and per item the
  code matcher's verdict (from `evaluate()`'s matches for that category) next to the judge's
  covered/not covered; saves `data/evals/judges/<id>/<timestamp>-store.json`; writes nothing to
  the store. Commit group T025–T029 (slow tier ran in T025).
  (As built, 2026-10-11: `JudgeCost` and `JudgeRunResult` live in `@pathfinder/gates` with
  `EvalResult`; the judge step is `graders/model/judge-step.ts` (`judgeStore`, `judgeLine`) and
  `graders/model/index.ts` (`judgeTrial`, `judgeLoginLine`); an empty category scores 0 (the
  create-eval skill), not 100; label files moved to `graders/human/labels/` (the skill keeps
  human labels there).)
- [ ] T030 [opus] [US1] Real runs: `pnpm eval:judge reference-insurer --store
  ../../data/db/sandbox.sqlite` (cheap, no agents); then, when the owner agrees to spend a
  trial's tokens, `pnpm eval reference-insurer` and `--no-judges` (SC-002, SC-003); record
  anything odd in `findings.md`.
  (Partly done 2026-10-11: `eval:judge` on the main store, 11 calls, $0.033, 10/10 covered,
  code and judge agree on every term, the judge failed the one mismatch candidate
  `T06~GL-007@1` with a sound reason. The full trial waits for the owner's go-ahead: it runs
  the crawler and BA agents.)

## Phase 7: Polish and close-out

- [x] T031 [haiku] [P] `apps/crawler/evals/README.md`: graders table (model-based: the mechanism,
  `glossary-terms`; human: the label files), the four commands, labels and reports folders,
  `PATHFINDER_JUDGE_TOKEN_FILE`; `apps/crawler/CLAUDE.md` evals line (G-30).
- [x] T032 [sonnet] [P] `.claude/skills/create-eval/SKILL.md`: "Adding a judge" (the four steps
  of contracts/judge-definition.md, the rules, never in `pnpm test`); `learning/05-llm-as-judge.md`:
  point "How to call it" and exercises 5.1/5.2 to the commands (exercise text stays the owner's).
- [x] T033 [opus] Glossary: entries for judge (model-based grader), label file, calibration,
  TPR/TNR, flip rate, wording version, isolation check in `docs/glossary/glossary.yaml`, then
  `uv run pathfinder-glossary --write` in `apps/dashboard`.
  (As built: entries `judge` (with the wording version), `judge-labels`, `judge-calibration`
  (TPR, TNR, flip rate), `judge-isolation-check`; `grader` updated; 125 entries;
  `apps/dashboard/tests/test_glossary.py` expected ids updated.)
- [x] T034 [opus] Code review: `code-reviewer` agent on the branch (G-31); fix `small` findings,
  defer `large` ones to `findings.md`. (2026-10-11: 0 findings; table and caveats in
  `findings.md`. Re-run before the merge if T022–T024 change code.)
- [x] T035 [opus] Close-out checks: `pnpm test` in `apps/crawler` plus every app's suite
  (CLAUDE.md); tick the validation scenarios in `quickstart.md`; roadmap R-47 → `done` (or
  partly, if T022–T024 wait for the owner's labels); changelog skill; merge to master; delete the
  branch.
  (2026-10-11, the owner: "put a pin into it", squash-merge and tag now. R-47 → `paused` with
  T017, T022–T024 and the rest of T030 open. They continue on a new branch from master. The
  delta since 578efad was re-reviewed with 0 findings. Every suite is green.)
- [ ] T036 [owner] Later, outside this item: write the rules judge (`judges/rules.ts`, one line
  in `JUDGES`), decide its candidate selector (spec Clarifications), label and calibrate it, then
  resume R-46 (SC-001, SC-006).

## Dependencies

- Phase 1 → Phase 2 → everything else. T011 (real isolation run) needs T002–T010.
- US4 (T012–T013) before US2 (drawer needs a judge) and before US1's real runs.
- US2 T016 → owner T017 → T022–T024 (calibration with real labels). T018–T021 do not wait for
  the labels (fixtures).
- US1 T025 before T027; T027 needs T020 (`runJudge`) and T019 (`isCalibrated`).
- Close-out T031–T035 after T030; R-47 may close with T022–T024 open only if the owner says so.

## Parallel examples

- Phase 2: T003, T004, T005, T006 together (different files); then T007 → T008 → T009 → T010.
- Phase 5: T018 and T019 together while the owner labels (T017).
- Phase 7: T031 and T032 together.

## Implementation strategy

MVP = Phases 1–4: an isolated, checked judge call, the example judge, and a label file in the
owner's hands. Then calibration (Phase 5) and trial wiring (Phase 6) while the owner labels;
the real calibration closes once the labels exist. Commits per group: T002–T011, T012–T016,
T018–T021, T022–T024, T025–T029, T031–T035.
