# Session dump 2026-10-10: R-28 crawler hardening (spec 015)

Branch `feature/015-r28-crawler-hardening` (pushed up to `0c67c2c`; `824428b` "update: commit
learning" is the user's own commit on top). Spec folder `specs/015-crawler-hardening/`
(spec, plan, research, data-model, contracts/tool-results.md, quickstart, tasks, findings).
Tasks T001–T036 ticked; T037 (evals) almost done; T038–T041 open. Not merged.

## What was built (commits)

- `6991fab` T001 spec/plan/tasks (opus/sonnet/haiku tags).
- `5061560` T002–T008: migration `0011_page_composition` (`state_observations.composition_json`),
  Zod `PageComposition`/`FoundBy`/`FieldNameSource` (core), `scope.mfe_wait_ms` (10000) and
  `scope.frame_depth` (3), trace events, dashboard model column, **fingerprint lock**
  `mcp-server/tests/fingerprint-stability.e2e.test.ts` (never update its snapshot to pass).
- `423785a` T009–T020, T024, T026, T032:
  - click signals: `crawler/src/click-signals.ts` (init script, listener WeakSet) +
    `clickables.ts` (detector, `selectClickables`, `locateClickable`); actions role `generic` with
    `found_by`, locators `path` then `text`; `act` never clicks a guess (absent/ambiguous).
  - frames: `crawler/src/frames.ts` (walk to depth 3, frame blocks APPENDED as
    `- iframe "<name|path>":`, frame-less pages byte-identical), `page-candidates.ts` (actions per
    document), `act` resolves `json.frame` via `frameByPath`; `chrome-error:` frame = failed.
  - `javascript:` postback links are clicks, not refused URLs (`action-gate.ts`).
  - forms: `crawler/src/forms.ts` (field naming + `name_source`, `label`; a field with name/id
    keeps it); `record-form.ts` schema accepts them.
  - network recorder: document POST + redirect chain (`kind: 'document'`), submit probe for
    multipart; session awaits `recorder.ready`.
  - resume rebuilds `depthByUrl` from actions' `page_url` (F-04@004).
  - mount wait: `crawler/src/mounts.ts`, used in mcp-server `settle.ts`; composition written.
  - gates promoted: LO-10, LO-18, LO-34 (shop), LO-02, LO-04, LO-11 (bank), LO-43 (insurer),
    F-04@004; `ActionInput` accepts `found_by`/`tag`/`frame`/`path`.
- `43d7249` T021–T036: `div` forms (`readDivForms`), format-only placeholder yields to nearby
  text, page result `frames` + `mounts_pending`, proving-ground test hook
  `/__test/bundle-delay?ms=` (cookie `pg_bundle_delay_ms`), gates LO-02 slow bundle, LO-11 legacy
  labels + React checkout, LO-18 date picker; crawler prompt (Procedure item 7), catalogue note,
  package CLAUDE.md notes, 5 glossary entries.
- `0c67c2c` eval/crawler fixes from the first bank eval: `frameRoutes` (framed screens count in
  `crawl_screens`, F-13), clickables must show something (F-14), autofill for `div`/`type=button`
  submits by submit words (`autofill.ts` `pfControlsFor`, F-15).

Slow tier green three times (last: 56 e2e, 138 gate tests). LO-35 is a chance flake (F-09, R-35).

## Uncommitted (commit with the close-out run; `gates/**` needs the slow tier)

- `apps/crawler/packages/gates/src/eval-checks.ts` + `tests/eval-checks.test.ts`: `routeKey`
  drops a query before comparing (F-18). Gate-tier test passes (14).
- `specs/015-crawler-hardening/findings.md`: eval table rows, F-16–F-19.
- `data/evals/*`: new result files; bank `baseline.json` promoted (+ `history/`). Commit them.
- NOT ours: `user_input/loose_ideas/readme.md` (user's edits) — leave it.

## Evals (T037), one at a time, `--budget-usd 8`

| Portal | Before | Now | Target | Notes |
| --- | --- | --- | --- | --- |
| bank (client, `--session-timeout 20`) | 4/11 | **10/11**, promoted | ≥ 8/11 ✔ | S11 `szczegoly.do` missing; terms 40 → 0 (BA skipped glossary, F-16) |
| shop (guest) | 3/6 | 4/6 | ≥ 5/6 ✘ | 214 pending, $9.34, pagination/product flood (F-17 → R-35) |
| insurer (client) | 4/6 | **5/6** (with F-18) | ≥ 5/6 ✔ | S07 claim confirmation reached; S08 legacy form not (F-19) |
| reference-insurer (guest) | 17/17 | **17/17**, no regression | no regression ✔ | `2026-10-09T21-56-49-833Z.json`, $4.84, crawler completed, 0 pending; constraints 83.7 → 95.9, fields 88.5 → 96.2, rules 31.3 → 81.3 (not promoted; consider promoting) |

password_hits 0 and widget_actions 0 in every run. Results: `data/evals/<portal>/2026-10-09T*.json`.

## Next steps (new session)

1. Reference eval is done (row above, logged in findings). T037 complete.
2. T038: verdicts SC-001–SC-006 in findings (SC-001 gates ✔; SC-002 bank ✔; SC-003 shop ✘ /
   insurer ✔; SC-004 reference ✔; SC-005 ✔; SC-006 fingerprint lock ✔ + reference 17/17).
3. T039 close-out: `pnpm test` (everything) in apps/crawler + chat + packages/workflow + dashboard
   + proving-ground backend; `code-reviewer` agent on the branch; `pnpm mutate` only if a kernel
   pure function changed (probably not). Then commit the uncommitted files above.
4. T040: roadmap R-28 → done, changelog skill (before merge). T041: merge only after the user's go.

## Open decisions for the user

- Keep the promoted bank baseline with `terms` 0 (F-16), or restore/re-run before R-39?
- Shop miss (F-17, frontier stopping rule for item lists/pagination): fold into R-28, or keep in
  R-35 as planned?

## Deferred / open findings (in findings.md)

F-08 `content_type` key collision (R-37), F-10 div form `submitted_via`, F-11 dropdown
`options_shown`, F-16 BA terms, F-17 shop budget, F-19 legacy insurer form unreached; mounts inside
frames not probed. Process slips F-01, F-07, F-12; also one findings entry appended via shell
heredoc (not the Edit tool) on 2026-10-09 — content correct.
