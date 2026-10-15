# Findings: spec 024 (R-33 access-dependent content, P1)

What came up while building P1 (owner scope 2026-10-14: attributes, CSV import, per-persona
variants with seen / not seen). Each finding has a test or eval idea.

## F-01 Persona variants are screen revisions, not their own axis (US2.4), 2026-10-14

- **What**: a persona that sees different content on a shared screen gets a different fingerprint,
  so the pipeline records a new state and, through `record-state`, a new observed revision
  (`screen_rev`) of the shared screen. The access model reads it correctly (newest state per
  persona), but the screen's History mixes "the portal changed" with "another persona sees more".
  When the difference changes the cluster, the variant becomes a separate screen and shows as
  "not reached" instead of "not seen" (the roadmap's open question).
- **Next**: US2.4 (revisions per persona variant) needs a pipeline change in `record-state`;
  waits for owner review with the diff UI (US3.1).
- **Test idea**: a proving-ground page with one premium-only button, scanned by two personas;
  assert one screen, two variants, and History labelling the second state as a persona variant.

## F-02 A renamed element counts as two keys, 2026-10-14

- **What**: element keys are `role "name"`, so a price or a count in an accessible name shows as
  "seen by A, not seen by B" twice instead of "same element, different text".
- **Next**: the diff view (US3.1) should pair keys by role and position; until then the BA note
  in `ba-practice/references/business-rules.md` asks for a question rather than a rule.
- **Eval idea**: a fixture pair where only a price differs; the BA must not write an access rule.

## F-03 "Not reached" also means "ran out of budget", 2026-10-14

- **What**: a completed map run that hit its step budget never reached some screens; the matrix
  marks those screens access-dependent through `not_reached`. Correct as a coverage fact, noisy as
  an access signal.
- **Next**: when sampling (US4) lands, mark a persona's run as budget-limited and leave such
  personas out of `not_reached`, or show them apart.
- **Test idea**: a fixture run with `steps_used = max_steps`: the persona is listed separately.

## F-04 `personas:import` writes one environment per import, 2026-10-14

- **What**: the plan said "for each environment of the portal". The vault is one database per
  environment (`data/<env>.sqlite`), so one import writes one (`--env`, default
  `PATHFINDER_ENV` / sandbox). A second environment is a second import of the same file
  (idempotent).
- **Test idea**: none needed beyond the existing idempotence test; documented in personas/README.

## F-05 `pnpm typecheck` failed once with no error, then passed, 2026-10-14

- **What**: the first `pnpm typecheck` of the session ended with `"pnpm recursive exec" failed in
  …/packages/config` and no TypeScript error; `tsc` in that package and every rerun passed. Likely
  a concurrent `pnpm` process (the commit hook or an install) holding the workspace. Logged per
  memory `log-every-bug-for-evals`.
- **Test idea**: none; if it repeats, capture the exit code of `pnpm --filter ./packages/* exec`.

## F-06 Two implementations of the persona `extends` merge, 2026-10-14

- **What**: the dashboard's Settings resolves `attributes` (and `auth`) through `extends` in
  Python (`queries_settings._layers`), next to the TypeScript loader. They agree today; a change
  to the loader's merge rules would not reach the dashboard.
- **Next**: either a shared fixture checked by both (as for the access model) or the chat service
  serving resolved personas.
- **Owner decision 2026-10-15**: one shared fixture both sides test against.
- **Test idea**: one YAML tree with nested mixins in `tests/fixtures`, loaded by both sides.

## F-07 T001 committed without the slow tier (process slip), 2026-10-14

- **What**: T001 changed `mcp-server/src/runtime/hooks.ts` (hooks see the persona attributes)
  and was committed after the fast tier only; CLAUDE.md asks for `pnpm test:slow` before a
  `runtime/**` commit. The slow tier ran afterwards on the branch (result in the close-out).
- **Test idea**: the commit hook could name the slow-tier paths it saw in the staged diff and
  print a reminder (it cannot run the slow tier itself).

## F-08 Access matrix size for the BA, 2026-10-14

- **What**: `get_access_matrix` lists every screen with its variants (only access-dependent
  elements). On a portal with hundreds of screens and many personas it can be large; not
  measured. Per memory `token-issues-to-r24`, a measured problem becomes an R-24 entry.
- **Test idea**: measure on the liveinsurer or reference portal once two personas scanned it.

## F-09 Gate LO-02 (slow micro-frontend) failed under parallel load, 2026-10-14

- **What**: in the branch's `pnpm test:slow`, `gates/tests/shop.test.ts` "LO-02 a slow
  micro-frontend bundle is waited for" failed: no mount reported `filled` with `waited_ms > 100`.
  The run overlapped two agents' dashboard suites, ui:check and the chat e2e (heavy CPU). Run
  alone right after, the file passed (20 passed, 1 skipped). Spec 024 changes nothing in settle or
  mounts. Like F-06@023, a timing-sensitive gate.
- **Next**: if it repeats outside load, isolate it like the perf tests (owner's choice for the
  F-01/F-05/F-06 flakes, 2026-10-13), or make the bundle delay larger than the settle poll.
- **Owner decision 2026-10-15**: isolate it (and F-06@023's golden lock) in the serial pass,
  like the perf tests.
- **Test idea**: run the shop gates with a CPU hog (`stress -c <cores>`) to reproduce.

## Close-out review (code-reviewer, G-31), 2026-10-14

| # | File | Guideline | Finding | Outcome |
|---|---|---|---|---|
| 1 | apps/dashboard/CLAUDE.md | G-30 | Layout missed `web/access.py`, `views_access.py`, `queries_access.py` | fixed |
| 2 | config/CLAUDE.md | G-30 | persona `attributes` not mentioned | fixed |
| 3 | mcp-server services/ba/access.ts | G-20 | `Variant`, `ScreenAccess`, `elementKey` exported but unused outside | fixed (not exported) |
| 4 | mcp-server services/ba/reads.ts | G-19 | over-long pointer comment | fixed |
| 5 | dashboard web/states.py `state_detail` | G-04 | 8 parameters | rejected: unchanged on master, FastAPI query parameters |
| 6 | services/ba/access.ts, runs.ts | G-05 | two `personaAttributes` helpers over `config_snapshot` (newest run per persona vs one run) | deferred: different questions; share a parser in `common.ts` when a third reader appears |
| 7 | runtime/hooks.ts | G-27 | hooks now get real persona attributes (runtime change) | covered by the branch's `pnpm test:slow` run (see F-07) |
