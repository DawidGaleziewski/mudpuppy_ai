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

## F-03 The design's Console glossary text, 2026-10-13

- The glossary entry "status codes" still explains `[ OK ]`, `[RUN.]` … (content, not markup). It
  is rewritten with the other glossary entries in M6 (T041).
