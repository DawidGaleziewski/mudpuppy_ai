# Tasks: Crawler hooks and URL lists per portal (spec 023, R-53)

Model tags per memory `model-split-per-task`. Commit per group with the task ids.

## Group 1 — URL lists (P1, US3)

- [x] T001 [opus] `safety/src/url-lists.ts`: entry kinds (path glob, URL glob, `/regex/`), `matchUrlEntry`, `checkUrlLists(url, lists)` with the refusal rule text; unit tests (every kind, case, query, invalid regex). As built: the entry rules (`urlEntryKind`, `urlEntryProblem`) live in `config/src/url-entry.ts` (safety imports config, not the other way); a slash-wrapped entry is a regex only when its body has a regex character, so `/konto/` stays a path.
- [x] T002 [opus] `config` schema: `urls { allowed?, disallowed? }` with regex validation; remove `scope.allowed_paths`, `denylist` `path:`/`url:` entries; `timeouts`; schema tests. As built: `scope` is strict now (a leftover `allowed_paths` fails to load instead of widening the scan); `mfe_wait_ms` / `client_redirect_wait_ms` stay in `scope` as the portal defaults, `timeouts` overrides them (no move, less churn).
- [x] T003 [opus] `safety/src/scope.ts`: `RunScope.url_lists` (portal, persona, focus): a URL must pass every set; `narrowScope(…, portalUrls)`; `focusScope` adds a `focus` set and refuses unusable entries; denylist keeps rule ids only (dead `path:`/`url:` branches removed).
- [x] T004 [sonnet] migrate every portal YAML, the chat new-portal template, gate/test fixtures, `docs/portal-config.md`; `pnpm portal:check` over all; dashboard Settings "Crawl rules" reads `urls`. Also the Kiro create-portal skill template and the glossary entry.
- [x] T005 [opus] links excluded by the lists → skipped frontier item "excluded by rule <entry>" (out_of_scope), never enqueued (the existing gate path; no new edge row); gates F-02@023 (SC-002) and F-03@023 (SC-003).

## Group 2 — Hooks (P2, US1, US2)

- [x] T006 [opus] package `@pathfinder/hooks`: `types.ts`, `load.ts`, `run.ts` (matching, order, 10 s default, failure capture, `trace`/`onRun` callbacks); unit tests with a fixture hooks file and a fake browser.
- [x] T007 [opus] config schema `hooks:` (point, fn, match, timeout_ms); a mapped `fn` without `hooks.ts` or not exported, or a file that does not load → `CONFIG_INVALID` at `start_run` (`services/run-hooks.ts`).
- [x] T008 [opus] pipeline wiring (`runtime/hooks.ts`): `onRunStart` after the session opens, `onBeforePageLoad` before the navigate gate (`{url}` faces the gate, `{skip}` settles queued items and refuses), `onPageLoad` at the start of `processPage` (navigate and act), `onBeforeClickAction` before perform (`skip` / `waitFor`), `onRunEnd` before the session closes. Each run a `hook` phase span + decision note. Golden snapshots unchanged: with no hooks nothing runs.
- [x] T009 [opus] `hook:patched` decision note on the observed state (BA run evidence lists decisions); crawler brief: never write hooks, suggest one by open question; BA brief: never document a patch.
- [x] T010 [opus] proving ground `/__test/hook-gate`; gates F-01@023 (SC-001, with and without the hook) and F-04@023 (SC-005: a throwing hook, run still running, failure recorded).

## Group 3 — Timeouts, export, dashboard (P3, US4, US5, US2.3)

- [x] T011 [sonnet] `pageTimeouts(timeouts, scope, url)` (safety) used by settle, navigation, micro-frontend and client-redirect waits when the portal sets `timeouts`; `page_timeouts` trace event; tests.
- [x] T012 [sonnet] dashboard scan page: "Portal hooks" in the summary from the `hook:*` decision notes (point, fn, runs, outcomes, pages patched); test.
- [x] T013 [sonnet] export-fork ships the `hooks` package; `portals/` is field-owned, so field hooks files are written in the field.
- [x] T014 [haiku] `docs/portal-config.md` sections for `urls`, `hooks`, `timeouts`; glossary entry `portal-hook`, `portal-scope` updated; glossary sync.

## Close-out

- [ ] T015 [opus] full `pnpm test` (crawler) + every app suite; code-reviewer; roadmap R-53; changelog; merge; tag; export-fork export
