# Findings: spec 045

## F-01 Where the missed rules are, from the kept workspaces (T001), 2026-10-22

- **Setup**: the six 2.0 reference-insurer trial workspaces in `/tmp/pf-eval-reference-insurer-*`
  graded again with `pnpm docs:evaluate --root <workspace>` (free).
- **Rules per trial** (17): 6, 7, 8, 7, 8 (e7ada23, 993bfa3) and 12 (55af20c, spec 040). Missed
  in every trial: R05 (engine factor bands), R12 (90 days), R15 (phone or e-mail), R16 (two
  different products); in five of six: R02, R03, R07, R10, R13.
- **Where the evidence is**: only the motor calculator was probed. Its probe messages carry R02,
  R03, R10 ("Please match the requested format.", "Value must be greater than or equal to
  1990."). R07, R12, R15, R16 are stated **only as hints on the page** ("AC dostępne tylko dla
  pojazdów młodszych niż 15 lat.", "Maksymalnie 90 dni.", "Napisz do nas. Podaj telefon lub
  e-mail…", "Wybierz dwa różne produkty, aby je porównać."); the BA listed them as screen elements
  and asked an open question about the 15 years, but wrote no rule. R05's bands need several
  engine sizes; one trace shows one band only (not a BA miss; R-88's repeat replays or a probe).
- **How the BA wrote what it did write**: one `requirement` per form step ("The vehicle step shall
  refuse submission unless … Rok produkcji is 1990–2026 … Kod pocztowy matches NN-NNN"), which
  the lenient matcher (F-13@004) credits for R02 and R03 at once in the 12/17 trial.
- **Processes**: P05 "Przedłuż polisę" (login wall at `/moje-polisy/przedluz`) missed in all six;
  the BA wrote a screen and a follow-up, no process.
- **The new server list on the latest store** (see below)

## F-02 Every eval since spec 044 started its MCP servers on local-dev (T008), 2026-10-22

- **Bug**: the first BA replay trial ended after 11 s ($0.17) with no write: "the `mudpuppy` and
  `mudpuppy-ba` MCP servers both failed to connect". The eval passes the repo's `.mcp.json` to
  `claude --mcp-config`; spec 044 set `MUDPUPPY_ENV: local-dev` in it, and a server's own `env`
  wins over the process's `MUDPUPPY_ENV=sandbox`, so the servers looked for a local-dev store in
  the sandbox workspace and closed. No full eval ran between spec 044 and tonight, so none was
  affected; the next one would have been.
- **Fix**: `evalMcpConfig` writes a copy of `.mcp.json` with every server's `MUDPUPPY_ENV` and
  `MUDPUPPY_ROOT` set to the eval's, in the temp folder. Test: `evals/tests/agent-mcp.test.ts`.
- **Eval idea**: `--dry-run` should start each MCP server once on the workspace and call
  `tools/list`, so a server that cannot boot fails the free check instead of a paid trial.
- **My slip**: the first trial result (garbage, all zeros) was deleted; $0.17 spent.

## F-03 The grouping eval's workspace could not migrate an older store (T008), 2026-10-22

- **Bug**: three grouping trials ended in 4 s with no suggestion ($0.37): the chat MCP server died
  at start, "migration left dangling foreign keys" (doc_records → ba_processes, then
  entity_refs → doc_records). The workspace copies the kept store (an older schema), removes the
  groupings with foreign keys off, and the server's `migrateUp` then ran the newer migrations,
  whose integrity check found the keys the cut left.
- **Fix**: both throwaway workspaces (`apps/chat/evals/harness/workspace.ts`, the crawler's
  `ba-replay.ts`) migrate the copy first, while its keys are whole, then cut. Checked by building
  the workspace and starting the chat MCP server on it (free) before paying again.
- **Eval idea** (with F-02's): the eval should boot each MCP server on the workspace and list its
  tools before the first paid call; both bugs cost a paid trial to find.

## F-04 A grouping trial gave up on a tool outside its fence (T008), 2026-10-22

- One of three grouping trials found every process in its reasoning but saved none: it called
  `workflow_state` (in the orchestrator's normal tools, not in the eval's two), was refused twice,
  and stopped with "I need to know which persona the screens were recorded as". Trials 2 and 3
  saved all five.
- **Not fixed** (a harness choice, R-78 (5)): either allow `workflow_state` in the grouping eval
  or tell the prompt it has only the two tools. Counted as a failed trial, not dropped.

## F-05 Results: rules 13 of 17 on two crawls; F-13 tightened; new baselines (T008, T009), 2026-10-22

- **Trials** (BA replays with `--ba-replay`, the same crawl evidence as a kept trial; $18.71 of the
  owner's $20 including F-02's and F-03's broken runs):

  | Trial | Crawl of | Rules (lenient) | Rules (strict, T009) | EARS | Cost |
  |---|---|---|---|---|---|
  | 2.0 trials, BA before this spec | (six) | 6, 7, 8, 7, 8, 12 | 5, 6, 8, 7, 7, 10 | 36–100 % | – |
  | replay 1 (first warning) | 55af20c | 12 | 12 | 13 % | $6.05 |
  | replay 2 (controls named, stricter "stated", EARS asked) | 55af20c | 14 | 13 | 83 % | $5.74 |
  | replay 3 (same code) | 993bfa3 (v2 baseline) | – | 13 | 72 % | $5.29 |

  The same crawl that gave 12 (lenient) before gives 14; the v2 baseline's crawl goes from 7 to 13
  (strict). Every hard check 0, no overclaims, screens, fields, terms 100 %. Found now and never
  before: R12 (90 days), R15 (phone or e-mail); R02, R03 and R10 as one rule each instead of one
  requirement per form step.
- **Still missed**: R05 (the engine bands need several engine sizes; one trace shows one band,
  R-88's repeat replays or a probe of the engine field); R07 (the BA quotes the hint, not the
  "OC + Autocasco (AC)" label, although the warning names it); R13 (the departure date is not
  probed in the eval: only the motor calculator is a probe form, a conditions change); P05 (the
  BA still writes a follow-up for the login wall, not a process; the guidance line was not enough;
  a server-side check like the rules one would be the next step).
- **Replay 1's lesson**: the first warning let a rule that named a field in passing "state" a
  probe message and took the 10 of "WIOSNA10" for a limit; hints tied to no control did not ask
  for the control's label, so the grader (which needs the anchor label) missed R07 and R16.
  Fixed before replay 2 (`isStated`, `tests/rule-pass-check.test.ts`).
- **Replays are not cheap**: a BA replay costs $5.3–6.1, as much as the BA part of a full trial;
  the crawler is the small part of a trial. They are worth it for comparability (same evidence),
  not for price.
- **Grouping eval** (orchestrator guidance, R-78's fixes; three trials on the 55af20c store):
  5/5 processes in two trials (baseline 4/5), clean starts 4/5 and 5/5 (baseline 3/4), Polish
  names, P05 "Przedłuż polisę" suggested with its one screen, no "Log in" process; the third trial
  saved nothing (F-04). Baseline promoted (the 4-clean trial); old one in `history/`.
- **F-13 (T009)**: `claim_markers_all` in the ground truth (groups that must all be met, each by
  one spelling) for R01, R04, R05, R11, R14; golden test in `docs/tests/evaluate.test.ts`. The old
  trials regraded: 1–2 rules lower each (R04 and R14 needed both numbers). Negative markers ("not
  observed" voids a match) were left out: tonight's rules say "enforcement not observed" next to
  a rule the page does state, which should still count.
- **Baseline**: replay 3 (strict grading, 13/17) promoted; the v2 baseline is in
  `history/2026-10-21T20-40-15-252Z.json`. `export_ears` shows as a regression against the old
  baseline's 100 % (one lucky trial; the other 2.0 trials had 36–71 %).

## F-01 (cont.)

- **The new server list on the latest store** (copy of `wiiGif`, both sessions): 27 candidates,
  18 without a rule, among them all four hint-only rules; noise: the login error hint, a computed
  "Typowa wartość" line (both legitimate to answer in the gaps).

## Close-out review: feature/045-r89-ba-rules-recall (2026-10-23)

| # | File:line | Guideline | Finding | Change | Size | Outcome |
| - | --------- | --------- | ------- | ------ | ---- | ------- |
| 1 | apps/crawler/packages/mcp-server/src/services/ba/rule-pass-check.ts:64 | G-03 | `hintsOf` complexity 19 (limit 15) | extract `hintOfLine` | small | fixed |
| 2 | apps/crawler/packages/mcp-server/src/services/ba/rule-pass-check.ts:234 | G-03 (no-nested-ternary) | nested ternary in `shown` | if / else if | small | fixed |
| 3 | apps/crawler/evals/graders/grade.ts:143 | G-03 | `grade` complexity 16 (limit 15), two `docs &&` spreads | one `docs &&` spread | small | fixed |
| 4 | apps/crawler/packages/mcp-server/src/runtime/pipeline/probe.ts:201 | G-03 | `classifyPress` complexity 17 (limit 15) after the dom-text branch | extract the message gathering | small in size, but runtime/** | deferred (needs `test:slow`; runtime not touched in this review) |
| 5 | apps/crawler/evals/README.md:124 | G-30 | `--ba-replay` / BA-only trial not described in the evals README (only in USAGE) | add a line | small | deferred (file not changed on the branch) |
| 6 | apps/crawler/evals/harness/ba-replay.ts:78 | G-05 | workspace copy (portals, personas, migrations, evidence, VACUUM INTO, migrateUp) repeats `createWorkspace` | share a helper | large | deferred -> follow-up |
| 7 | apps/crawler/evals/harness/agent.ts:50 | G-20 | `evalMcpConfig` writes `pf-eval-mcp-<pid>.json` to tmpdir on every agent call, never removed | clean up after the session | large (behaviour) | deferred -> follow-up |

Checks after fixes: typecheck ✓ lint ✓ (touched files: no complexity or nested-ternary warnings) test ✓ for mcp-server rule-pass-check and ba-session, evals/tests; full test:fast and test:slow not run
Summary: 7 findings, 3 fixed, 4 deferred, 0 rejected.
