# Plan 036 (R-73)

- **FR-001 clock.** `crawler/src/clock.ts` exports `monotonicNow()` (`performance.now()`), the
  pattern `mcp-server/.../stop.ts` already uses. It becomes the default clock of
  `trackNetworkActivity` (and `session.ts` passes it), of `condition-wait.ts` `realClock`, and of the
  comparisons in `stabilizer.ts`, `mounts.ts`, `client-redirect.ts`; the in-page loop of
  `fix-plugins/.../wait-for-mount.ts` uses the page's `performance.now()`. Every timestamp a wait
  compares then comes from one clock (`login.ts`, `settle.ts` read the tracker into
  `waitForCondition`). Record timestamps (`ids.ts`, evidence, obstacles `at`) stay wall-clock. Test:
  `waitForCondition` with a fake clock and a wall clock that jumps ±6 s; the tracker's default clock
  is monotonic.
- **FR-004 unread answers.** In `trackNetworkActivity`, a request also ends on its `response`
  event (headers in) for non-document requests, so an unread body does not keep it in flight; a 204
  is recorded by the network recorder from `response`, not from `requestfinished`. Scar SC-21
  (fire-and-forget ping) in scar-maker with a gate.
- **FR-003 hidden controls.** `forms.ts` `readForm` skips controls with no client rects (the check
  `readDivForms` already does), except radios/checkboxes styled hidden behind a visible label
  (label has rects). Scar SC-22 (a box only hidden) with a gate.
- **FR-007 radio groups.** `forms.ts` folds radios of one `name` into one field (`type: radio`,
  label from the group's `legend` / `role=radiogroup` name / shared label, `options` with each
  option's label, `required` if any is). The field model and export already carry `options`.
  Store: same columns (no migration). Test on the reference portal's "Zakres" markup.
- **FR-002 blank page after submit.** Where the runtime names the observed state's route
  (`navigate`/`act` pipeline), an empty document (no body text, no elements) reached by a submit
  keeps the submitting page's route template and gets state kind `blank`; the export's
  destinations leave `blank` out and label it "Blank page". Scar SC-23 (submit → empty body).
- **FR-006 steps start at the start screen.** `docs/src/process-export/steps.ts` drops walked
  steps before the process's start screen.
- **FR-008 probe limits.** Owner Q1 (2026-10-18): raise the per-step budget to 24 (`config`
  `probe-budget.ts`, docs, glossary, design 11-map-runs). Then check that the boundary probe covers
  both limits of every number box of the reference calculator within 24.
- **FR-005** rerun the three browser files 20× in the fast tier after FR-001.
- Close-out: export quality eval on a new reference trial; slow tier; findings; roadmap.

## Open questions

- **Q1 (owner)** The per-step budget (12, R-69) is shared round-robin by 10 probe kinds, so the
  boundary probe gets one try per step. **Answered 2026-10-18: raise it to 24 (option A).**
