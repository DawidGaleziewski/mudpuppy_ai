# Spec 037: Probe leftovers, transit zones, shop S07 (R-76, R-62 (5), R-55 (2))

Branch `feature/037-probes-transit-shop` · 2026-10-18 · owner request (2026-10-18): "do these on
new branch: 76, 62, 55". Sources: spec 036 findings F-03, F-04; R-62 owner decision Q3
(`docs/discussions/r62-transit-zones.md` section 8); spec 031 F-11 (shop S07).

## Problem

- **R-76.** Probes start from the happy values. A required radio group's "nothing chosen" message
  is filed under one radio's label ("Tylko OC") instead of the group ("Zakres"), and the fields an
  option reveals ("Wartość pojazdu (zł)" on the AC branch) are filled with a test value but never
  probed, so the reference export misses 4 of 24 validation messages (83.3 %). The `offline` fault
  does not break a page-load form submit, so offline outcomes of such forms are never recorded.
- **R-62 (5).** Transit zones were decided (learned, not declared) but not built: a focused run
  narrowed by `urls.allowed` or a focus cannot log in through an identity provider outside it; a
  URL-only success sign can read "logged in" while the browser is still on the provider's host; and
  the provider's pages leave no record beyond the landing page's redirect hops.
- **R-55 (2).** Shop S07: `act` goes back to a state by loading its URL. A screen reached by a
  click inside an SPA can be a different screen when its URL is loaded directly (the shop's
  account screen vs. its login form), so the link on it reads as gone (`unreachable`).

## Requirements

- **FR-001 A radio group's messages are the group's** (F-04@036). A native message on a radio is
  filed under its group's label (fieldset legend, else the radiogroup's name), once per group; a
  probe's target for a radio group is that label too. The export shows "Please select one of these
  options." under "Zakres".
- **FR-002 Fields a branch reveals are probed from that branch** (F-04@036). When an option try
  reveals new fields, the validation probes (required empty, wrong format, boundaries) are planned
  for the revealed fields with that option chosen, within the same per-step budget. Each such try
  types and presses like any other and is recorded with its full input. On the reference
  calculator: "Wartość pojazdu (zł)" empty, below 5000 and above 500000 are tried.
- **FR-003 Offline breaks a page-load submit** (F-03@036). The `offline` fault fails the step's
  own request the way a dropped connection does (also a document the request gate would answer),
  so a page-load form lands on a technical state on the submitting route. Gate: an `offline` probe
  on SC-04's form.
- **FR-004 The login's transit zone is allowed** (R-62 Q3 (b)). While a login runs, main-frame
  navigations that only the run's scope would refuse (a domain outside `allowed_domains`, an
  `allowed` list of the portal, persona or focus that no entry matches) are let through; every
  other rule (`disallowed` lists, robots.txt, the denylist, the action limit) still applies. Hosts
  other than the portal's own that the browser passes during the login are the login's **learned
  transit hosts**, named in the login result and its decision note. Outside a login nothing
  changes.
- **FR-005 A URL-only success waits out the transit zone.** While the browser is on a learned
  transit host, a success sign made only of `url_not_matching` does not count; a success text
  still does, and a failure text still decides. Still in transit after the wait and the silent
  re-check: `pending`, as decided in D-2 Q2.
- **FR-006 Transit pages are recorded, never dropped** (owner, section 8). Each page that settles
  on a transit host during a login is kept with evidence (masked accessibility snapshot,
  screenshot), its URL (masked when the portal scrubs), host, title and order, marked transit, in
  their own table: they are not screens of the portal and are never explored. The login's redirect
  chain stays on the landing page's visit (R-38, read from the browser's network events: the
  backstop for hops a wait misses). Pages are captured before typing or after the submit's
  document change, never with typed values on them.
- **FR-007 A screen reached by a click is reached again by the click** (F-11@031, S07). When `act`
  loads a state's URL and the element is not on the page, and the run reached that state by acting
  (a recorded path with steps), it replays the run's recorded path (R-66's `returnToState`) and
  looks again; such a state is replayed directly from then on in this run. Gate F-11@031 turns
  from a known gap into a gate.

Done when the gates for FR-001…FR-007 pass (new ones fail on master first), the slow tier passes,
and a reference trial shows `export_validation` at 100 % on PROC-001 with no regression elsewhere.

Out of scope: a declared transit list or a proposal flow (option (c)); showing transit pages in
the dashboard or the process export (suggestion); S05 (needs a human for the CAPTCHA).
