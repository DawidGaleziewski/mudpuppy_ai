# Research: LLM judge mechanism (R-47)

Each item: **Decision**, **Rationale**, **Alternatives considered**. Facts marked *verified* were
checked on the owner's machine on 2026-10-11 (Claude Code 2.1.288).

## R1. How a judge calls the model

- **Decision**: one `claude -p` child process per (item, record) pair, with
  `--system-prompt <judge instructions>`, `--tools ""`, `--strict-mcp-config`,
  `--no-session-persistence`, `--output-format stream-json --verbose`, `--json-schema <verdict
  schema>`, `--model <judge model>`; the answer is the result event's `structured_output`.
- **Rationale**: same CLI and subscription the eval harness already uses for the agents
  (`harness/agent.ts`); no API key, no SDK dependency. `stream-json --verbose` adds the
  `system/init` event (model id, tools, MCP servers, plugins, skills, agents, Claude Code
  version), which the isolation check and the verdict's provenance need. *Verified*: a call
  returned `{"reason": "...", "verdict": "pass"}` in `structured_output`, ~870 input tokens,
  ~$0.005 on Sonnet.
- **Alternatives**: Messages API with an API key (prompt caching of the few-shot prefix, batch
  API at half price, more control) — rejected for now by the owner: needs a key and separate
  billing; worth it only when judges grow. Agent SDK (TypeScript) — also needs an API key
  (subscription OAuth is not accepted by the SDK). `--output-format json` — no init event, so no
  provenance or isolation evidence.

## R2. Isolation (light version, owner decision 2026-10-11)

- **Decision**: per judge run, a fresh temp config folder as `CLAUDE_CONFIG_DIR` and a fresh empty
  temp working folder (outside the repo, so no project `CLAUDE.md`, `.mcp.json` or
  `.claude/settings.json` is found). `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` are removed
  from the child's environment so the subscription credential is the one used. Both folders are
  deleted after the run.
- **Rationale**: everything personal (instructions, rules, memory, skills, agents, hooks,
  plugins, sessions) lives in `~/.claude`; a fresh config folder drops all of it. *Verified*:
  the init event lists only the `StructuredOutput` tool, no MCP servers, and the auto-memory
  path inside the fresh folder; the owner's skills (`ba-practice`, `create-eval`, ...) and
  agents (`crawler`, `ba`, `po`, ...) are absent.
- **Caveat** (*verified*): Claude Code's **built-in** plugins (`*@builtin`), skills and agents
  still load with an empty config. With no tools the judge cannot call them. The isolation check
  therefore forbids user and project ones, not built-ins.
- **Alternatives**: `--bare` — rejected: it ignores the subscription login and
  `CLAUDE_CODE_OAUTH_TOKEN` (API key only). A container — deferred by the owner; reconsider only
  if the isolation check finds a leak. It would add a pinned CLI version.

## R3. The judge's login

- **Decision**: lookup in this order: (1) `PATHFINDER_JUDGE_TOKEN_FILE`, (2)
  `~/.config/pathfinder/judge-token`, (3) a symlink to `~/.claude/.credentials.json` placed in the
  fresh config folder. A token from (1)/(2) is passed as `CLAUDE_CODE_OAUTH_TOKEN` to the judge's
  child process only. A token file that exists but is rejected (401) stops the run with a clear
  message; it never falls back silently.
- **Rationale**: mirrors the vault key convention (`PATHFINDER_VAULT_KEY_FILE`,
  `~/.config/pathfinder/vault.key`). A separate one-year token (`claude setup-token`) keeps the
  judge from sharing the refreshing credential file with the owner's live sessions. Exporting
  `CLAUDE_CODE_OAUTH_TOKEN` globally was rejected: it outranks the `/login` credential, so every
  Claude session on the machine would switch to it. *Verified*: the owner's token works from the
  file; the symlink fallback also works. Lesson from setting it up: a token copied with
  surrounding quotes or clipped gives `401 Invalid bearer token` / `OAuth access token is
  invalid`; the loader trims whitespace and rejects a value that is not `sk-ant-` followed by
  token-safe characters, naming the file (never printing the value).
- **Alternatives**: always the symlink (works, zero setup; kept as the fallback); the vault
  (built for per-portal credentials, wrong shape for a machine-wide token).

## R4. Verdict shape and leniency

- **Decision**: JSON schema `{reason: string, verdict: "pass" | "fail" | "unknown"}` with `reason`
  first; `unknown` counts as not covered and is reported separately. The judge sees only the
  ground-truth item and the record's content. Instructions say: fail when the record does not
  clearly state the item.
- **Rationale**: Anthropic's evals guide: an isolated judge per dimension, an "Unknown" escape
  instead of a guess, structured rubrics; `learning/05`: binary verdicts, leniency defence, no
  scales, no pairwise comparison. Reason before verdict lets the model explain before deciding;
  the schema lists `reason` first and the instructions ask for it first (whether the CLI keeps
  property order in generation is not documented; the verified call answered in that order).
- **Alternatives**: pass/fail only (`learning/05`) — kept in spirit: `unknown` is a fail for the
  score; it only adds a signal for unclear records or questions.

## R5. Where judge results go in a trial result

- **Decision**: a new optional `judges` section in `EvalResult` (`@pathfinder/gates`), one entry
  per judge: id, wording version, model, Claude Code version, calibrated flag, covered/total,
  counts per verdict, the verdicts with reasons, and the judge's own cost. Judge scores are **not**
  put in `scores` and are not part of `compareEval` regressions. Also a new optional `workspace`
  field: the folder the trial ran in.
- **Rationale**: `compareEval` treats a score missing from the current result as a regression,
  so judge scores in `scores` would make "judges off" (FR-006, SC-002) look like a regression,
  and an uncalibrated judge would gate baselines. Keeping them apart keeps the code scores and
  their comparison byte-identical (FR-007). The agents' `cost` stays comparable; the judge cost is
  its own figure. `workspace` fixes a gap found while planning: no result says where its outcome
  is, so no trial could be re-judged or drawn from later (see R7).
- **Alternatives**: a sidecar file per trial (no schema change, but two files to keep together);
  judge scores in `scores` (rejected above). Promoting a calibrated judge's score into `scores`
  for regression checks is left for later, by the owner.
- **Consequence**: `packages/gates/**` changes, so the slow tier (`pnpm test:slow`) runs before
  that commit (CLAUDE.md).

## R6. Declaring a judge, and the wording version

- **Decision**: one file per judge in `evals/graders/model/judges/<id>.ts` exporting a
  `JudgeDefinition` object: `id`, `category`, `question`, `pass`, `fail`, `examples` (0–5, each
  item text + record text + verdict + reason), `model` (default `sonnet`), `selectPairs` (code).
  The list `JUDGES` in `judges/index.ts` names them (one line per judge). The wording version is
  computed: a short sha256 of question, pass, fail, examples and model, so a change in wording
  automatically makes the judge uncalibrated until a new `test` report exists.
- **Rationale**: declarative config object per role (owner's preference); adding a judge touches
  its own file and one list line, never the runner, results or calibration (FR-001). A computed
  version cannot be forgotten. The spec's SC-001 is read with that one list line allowed (spec
  updated).
- **Alternatives**: auto-discovery of `judges/*.ts` (no list line, but implicit and harder to
  read); a hand-bumped version number (easy to forget).

## R7. Where labelling pairs come from

- **Finding (planning)**: the 30 eval workspaces under `/tmp/pf-eval-*` hold no documentation
  records: they were created in pairs at the same minutes on 2026-10-10 (dry runs or tests), and
  no result records its workspace. Real BA output exists only in the owner's main store
  (`data/db/sandbox.sqlite`: reference-insurer has 33 business rules, 5 requirements, 12 glossary
  terms). Logged as finding F-01 in `findings.md`.
- **Decision**: the pair drawer takes one or more **store paths** (a trial workspace's store, or
  the main store) and a portal; it opens each read-only, runs the judge's `selectPairs`, and
  merges the pairs into the judge's label file. Results gain `workspace` (R5) so later trials can
  be drawn from. The label file also accepts hand-written pairs (`source: hand-made`) for tricky
  cases real output lacks, as `learning/05` suggests ("include tricky ones").
- **Rationale**: works today on the one store with real output, and on every trial from now on.
- **Alternatives**: draw only from trial results (impossible today: no workspace recorded);
  keep workspaces in the repo (large, and they hold encrypted credential rows).

## R8. Label file format and the dev/test split

- **Decision**: YAML (as G-34 for ground truth, since people edit it by hand), one file per judge:
  `evals/graders/human/labels/<judge-id>.yaml` (the create-eval skill keeps human labels in
  `graders/human/`), committed. Per pair: `id` (`<item id>~<record key>@<rev>`),
  `split`, `source` (store or `hand-made`), `item` (text), `record` (key, rev, readable content),
  `label` (`pass`/`fail`, empty until labelled), `why` (one sentence). The split is decided once
  per pair from a hash of its id (stable when pairs are re-drawn), targeting about half each;
  the owner may move a pair by editing `split`. Re-drawing keeps every existing entry untouched
  and appends new pairs.
- **Rationale**: readable without opening the database; stable ids make re-drawing safe; a hash
  split cannot be tuned by accident.
- **Alternatives**: a rating page (the owner liked one for the glossary) — possible later on top
  of the same file; JSON (rejected: hand-edited).

## R9. Calibration maths and the bar

- **Decision**: each labelled pair of the chosen split is judged 3 times; the majority verdict
  (`unknown` and `error` count as fail for agreement, and are listed) is compared with the label.
  Report: 2×2 table, TPR = TP/(TP+FN), TNR = TN/(TN+FP), flip rate = share of pairs whose 3
  verdicts are not all equal, every disagreement with the owner's `why` and the judge's reasons,
  plus date, judge id, wording version, model, Claude Code version, split. Calibrated = the latest
  `test` report for the current wording version has TPR ≥ 0.9 and TNR ≥ 0.9. A `test` run for a
  wording version that already has a `test` report is allowed but printed as a repeat use of the
  test set. An example in the judge's `examples` that equals a `test` pair is refused.
- **Rationale**: `learning/05` (TPR and TNR, not accuracy; 3 runs for stability; test once per
  wording); Anthropic (calibrate against human judgement).
- **Alternatives**: accuracy alone (hides a judge that passes everything); Cohen's kappa (harder
  to read; can be added to the report later).

## R10. Concurrency and timing

- **Decision**: judge calls run asynchronously, at most 4 at a time, each with a 120 s timeout and
  one retry on an invalid answer, a failed call or a timeout (FR-008); a usage-limit message stops
  the run (as `harness/agent.ts` does for agents).
- **Rationale**: a call takes a few seconds; 20 pairs × 3 runs = 60 calls finish well inside
  SC-004's 10 minutes at 4 in parallel; small enough not to strain the subscription.
- **Alternatives**: sequential `spawnSync` like the agents (simplest, ~5–8 min for 60 calls,
  borderline); higher concurrency (rate limits).

## R11. The example judge (glossary terms)

- **Decision**: `glossary-terms`: "Does this glossary record name the same portal term as the
  ground-truth term?". `selectPairs`: for each ground-truth term, the `glossary_term` records whose
  normalised `term_verbatim` shares a word with the term or contains it or is contained in it
  (looser than the code matcher's exact equality, so variants like "Autocasco" vs
  "Autocasco (AC)" are seen). No few-shot examples until the owner has labels (the declaration
  can take them from the owner's dev labels).
- **Changed 2026-10-11 (owner, option B, findings F-08)**: the question is now the meaning: "Does
  this glossary record define the ground-truth term with the meaning the portal gives it?". Each
  ground-truth term gets `meaning`, the portal's /slowniczek definition verbatim (a portal test
  keeps them equal); the item the judge reads is `term: …` plus `meaning on the portal: …`. Name
  matching stays with the code matcher, which already does it.
- **Rationale**: small, short pairs, real variants exist in the reference portal; leaves the
  rules judge to the owner.
- **Risk**: the main store gives few natural pairs (12 glossary records against 10 ground-truth
  terms, mostly exact) and few natural fails. The label file takes hand-made pairs, and the owner
  can draw again after the next reference-insurer trial (which now records its workspace). The
  bar may not be reachable on such a small set; SC-005 asks only that the numbers be written.

## R12. Constitution Principle VII and spec 004's earlier rejection

- **Finding**: spec 004 research rejected an LLM judge for `docs:evaluate` because it is
  non-deterministic (Principle VII).
- **Decision**: unchanged: `evaluate()` and every code-based score stay deterministic and are
  still the regression gate. The judge is a model-based **eval grader** in the evaluation harness
  (which already runs non-deterministic agents and never runs in `pnpm test`); its scores sit
  beside the code scores. The deterministic parts of the mechanism (selectors, prompt building,
  output parsing, agreement maths, label merging, login lookup, isolation verdict) are pure
  functions with unit tests on fixtures, without model calls.
