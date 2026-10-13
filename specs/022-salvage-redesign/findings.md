# Findings: spec 022

## F-01 test_review flakes under the parallel suite, 2026-10-13

- **Symptom**: `tests/test_review.py::test_confirm_runs_docs_review_and_changes_only_the_reported_rows`
  failed once in the commit hook (`pnpm docs:review` returned `[ELIFECYCLE] Command failed with exit
  code 1`, the dashboard showed `UNEXPECTED`); it passed alone and on the next commit.
- **Cause**: not found. The test shells out to the real crawler CLI; under `pytest -n auto` several
  workers do that at once.
- **Test idea**: mark the CLI-driving review tests `serial` (like `perf`) or give each its own
  scratch store path, and record the CLI's stderr in the assertion message.

## F-02 The export-fork export would have shipped a broken dashboard test, 2026-10-13

- **Symptom**: the export dry run failed on `test_salvage.py`: the style guard lived only in the
  `.claude/skills/` skill, which the export does not ship.
- **Fix**: the dashboard keeps its own copy of `find-old-styles.sh` under `apps/dashboard/scripts/`.
- **Lesson**: spec 020 F-08's idea (dry-run the export before merging) caught it before the
  interim merge. Keep doing it at every interim merge.

## F-04 db-admin edited files with perl/python substitutions, 2026-10-13

- **Symptom**: the db-admin agent (migrations 0015/0016) reported editing several files with perl
  and python text substitutions, against CLAUDE.md; one perl edit mangled `store/src/db-types.ts`,
  which it restored with `git show HEAD:<path> > file` and redid with Edit. Results were checked
  with diffs and the suites are green.
- **Test idea**: the PreToolUse hook refusing `sed -i` / `perl -i` / python file rewrites on repo
  files (logged since spec 020 F-03, also spec 021 F-03) — third occurrence; it should be built.

## F-05 ba-e2e pending-feedback order flakes, 2026-10-13

- **Symptom**: `mcp-server/tests/ba-e2e.test.ts:339` once got the `confirm` review before the
  `reject` one in `get_pending_feedback` (commit hook, fast tier); five runs alone passed.
- **Cause (likely)**: the reviews are ordered by id; two UUIDv7 ids made in the same millisecond
  are not ordered by creation (`…-7000-ae3a…` vs `…-7004-a080…`).
- **Test idea**: order pending feedback by `created_at, id` (or make `newId` monotonic within a
  millisecond) and assert it with two reviews in the same tick.

## F-06 SC-008 trace-overhead timing check fails under load, 2026-10-13

- **Symptom**: in the full `pnpm test` before interim merge 2, `trace-map-run.e2e.test.ts` SC-008
  measured 660 ms (off) vs 1322 ms (standard), +100 %; alone it measured −0.2 %. The run before
  (R-42 close-out) measured −24 %.
- **Cause (likely)**: wall-clock medians of a few steps on a loaded machine (the Salvage
  dashboard and other suites were running).
- **Test idea**: move SC-008 to the `perf`-style isolated run like the dashboard's wall-clock
  tests, or compare more steps and use a ratio of medians with a warm-up.

## F-03 The design's Console glossary text, 2026-10-13

- The glossary entry "status codes" still explains `[ OK ]`, `[RUN.]` … (content, not markup). It
  is rewritten with the other glossary entries in M6 (T041).
