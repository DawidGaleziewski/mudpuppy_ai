# Spec 014: Eval baselines and gap ranking (R-29)

Branch `feature/014-r29-eval-baselines` · Created 2026-10-08 · Status: done, signed off 2026-10-09; merged, tag v1.0.13

**Input**: roadmap R-29, the R-25..R-27 leftovers (spec 009 T043, T051, SC-003–SC-005, SC-007;
findings F-16, F-17; `session_dump/2026-10-05-r25-r27-review.md`). User, 2026-10-08: "start 29
with sdd, split into opus sonnet, haiku … If there are outstanding questions wait for me. If not
continue as far as you can."

## Problem

The tier-2 eval (`pnpm eval`, spec 009 R-27) exists but no portal has a baseline, so nothing
measures whether a change makes the crawler and BA better or worse at the goal. The spec 009
success criteria SC-003 (no password anywhere after a logged-in agent run), SC-004 (bank coverage
and a re-login), SC-005 (shop coverage with the CAPTCHA widget, widget never acted on) and SC-007
(baseline + a second eval with no regression) were only checked by deterministic gates, never on
real agent runs. The eval result does not yet measure what those criteria ask for: crawl coverage
of ground-truth screens, a forced session expiry, password leaks in agent transcripts and exports,
or how much frontier the crawler left (F-17). The 20 known crawler gaps (R-28) have no order yet.

## Decisions already made (spec 009 review, 2026-10-05)

- Four baselines: `reference-insurer` guest, `proving-ground-shop` guest, `proving-ground-bank`
  client, `proving-ground-insurer` client; `--budget-usd 8` per agent; `--promote --force-promote`
  even when the crawler stops early (F-17).
- After each eval, ports 4010, 4100 and 4101 must be free (F-16).
- R-28's order comes from the user's ratings on the gap ranking page.

## User stories

### US1 The eval measures the spec 009 criteria — priority P1

`pnpm eval` adds to its result:

- **AS1.1** `scores.crawl_screens`: ground-truth screens the crawler's run recorded, matched by
  exact `route_template` against the run's states. Guest persona: the `guest_visible` screens
  (SC-005). Logged-in persona: the screens behind the login (`actor` not `guest`, SC-004).
  Tolerance applies like any score.
- **AS1.2** `checks.frontier_pending`: frontier items still pending at the end of the run (F-17).
- **AS1.3** `checks.password_hits`: occurrences of every password the vault holds for the
  portal (any persona; refs named like `pass`/`secret`/`pin`/`token`) in the eval workspace
  (store tables other than `credentials`, evidence, logs, unzipped traces), the SRS export of
  the BA's documentation, and both agents' transcripts (SC-003). A guest run is swept for the
  client's password too. A non-zero value makes the eval fail (exit 1), whatever the baseline,
  and is never promoted.
- **AS1.4** `checks.widget_actions`: actions the run executed inside the cross-origin widget host
  (`127.0.0.1:4101`) or on the widget iframe. Must be 0 (SC-005); non-zero fails the eval.
- **AS1.5** `--session-timeout <s>`: the eval starts the proving-ground estate with that idle
  timeout and records it in the result (`conditions.session_timeout_s`); refused (exit 2) when
  the estate is already running, since its timeout is unknown. The bank baseline uses it so a
  re-login happens (SC-004: `checks.relogins >= 1`).
- **AS1.6** `checks.ba_session_completed`, `crawler_completed` stay; the agent CLI session ids are
  recorded in `runs` so the transcripts can be found again.

### US2 First baselines — priority P1

- **AS2.1** One promoted `data/evals/<portal>/baseline.json` per portal, with a
  `tolerances.json` next to it.
- **AS2.2** A second eval per portal with no code change in between reports no regression
  beyond the tolerances (SC-007). Where it does, the cause is logged (agent variance vs a bug) and
  the tolerance or the code is changed, not the measurement.
- **AS2.3** Every problem met during the runs is logged in `findings.md` with a test/eval idea.

### US3 Spec 009 criteria rechecked on agent runs — priority P1

- **AS3.1** `specs/014-eval-baselines/criteria.md` states SC-003, SC-004, SC-005, SC-007 met or
  not met, with the eval result file each verdict rests on.

### US4 Gap ranking orders R-28 — priority P2 (**blocked on the user's ratings**)

- **AS4.1** The ratings on https://claude.ai/artifact/U5tVbfrdoD3rwvriT2resk (db collection
  `ratings`) are read into `specs/009-legacy-proving-ground/gap-ranking.md`.
- **AS4.2** R-28's text lists the gaps in that order.

## Functional requirements

- **FR-001** The new measures live in a pure module (`@pathfinder/gates`, `eval-checks.ts`) with
  unit tests; `scripts/eval-run.ts` only gathers the inputs (G-01, G-05).
- **FR-002** `EvalResult` gains optional `conditions` (`session_timeout_s`) and optional
  `runs.crawler_session`/`runs.ba_session_id` — old result files still parse.
- **FR-003** `compareEval` treats `password_hits > 0` and `widget_actions > 0` as regressions
  even without a baseline.
- **FR-004** The password sweep never prints the password; it reports counts per place only.
- **FR-005** No change to the crawler, BA server or agents in this item; findings that need one
  go to R-28 or a new roadmap note.

## Success criteria

- **SC-001** Four promoted baselines with tolerances, each from a run whose `password_hits` and
  `widget_actions` are 0.
- **SC-002** A second eval per portal shows no regression (or each regression is explained in
  findings and resolved).
- **SC-003** `criteria.md` gives a verdict per spec 009 criterion, backed by result files.
- **SC-004** (after the user rates) `gap-ranking.md` exists and R-28 follows it.

## Out of scope

The crawler's stopping rule (F-17, R-28), BA quality improvements (scores are measured, not
raised here), new portals.
