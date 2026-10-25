# Spec 080: 2.0 leftovers and the crawler bundle (R-97, R-98, R-99, R-35 with R-58 and R-80)

**Branch:** `feature/080-2-0-leftovers` · **Owner (2026-10-25):** "R-97 do 1, 2, 4; R-98 do 1, 5,
4 (if it is related we can do it despite being part of a frozen one, update the frozen one after);
R-99 1, 5; R-35: ok do it. Leave frozen ones alone." Built overnight without questions; the
defaults are D-1… in `findings.md` for the owner's review. **No paid runs** (no budget given):
eval measurement and R-99 (5) are prepared, not run.

## Requirements

### R-97 (spec 045 leftovers)

- **FR-001 Login-wall processes (R-97 (1)).** When the BA records the `processes` or the
  `synthesis` pass, `record_pass` warns about every screen of the session behind a login wall
  that a body link or button reaches by a name of its own and that no live `process` record
  cites: "a process whose first screen is a login wall is still a process" (P05 "Przedłuż
  polisę"). A login wall: the page's `main` holds a login prompt (a link, button or field named
  like log in / sign in / password, in Polish, English, German, French or Spanish) and at most five
  controls. Menu, banner and footer links are not triggers (the menu reaches areas, the body
  offers actions; D-1).
- **FR-002 A hint names its control (R-97 (2)).** A hint tied to no control by position is tied to
  the control whose label it names (a word of the label, an abbreviation in brackets: "AC" of
  "OC + Autocasco (AC)"), so the rules warning asks for that control and `isStated` needs its
  label. Several controls named equally: as before, all of the form's controls.
- **FR-003 Input sweeps with band search (R-97 (4)).** For a recorded journey that typed a
  number into a field with a minimum and a maximum and later reached a page that shows values
  (`label: value`), the headless driver replays the journey with that number spread over the
  range (minimum, 10 %, 25 %, 50 %, maximum) and, between two neighbouring values whose pages show
  different values, halves the gap until the boundary is two neighbouring numbers. Each replay is
  a probe run; each band edge is a decision note (`input_band`) on the run that found it.
  `pnpm model:sweep <portal>` runs it within the replay budget; the rules pass lists each edge no
  business rule states (FR-001 of spec 045, new source `sweep`). The reference eval gets an
  opt-in `--sweep-inputs` condition (a new baseline is the owner's call, paid).

### R-98 (spec 046 leftovers)

- **FR-004 Replays after a login (R-98 (1)).** A visit of a run that logged in replays from the
  last login landing at or before it (the page the login opened, its own URL), with only the
  presses after it, never from a login page while already logged in (F-03@046).
- **FR-005 Scenario `overlapping-rule` (R-98 (5), R-91 (5)).** On the reference portal, a standard
  customer's "Moje polisy" is, on every third load of the instance, a manual-review page instead
  (deterministic, no cookie: nothing a person can see decides it). Rule R5's three replays then
  alternate with no separating flag → `nondeterministic`. An e2e test like the persona-variant
  and A/B ones; the switchboard marks it built.
- **FR-006 Batch scans of a persona sample from the chat (R-98 (4), R-33 US4.2).** A chat tool
  `request_sample_scans` proposes the portal's persona sample (one per attribute combination,
  pairs differing in one attribute, as `pnpm personas:sample`), checks every chosen persona
  (file, credentials, environment) before the first scan, and hands off the next one each call:
  the personas of the sample without a finished scan in that environment since the batch began.
  When none is left, it says the batch is complete and points to the Access page. One scan at a
  time, as today.

### R-99 (R-32 acceptance run leftovers)

- **FR-007 A scoped session cites only in-scope evidence (R-99 (1)).** `start_session` takes the
  process scope a documentation request names (`scope_id`); a record written in a scoped session
  that cites a network call, an action, a form, a transition or a state off the scope's states is
  refused (`OUT_OF_SCOPE`, the targets named). The documentation brief passes the scope id and
  says how to cite an "every page" NFR (one in-scope call).
- **FR-008 R-99 (5) prepared.** SC-007/SC-008 and a logged-in scan through the chat need a paid
  run: the steps are written down in `findings.md`; the budget is the owner's question.

### R-35 (crawler bundle, with R-58's batch drain and R-80 (2), (4))

- **FR-009 A stopping rule for lists and pagination (F-17@015, parameter links F-08@019).** A link
  item whose route template the run already visited under `list_cap` different addresses (default
  5, portal `scope.max_items_per_template`), all of them the same state, is settled
  `budget_reached` (`list_cap: …`) when handed out, never given to the agent. A template whose
  pages differ (two or more states), or whose parameter the portal model holds as `identity`
  (2.0's parameter roles), is never capped (D-2).
- **FR-010 Batch drain (R-58, decided here: D-3).** A map run's tool `drain_frontier` visits up to
  ten pending read-only link items whose route template the run already visited, in one call,
  each gated and recorded like `act`; it stops at the first one that reaches a new state and
  returns what it did. Items to new templates, buttons and forms stay the agent's.
- **FR-011 Script-written pop-ups (LO-27, option (b) of F-09@031, D-4).** A window a script writes
  into (`about:blank`, no URL) is read before it is closed: its title and text are kept as an
  evidence file and a decision note `popup_written` on the action, which the BA can cite. Not a
  state of its own (option (a) needs a second-page pipeline; it stays on R-35).
- **FR-012 A gate for shared menu buttons (R-80 (2)).** On the bank estate: the banner's "Wyloguj"
  clicked once, the same button on another page is settled `shared_button` without a turn.
- **FR-013 A date form without server state (R-80 (4), SC-25).** A scar: a date field with no
  limits whose server refuses a date more than a year away; the `date-range` probe names SC-25
  and its gate records both tries as validation.

## Out of scope

- Paid eval trials and R-99 (5) (no budget). Promoting a baseline with `--sweep-inputs`.
- Every other roadmap row (R-33, R-58, R-80 only get their status text updated).

## Validation

- [x] Unit: login-wall candidates and their warning; a hint tied to the control it names.
- [x] Unit: band search (`findBands`); the rules pass lists unstated band edges. The planner is
      covered by the e2e only (review row 6).
- [x] e2e: a sweep on the reference portal finds the engine bands' edges (1400 / 1401, 2000 / 2001).
- [x] Unit: a login journey's replay starts at the landing page.
- [x] e2e: scenario overlapping-rule → `nondeterministic`.
- [x] Unit: `request_sample_scans` checks, hands off the next persona, completes.
- [x] Unit: a scoped session refuses an off-scope network call; the brief passes the scope.
- [x] Gate and e2e: list cap and `drain_frontier` on the mock portal (e2e; no shop gate: whether
      the shop's catalogue pages are one screen was not checked), `popup_written` (F-04@080), bank shared
      button (F-05@080), SC-25.
- [x] Slow tier and every suite green; no paid run.
