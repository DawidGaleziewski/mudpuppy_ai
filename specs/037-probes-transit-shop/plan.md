# Plan 037 (R-76, R-62 (5), R-55 (2))

- **FR-007 S07.** `act.ts` `reachState`: after the deep link settles, if `findAgain` misses the
  action and `rs.pathTo` holds a path with steps for the state, call `returnToState` and remember
  the state in `RunState.replayOnly`; `reachState` replays such states directly. Gate F-11@031
  (`gates/tests/shop.test.ts`) `gap` → `gate`, `eval-cases.yaml` tier note.
- **FR-003 offline.** `fault.ts` `armFault('offline')`: besides `context.setOffline(true)`, a page
  route aborts the first step request with `internetdisconnected` (page routes run before the
  request gate's context route), and `hit` is set from that abort or a `requestfailed`. Gate: an
  `offline` probe on SC-04 lands on a technical state of `/sc04/…` (fails on master: no hit).
- **FR-001 radio group label.** `crawler/src/autofill.ts`: `readForm` adds `groupLabel` (legend /
  radiogroup name, the `forms.ts` rule) to radios; `readNativeMessages` names a radio's message by
  its group label and keeps one per group. `probes` `ProbeField.groupLabel`, `nameOf` prefers it.
  Unit tests on the "Zakres" markup.
- **FR-002 revealed fields.** `probes`: `revealedTries(branch, ctx)` (pure) plans the validation
  probes on the fields a branch revealed and returns tries keyed `<branch key>/<try key>` whose
  `writes` are the branch's and whose new `after` writes (indexes of the re-read form) apply after
  the revealed fields got their test values. `probe.ts` `press` returns the revealed fields and
  applies `after`; `probe-form.ts` queues the revealed tries after a branch outcome (kept in
  `rs.probing` across calls), counted in the step budget. Probes unit test; gate on the reference
  calculator through `probe_form` is not possible in gates (no reference portal there), so a scar
  SC-24 (an option revealing a required number box with limits) carries the gate.
- **FR-004…FR-006 transit zones.** `RunState.transit` (hosts and captured pages of the current
  login). `gate.ts` `navigationPolicy`: while `rs.loggingIn`, a refusal whose rule is
  `scope:domain` or `<where>.allowed` is waived and the host noted. `login.ts`: `verdict` ignores a
  URL-only success on a transit host; `awaitVerdict`'s condition captures each new settled
  document on a transit host; the page before typing is captured when on one. Migration 0029
  `transit_pages` (run_id, login_seq, seq, url, host, title, evidence_ref, screenshot_ref,
  created_at); `services/transit.ts` stores them; `login-step.ts` returns `transit_hosts` and
  `transit_pages` and adds them to the decision note. Gates in `scars-login.test.ts`: a focused run
  (`only_domains: [127.0.0.1]`, `only_paths: [/sc16/dashboard*]`) logs in through SC-16 and records
  the IdP pages as transit; a URL-only success portal (`portals/scar-maker-sso-url`) lands on the
  dashboard, not the IdP's waiting page.
- Close-out: slow tier, reference trial, code review, findings, roadmap, glossary, changelog.

## Decisions taken without the owner (autonomous run; listed for review)

- D-1 Transit pages are not states (a new `state_kind` needs a rebuild of `states`, and they must
  not enter fingerprints, screens or the BA's state lists) and get **no table of their own**
  either: they are kept on the landing visit's hops (`page_visits.hops_json`), next to the chain
  they belong to, as optional `NavigationHop` fields (`transit`, `title`, `evidence_ref`,
  `screenshot_ref`). No migration; the planned 0029 `transit_pages` was dropped (T005).
- D-2 "Learned" = every host other than the portal's base host the browser enters while `login`
  runs (from the login URL to the verdict), not only after submit: the redirect to the provider
  happens before submit.
- D-3 A success **text** on a transit host still counts (a portal may land on another host);
  only a URL-only success waits.
- D-4 S07 replays only after the deep link missed the element (no extra replay for states a deep
  link reaches fine).
