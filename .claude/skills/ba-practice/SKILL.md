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

- **Every record cites evidence** (a state, a screen region of a state, transition, action, form, network
  call, process step, rule candidate, crawler open question, another record, or a review). The server
  refuses a record without one (`MISSING_EVIDENCE`). Evidence is what makes the documentation
  trustworthy.
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
  the field "Numer karty", the button "Zarezerwuj". Do not translate inside quotes, fix typos, or
  change case. The evaluator matches on verbatim labels and on route templates.

## Procedure

1. `get_pending_feedback` for the portal **first**. For each rejection or comment: revise the record
   (`revise_record` with `responds_to_review`), withdraw it with a reason, or raise an
   `open_question`. A reviewer's answer to an `OQ` is evidence (target `review`) for a
   `needs_confirmation` assumption or requirement.
2. `list_runs`, choose the runs to read (all completed map runs, plus trace runs, interrupted ones
   included when they recorded steps: their extent is partial), `start_session` with them; heed
   its `warnings` (trace runs not grouped into processes: stop and report). Evidence from other runs is refused (`RUN_NOT_IN_SESSION`).
3. `list_records` to see what exists; revise instead of duplicating. Revisions need `base_rev` equal to
   the latest (`STALE_REVISION` otherwise — re-read and retry once). **Documentation grows**
   (spec 034): for a process that is already documented (a `PROC` record, or a `PRC` you were
   named), call `open_process_update` first. It returns the process's records, every run of the
   process (runs that walked its screens, not only the runs you were handed: put them all in
   `start_session`), the runs new since its last change, the screens no record cites yet and the
   error pages. Revise the listed records with what is new and create records for the uncited
   screens. A revision keeps the previous revision's evidence and use-case steps; leaving any out
   needs `dropped` (each link or the step count, and a reason) or it is refused
   (`REVISION_DROPS`). A process citing only error pages is refused (`PROCESS_ONLY_ERRORS`): cite
   the runs that walked the journey and keep the error page as an error branch.
4. Run the seven passes below in order; after each call `record_pass` with a 1–3 line summary.
5. `finish_session` with a summary and `gaps` (what you could not document and why).

**Read every page of evidence.** `get_run_evidence` returns 50 items per call. Leave `limit` unset and
call again with `cursor` = the returned `next_cursor` until it is `null`, for every kind you read. A
larger `limit` can exceed your output limit, and then you see nothing of that page. Documenting from
a partial list (e.g. transitions from one page only) hides entry points and navigation; if you had to stop
early, say which kind and how many items you read in the session gaps.

**No ids in prose.** Run, state and record ids belong in `evidence[]`, relations and
`data_item.seen_in`, never in titles, statements, notes, pass summaries or the session summary. The
PII check reads an id in prose as a token and refuses the write (`PII_SUSPECTED`). Refer to a run as
"the map run" and to a record by its key (`BR-008`).

## The seven passes

| # | Pass | Read | Write |
|---|---|---|---|
| 1 | `inventory` | `get_run_evidence` states, forms, network_calls, actions, decisions, observations | one `screen` per distinct page/UI state cluster: purpose, **route templates exactly as recorded**, elements (role + verbatim label; an element with no visible label is left out of `elements` and cited as a screen region instead), entry points (every URL it was reached under) |
| 2 | `capabilities` | your screens, nav labels | `capability` records (what the business offers, e.g. "Book reservation"); relations `capability contains screen|process` |
| 3 | `processes` | `list_processes`, then `get_process` per process (ordered steps), transitions between screens | `process` (goal, persona, trigger, outcome, `observed_extent`) and `use_case` (Cockburn, see `references/use-cases.md`); if no trace exists, a `followup` asking for one |
| 4 | `rules` | forms (required, pattern, min/max), disabled controls and their hints, validation messages, computed values, refused actions, rule candidates | `business_rule` and `requirement` records (`references/business-rules.md`, `references/requirements-writing.md`); a field limit with business meaning is a rule too, besides the data item's constraint; every rule quotes the label of the control it is about; give every requirement, rule (and in pass 6 every NFR) its `ears` form: `{pattern, text}`, pattern one of ubiquitous ("The <system> shall …"), event ("When …, the <system> shall …"), state ("While …"), unwanted ("If …, then …"), optional ("Where …"), complex; one statement, verbatim labels kept (the export prints it as written) |
| 5 | `data` | form fields, network call shapes, labels, state `elements` | one `data_item` per field of every form (`name_verbatim` = the label exactly, constraints observed, evidence includes the field's screen region), checkboxes, selects and login fields included, also when a rule or process already covers the field; `glossary_term` per domain term (`references/glossary.md`), related to every screen that shows it with `appears_on` (`glossary_term appears_on screen`) |
| 6 | `nfr` | status codes, console errors, robots policy, languages, accessibility of labels | `nfr` records only for what was measured; everything else goes to gaps |
| 7 | `synthesis` | your records | `assumption` records, remaining `open_question`s, gap list; check every screen has data items and rules linked, every rule cites its form/screen; count the fields of each form in the runs against your data items and write the missing ones now; go through your data items: each constraint with business meaning (a range, a date limit, a maximum duration, a code format, "one of two needed") without a `business_rule` gets one now |

### Pass 3 in detail: processes from traces

**What a process is.** A process is something the business does for a user: a **goal** in the
portal's words ("Calculate a car premium"), a **trigger** (the menu link or button that starts it;
its label is usually the trigger's name), its **own first screen** (the screen the trigger opens)
and an **outcome** (what the user has at the end: a premium shown, a policy bought), or the
boundary where the trace had to stop. It is the as-is documentation a rebuild or a migration
works from, so it starts where the business process starts, not where the browser did.

- **Start**: the first screen of its own, the one its trigger opens. The home page, a menu or a
  product page walked on the way there are the trigger's context: name them in `trigger` ("the
  'Oblicz składkę' button on the car insurance page"), never as screens the process `contains`
  and never as use-case steps.
- **End**: the screen that shows the outcome, or the last screen before the boundary. Pages
  after the outcome (back to home, another product) are not part of it.
- One process per goal. Two goals reached one after the other (calculate, then buy) are two
  processes; relate them with `depends_on` when the second needs the first.

- Read each trace with `get_process`: its steps (intent, kind, action label, value, states before and
  after, outcomes) are the evidence. Cite the `process` and the `process_step`s that show each claim
  (`target_kind` `process` / `process_step`); a step is a server-observed fact and can carry `observed`.
- `PROC` field `observed_extent`: `full` when the process ended `goal_reached`; `until_boundary` when it
  ended `boundary_reached` (a trace stopped at an action above the run's limit); `map_only` when you
  know the process only from map data (screens and transitions, no trace).
- Relate each `process` to every screen its steps pass through with `contains`
  (`process contains screen`), in step order, starting at the screen its trigger opens: a trace's
  `trigger_ord` names the step that entered the process; the pages before it are where the
  trigger sits (write them in the `trigger`), not screens of the process.
- Write each `use_case` main flow from the steps, one entry per step: actor steps quote the verbatim
  label and value, system steps state the recorded outcome (`references/use-cases.md`).
- A boundary is a `not_observable` gap: record what lies beyond it with `not_observable: true`,
  `needs_confirmation`, and a linked `open_question` naming the refused action and what could not be
  seen (the process's `boundary.not_observable` says it). Never write the flow past the boundary.
- To see more than the traces show (a process you only know as a link, or one that stopped at a
  boundary and could run in a sandbox), write a `followup` (below) rather than guessing.

### Form steps and probe outcomes (passes 1, 3, 4, 6; spec 032)

A form-probing scan tried the form steps a person marked for probing beyond their happy path (plain
scans never probe, so a form without outcomes was simply not marked yet). `get_run_evidence` kind `states` gives
each state's `form_step_id`, `step_index` and `state_kind` (`main`, `validation`, `technical`);
kind `probe_outcomes` gives what every try did: `probe`, `target`, `outcome_kind` (`next`,
`branch`, `validation`, `technical`, `temporary`, `blocked`), the messages with their field and
source (`dom` or `native`, the browser's own message), the state it landed on, `accepted`
(the form let wrong data through) and `possible_new_process`.

- **A step is documented by its main state.** Validation, technical and variant states are states
  *of that step* (list them on the step's `screen`), never steps of the process.
- **An error-only step is not the step.** If a step was only ever seen as an error page, it is not
  observed: write an `open_question` and a `followup` (map, to recheck it). Never write "the step
  is an error page".
- **A `temporary` outcome is an environment issue**, not behaviour: an `open_question` or an `nfr`
  candidate (`inferred`), and a `followup` to recheck it.
- **Candidates, all `inferred`, all citing the outcome's state:** each validation message becomes a
  `business_rule` quoting the message and the field label (a `native` message is the browser's
  wording: quote it, and say the rule comes from the field's own constraint); each `branch`
  becomes a process variant on the `process` (or, with `possible_new_process`, a `followup` to
  trace the new process); each `technical` outcome becomes an `nfr` about error handling (what the
  user sees when the request fails). An `accepted: true` validation try is a finding: an
  `open_question` asking whether the portal should refuse that input.
- **Propose a suite per form** after the passes: `propose_probe_suite` with the run, a trace id,
  name and goal in the portal's terms, and one variant per outcome worth repeating (each with a
  `why`). Include the happy press (probe `happy-path`). The server builds the steps from the
  outcomes; the suite waits in Review for the owner and never runs before approval. Leave
  `temporary` and `blocked` outcomes out (the server refuses them).

### Changes and hypotheses (before pass 3; spec 039, design § 8–10)

The portal model compares every scan with what was known: a **deviation** is a change it found (a
new screen, a screen that looks different, a new or missing action, an action that leads elsewhere,
a changed result, a broken business rule). Rules R1–R8 explain most of them as **hypotheses**:
`list_deviations` shows each change and the hypotheses on it; `list_hypotheses` / `get_hypothesis`
show a hypothesis's claim, evidence, tests and status.

- **Document by status.** `confirmed` (by a person, or derived by a rule: a new release, a renamed
  button, a flaky page) is a fact: cite it and write `observed` where its evidence is observed.
  `supported` (its tests passed) and `proposed` are `inferred` until a person confirms them.
  `refuted` and `rejected` are not true: never document them as behaviour.
- **Explain what is left open.** A change without a hypothesis, or a difference the model cannot
  decide (two readings of one page, a rule hidden in data), is yours to propose:
  `propose_hypothesis` with the kind, one sentence in the portal's words, typed evidence (a screen
  `SC-…` with its element key, observations, transitions) and a **test that could refute it**
  (inputs and `refutes_if`). Check the reasons in this order: persona (differs only between
  personas), input (follows other values), temporary (5xx, not seen again), session or time,
  feature flag (a stable split across scans of one persona), data. `same_as`, `different_from` and
  `process_boundary` need no test: a person's label or decision settles them.
- **Decision rules and process boundaries.** A `confirmed` `decision_rule` (a result that follows
  input values, mined from the scans; the export writes it as a DMN table) is a `business_rule`:
  write it in the portal's words, cite the hypothesis's evidence, and keep its conditions as the
  hypothesis states them. A `confirmed` `process_boundary` says where a process starts or ends:
  use it for the process's first or last contained screen.
- **A refused claim stays refused**: `CLAIM_REFUTED` means the same claim was tested and failed;
  look for another explanation. The rules of "Form steps and probe outcomes" apply: the main state
  is the step, the others are states of that step, a temporary error is an environment issue.

### URLs and parameters (inside passes 1, 4 and 5)

Legacy systems wire screens together through URLs: old and new address schemes, redirects, and
query parameters that depend on each other. These are part of the documentation, not noise.
`get_run_evidence` kind `observations` gives every URL a screen was reached under with the hops that
led there (`http` 301/302, `meta_refresh`, `script`, `same_document`, `reload`, `blocked`); kind
`parameters` gives, per screen, every query, path and hash-route parameter, the values seen and the
action (`transition_id`) or hop that set them.

- **Route templates stay as recorded** (pass 1): `route_templates` holds the state's
  `route_template` exactly, a path with no query (`/katalog/wyniki`, never
  `/katalog/wyniki?fraza={text}`). Parameters go in `entry_points` and in rule and data-item
  records, never into the route.
- **Entry points** (pass 1): a screen's `entry_points` name every distinct way in, e.g. "old URL
  `/egzemplarz.asp?sygn=:sygn`, redirected (meta refresh, then script) to
  `/czytelnia#/egzemplarze/:sygn`".
- **Parameters that change the screen** (pass 4): a value that switches the layout or content (e.g.
  `widok=karta` gives a printable catalogue card) is a `business_rule` (`rule_type` `inference`) citing an observation
  with each value.
- **Parameters that only matter together** (pass 4): when one parameter's format or meaning depends
  on another (e.g. `termin` is `DD.MM.YYYY` when `rodzaj=dzien` and `YYYY` when `rodzaj=rok`), write a
  `business_rule`, with a `decision_table` when there are several combinations. Cite the observations
  that show each combination. Label it `inferred` unless a validation message or error page shows the
  dependency. Then it is `observed`, and that page is cited too.
- **Parameters carried from page to page** (pass 5): a parameter set by one action and passed along
  (`czytelnik`, a session id) is a `data_item` with `seen_in` kind `observation`. Say where it is set and
  where it is read.
- Session ids and tracking parameters are recorded on purpose. Document a session id once, as a
  `data_item` ("Session identifier in the URL path"). Never list its values in prose.

Record fields per kind: `references/record-kinds.md` (the `create_record` tool description carries
the same shapes, generated from the server's schemas). Document order and what a re-creating team
needs: `references/srs-outline.md`.

## Linking so the documentation is usable

- A `business_rule` or `requirement` about a field: cite the **form or state** where it shows, quote
  the field label verbatim in the statement, and cite the same form as the field's `data_item`.
  Example: `data_item` "Numer karty" (evidence: form; relation `appears_on` → its `screen`) and
  `business_rule` `The "Numer karty" field accepts only the format AA-NNNNNN.` (evidence: the same form,
  plus the validation message step if a trace recorded one).
- **Point at the element on the screenshot.** States recorded since spec 008 have a screenshot, and
  `get_evidence` on a state lists its `elements`: key strings such as `textbox "Numer karty"` or
  `button "Dalej"`. `elements_without_box` lists the keys that cannot be outlined on the screenshot
  (they are still valid to cite). Readers see outlined elements on a screenshot, so cite a **screen region**
  (`target_kind` `screen_region`, `target_id` the state id, `region` the key) in addition to the form or state:
  - every `data_item` cites the region of its field;
  - a `business_rule` or `requirement` about one control or message cites that control's region;
  - a `screen` cites the whole `state`, plus regions for the elements its content names when useful.
  Copy keys verbatim from `elements` (the `#2` suffix included); the server refuses a key the state
  does not have (`UNKNOWN_REF`) and lists the closest ones. A region counts as observed evidence like
  its state. A key in `elements_without_box` is still valid (it is in the snapshot but not visible on the
  screenshot); prefer an outlined one when both describe the same thing.
- A `data_item` relates to its screen with `appears_on`; any record using a domain term relates to the
  `glossary_term` with `uses_term`; a `glossary_term` relates to each screen that shows it with
  `appears_on`.
- A `requirement` `refines` a `use_case` or `capability` and `enforces` a `business_rule`.
- An `assumption` or a `use_case` that rests on a rule relates to it with `depends_on`
  (`assumption depends_on business_rule`). Every assumption is checked by a reviewer.
- A `business_rule` relates to each screen it holds on with `applies_on` (besides citing the
  screen region as evidence); an `open_question` names what it is about with `asks_about`; a
  `followup` names the process, capability, screen, rule, use case or open question it would
  observe or answer with `follows_up`.
- One data item per form field: the server refuses a data item whose name holds two or more field
  labels of the form it cites ("Data wypożyczenia / Data zwrotu" is two data items).
- Allowed relation triples are enforced (`RELATION_NOT_ALLOWED`); see `references/record-kinds.md`.

## Hand-offs, logged-in evidence and legacy obstacles

- **CAPTCHA hand-off.** A crawler question `Human needed: CAPTCHA on <route>` means a person must
  pass that screen. Document the screen as reachable only by a human. Raise no requirement about
  solving the CAPTCHA. Link the open question to the screen.
- **Logged-in evidence.** Screens recorded after a login are documented with the persona as the
  actor. The login and any re-login are crawler events, not steps of a process: never write a
  `re-login` into a flow or a use case. A `relogin` decision only explains why a state repeats.
- **Legacy obstacles.** When a record describes something in `docs/legacy-obstacles.md`, name it in
  plain words in the statement, for example `The "Rezerwuj" button has no accessible role.` or `The
  history list is shown in a frameset.` Reviewers and the evaluator find it by those words.

## Asking for more

| You lack | Write |
|---|---|
| Something only people know (why a rule exists, business goals, what happens after a submit the crawler was not allowed to make) | `open_question` (`answer_needed_from: sme`) |
| Behaviour the crawler could record but has not (a flow's steps, a page not visited, the error shown for a bad card number) | `followup` with `suggested_mode: trace` and `target: {process_name, goal}` for a process, or `map` with `target: {url}`; `reason` says what record it will unblock |
| Both | a `followup` and an `open_question`, related |

Processes and use cases need trace evidence: request one `followup` per process you can see an entry
point for (e.g. "Zarezerwuj" link), before writing use cases from map data alone. Shape:
`suggested_mode: trace`, `target: {process_name, goal}` (the name in the portal's words, the goal in
one English sentence), `persona`, and a `reason` saying which `PROC` and `UC` it will unblock. The
crawler picks it up, traces it and links the run; the next session reads it with `get_process`.

## Not observable

Backend jobs, e-mails, payments, third-party integrations, anything behind a login the persona does
not have, anything after a submit the crawler's limit refused: record it with
`not_observable: true`, confidence `needs_confirmation`, and a linked `open_question` (required by the
server). Never `observed`. Checklist: `references/blind-spots.md`.

## Examples

Good: `business_rule` — statement `The "Zarezerwuj" button stays disabled until "Akceptuję
regulamin" is ticked.`, rule_type `action_enabler`, confidence `observed`, evidence: state (button
disabled) + transition (after ticking, enabled), relation `uses_term` → "Regulamin wypożyczalni" if it is a
term.

Bad: `Pickups are limited because of library policy.` — intent presented as fact, no verbatim
label, no evidence of the policy. Instead: rule `The "Data odbioru" field rejects dates more than 7
days ahead.` (`observed`, cites the validation message) plus an `open_question` "Why is 7 days the
limit?".

Bad: `data_item` `name_verbatim: "Card number"` for a field labelled "Numer karty" — translated, so it
matches nothing. Put the English in `name_en`.

## Stop conditions

- A tool refuses the same write twice for the same reason: stop retrying, record the problem in the
  session gaps.
- You run out of evidence: finish the session with gaps and follow-ups rather than padding.
