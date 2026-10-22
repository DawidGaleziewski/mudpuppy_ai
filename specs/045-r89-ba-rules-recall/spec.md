# Spec 045: the BA's rules recall on 2.0 (R-89, with R-84, R-78's grouping fixes, R-80 (1), R-36 F-13)

**Branch:** `feature/045-r89-ba-rules-recall` · **Owner answers (2026-10-22):** approach **A**
(the server lists the limits the pages state that no rule states yet; the BA writes the rules),
B's count kept only as an eval diagnostic; trial budget **$20**; F-13: keep the lenient matcher
for the comparison, then tighten it as its own step with a new baseline.

## Problem

Over the 2.0 reference-insurer trials the BA documented 6–8 of 17 ground-truth rules (F-59@039).
The six kept trial workspaces, graded again offline (`findings.md` F-01), show where:

- The always-missed rules are stated **by the page itself** next to the field: "Maksymalnie 90
  dni." (R12), "Podaj telefon lub e-mail" (R15), "Wybierz dwa różne produkty" (R16), "AC dostępne
  tylko dla pojazdów młodszych niż 15 lat." (R07). Only the motor calculator was probed, so these
  forms have no probe messages: the hint is the only evidence, and the BA saw it (it is in the
  screens' elements and in an open question) but wrote no rule.
- Where probe messages exist (R02, R03, R10), the BA wrote them as data item constraints or one
  `requirement` for a whole form step.
- P05 "Przedłuż polisę" (a login wall on its first screen) is missed in every trial: the BA writes
  a follow-up but no process. The grouping eval shows the same and a "Log in" process (F-02@038).

## Requirements

- **FR-001 Rule candidates (A).** When the BA records the `rules` or the `synthesis` pass,
  `record_pass` returns a warning listing the session's limits no live `business_rule` states:
  the probes' validation messages (the browser's required-only wording left out), the alerts of
  validation states, and the hints in a form's `main` (text lines that are not a control's own
  label, tied to the control before them). A rule states a candidate when it quotes the text, or
  names the field and every number of the text. Capped at 30, with the route of each.
- **FR-002 Guidance.** `ba-practice` pass 4: a hint next to a form is a rule, one per limit, not
  one requirement per form; passes 4 and 7 name the server's list. Pass 3: a process behind a
  login wall is still a process (`until_boundary`, `not_observable`), the login form is the wall.
  The orchestrator's grouping guidance (R-78's grouping fixes): start on the screen the trigger
  opens, a login page is a wall not a process, the portal's own words for names.
- **FR-003 B as a diagnostic.** The eval's `checks` gain `rules_constraint_only`: missed rules
  whose anchor field has a data item with a constraint. Never scored, never a regression.
- **FR-004 Plain-text messages (R-80 (1)).** A probe press that stays on the step with no alert
  and no browser message keeps up to three texts that appeared after the press outside the
  header, menu and footer, as `source: 'dom-text'`. The claim wizard's 30-day message is the gate.
- **FR-005 Measure.** Reference-insurer trials within $20 against the v2 baseline; the grouping
  eval on the same store (about $0.40 each). R-84: process starts and triggers checked in each
  trial's export (`export_wrong_start`, `export_extra_steps`).
- **FR-006 F-13 (after FR-005).** The rule matcher gets stricter as its own commit, the kept
  workspaces are graded again, and the baseline is promoted from the regrade.

## Out of scope

- A scar for the plain-text message (the proving ground's claim wizard is the gate).
- Probing more forms in the eval (a conditions change, not BA behaviour).

## Validation

- [x] `record_pass` lists probe messages and hints without a rule after `rules` and `synthesis`,
      not after other passes, and stops listing a candidate once a rule states it (unit tests).
- [x] `textMessages` keeps new body text only; the claim-wizard gate records the 30-day message.
- [x] Trials: rules recall above the v2 baseline (7/17) with no new overclaims and every hard
      check 0: 13/17 strict on two crawls (F-05). **Not met: P05** (the BA still writes a
      follow-up for the login wall; the grouping eval does suggest it).
- [x] F-13: stricter matcher, regraded workspaces, new baseline.
