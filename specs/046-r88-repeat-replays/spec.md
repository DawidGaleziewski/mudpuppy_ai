# Spec 046: repeat replays for rules R4 and R5 (R-88, with R-33's leftovers and LO-35)

**Branch:** `feature/046-r88-repeat-replays` · **Owner (2026-10-21):** "Put it on the roadmap";
order of 2026-10-22: after R-89; R-33's leftovers built to the spec defaults, reviewed after.

## Problem

2.0 has rules R4 (persona variant) and R5 (A/B test), but nothing runs their replays: every
deviation that reaches R4 or R5 waits in `waiting_test` for ever, nothing fills R5's
`separatingFlag`, so an A/B finding from the rules never names its cookie (F-54@039), and the
reference portal has neither a working login nor the `persona-variant` and `ab-test` scenarios.

## Requirements

- **FR-001 Login on the reference portal.** `/logowanie` accepts two test users (a standard and
  a premium customer, obviously fake passwords), sets a session cookie and opens `/moje-polisy`
  with the user's policies; `/moje-polisy/przedluz` shows the renewal form when logged in. Guests
  see the login wall as before (the guest ground truth is unchanged). Personas `klient` and
  `klient-premium` for the reference portal.
- **FR-002 Scenario `persona-variant`.** The premium customer sees one more button on
  `/moje-polisy` ("Oferta dla klientów premium"); the standard customer does not.
- **FR-003 Scenario `ab-test`.** The home page's banner text depends on the cookie `ab_baner`
  (`A` or `B`), given to a new session in turn (A, B, A, …: half of the sessions, deterministic so
  tests can rely on it).
- **FR-004 R4 replays.** A deviation waiting on R4 (audiences differ) is replayed once with the
  reference visit's persona and path and once with the deviating visit's; each landing on its own
  visit's state is `context_variant` (derived). Otherwise R5 runs.
- **FR-005 R5 replays.** A deviation waiting on R5 is replayed three times with the deviating
  visit's persona and path. Outcomes all the same: no randomness, the deviation becomes
  `ambiguous` for the agent. Alternating: a flag (cookie or web storage key) whose value is the
  same within each outcome and differs between them is the separating flag: `ab_test` for a
  person, "separated by cookie:NAME"; no such flag: `nondeterministic`.
- **FR-006 Flags in replays.** A probe run (the headless driver) records every cookie and web
  storage key of its session on each observation, besides the portal's declared experiment flags,
  so R5 can find a flag nobody declared.
- **FR-007 Logged-in replays.** A replay plan logs in first when the journey it repeats was
  logged in.
- **FR-008 Scenarios as e2e tests** on the reference portal: persona variant → `context_variant`;
  A/B → `ab_test` naming `cookie:ab_baner`. Closes R-91's last scenario (Persona variant and A/B).
- **FR-009 R-33 leftovers.** F-03: a run that ended on its step budget is "budget-limited"; its
  persona is left out of "not reached" in the access read model and listed apart. US4: `pnpm
  personas:sample <portal>` proposes a sample of the portal's personas (one per distinct attribute
  combination, plus pairs differing in exactly one attribute). US2.4 (revisions per persona
  variant) is covered by 2.0's model (members and `context_variant`): checked, not rebuilt.
- **FR-010 LO-35.** Where the shop's random hero banner (A or B) is a known gap, it becomes a gate
  if the replays explain it as an A/B test without a new screen.

## Out of scope

- Dashboard UI for the sample and batch scans (the dashboard moves to React next, R-96).
- Batch scans from the chat (US4.2): the sample command prints the persona ids to scan.

## Validation

- [x] Reference portal tests: login, both scenarios, guest ground truth unchanged.
- [x] Store unit tests: the separating flag; R4 and R5 plans and verdicts through the e2e tests.
- [x] e2e: persona variant and A/B scenarios end in the expected hypotheses.
- [x] Access model: a budget-limited persona is not "not reached"; sample proposal tests.
