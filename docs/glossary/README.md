# Pathfinder glossary

<!-- Generated from glossary.yaml by `uv run pathfinder-glossary --write` (apps/dashboard). Do not edit by hand. -->

This glossary explains Pathfinder's own vocabulary: the words the dashboard, the specs and the agents use for runs, evidence and documentation. It is not the portal glossary the BA agent writes (GL records in the Docs tab), which explains the documented website's business terms, such as "Składka" or "OC".

## Pathfinder terms

### Runs and setup

<a id="run"></a>

#### Run

**One session of the crawler against one portal, as one persona, in one mode, and everything it recorded on the way.**

A run starts when the crawler agent calls `start_run` and ends with `finish_run` or when
something stops it. Every state, action, form, network call shape, decision and question
it records belongs to that run, so the run is the unit you open to see "what happened".

Status codes on runs: `[ OK ]` completed, `[RUN.]` running, `[STOP]` stopped on a warning
(for example an anti-bot block), `[INT.]` interrupted (the process died or was stopped; it
can be resumed without repeating recorded work).

*Example:* The map run 01a0fe67… on reference-insurer completed with 12 states and 201 frontier items.

*Seen in:* Overview → Runs table; Run page header

*Labels:* `Run`, `Runs`

*Related:* [Mode (map / trace)](#mode), [Persona](#persona), [Environment (sandbox / production)](#environment), [Frontier](#frontier)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="mode"></a>

#### Mode (map / trace)

**What a run is for, either map mode, which explores the whole portal, or trace mode, which records one named process step by step.**

**Map** mode explores broadly: it visits every reachable state within scope and budget and
records what is there. It never fills or submits forms.

**Trace** mode follows one named business process, such as "Oblicz składkę OC/AC", with
inputs from the persona, and records the ordered steps and what the portal did after each.
On production it stops at the submit boundary. The BA asks for trace runs through
follow-up tasks when a map run is not enough.

*Seen in:* Runs table → Mode

*Labels:* `Mode`, `map`, `trace`

*Related:* [Run](#run), [Process (trace mode)](#trace-process), [Submit boundary](#submit-boundary), [Follow-up task (FUP)](#follow-up-task)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="environment"></a>

#### Environment (sandbox / production)

**Whether a portal is a live production site, where only read-only actions are allowed, or a sandbox with resettable data, where forms may be submitted.**

The portal config declares `environment: production` or `sandbox`. On production the
environment guard allows only `read` actions, enforced in code, plus a conservative rate
limit and an identifying User-Agent. Each environment has its own database file
(`data/db/<environment>.sqlite`); the environment selector in the dashboard's top bar
switches between them.

*Example:* reference-insurer is a sandbox; its twin reference-insurer-readonly is treated as production.

*Seen in:* Top bar → environment; Runs table → Environment

*Labels:* `Environment`, `sandbox`, `production`

*Related:* [Safety class](#safety-class), [Scope / denylist](#portal-scope)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="persona"></a>

#### Persona

**Who the crawler acts as during a run, such as an anonymous guest, defined in a persona file that can only narrow what the portal config allows.**

A persona file (`personas/<portal>/<persona>.yaml`) says who is acting: logged in or not,
which inputs to type in trace mode, its own budgets and safety ceiling. Personas can extend
shared pieces (`personas/_mixins/`). The run's effective safety ceiling is the lower of the
portal's and the persona's, so a persona can restrict but never widen. Secrets are referenced,
never written in the file.

*Example:* reference-insurer/guest extends the anonymous base mixin and the trace-input mixin.

*Seen in:* Runs table → Persona

*Labels:* `Persona`

*Related:* [Run](#run), [Safety class](#safety-class), [Budget](#budget)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="reference-portal"></a>

#### Reference portal / ground truth

**A practice insurance website that Pathfinder runs locally, with a written answer key (the ground truth) used to measure how good the crawler's and the BA's results are.**

The reference portal is a fake Polish insurer, "Towarzystwo Ubezpieczeń Wzorcowych",
served on `http://127.0.0.1:4010` by `pnpm reference-portal` in `apps/crawler`. Because we
wrote it, we know everything it contains: its screens, fields, rules and processes are listed
in a ground-truth file. Comparing the BA's documentation with that file shows what was
found, what was missed and what was over-claimed (the planned `docs:evaluate`, R-16). Its
data is safe to show and stable, which is why glossary examples come from it.

*Seen in:* Docs tab → reference-insurer; portals/reference-insurer

*Labels:* `reference-insurer`, `ground truth`

*Related:* [Run](#run), [Documentation record](#documentation-record)

<sub>Last changed in R-22, 2026-10-03.</sub>

### Crawling

<a id="state"></a>

#### State

**One distinct condition of a portal screen that the crawler recognised and recorded, identified by its fingerprint.**

A state is "a screen as it looked", not a URL. One URL can hold several states (a form
before and after a validation error), and many URLs can be one state (product pages that
differ only by an id). Each state has a route template, a title, a fingerprint, a cluster,
a stabilization result and an evidence snapshot. States are shared across runs; each run
records which states it observed.

*Example:* The reference map run observed 12 states, from / ("Ubezpieczenia dla Ciebie") to /moje-polisy/przedluz.

*Seen in:* Run page → States observed

*Labels:* `State`, `States`, `States observed`

*Related:* [Fingerprint](#fingerprint), [Cluster](#cluster), [Settled / never stabilized](#settled), [Transition (edge)](#transition)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="fingerprint"></a>

#### Fingerprint

**A hash of a page's route template and its accessible structure, so two observations with the same fingerprint count as the same state.**

The fingerprint is computed by pure code, not by the AI agent: the route template plus a
canonical form of the page's accessibility tree (roles and names, with volatile text
removed), hashed with sha256. Identical fingerprint means the same state. Near-identical
pages are grouped one level up, in a cluster. Every merge or split decision is written to
the decision log with its similarity score.

*Seen in:* Run page → Decision log (merge; split); Run trace → fingerprint phase

*Labels:* `Fingerprint`

*Related:* [State](#state), [Cluster](#cluster)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="cluster"></a>

#### Cluster

**A group of states that look almost the same, so near-duplicate pages are kept together instead of being documented as unrelated screens.**

Each state has one exact fingerprint and belongs to one cluster. When a new page arrives,
its structure is compared with existing clusters; at a similarity of 0.9 or more it joins
that cluster ("merge"), otherwise it starts a new one ("split"). Both outcomes are logged.
The BA usually documents one screen per cluster.

*Example:* The reference map run found 12 states in 10 clusters.

*Seen in:* States observed → Cluster

*Labels:* `Cluster`

*Related:* [Fingerprint](#fingerprint), [State](#state), [Screen (SCR)](#screen)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="settled"></a>

#### Settled / never stabilized

**Whether the page had stopped changing when it was recorded, meaning network requests, DOM changes and animations had all gone quiet.**

Before recording, the crawler waits for the page to stabilise. `settled` means it did.
`never_stabilized` means the wait ran out while something was still moving, so the record
may show a half-loaded page; it is still recorded, with evidence, and the run trace shows
what was still moving.

*Example:* All 12 states of the reference map run are settled.

*Seen in:* States observed → Stabilization; Run trace → settle phase

*Labels:* `Stabilization`, `settled`, `never_stabilized`

*Related:* [State](#state), [Tool call / phase / span](#tool-call)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="transition"></a>

#### Transition (edge)

**An action that leads from one state to another, such as clicking a menu link, recorded with its safety class and locators.**

States are the dots of the portal map and transitions are the arrows. A transition records
the state it started from, the state it led to (or none), the action that caused it, its
safety class and whether it was executed or skipped. Skipped transitions are kept so the
map shows what exists even where the crawler did not go.

*Seen in:* Map diagrams; Run trace

*Labels:* `Transition`, `Edge`

*Related:* [State](#state), [Safety class](#safety-class), [Top locator](#top-locator)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="portal-scope"></a>

#### Scope / denylist

**The part of a site the crawler may visit (domains and paths in the portal config) and the URLs or actions it must never touch.**

The portal config lists `allowed_domains` and `allowed_paths`; anything else is out of
scope and skipped with the reason `out_of_scope`. The `denylist` names paths or controls that
are forbidden even inside scope, such as logout, payment or an admin reset page; those are
skipped as `denylisted`. Both appear as skip reasons on the frontier.

*Example:* reference-insurer allows 127.0.0.1 with paths /* and denylists path:/__admin/*.

*Seen in:* Frontier → Status; skip reasons

*Labels:* `Scope`, `Denylist`, `out_of_scope`, `denylisted`

*Related:* [Frontier](#frontier), [Budget](#budget), [Environment (sandbox / production)](#environment)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="budget"></a>

#### Budget

**A limit a run must stay within, such as the number of states, click depth, actions per state, running time or steps.**

Five budgets exist: `max_depth`, `max_states`, `max_actions_per_state`,
`max_run_time_minutes` and `max_steps`. The portal config sets them and a persona may lower
them. When a budget runs out, remaining frontier items are marked `budget_reached` and
listed, never silently dropped, so you can see what a bigger budget would have explored.

*Example:* reference-insurer allows depth 6, 100 states, 40 actions per state, 30 minutes and 400 steps.

*Seen in:* Frontier → budget_reached

*Labels:* `Budget`, `budget_reached`

*Related:* [Frontier](#frontier), [Priority / depth](#priority-depth), [Persona](#persona)

<sub>Last changed in R-22, 2026-10-03.</sub>

### Actions and safety

<a id="accessible-name"></a>

#### Accessible name

**The text a screen reader announces for an element, such as a button's caption or a field's label, which Pathfinder uses to name elements.**

Pathfinder identifies elements the way assistive technology does: by role plus accessible
name. That keeps the documentation in the portal's own words and gives stable locators
for tests. An empty accessible name (shown as "—") is itself a finding: the control has no
label a screen reader could read.

*Example:* A link named "Start" in the main menu.

*Seen in:* Actions → Accessible name

*Labels:* `Accessible name`

*Related:* [Role](#role), [Top locator](#top-locator)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="role"></a>

#### Role

**What kind of element something is in accessibility terms, such as link, button, textbox or checkbox, not a user role.**

Roles come from the page's accessibility tree (ARIA roles, explicit or implied by HTML).
Together with the accessible name they identify an element. Do not confuse it with a
persona or a business role.

*Seen in:* Actions → Role

*Labels:* `Role`

*Related:* [Accessible name](#accessible-name), [Persona](#persona)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="safety-class"></a>

#### Safety class

**How risky an action is, either read, mutating, destructive or external side effect, with unclear cases treated as unsafe.**

Every action is classified by pure code before it may run:

- `read`: only looks (a navigation link).
- `mutating`: changes data (submitting a form).
- `destructive`: deletes or cancels something.
- `external-side-effect`: does something outside the site, such as sending an e-mail or
  making a payment.

If the code cannot prove an action is read-only it does not assume it is. On production
only `read` actions run. The effective ceiling of a run is the lower of the portal's and
the persona's.

*Example:* On the reference map run the "Porównaj" button was classified mutating (no evidence it is read-only) and skipped.

*Seen in:* Actions → Safety class; Frontier → Safety class

*Labels:* `Safety class`, `read`, `mutating`, `destructive`, `external-side-effect`

*Related:* [Decision (allowed / skipped)](#decision), [Environment (sandbox / production)](#environment), [Persona](#persona)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="decision"></a>

#### Decision (allowed / skipped)

**Whether the crawler was permitted to perform an action and, if not, the rule that stopped it.**

Each extracted action is checked against the safety ceiling, scope, denylist, robots.txt and
budgets. The Decision column shows "allowed" or the skip reason, which names the rule, so you
can tell a deliberate safety skip from a gap in coverage.

*Example:* ceiling:read: classified mutating (no evidence that this control is read-only), above the effective ceiling read.

*Seen in:* Actions → Decision

*Labels:* `Decision`

*Related:* [Safety class](#safety-class), [Scope / denylist](#portal-scope), [Budget](#budget)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="top-locator"></a>

#### Top locator

**The best of the ranked ways the crawler found to point at an element, which QA can reuse when writing tests.**

For each action the crawler stores several candidate locators, ranked: role + accessible name
first, then visible text, then container path, then `data-testid` if present. The top one is
shown in the table; the rest are fallbacks. Generated tests follow the same priority, and QA
validates a locator before relying on it.

*Example:* role=link[name="Start"], with fallbacks text "Start" and the container path.

*Seen in:* Actions → Top locator

*Labels:* `Top locator`, `Locator`

*Related:* [Accessible name](#accessible-name), [Role](#role), [Transition (edge)](#transition)

<sub>Last changed in R-22, 2026-10-03.</sub>

### Frontier

<a id="frontier"></a>

#### Frontier

**The edge of what the crawler has explored, every action it has seen but not yet followed, plus a record of what happened to each one.**

"Frontier" is the standard name for this in web crawlers and graph search; it is not a BA
term. Picture fog of war: each visited page reveals new links and buttons, which join the
frontier. The crawler keeps taking the next item, following it and adding what it finds,
until nothing is left or a budget stops it.

Pathfinder's Frontier table also keeps history: each item ends `done` (followed) or skipped
with a reason (`skipped_unsafe`, `out_of_scope`, `denylisted`, `robots_disallowed`,
`budget_reached`, `unreachable`). An empty list of `pending` items means the map is complete
within the rules.

*Example:* The reference map run queued 201 items, followed 195 and skipped 6 as unsafe.

*Seen in:* Run page → Frontier

*Labels:* `Frontier`

*Related:* [Priority / depth](#priority-depth), [Budget](#budget), [Decision (allowed / skipped)](#decision), [Scope / denylist](#portal-scope)

*Read more:* [The frontier, explained](pages/frontier.md)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="priority-depth"></a>

#### Priority / depth

**Priority decides which frontier item is followed next (higher first, then oldest first), and depth is how many clicks away from the start page it is.**

The server, not the AI agent, decides the order: the pending item with the highest priority,
and among equals the one queued first. Depth counts navigation steps from the start page and
is limited by the `max_depth` budget.

*Seen in:* Frontier → Priority; Frontier → Depth

*Labels:* `Priority`, `Depth`

*Related:* [Frontier](#frontier), [Budget](#budget)

<sub>Last changed in R-22, 2026-10-03.</sub>

### Recorded evidence

<a id="evidence"></a>

#### Evidence

**What the crawler saved as proof of what it saw, such as masked page snapshots, form fields, locators and network shapes, which every documentation statement must cite.**

Pathfinder never asks you to trust a statement on its own: the crawler stores proof, and
every BA record points at it. Evidence includes a masked accessibility snapshot per observed
state, the fields of each form, the ranked locators and safety class of each action, the
shape (not the content) of network calls, process steps, decisions and, on sandbox only, a
Playwright trace. Personal data is masked before anything is stored, and request bodies and
production screenshots are never stored. The long page explains each kind, where it lives
and how the BA uses it.

*Seen in:* Run page sections; Docs record → Evidence

*Labels:* `Evidence`

*Related:* [Evidence link / cites](#evidence-link), [Target](#target), [Network call shape](#network-call-shape), [Layer A / Layer B](#layers)

*Read more:* [Evidence, explained](pages/evidence.md)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="network-call-shape"></a>

#### Network call shape

**A request the portal's own page made, recorded as method, URL template, status and the structure of its request and response, without the actual values.**

Pathfinder records what the page asked its server for, not what it sent. The structure
(field names and types) shows what data the screen exchanges, while the absence of values
keeps personal data out. Only background `fetch`/XHR requests are captured; a classic form
POST followed by a redirect is not. The crawler never calls a portal's API itself.

*Seen in:* Run page → Network call shapes

*Labels:* `Network call shapes`, `Shapes`

*Related:* [Evidence](#evidence), [Data item (DI)](#data-item)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="crawler-open-question"></a>

#### Open question (crawler)

**Something the crawler noticed but cannot explain from the screen, handed to the BA instead of guessed.**

The crawler records facts and does not interpret them. When it meets something puzzling,
such as a button that is disabled for guests, it adds an open question with
`add_open_question` and moves on. The BA picks these up and either answers them from the
evidence or turns them into an open question record for a person.

*Seen in:* Run page → open questions; Docs evidence → open question

*Labels:* `Open question`

*Related:* [Rule candidate](#rule-candidate)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="rule-candidate"></a>

#### Rule candidate

**A possible business rule the crawler spotted, such as a limit stated in an error message, recorded as a hint for the BA and never as a fact.**

The crawler may flag a few patterns that look like rules with `add_rule_candidate`. It does
not decide whether they are rules. The BA checks each against the evidence and writes a
business rule record only when the evidence supports it.

*Seen in:* Run page; Docs evidence → rule candidate

*Labels:* `Rule candidate`

*Related:* [Business rule (BR)](#business-rule), [Open question (crawler)](#crawler-open-question)

<sub>Last changed in R-22, 2026-10-03.</sub>

### Traced processes

<a id="trace-process"></a>

#### Process (trace mode)

**The ordered steps the crawler recorded while following one named process in trace mode, the raw material for the BA's process record.**

"Process" has two meanings in Pathfinder. Here it is what a trace run recorded: a name, the
persona, the ordered steps and an outcome. The BA turns it into a PROC documentation record
(see Process (PROC)), which is the documented business process.

Outcomes: `[ OK ]` goal reached, `[BNDY]` stopped at the submit boundary on purpose,
`[STOP]` stopped by a problem, `[ABND]` abandoned.

*Example:* The trace "Oblicz składkę OC/AC" on reference-insurer reached its goal.

*Seen in:* Run page → Process tab

*Labels:* `Process`

*Related:* [Step / intent / outcome](#process-step), [Submit boundary](#submit-boundary), [Process (PROC)](#process-record), [Mode (map / trace)](#mode)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="process-step"></a>

#### Step / intent / outcome

**One move in a traced process, where intent is what the crawler meant to do and outcome is what the portal did in response.**

Each step records its intent in plain words ("fill in the vehicle's year"), the kind of move
(click, fill, select…), the value used, and the observed outcomes, such as a new screen, a
validation message or a changed price. Steps are evidence the BA cites in process and use
case records.

*Seen in:* Process tab → Steps (Intent; Kind; Value; Outcomes)

*Labels:* `Steps`, `Intent`, `Outcome`, `Outcomes`

*Related:* [Process (trace mode)](#trace-process), [Submit boundary](#submit-boundary)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="submit-boundary"></a>

#### Submit boundary

**The point in a process where continuing would submit, buy or send something, where a trace on production stops on purpose.**

On production only read-only actions are allowed, so a trace fills the steps it safely can
and stops before the final submit. The outcome `[BNDY]` means the run worked as intended,
not that it failed. On a sandbox the same process may continue past the boundary.

*Seen in:* Process tab → Outcome [BNDY]

*Labels:* `BNDY`, `boundary_reached`

*Related:* [Process (trace mode)](#trace-process), [Safety class](#safety-class), [Environment (sandbox / production)](#environment)

<sub>Last changed in R-22, 2026-10-03.</sub>

### Run trace

<a id="tool-call"></a>

#### Tool call / phase / span

**A tool call is one request the crawler agent made to Pathfinder's server, a phase is one stage inside it, and a span is one timed block in that tree.**

The crawler agent works only through tools such as `start_run`, `navigate`, `act`,
`get_next_frontier_item` and `finish_run`. Inside each call the server runs phases, for
example `gate` (safety checks), `settle`, `observe`, `fingerprint`, `record_state`,
`record_forms`, `record_api_calls` and `enqueue_frontier`. The Trace tab shows these as
nested, timed spans, which is how you debug a slow or failing run. This trace describes
the crawler's machinery, not the portal.

*Seen in:* Run page → Trace tab

*Labels:* `Tool calls`, `Call`, `Phase`, `Tool`

*Related:* [Run-less calls](#run-less-call), [p50 / p95](#percentiles)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="run-less-call"></a>

#### Run-less calls

**Tool calls that happened outside any run, such as a refused start_run, kept so that nothing the server did is invisible.**

Most tool calls belong to a run. A few cannot: a `start_run` that was refused (for example
because the portal's compliance check is missing) never created a run. These calls are
listed on the Activity page so a refusal is visible rather than silently lost.

*Seen in:* Activity → Run-less calls

*Labels:* `Run-less calls`

*Related:* [Tool call / phase / span](#tool-call)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="percentiles"></a>

#### p50 / p95

**Timing percentiles, where half of the measured calls were faster than p50 and 95 in 100 were faster than p95.**

The trace summary lists each phase with how often it ran, the total time and two
percentiles. p50 (the median) shows the typical time; p95 shows the slow tail. A large gap
between them means a phase is usually fast but sometimes very slow, which is often a page
that takes long to settle.

*Seen in:* Trace tab → summary (p50; p95)

*Labels:* `p50`, `p95`

*Related:* [Tool call / phase / span](#tool-call)

<sub>Last changed in R-22, 2026-10-03.</sub>

### BA workflow

<a id="layers"></a>

#### Layer A / Layer B

**Layer A is the mechanical map the crawler records (states, actions, forms), and Layer B is the BA's documentation built on top of it.**

Layer A answers "what is on the screen and what happens when you click". Layer B answers
"what does the business do here": capabilities, processes, requirements, rules, data and
terms. Layer B is the deliverable; Layer A is its evidence, and every Layer B statement cites
Layer A.

*Seen in:* Specs and data docs

*Labels:* `Layer A`, `Layer B`

*Related:* [Evidence](#evidence), [Documentation record](#documentation-record)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="follow-up-task"></a>

#### Follow-up task (FUP)

**A request from the BA to the crawler to go and record something specific, because the BA never browses itself.**

When the evidence is not enough, for example a process was never traced, the BA writes a
follow-up task. A person then runs the crawler (usually in trace mode) to fulfil it, and the
BA reads the new run. Status codes: `[OPEN]` open, `[WORK]` in progress, `[DONE]` done,
`[BLKD]` blocked, `[CNCL]` cancelled.

*Example:* FUP-001 "Trace the OC/AC calculator through all four steps".

*Seen in:* Docs tab → follow-ups

*Labels:* `Follow-up`, `FUP`

*Related:* [Mode (map / trace)](#mode), [Analysis session](#analysis-session), [Open question (crawler)](#crawler-open-question)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="analysis-session"></a>

#### Analysis session

**One sitting of the BA agent, showing which runs it read, which passes it made, which records it wrote and which gaps it left.**

The BA agent starts a session with the runs it will analyse, works through its seven passes,
and finishes with a summary and a list of gaps. The session page is the BA's work log: it
tells you what the documentation is based on and what it does not cover.

*Seen in:* Docs tab → Session page

*Labels:* `Analysis session`, `Session`, `Input runs`

*Related:* [Pass](#analysis-pass), [Gaps](#gaps), [Documentation record](#documentation-record)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="analysis-pass"></a>

#### Pass

**One of the BA agent's seven read-throughs of the evidence, each looking for one kind of thing.**

The passes run in order: 1 inventory (screens), 2 capabilities, 3 processes and use cases,
4 rules and requirements, 5 data items and glossary terms, 6 non-functional requirements,
7 synthesis (assumptions, remaining open questions, gaps). Each pass records a one-to-three
line summary on the session page.

*Seen in:* Session page → Passes

*Labels:* `Pass`, `Passes`

*Related:* [Analysis session](#analysis-session), [Gaps](#gaps)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="gaps"></a>

#### Gaps

**What the BA could not document from the evidence it had, listed so nobody assumes it was covered.**

A gap is an honest "not known": a screen never reached, a rule that would need a submit,
behaviour that cannot be observed from the outside (back-office work, e-mails). Gaps usually
lead to a follow-up task or an open question.

*Seen in:* Session page → Gaps

*Labels:* `Gaps`

*Related:* [Analysis session](#analysis-session), [Follow-up task (FUP)](#follow-up-task)

<sub>Last changed in R-22, 2026-10-03.</sub>

### Records and review

<a id="record-key"></a>

#### Record key

**The stable id of a documentation record, a kind prefix plus a number such as REQ-007 or BR-012, never reused even after the record is withdrawn.**

Prefixes: CAP capability, SCR screen, PROC process, UC use case, REQ requirement, NFR
non-functional requirement, BR business rule, GL glossary term, DI data item, ASM assumption,
OQ open question, FUP follow-up. Numbers count up per portal and kind. Use the key when you
refer to a record in a comment or a test tag.

*Example:* BR-012 "Contact form: required fields, lengths and formats".

*Seen in:* Docs tab; everywhere a record is listed

*Labels:* `Key`, `Record`

*Related:* [Documentation record](#documentation-record), [Revision (Rev)](#revision)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="revision"></a>

#### Revision (Rev)

**A numbered version of a record, created each time the BA changes it, with older revisions kept and reviews applying to one exact revision.**

A record never changes in place. Every change adds revision n+1; you can read the full
history on the record page. A review always names the revision it judged, so a confirmation
cannot silently carry over to text nobody approved.

*Seen in:* Record page → Revision history; Rev column

*Labels:* `Rev`, `Revision`, `Revision history`

*Related:* [Record status](#record-status), [Review (confirm / reject / comment)](#review), [Record key](#record-key)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="record-status"></a>

#### Record status

**The state of a record's revision, either draft, confirmed, rejected, superseded or withdrawn, worked out by code from the revisions and reviews.**

- `[DRFT]` draft: written, not yet reviewed.
- `[ OK ]` confirmed: a person approved this revision.
- `[RJCT]` rejected: a person sent it back.
- `[OLD.]` superseded: a newer revision replaced this draft, or a newer revision was
  confirmed.
- `[WDRN]` withdrawn: the BA retracted the record.

Only the latest draft can be confirmed or rejected. Nobody sets a status by hand, not the
BA agent and not the dashboard; it follows from the reviews.

*Seen in:* Docs tab → Status; Record page

*Labels:* `Status`, `Status now`, `DRFT`, `RJCT`, `OLD.`, `WDRN`

*Related:* [Revision (Rev)](#revision), [Review (confirm / reject / comment)](#review), [Four-letter status codes](#status-codes)

<sub>Last changed in R-22, 2026-10-03.</sub>

### Reading the dashboard

<a id="status-codes"></a>

#### Four-letter status codes

**The bracketed labels such as [DRFT] or [BNDY], a fixed-width short form of the status word printed next to them.**

The dashboard prints every status as a four-character code in brackets, followed by the full
word, so columns line up. Muted codes mean "the system did what it should" (a safety skip,
a boundary), and red ones mean something needs attention.

| Where | Codes |
|---|---|
| Runs | `[ OK ]` completed, `[RUN.]` running, `[STOP]` stopped on a warning, `[INT.]` interrupted |
| Frontier | `[PEND]` pending, `[DONE]` done, `[SKIP]` skipped (unsafe, out of scope, denylisted, robots, budget), `[FAIL]` unreachable |
| Decision log | `[SKIP]` skip, `[RFSE]` refuse, `[MRGE]` merge, `[SPLT]` split, `[WARN]` warning, `[NOTE]` note |
| Trace | `[ OK ]` ok, `[RUN.]` running, `[RFSE]` refused, `[STOP]` stopped, `[FAIL]` error, `[INCM]` unfinished, `[PHSE]` phase, `[EVNT]` event |
| Records | `[DRFT]` draft, `[ OK ]` confirmed, `[RJCT]` rejected, `[OLD.]` superseded, `[WDRN]` withdrawn |
| Reviews | `[ OK ]` confirm, `[RJCT]` reject, `[NOTE]` comment |
| Follow-ups | `[OPEN]` open, `[WORK]` in progress, `[DONE]` done, `[BLKD]` blocked, `[CNCL]` cancelled |
| Process outcome | `[ OK ]` goal reached, `[BNDY]` boundary reached, `[STOP]` stopped, `[ABND]` abandoned |

*Seen in:* Every status column

*Labels:* `[ OK ]`, `[DRFT]`, `[BNDY]`, `[SKIP]`

*Related:* [Record status](#record-status), [Run](#run), [Frontier](#frontier), [Submit boundary](#submit-boundary)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="target"></a>

#### Target

**In a record's evidence table, the piece of recorded data the record cites, such as a state, form, action, network call or process step.**

Each evidence link on a record points at one target and says what it supports. Target kinds
are state, edge (transition), action, form, network call, rule candidate, open question,
decision, process, process step, another documentation record, or a review. Click the target
to open it on its run page.

Until R-22 the Actions table also had a "Target" column for a link's address; it is now
called "Links to", so "Target" has only this meaning.

*Seen in:* Record page → Evidence → Target

*Labels:* `Target`

*Related:* [Evidence link / cites](#evidence-link), [Evidence](#evidence)

<sub>Last changed in R-22, 2026-10-03.</sub>

## Business-analysis terms

### Statements and traceability

<a id="confidence"></a>

#### Confidence (observed / inferred / needs confirmation)

**How sure a statement is, either observed in the evidence, inferred as a reasonable deduction, or needing confirmation from someone who knows the business.**

- `observed`: seen in the UI, network traffic or data.
- `inferred`: deduced from what was seen, but not directly visible.
- `needs_confirmation`: about intent or the reason behind behaviour, which only a person can
  confirm.

The app shows what it does, never why. Keeping the three apart is the main protection against
documentation that reads as fact but is a guess.

*Seen in:* Confidence column on states; actions and records

*Labels:* `Confidence`, `observed`, `inferred`, `needs_confirmation`

*Related:* [Documentation record](#documentation-record), [Evidence link / cites](#evidence-link), [Assumption (ASM)](#assumption)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="documentation-record"></a>

#### Documentation record

**One unit of the BA's documentation, such as a screen, requirement or rule, with a key, revisions, evidence links and a status.**

Pathfinder's documentation is a set of small linked records rather than one long document.
There are twelve kinds (see Record key for the prefixes). The SRS export (R-16) will render
them into a readable document.

*Seen in:* Docs tab

*Labels:* `Records`, `Record`

*Related:* [Record key](#record-key), [Revision (Rev)](#revision), [Relations / linked records](#relations), [Layer A / Layer B](#layers)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="evidence-link"></a>

#### Evidence link / cites

**The link from a record to the recorded data that supports it, and a record without at least one is not allowed.**

Each revision cites its evidence: a target plus a note on what it supports. The "Cites"
column counts them and the record page lists them, so any statement can be checked against
what the crawler actually recorded.

*Seen in:* Records → Cites; Record page → Evidence

*Labels:* `Cites`, `Evidence`, `What it supports`

*Related:* [Target](#target), [Evidence](#evidence), [Traceability](#traceability)

*Read more:* [BA wiki: Traceability](../wiki/traceability.md)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="relations"></a>

#### Relations / linked records

**Typed links between records, such as a rule that enforces a requirement or a field that appears on a screen.**

Relation types: `contains`, `describes`, `refines`, `enforces`, `appears_on`, `uses_term`,
`synonym_of`, `answers`, `depends_on`. Relations belong to the revision that states them, so
they change with the record.

*Example:* On reference-insurer the most common are uses_term (44), appears_on (41) and contains (39).

*Seen in:* Record page → Relations; Linked records

*Labels:* `Relations`, `Linked records`

*Related:* [Documentation record](#documentation-record), [Traceability](#traceability)

*Read more:* [BA wiki: Traceability](../wiki/traceability.md)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="traceability"></a>

#### Traceability

**Being able to follow a requirement back to where it came from and forward to what depends on or tests it.**

In Pathfinder, backward traceability is built in: every record cites evidence and the
evidence names its run. Forward traceability runs through relations (rule → requirement →
use case) and, later, through test tags such as `@REQ-007`. The SRS export (R-16) will
include a traceability matrix.

*Seen in:* Record page; SRS export (R-16)

*Labels:* `Traceability`

*Related:* [Evidence link / cites](#evidence-link), [Relations / linked records](#relations), [SRS](#srs)

*Read more:* [BA wiki: Traceability](../wiki/traceability.md)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="review"></a>

#### Review (confirm / reject / comment)

**A person's decision on one revision of a record, where confirm approves it, reject sends it back and comment adds a note without deciding.**

Reviews are stored with the reviewer, time, action and revision. Reject and comment need a
text. Only the latest draft can be confirmed or rejected; comments can go on any revision.
The BA agent reads rejections and comments as feedback in its next session. In the
dashboard, review buttons appear only when a reviewer name is configured.

*Seen in:* Record page → Review; Reviews

*Labels:* `Review`, `Reviews`, `Decisions on revision`

*Related:* [Record status](#record-status), [Revision (Rev)](#revision)

*Read more:* [BA wiki: Requirements review and validation](../wiki/requirements-validation.md)

<sub>Last changed in R-22, 2026-10-03.</sub>

### Record kinds

<a id="capability"></a>

#### Capability (CAP)

**Something the business offers its users at a high level, such as quoting car insurance, grouping the screens and processes that deliver it.**

Capabilities give the big picture before the details. The BA writes them in pass 2 and links
them to screens and processes with `contains`.

*Example:* CAP-001 "Product information and help content".

*Seen in:* Docs tab → Capabilities

*Labels:* `Capability`, `CAP`

*Related:* [Screen (SCR)](#screen), [Process (PROC)](#process-record)

*Read more:* [BA wiki: Business capability](../wiki/business-capability.md)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="screen"></a>

#### Screen (SCR)

**One page or view of the portal as the BA documents it, with its purpose, route templates, elements and how you reach it.**

A screen usually corresponds to one cluster of states. It lists the elements by role and
verbatim label, so it doubles as a description a developer could rebuild the page from.

*Example:* SCR-001 "Home page with global header and footer".

*Seen in:* Docs tab → Screens

*Labels:* `Screen`, `SCR`

*Related:* [Cluster](#cluster), [State](#state), [Data item (DI)](#data-item)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="process-record"></a>

#### Process (PROC)

**A business process as the BA documents it, with its goal, persona, trigger, steps and outcome, based on trace runs.**

The documented counterpart of a traced process. It also records how far the evidence goes
(`observed_extent`), for example "up to the submit boundary", so nobody assumes the end of the
process was seen.

*Example:* PROC-001 "Calculate an OC/AC premium".

*Seen in:* Docs tab → Processes

*Labels:* `Process`, `PROC`

*Related:* [Process (trace mode)](#trace-process), [Use case (UC)](#use-case), [Capability (CAP)](#capability)

*Read more:* [BA wiki: As-is process modelling](../wiki/process-modelling-as-is.md)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="use-case"></a>

#### Use case (UC)

**One actor's goal told as a flow, with a main path and the alternative and exception paths, written in Cockburn style.**

Use cases turn a process into something a team can build and test against: who wants what,
the steps that work, and every way it can go differently.

*Example:* UC-001 "Guest calculates an OC/AC premium".

*Seen in:* Docs tab → Use cases

*Labels:* `Use case`, `UC`

*Related:* [Process (PROC)](#process-record), [Requirement (REQ)](#requirement), [Acceptance criteria](#acceptance-criteria)

*Read more:* [BA wiki: Use case](../wiki/use-case.md)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="requirement"></a>

#### Requirement (REQ)

**A statement of what the system must do, written so that it can be tested.**

Requirements describe behaviour the rebuilt system must keep. Each has acceptance criteria
and cites the evidence it was derived from. They become `confirmed` only through a person's
review.

*Example:* REQ-001 "Global menu and footer on every page".

*Seen in:* Docs tab → Requirements

*Labels:* `Requirement`, `REQ`

*Related:* [Non-functional requirement (NFR)](#nfr), [Acceptance criteria](#acceptance-criteria), [Business rule (BR)](#business-rule)

*Read more:* [BA wiki: Requirement](../wiki/requirement.md)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="nfr"></a>

#### Non-functional requirement (NFR)

**A quality the system must have rather than a function it performs, such as speed, accessibility or reliable navigation.**

Pathfinder writes NFRs only for what it actually measured (status codes, console errors,
labels, robots policy). Qualities it could not measure go to the gaps instead.

*Example:* NFR-004 "No broken internal navigation for a guest".

*Seen in:* Docs tab → NFRs

*Labels:* `NFR`

*Related:* [Requirement (REQ)](#requirement), [Gaps](#gaps)

*Read more:* [BA wiki: Non-functional requirement](../wiki/non-functional-requirement.md)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="acceptance-criteria"></a>

#### Acceptance criteria

**The concrete conditions that show a requirement is met, written as Given, When, Then.**

Each criterion is a small scenario: given a starting situation, when the user does something,
then the system responds in a stated way. They are what QA turns into tests.

*Seen in:* Requirement page → Acceptance criteria

*Labels:* `Acceptance criteria`

*Related:* [Requirement (REQ)](#requirement), [Use case (UC)](#use-case)

*Read more:* [BA wiki: Acceptance criteria](../wiki/acceptance-criteria.md)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="business-rule"></a>

#### Business rule (BR)

**A rule the business imposes regardless of screen layout, such as which fields are required or which values are allowed.**

Rules are written once and linked to every requirement, data item and screen they affect
(`enforces`, `appears_on`). Complex rules use a decision table.

*Example:* BR-012 "Contact form: required fields, lengths and formats".

*Seen in:* Docs tab → Business rules

*Labels:* `Business rule`, `BR`, `Rule`

*Related:* [Decision table](#decision-table), [Rule candidate](#rule-candidate), [Data item (DI)](#data-item)

*Read more:* [BA wiki: Business rule](../wiki/business-rule.md)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="decision-table"></a>

#### Decision table

**A table listing combinations of conditions and the outcome for each, used for rules with several inputs.**

In a business rule, the "if" columns are conditions and the "then" columns are results; each
row is one combination. It makes missing or contradictory cases easy to spot.

*Seen in:* Business rule page → if / then columns

*Labels:* `if`, `then`

*Related:* [Business rule (BR)](#business-rule)

*Read more:* [BA wiki: Decision table](../wiki/decision-table.md)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="data-item"></a>

#### Data item (DI)

**One piece of data the portal handles, such as a phone number field, with its verbatim label, type, format and observed constraints.**

Data items form the data dictionary. The label is kept exactly as the portal shows it, and
the constraints are those observed (required, pattern, length, options). `seen_in` says where
it appears.

*Example:* DI-015 "Telefon".

*Seen in:* Docs tab → Data items

*Labels:* `Data item`, `DI`

*Related:* [Business rule (BR)](#business-rule), [Glossary term (GL)](#glossary-term), [Network call shape](#network-call-shape)

*Read more:* [BA wiki: Data dictionary](../wiki/data-dictionary.md)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="glossary-term"></a>

#### Glossary term (GL)

**A business word the documented portal uses, kept verbatim with its meaning, such as "OC".**

These are the portal's terms, written by the BA agent. They are a different thing from this
glossary, which explains Pathfinder's own words.

*Example:* GL-001 "OC".

*Seen in:* Docs tab → Glossary

*Labels:* `Glossary term`, `GL`

*Related:* [Data item (DI)](#data-item)

*Read more:* [BA wiki: Glossary (as a BA deliverable)](../wiki/glossary.md)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="assumption"></a>

#### Assumption (ASM)

**Something the BA treats as true without proof, written down so it can be checked later.**

An assumption is honest about its uncertainty and lets the work continue. Each one should be
confirmed or replaced once someone who knows the business has looked at it.

*Example:* ASM-002 "Contact enquiries are answered by phone or e-mail".

*Seen in:* Docs tab → Assumptions

*Labels:* `Assumption`, `ASM`

*Related:* [Confidence (observed / inferred / needs confirmation)](#confidence)

*Read more:* [BA wiki: Assumption](../wiki/assumption.md)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="srs"></a>

#### SRS

**Software Requirements Specification, the complete requirements document a team could rebuild the system from.**

Pathfinder keeps requirements as linked records; the planned SRS export (R-16) renders them
into one document with chapters, diagrams, a traceability matrix and an Unknowns section.

*Seen in:* SRS export (R-16)

*Labels:* `SRS`

*Related:* [Traceability](#traceability), [Documentation record](#documentation-record), [As-is documentation](#as-is-documentation)

*Read more:* [BA wiki: Software requirements specification (SRS)](../wiki/software-requirements-specification.md)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="as-is-documentation"></a>

#### As-is documentation

**A description of how an existing system works today, as opposed to a to-be design of how it should work.**

Pathfinder only documents the as-is system, from the outside, so that it can be rebuilt. It
never proposes improvements in the documentation; those belong in a separate to-be design.

*Seen in:* Overall purpose of the Docs tab

*Labels:* `As-is`

*Related:* [SRS](#srs), [Layer A / Layer B](#layers)

*Read more:* [BA wiki: As-is process modelling](../wiki/process-modelling-as-is.md)

<sub>Last changed in R-22, 2026-10-03.</sub>
