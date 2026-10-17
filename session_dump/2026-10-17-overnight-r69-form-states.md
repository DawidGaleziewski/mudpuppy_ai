# 2026-10-17 overnight: R-69 (1)–(3), spec 032 (form states, probes, owner-reviewed suite)

Branch `feature/032-r69-form-states-and-map-graph`. Not merged: the close-out (code-reviewer,
changelog, merge) waits for your answers below.

## Done

- **Spike (US1):** new scar SC-19, a three-step quote wizard drawn by script on one URL. Findings in
  `specs/032-form-states-probes/research.md`:
  - the steps already split by fingerprint;
  - a validation state showed as revision r2 of its screen (F-02);
  - an item of step 2 was unreachable once the browser was elsewhere (F-01).
- **Form steps:** each recorded state gets a numbered form step on its route (same form name, else
  ≥ 50 % of the same fields) and a kind (`main`, `validation`, `technical`). The fingerprint is
  unchanged, so existing stores keep their states. On a same-URL wizard, `act` goes back along the
  run's own path.
- **Probes:** new package `@pathfinder/probes` (catalogue + classifier) and the crawler tool
  `probe_form`:
  - one call per form step: the happy values first, then up to 12 tries;
  - outcomes next, branch, validation, technical, temporary or blocked, each with its state,
    messages (the browser's own included) and evidence;
  - technical faults simulated in the crawler's browser;
  - the limit must allow submitting forms (production included, O-M1);
  - a one-time code gives `blocked` (O-M2);
  - budget 12 per step and 60 per run (O-M4);
  - test data from the persona's `test_data`, with `missing_test_data` asked once in chat through
    the new `save_test_data` (O-M3).
- **Suite:** the BA tool `propose_probe_suite` builds a trace from chosen outcomes.
  - Review gets "Probe suites to approve": keep or drop variants, change expectations, approve or
    dismiss.
  - The chat service writes approved suites into `traces.yaml`, comments kept.
  - The trace driver runs them with faults, the same way every time.
- **Documentation:** BA skill and agent, crawler agent, orchestrator, contracts, portal-config,
  how-to-use, glossary. The screen page has "States of this step".
- **Gates:** four SC-19 cases (form steps, probes, missing test data, read-only limit) plus the
  suite case. Chat and dashboard tests cover the approval routes.

## Not done or not verified

- **SC-005 (live BA check) not run:** this session's MCP servers started before the change, so they
  lack `probe_form` and `propose_probe_suite`. It needs a new session: probe SC-19 with the crawler
  agent, then run the BA agent and check the candidates.
- Close-out: code-reviewer agent, changelog, merge, export-fork export.
- No screenshots / `ui:check` of the two new dashboard pieces (needs a running dashboard with a
  probing store).

## Questions for you (each has a default already built)

1. **Test data name.** The persona already had `trace_inputs` (label → value). I added
   `test_data`, merged with it (`test_data` wins). Keep both names, or rename `trace_inputs` to
   `test_data` everywhere (a migration of persona files)?
2. **Editing a suite in Review.** Built: drop variants and change their expectation. Adding variants
   or editing their steps happens in `traces.yaml` after approving. Do you want step editing in
   Review too?
3. **Probes in every map run?** The crawler agent is told to call `probe_form` once per form step
   after the happy path, so probing is on by default. `probes.per_run: 0` turns it off. Should it
   instead be off unless a scan asks for it (the design's "Probe forms" run type, R-66)?
4. **"Delay".** It holds the request until the page is observed (about 3 s quiet, at most 30 s),
   then drops it. So we record the waiting state, not what happens after 30 s. Enough?
5. **F-05:** a heading with a colon (Playwright writes it YAML-quoted) is dropped from the
   fingerprint. Fixing it changes state identity: every store gets new states on its next run. Fix
   now or with R-50?
6. **F-03:** autofill types "Test" into a field whose placeholder is `DD.MM.YYYY`. It is a small fix
   (a date from the mask) but it changes map runs on every portal. OK to do it here?
7. **Read-only "Next".** The wizard's "Next" passes the action gate as read (a pager word), so a
   read-only scan presses it. Probes now require `mutating` (F-10), but a plain map run still
   presses "Next" on read-only. Leave it, or classify a form's Next as mutating?

## Owner answers (2026-10-17) and what was done

1. **Rename everywhere:** done. `trace_inputs` → `test_data` in the schema, code, tests, persona
   files and mixins (`*-test-data.yaml`). A persona with the old key is refused with a rename note.
2. **Edit in Review:** done.
   - Steps are editable (values, drop, add a row), and a variant can be copied into a new one.
   - Save keeps the suite open; Approve saves, then approves.
   - Chat route `…/edit`.
3. **Probing only when asked** (answer: "map the portal first and see what it has; once it is
   marked we can start probing it"; marks in a special colour; screens show missing probes; each
   form may be marked). Built as spec 032 US5 (T026–T031):
   - a plain scan never probes (`probe_form` answers `PROBE_NOT_ASKED`);
   - table `marks` (migration 0024, the design's `mark` entity; only `probe` marks on form steps
     are written now, the other kinds wait for R-69 (5) / R-66);
   - screen page: orange **Probe** tag (the design's marker tag for a person's mark), coverage
     chips per probe group, "Mark for probing" / "Remove the mark" through the chat service
     (`POST|DELETE /portals/{p}/marks`);
   - Screens list: a "Form probes" column (Probe tag, "Probed · N", "Not probed") and a count in
     the page head;
   - chat: "probe the marked forms" → `request_scan` `probe_marked: true` → a probe scan that
     visits only the marked steps, does not drain the frontier and uses each mark once probed;
   - glossary: Probe mark, Probe scan.
4. **Delay:** kept as built.
5. **F-05 fixed** after the wipe:
   - Wiped: every portal's scans, documentation, chats, traces, evidence, exports, backups and
     logs (`pnpm portal:delete` per portal, then the portal-less leftovers).
   - Kept: the 6 test-user credentials (never copied).
6. **F-03 fixed:** date masks.
7. **A form's Next is now `mutating`:** pager words count as read only outside a form.

## Live check of all five test portals (2026-10-17, owner: "do a probe on forms we have mapped, all of them, check how it works")

- Mapped and documented each portal through the chat (the BA picked one process per portal on the
  owner's behalf; the shop map stopped early, F-16).
- Marked every form step and asked each chat for a probe scan, three rounds:
  - round 1: bank fine; three portals hung for good on the slow-request probe (F-17); the shop
    probed nothing (F-18);
  - round 2 after the fixes: no hangs, 70 outcomes, but only 7 of 33 steps reached (the map's
    depth limit, F-23; hash-route replay, F-24);
  - round 3 after those fixes: all four completed, no hangs, no depth refusals; 21 steps probed,
    155 outcomes (next, branch, validation, technical). The rest as designed or known: the shop
    ran out of its 60 probes per run (O-M4), scar-maker's three sign-in forms need test data
    (`missing_test_data`), the insurer's hash-route wizard F-24.
- Also fixed: Home's process links on a five-portal store (F-22), a dashboard test that asked the
  real chat service (F-26). Open: F-19, F-20, F-24, F-25 (spec findings).

## Commits

See `git log master..feature/032-r69-form-states-and-map-graph`.
