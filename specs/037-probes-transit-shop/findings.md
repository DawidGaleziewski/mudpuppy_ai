# Findings 037 (R-76, R-62 (5), R-55 (2))

| Id | Found | What | Cause | Status | Test / eval idea |
|---|---|---|---|---|---|
| F-05 | 2026-10-18, T009 reference trial `2026-10-18T13-03-10-082Z` | `rules` 52.9 % (baseline 70.6, the R-73 trial 58.8): flagged as a regression | the BA's rule records; nothing on this branch touches the BA or the rule matcher. 9 of 17 vs 10 of 17 in the last trial | open: BA spread (R-39 noted the same range); not promoted | rerun 3 trials before reading a rules change; the R-47 judge for rules would replace the lenient matcher |
| F-04 | 2026-10-18, T009 reference trial | `export_extra_steps` 1 again (0 in the R-73 trial): PROC-001's export starts at `/` | the BA wrote that PROC-001 **contains** SCR-001 (the home page), so spec 036's "start at the first contained screen" keeps `/` as step 1 | open: BA judgement; the export follows the record | eval check: a process record that contains the portal's start page while its trace's first form is elsewhere; or BA guidance "a process starts at its first own screen, not the page the user came from" |
| F-03 | 2026-10-18, T009 | The commit hook failed the docs commit twice: the glossary test pins the entry ids and their count, and a `--write` in the same shell command as `git commit` runs after the hook (the hook checks first) | the hook is a PreToolUse check on the whole command | fixed (EXPECTED_IDS + count, glossary written in its own command) | process slip; none |
| F-02 | 2026-10-18, T004 | `probe-form.ts` went to 404 lines and `probeStep` / `readNativeMessages` over complexity 15 with the new queue and group naming | features added in place | fixed: `runTries`, `probe-records.ts`, `pfMessageField` (637c694) | lint warnings count compared before and after each task |
| F-01 | 2026-10-18, T002 | Claude appended to `eval-cases.yaml` with a shell heredoc; the no-script-edits hook blocked it | habit; CLAUDE.md says Edit tool only | redone with Edit | process slip; none |

## Close-out review: feature/037-probes-transit-shop (2026-10-18)

| # | File:line | Guideline | Finding | Change | Size | Outcome |
| - | --------- | --------- | ------- | ------ | ---- | ------- |
| 1 | apps/crawler/packages/mcp-server/src/runtime/transit.ts | G-18, G-25 | the pure transit helpers (`noteHost`, `inTransit`, `loginScope`, `markTransitHops`) had no fast-tier test, only the SC-16 gates | `tests/transit.test.ts` (3 tests) | small | fixed |
| 2 | apps/crawler/packages/crawler/src/autofill.ts:104 | G-03, G-06 | the in-page `readForm` arrow is at complexity 30 (already over 15 on master; the branch adds the group label); serialised into the page, so a split needs more in-page helpers | none | large | deferred: split `readForm` into pf-prefixed in-page helpers |
| 3 | apps/crawler/packages/crawler/src/test-values.ts:139 | G-03 | `testValueFor` complexity 30 | none | small | rejected: pre-existing, function untouched |
| 4 | apps/crawler/packages/mcp-server/src/runtime/login.ts:27, :153 | G-03 | nested ternaries in `list` and `verdict` | none | small | rejected: pre-existing lines |
| 5 | apps/crawler/packages/mcp-server/CLAUDE.md | G-30 | 122 lines, over the ~60-line note size; the branch adds 8 accurate lines | none | large | deferred: a notes trim |

Checks after fixes: typecheck ✓ lint ✓ (641 warnings, 0 errors) test:fast ✓; slow tier green before the review (e2e 59, gates 169, perf 2; the review only added a fast test).
Summary: 5 findings, 1 fixed, 2 deferred, 2 rejected.
