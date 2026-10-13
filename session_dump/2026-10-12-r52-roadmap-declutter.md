# Session dump 2026-10-12/13: R-52 roadmap declutter (spec 020), overnight

Branch `feature/020-r52-roadmap-declutter` (from master f16c0da). **Not merged**: merging waits for
the owner. Spec, plan (with "As built"), tasks, findings: `specs/020-roadmap-declutter/`.

## Done (committed)

| Group | Tasks | Commit | What |
| --- | --- | --- | --- |
| spec | — | 2c3a0bd | spec, plan, tasks |
| G1 evals (R-40) | T001–T006 | e46d390 | pure eval tests in the fast tier; outcome per agent; one eval at a time; own portal server, port refusal, verified stop |
| G2 fixes (R-36 part) | T007–T009 | aa1782a | radio/checkbox crops hold labels; re-issued action decision; revisions keep outside citations |
| G4 pan/zoom (R-19) | T014 | 666c391 | `diagram-zoom.js` on every dashboard diagram; browser-checked |
| G3 crawler (R-35 part) + docs | T010–T013, T015, T016 | 3cdc9ee | LO-08 gate; F-14 trace depth; pop-ups with a URL queued (gate F-04@020); frame-less pop-up request crash fixed; S08 linked; S11 analysed; roadmap; findings indexed |
| glossary | T017 part | a970aab | eval trial outcomes, pop-up frontier items |

Verification: `pnpm test` in `apps/crawler` 1935 passed / 2 skipped (exit 0); slow tier runs
during the night 121/122 and 121/123 (only failures: the chance-sensitive LO-35 gap reporting
"fixed", and the then-unindexed F-04@020 id, fixed); `apps/chat` 222, `packages/workflow` 27,
dashboard full suite and perf green, proving-ground backend green.

## Close-out

- Code-reviewer pass: 5 findings, 4 fixed, 1 deferred (diagram-zoom.js `attach` length, needs a
  JS test first); table in findings. `CHANGELOG.md` entry under [Unreleased]. Branch pushed.

## Open / for the owner

1. **Merge**: review and merge the branch (squash, tag) when happy.
2. **S08 link placement** (findings F-06): the insurer policy screen now links "Stary formularz
   zgłoszenia szkody". An estate change, not an obstacle fix; move it if another place fits better.
3. **LO-27** (findings F-04): only pop-ups with a URL are handled. The proving-ground pop-up is
   written by script into `about:blank`; observing it needs the session to watch a second page
   (a runtime design decision). Left in R-35.
4. **S11** (findings F-06): the crawler issues the unnamed image link; the agent does not take
   it. A prompt rule ("unnamed links are often icons, follow them") would be the R-35 experiment.
5. **LO-35** (resolved 2026-10-13, findings F-07): made deterministic; both variants seen, two
   clusters every time, so it stays a gap. The overnight "fixed" reports (two of three runs) were
   false: same variant drawn, or observed before the CMS text (spec 012 F-03).
10. Owner answers 2026-10-13: S08 link placement accepted; merge approved.
6. **T074**: the static review is redone (findings F-01); its live bypass-attempt run with the
   crawler agent still needs a session with the agent.
7. **F-13@004** (lenient rule match) was left out: the finding says it needs a decision, and the
   R-47 judge may replace the rule matcher.
8. Process slips logged (findings F-03): `sed -i` used once to tick checkboxes, a Python replace
   once on a throwaway probe file. Idea: a hook refusing `sed -i`.
9. Eval behaviour change: `pnpm eval` no longer reuses a running reference portal or estate; stop
   a dev server on 4010/4100/4101 before an eval.
