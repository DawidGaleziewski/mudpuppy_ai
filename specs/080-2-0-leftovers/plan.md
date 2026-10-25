# Plan: spec 080

Order and grouping are in `tasks.md`. Design notes per requirement:

- **FR-001** `services/ba/process-pass-check.ts` beside the rules and data checks (same shape:
  read the session's states and snapshots, read the live records, return one warning). A login
  wall is read from the stored ARIA snapshot's `main`; triggers from `transitions.action_json`
  (`accessible_name`, the container locator; menus excluded as in `shared-button.ts`); cited when
  a live process record's latest revision has `doc_evidence` on the state (state, screen region)
  or on a transition into it.
- **FR-002** in `hintsOf`: after the controls are known, a free hint takes the one control whose
  label tokens (words of 2+ letters, a bracketed abbreviation) it contains as whole words.
- **FR-003** store `input-sweeps.ts` (pure planning from `attribute_writes`, `forms.fields_json`
  min/max, `journeyPath`), mcp-server `sweep-portal.ts` (drives `replay`, compares the landing's
  `shown` attributes, halves gaps), `pnpm model:sweep`. Edges as decision notes `input_band` on
  the probe run. Rules pass: a new candidate source.
- **FR-004** `walkOf`: the last observation with `via` login/relogin in the journey at or before
  the visit's seq becomes the start; presses after it only.
- **FR-005** `Visit.manualReview` from an instance counter (like the A/B arm picker), an `html`
  effect on `/moje-polisy`.
- **FR-006** `apps/chat/src/sample-scans.ts`: `samplePersonas` from `@mudpuppy/config`, the
  `requestScan` checks per persona, finished runs since `batch_started_at`.
- **FR-007** migration 0053; `start_session` stores `scope_id`; `record-checks.ts` maps each
  evidence target to its states (the export's `evidenceStates`) and refuses off-scope ones.
- **FR-009** `services/list-cap.ts`, called in `getNextFrontierItem`'s settle loop after the
  same-target and shared-button inferences.
- **FR-010** `services/drain-frontier.ts` + tool; uses `act` per item through the runtime index.
- **FR-011** `BrowserSession` waits briefly for a script-written window's load, reads title and
  ARIA snapshot, then closes it; `popups.ts` stores the text as evidence.
- **FR-012/013** gates in `bank.test.ts` and a new `scars-*.test.ts` case; scar `sc25-date-window.ts`.
