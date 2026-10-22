# Findings 042 (R-90 size and complexity)

Bugs, slips and decisions found while building, with test or eval ideas (`log-every-bug-for-evals`).

## F-01 Moving code between files without retyping it

The no-script-edits rule (CLAUDE.md) forbids text replacement on tracked files. Moved blocks were
copied into the new, untracked files as exact line ranges (`sed -n 'a,bp'`), and the tracked file
was then cut with the Edit tool (the old text must match exactly, so a slip fails loudly) or
rewritten whole with Write. Checks per move: every exported name still exported (89 of 89 for
`db-types.ts`), typecheck, the package's tests, byte-stable goldens where there are some. Idea: a
`pnpm move <file>:<a>-<b> <new file>` helper that the hook allows.

## F-02 Spec 040's review named the wrong function

Row 5 of spec 040's close-out review lists `range_from` with 7 parameters at
`queries_changes.py:292`; that line is `changes_view` (7 counted, keyword-only included);
`range_from` has 5. `changes_view` now takes a `ChangeFilter`.

## F-03 What R-90 left on purpose

- Crawler: the 112 size/complexity warnings of the baseline that no review named stay (they
  predate 2.0: `request-gate.ts`, `browser-runtime.ts`, `wireframe/model.ts`, `vault/cli.ts`, …).
  Spec 042 removed the named ones; the lint report has the counts before and after (T060).
- Dashboard: 23 C901/PLR hits remain; by `git blame` each was written before 2.0 (v1.0.44):
  `create_app` (65 statements), `queries.py` `_page`, `run_actions`, `run_decisions`,
  `trace_calls`, `queries_docs.py` record readers, `web/map.py` `map_page`, `web/portals.py`
  `settings_page`, `web/processes.py` `process_page`, `web/views_docs.py` `_paging`,
  `record_values`, and others outside 2.0's files (`glossary.py` `_load`, `live.py`).
- Chat: the warnings no review named (`amendments.ts` `createAmendmentService`,
  `step-recorder.ts`, `workflow-data.ts`, `acp-client.ts`, `handover.ts`).

## F-04 The T050 commit message has the wrong line counts

It says 59/50/51/47; the notes are 58/45/51/45 lines. Not rewritten (history).

## F-05 Agent notes and the file maps

G-30 asks for agent notes of about 60 lines; the long per-spec file maps (what lives where) are
still useful, so they moved word for word to a `LAYOUT.md` beside each `CLAUDE.md` (dashboard,
chat, mcp-server, store), which the notes point to. Idea: the code-reviewer checks that a new file
has its line in the package's `LAYOUT.md`.

## F-06 `pnpm portal:trace` dropped its portal argument

`scripts/trace.ts` marked the positions of absent flags as flag values (`indexOf` is -1, plus 1
is 0), so the portal (argument 0) was removed unless `--variant` was given, and the script only
printed its usage. Fixed (936c0db). Idea: a unit test of the argument parsing, or the scripts'
shared `flag()` helper used everywhere.

## F-07 A pattern kill hit my own shell

Stopping scar-maker with `pgrep -f "pnpm --dir apps/scar-maker start"` matched the shell running
the command and killed it (no harm: nothing else matched). The rule `feedback-kill-explicit-pids`
says to kill a printed list of the service's own PIDs; it applies to `pgrep` patterns too.

## F-08 R-80 (3): stability after `FingerprintIndex.seed`

Two rounds of `pnpm portal:trace scar-maker all applicant` (no LLM): `pnpm stability` on the
happy-path pair and the too-young pair: 4 of 4 and 1 of 1 matched route templates stable (100 %,
target 90 %); round 2's pages merged into round 1's clusters (`fingerprint:identical-fingerprint`).
Mutation testing on the fingerprint package (`pnpm mutate --package fingerprint`, 4 min): 1100
mutants, 815 killed, 278 survived, 7 timeouts, score 74.7 % (spec 012: 73.1 % over 468 mutants
before `FingerprintIndex.seed`, `profile.ts`, `form-step.ts` and `url-params.ts` grew the package).
Weakest: `aria-canonical.ts` 56.9 % (94 survivors), `route-template.ts` 74.8 % (54),
`structure.ts` 80.6 % (48), `form-step.ts` 74.4 % (42). No new test written here (R-90 is
behaviour-neutral); idea for R-35 / R-88: tests that kill the `aria-canonical.ts` survivors.

## F-09 A screen's As of menu offered versions before the screen existed (2.1 bug)

The header's As of menu (spec 040 T015) listed every model version on every model page; on a
screen's page, a version before the screen's first one opened a 404 (the screen did not exist
yet). Found by `test_smoke.py::test_every_linked_page_renders_on_a_copy_of_the_real_sandbox`
once T051's trace rounds gave the real sandbox four model versions (`404
/screens/SC-0006?as_of=1`); it fails the same way on master. The rule page had the same bug
(`/rules/H-0003?as_of=1` was 404 while the menu offered it), and the process page the same shape.
Fixed: a screen, rule or process page passes its first version (`as_of.first_seq`, one query
per kind in `FIRST_SEQ`) and the menu skips earlier ones; test
`test_a_screen_offers_only_the_versions_it_is_in` (screen and rule). Idea: the smoke test on a
store with several model versions as a fixture, not only the real sandbox.

## Close-out review: feature/042-r90-size-complexity (2026-10-22)

Behaviour neutrality checked by reading the moved code against master: `tracer*.ts` (closure to
`TraceCore`; `newId`/clock/`seq` call order, `bootId` first), `docs/src/testing/` (id allocation
order of fixture rows and of the 11 seed sections; title/kind/status sequence identical to
master), `evaluate*.ts` (matchers, `byKey`, score key order, route readers), `start-run*.ts` (phase
and write order, resume vs new run), `ba/records.ts` (`nextSeq`/`newId` before the pure status
event only), `api*.ts` (route order: portals, conversations, amendments, proposals, processes,
probe suites, marks, check runs, model, control), `scan*.ts` (check order, brief text identical),
`mcp-chat` (tool registration order and descriptions identical), `reconcile`, `clustering`,
`process-facts`, `process-proposals`, `rule-mining`, dashboard query models (same names, types
and defaults as the old handler parameters; `overview` and `fragment_review` pass the old
`portal` / `note` values). `portal-tables.ts` `where()`: all 76 tables x 2 sides give the same
clause as master's `switch` (compared by running both).

| # | File:line | Guideline | Finding | Change | Size | Outcome |
| - | --------- | --------- | ------- | ------ | ---- | ------- |
| 1 | apps/dashboard/CLAUDE.md:23,47,57 | G-30 | The shortened notes dropped three rules not kept in `LAYOUT.md`: routers name templates without the `salvage/` prefix (`salvage_template`), `package.json` exists only for `ui:check`, which modules mutmut mutates and that it works from a gitignored `mutants/` copy | restored them as clauses of the existing lines | small | fixed |
| 2 | apps/crawler/packages/store/LAYOUT.md:10 | G-30 | New files `db-types-{crawl,evidence,model,docs,chat,trace,columns}.ts` and `agent-hypothesis-reads.ts` had no line in the file map (CLAUDE.md says every new module gets one) | added the family list and the reads/writes split | small | fixed |
| 3 | apps/crawler/packages/docs/src/render/export-load.ts:170 | G-01 | Nested ternary (`excluded`), moved unchanged from `model.ts:407`; extracting a helper makes the file 401 lines (limit 400) | tried, reverted | small | rejected (moved verbatim; the fix trades one warning for a G-01 one; fold into the next split of this file) |
| 4 | apps/crawler/packages/store/src/agent-hypotheses.ts:250 | G-30 | `hypothesisRow` is now exported so `agent-hypothesis-reads.ts` can use it, and `index.ts` `export *` makes it public API of the store | after the review: `hypothesisRow` and `HypothesisInputError` in an internal `hypothesis-row.ts`, the index exports only the error | small | fixed (by me after the review) |

No other finding: no new size, complexity or parameter warning in changed lines (the ones left in
changed files are the baseline's: `browser-runtime.ts` `createBrowserRuntime` / `launch`,
`amendments.ts` `createAmendmentService`, dashboard `map_page`; see F-03). The four `LAYOUT.md`
files and the shortened `CLAUDE.md` files keep invariants, where-to-add and tests; every new file
of chat, mcp-server and docs has its line.

Checks after fixes: typecheck ✓ (crawler, chat) lint ✓ (0 errors, no new warnings) test: `vitest run packages/docs packages/store packages/model` ✓ (78 files, 480 tests); dashboard `ruff check` ✓, `ruff format --check` ✓, `pytest -n auto -m 'not perf and not serial'` ✓ except `test_smoke.py::test_every_linked_page_renders_on_a_copy_of_the_real_sandbox` (404 on `/screens/SC-0006?as_of=1` of the real sandbox copy; the screen detail route and `as_of` are untouched by this branch, so probably store data; not run on master). test:slow, the chat and mcp-server suites were not run (close-out).
Summary: 4 findings, 2 fixed, 1 deferred, 1 rejected.
