---
name: ba-practice
description: How Pathfinder's BA documents an existing portal from recorded crawl evidence — the seven analysis passes, record kinds, confidence labels, evidence citing, verbatim portal terms, open questions vs crawler follow-ups. Use when writing or revising Layer B documentation records through the pathfinder-ba tools. Not for crawling, testing or dashboard work.
---

# BA practice: as-is documentation from evidence

You are doing **as-is analysis** (requirements recovery) of a live portal. The recorded behaviour is
the source of truth for *what* the portal does, never for *why*. Your output must be good enough for
another team to **re-create the portal** from it, and it is scored against a ground truth: coverage
of screens, fields, field constraints, business rules, processes and domain terms, with zero
over-claims. Complete, verbatim and honest beats elegant.

## Non-negotiables (and why)

- **Every record cites evidence** (a state, edge, action, form, network call, process step, rule
  candidate, crawler open question, another record, or a review). The server refuses a record without
  one (`MISSING_EVIDENCE`). Evidence is what makes the documentation trustworthy.
- **Confidence is earned.** `observed` = you can point at a recorded observed item that shows it.
  `inferred` = a reasonable deduction from observed items (say what from). `needs_confirmation` =
  business intent or anything only a human can know. `observed` citing only rule candidates or
  questions is refused (`INVALID_CONFIDENCE`). A guess labelled `observed` is the worst error you can
  make: it is scored as an over-claim.
- **Never browse, never guess.** If the evidence does not show it, ask: an `open_question` record for
  a human, or a `followup` record for the crawler (see "Asking for more" below).
- **You never set status.** Drafts become `confirmed` only through a human review. Tools have no status
  input.
- **English prose, portal words verbatim.** Write statements in English; quote every UI label, field
  name, message and domain term exactly as the portal shows it, in its language, in double quotes:
  the field "Kod pocztowy", the button "Kup polisę". Do not translate inside quotes, fix typos, or
  change case. The evaluator matches on verbatim labels and on route templates.

## Procedure

1. `get_pending_feedback` for the portal **first**. For each rejection or comment: revise the record
   (`revise_record` with `responds_to_review`), withdraw it with a reason, or raise an
   `open_question`. A reviewer's answer to an `OQ` is evidence (target `review`) for a
   `needs_confirmation` assumption or requirement.
2. `list_runs`, choose the runs to read (all completed map runs, plus trace runs), `start_session`
   with them. Evidence from other runs is refused (`RUN_NOT_IN_SESSION`).
3. `list_records` to see what exists; revise instead of duplicating. Revisions need `base_rev` equal to
   the latest (`STALE_REVISION` otherwise — re-read and retry once).
4. Run the seven passes below in order; after each call `record_pass` with a 1–3 line summary.
5. `finish_session` with a summary and `gaps` (what you could not document and why).

## The seven passes

| # | Pass | Read | Write |
|---|---|---|---|
| 1 | `inventory` | `get_run_evidence` states, forms, network_calls, actions, decisions | one `screen` per distinct page/UI state cluster: purpose, **route templates exactly as recorded**, elements (role + verbatim label), entry points |
| 2 | `capabilities` | your screens, nav labels | `capability` records (what the business offers, e.g. "Car insurance quoting"); relations `capability contains screen|process` |
| 3 | `processes` | trace processes (when available), edges between screens | `process` (goal, persona, trigger, outcome, `observed_extent`) and `use_case` (Cockburn, see `references/use-cases.md`); if no trace exists, a `followup` asking for one |
| 4 | `rules` | forms (required, pattern, min/max), disabled controls and their hints, validation messages, computed values, refused actions, rule candidates | `business_rule` and `requirement` records (`references/business-rules.md`, `references/requirements-writing.md`) |
| 5 | `data` | form fields, network call shapes, labels | one `data_item` per field (`name_verbatim` = the label exactly, constraints observed); `glossary_term` per domain term (`references/glossary.md`) |
| 6 | `nfr` | status codes, console errors, robots policy, languages, accessibility of labels | `nfr` records only for what was measured; everything else goes to gaps |
| 7 | `synthesis` | your records | `assumption` records, remaining `open_question`s, gap list; check every screen has data items and rules linked, every rule cites its form/screen |

Record fields per kind: `references/record-kinds.md`. Document order and what a re-creating team
needs: `references/srs-outline.md`.

## Linking so the documentation is usable

- A `business_rule` or `requirement` about a field: cite the **form or state** where it shows, quote
  the field label verbatim in the statement, and cite the same form as the field's `data_item`.
  Example: `data_item` "Kod pocztowy" (evidence: form; relation `appears_on` → its `screen`) and
  `business_rule` `The "Kod pocztowy" field accepts only the format NN-NNN.` (evidence: the same form,
  plus the validation message step if a trace recorded one).
- A `data_item` relates to its screen with `appears_on`; any record using a domain term relates to the
  `glossary_term` with `uses_term`.
- A `requirement` `refines` a `use_case` or `capability` and `enforces` a `business_rule`.
- Allowed relation triples are enforced (`RELATION_NOT_ALLOWED`); see `references/record-kinds.md`.

## Asking for more

| You lack | Write |
|---|---|
| Something only people know (why a rule exists, business goals, what happens after a submit on production) | `open_question` (`answer_needed_from: sme`) |
| Behaviour the crawler could record but has not (a flow's steps, a page not visited, the error shown for a bad postcode) | `followup` with `suggested_mode: trace` and `target: {process_name, goal}` for a process, or `map` with `target: {url}`; `reason` says what record it will unblock |
| Both | a `followup` and an `open_question`, related |

Processes and use cases need trace evidence: request one `followup` (mode `trace`) per process you can
see an entry point for (e.g. "Oblicz składkę" link), before writing use cases from map data alone.

## Not observable

Backend jobs, e-mails, payments, third-party integrations, anything behind a login the persona does
not have, anything after a submit the crawler refused on production: record it with
`not_observable: true`, confidence `needs_confirmation`, and a linked `open_question` (required by the
server). Never `observed`. Checklist: `references/blind-spots.md`.

## Examples

Good: `business_rule` — statement `The "Dalej" button stays disabled until both consent checkboxes
are ticked.`, rule_type `action_enabler`, confidence `observed`, evidence: state (button disabled) +
edge (after ticking, enabled), relation `uses_term` → "Zgoda marketingowa" if it is a term.

Bad: `Customers must be adults because of insurance law.` — intent presented as fact, no verbatim
label, no evidence of the law. Instead: rule `The "Data urodzenia" field rejects ages under 18.`
(`observed`, cites the validation message) plus an `open_question` "Why is 18 the lower limit?".

Bad: `data_item` `name_verbatim: "Postal code"` for a field labelled "Kod pocztowy" — translated, so it
matches nothing. Put the English in `name_en`.

## Stop conditions

- A tool refuses the same write twice for the same reason: stop retrying, record the problem in the
  session gaps.
- You run out of evidence: finish the session with gaps and follow-ups rather than padding.
