# MudPuppy glossary

<!-- Generated from glossary.yaml by `uv run pathfinder-glossary --write` (apps/dashboard). Do not edit by hand. -->

This glossary explains Pathfinder's own vocabulary: the words the dashboard, the specs and the agents use for runs, evidence and documentation. It is not the portal glossary the BA agent writes (GL records in the Docs tab), which explains the documented website's business terms, such as "Składka" or "OC".

## MudPuppy terms

### Runs and setup

<a id="run"></a>

#### Run

**One session of the crawler against one portal, as one persona, in one mode, and everything it recorded on the way.**

A run starts when the crawler agent calls `start_run` and ends with `finish_run` or when
something stops it. Every state, action, form, network call shape, decision and question
it records belongs to that run, so the run is the unit you open to see "what happened".

Statuses on runs: Completed, Running, Stopped (on a warning, for example an anti-bot
block) and Interrupted (the process died or was stopped; it can be resumed without
repeating recorded work).

*Example:* The map run 01a0fe67… on reference-insurer completed with 12 states and 201 frontier items.

*Seen in:* Overview → Runs table; Run page header

*Labels:* `Run`, `Runs`

*Related:* [Mode (map / trace)](#mode), [Persona](#persona), [Environment](#environment), [Frontier](#frontier)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="mode"></a>

#### Mode (map / trace)

**What a run is for, either map mode, which explores the whole portal, or trace mode, which records one named process step by step.**

**Map** mode explores broadly: it visits every reachable state within scope and budget and
records what is there. It fills a form with test data before pressing its submit button
(form autofill), so the pages behind forms are mapped too, unless the portal's or
persona's limit forbids submitting.

**Trace** mode follows one named business process, such as "Oblicz składkę OC/AC", with
inputs from the persona, and records the ordered steps and what the portal did after each.
Where a limit forbids the next action it stops at the submit boundary. The BA asks for
trace runs through follow-up tasks when a map run is not enough.

*Seen in:* Runs table → Mode

*Labels:* `Mode`, `map`, `trace`

*Related:* [Run](#run), [Process (trace mode)](#trace-process), [Submit boundary](#submit-boundary), [Follow-up task (FUP)](#follow-up-task), [Form autofill](#form-autofill)

<sub>Last changed in R-42, 2026-10-13.</sub>

<a id="environment"></a>

#### Environment

**A copy of a site you declare per portal under a name of your choice (dev, acceptance, live, sandbox), with its own address, its own users and its own store.**

A portal has one or more environments (see Portal settings), named by you; no name has a
meaning of its own, "production" included (spec 030, R-61). Each environment has its own
test users and its own database file (`data/db/<name>.sqlite`), so scans and documentation
of two environments never mix. Nothing opens a store for a name no portal declares (a typo
used to create a stray, empty store), and there is no default: the servers and the chat need
`PATHFINDER_ENV` set to a declared name, and every crawler result says which environment
answered. Without a limit the crawler may fill, submit and log in; the BA sets a limit per
environment to restrict it. A CAPTCHA is handed to a human on every environment.

*Example:* a portal with dev https://dev.portal.test/ and acceptance https://acc.portal.test/ (only look)

*Seen in:* Portal settings; Runs table → Environment; every crawler result

*Labels:* `Environment`, `sandbox`, `staging`, `production`

*Related:* [Safety class](#safety-class), [Scope / denylist](#portal-scope), [Form autofill](#form-autofill), [Portal settings (environments)](#portal-settings), [Scan choices (edits, images)](#scan-choices)

<sub>Last changed in R-61, 2026-10-16.</sub>

<a id="persona"></a>

#### Persona

**Who the crawler acts as during a run, such as an anonymous guest, defined in a persona file that can only narrow what the portal config allows.**

A persona file (`personas/<portal>/<persona>.yaml`) says who is acting: logged in or not,
which inputs to type in trace mode, its own budgets and safety ceiling. Personas can extend
shared pieces (`personas/_mixins/`). The run's effective safety ceiling is the lower of the
portal's and the persona's, so a persona can restrict but never widen. Secrets are referenced,
never written in the file. Its `attributes` (tariff, contract, feature flags…) say what
decides that test user's access; Pathfinder shows them and never interprets them. Many
logged-in personas can be imported from a CSV of test users (`pnpm personas:import`).

*Example:* reference-insurer/guest extends the anonymous base mixin and the trace-input mixin.

*Seen in:* Runs table → Persona; Settings → Personas

*Labels:* `Persona`

*Related:* [Run](#run), [Safety class](#safety-class), [Budget](#budget), [Access-dependent content](#access-dependent)

<sub>Last changed in R-33, 2026-10-14.</sub>

<a id="reference-portal"></a>

#### Reference portal / ground truth

**A practice insurance website that Pathfinder runs locally, with a written answer key (the ground truth) used to measure how good the crawler's and the BA's results are.**

The reference portal is a fake Polish insurer, "Towarzystwo Ubezpieczeń Wzorcowych",
served on `http://127.0.0.1:4010` by `pnpm reference-portal` in `apps/crawler`. Because we
wrote it, we know everything it contains: its screens, fields, rules and processes are listed
in a ground-truth file, `ground-truth.yaml` (ground truth is always YAML, written and
reviewed by people, guideline G-34). Comparing the BA's documentation with that file shows
what was found, what was missed and what was over-claimed (`pnpm docs:evaluate`, see
Coverage score). Its data is safe to show and stable, which is why glossary examples come
from it. A live site we don't own keeps its ground truth in `apps/crawler/evals/ground-truth/`.

*Seen in:* Docs tab → reference-insurer; portals/reference-insurer

*Labels:* `reference-insurer`, `ground truth`

*Related:* [Run](#run), [Documentation record](#documentation-record), [Coverage score](#coverage-score), [Over-claim](#over-claim), [Eval task / suite](#eval-task)

<sub>Last changed in R-46, 2026-10-10.</sub>

<a id="coverage-score"></a>

#### Coverage score

**The share of a ground-truth category (screens, fields, constraints, rules, processes, terms) that the BA's documentation covers, as scored by `docs:evaluate`.**

`pnpm docs:evaluate <portal> --ground-truth <file>` compares the latest documentation records
with the reference portal's ground truth and gives one percentage per category, with the
missing ground-truth ids. Each category has a minimum (the SC-008 targets: screens 90,
fields 90, constraints 80, rules 70, processes 100, terms 80) and the command fails when one
is not met, so it can gate a pipeline run. Matching is deterministic: a screen by its route
template, a field by its verbatim label, a rule by its anchor screen, label and claim markers.
A score says the documentation mentions an item, not that it is complete: a rule counts when
any one of its claim markers appears.

`processes` counts a process only from trace evidence (or a boundary flag), so a map-only
run scores 0 there. `processes_map` (R-39) counts a process record whose cited evidence of
any kind covers the process's first and last routes; it is shown whenever the ground truth
has processes (minimum 80).

*Example:* Goal run 2026-10-04 on reference-insurer: screens 100 (17/17), rules 100 (16/16), 0 over-claims.

*Seen in:* data/exports/<portal>-eval.json; `pnpm docs:evaluate`

*Labels:* `Score`, `Coverage`, `processes_map`

*Related:* [Reference portal / ground truth](#reference-portal), [Over-claim](#over-claim)

<sub>Last changed in R-39, 2026-10-14.</sub>

<a id="over-claim"></a>

#### Over-claim

**A documentation record that states a rule as observed although the ground truth says a guest cannot observe it.**

Some of the reference portal's rules are hidden from a guest (behind the login, or only in
the back office). If the BA documents one of them with confidence `observed`, the evaluation
reports an over-claim: the documentation is more certain than the evidence allows. Recording
such a rule as `needs_confirmation` or flagged not observable is fine. The goal is 0
over-claims (SC-009); one over-claim fails `docs:evaluate`.

*Example:* The renewal window ("30 dni", only on the logged-in renewal page) documented as observed would be an over-claim.

*Seen in:* data/exports/<portal>-eval.json; `pnpm docs:evaluate`

*Labels:* `Over-claims`, `overclaims`

*Related:* [Coverage score](#coverage-score), [Confidence (observed / inferred / needs confirmation)](#confidence), [Reference portal / ground truth](#reference-portal)

<sub>Last changed in R-16, 2026-10-04.</sub>

<a id="portal-network"></a>

#### Portal network (proxy)

**How the browser reaches a portal behind a corporate network, through a forward proxy (with hosts that go direct) and a TLS-inspecting proxy's CA (trusted from a file, or errors ignored).**

`network:` in the portal file: `proxy: { server, bypass }`, `ca_file` and
`ignore_https_errors`. A portal that admits only the company's proxy answers 403 "not
whitelisted" otherwise. `ca_file` names a PEM file with the company's issuing CA: the server
and the browser trust that CA only, instead of ignoring every certificate error; the doctor
checks that the portal presents it. Robots.txt is read by the server, not the browser, so a
proxy-only portal sets `robots: ignore`. Before the first scan at a new site,
`pnpm --dir apps/crawler portal:doctor <portal>` checks the machine and the way to the portal
and names the cause of each problem with its fix.

*Example:* network: { proxy: { server: http://proxy.corp:3128, bypass: [cdn.example.net] }, ca_file: corp-ca.pem }

*Seen in:* Portal file → network; portal:doctor

*Labels:* `network`, `proxy`, `doctor`, `ca_file`

*Related:* [Environment](#environment), [Render warning](#render-warning)

<sub>Last changed in R-67, 2026-10-16.</sub>

<a id="access-dependent"></a>

#### Access-dependent content

**A screen or element that some test users see and others do not, found by scanning the same portal as several personas.**

When personas differ by their attributes (tariff, contract, feature flags), Pathfinder
compares what each one recorded. Per screen it lists who reached it, the variant each one
saw, and the elements only some of them see ("seen by" / "not seen by"). Only personas whose
scan finished count as "not seen": an interrupted scan shows nothing missing. A screen is
also marked when a persona with a finished scan never reached it, which can mean access or
just a scan that ran out of budget. Pathfinder never reads the attributes itself; the BA
documents the rule, citing one persona that sees the element and one that does not.

*Example:* Premium and B2B users see an Export button on Home; a basic user does not.

*Seen in:* Screen page → Access; Access by persona

*Labels:* `Access`, `seen by`, `not seen by`

*Related:* [Persona](#persona), [Run](#run), [Unexplained difference](#unexplained-difference)

<sub>Last changed in R-33, 2026-10-14.</sub>

<a id="unexplained-difference"></a>

#### Unexplained difference

**Something only some personas see that no documentation record explains yet; it waits in Review until one does.**

Every access-dependent element, and every screen some personas never reached, is a
difference. It counts as explained once a business rule cites the element on the screen of
a persona who sees it and the screen of one who does not (for a screen nobody else reached:
a rule or an open question citing that screen and a screen the other persona reached).
Until then it is listed in Review under "Unexplained differences", and the screen's Access
tab marks it "Unexplained". The tab also shows two personas' variants side by side: what
only one of them shows, what is the same element with other text, and how many are the same.

*Example:* The B2B-only Invoices entry on Account leaves Review once BR-004 cites it on the B2B user's screen and the basic user's screen.

*Seen in:* Review → Unexplained differences; Screen page → Access; Side by side

*Labels:* `Unexplained differences`, `Unexplained`, `Explained by`, `Side by side`

*Related:* [Access-dependent content](#access-dependent), [Persona](#persona), [Business rule (BR)](#business-rule)

<sub>Last changed in R-33, 2026-10-15.</sub>

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

*Related:* [Fingerprint](#fingerprint), [Cluster](#cluster), [Settled / never stabilized](#settled), [Transition](#transition), [Form step](#form-step), [State kind](#state-kind)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="form-step"></a>

#### Form step

**One step of a form flow on one address, numbered in the order the crawler first saw it (step 1, step 2, ...).**

A wizard drawn by script shows its steps on one URL. The crawler tells them apart by their
form controls: the same form name, or mostly the same fields, is the same step; other fields
start the next step. An option that reveals more fields stays in the same step. Every state
of the step (filled in, with an error message, after a failed request) belongs to it. The
screen page shows them under "States of this step".

*Example:* /sc19/apply holds step 1 "Your details" and step 2 "Your contract".

*Seen in:* Screen page → States of this step

*Labels:* `Form step`, `States of this step`

*Related:* [State](#state), [State kind](#state-kind), [Form probe](#form-probe)

<sub>Last changed in R-69, 2026-10-17.</sub>

<a id="state-kind"></a>

#### State kind

**What a state of a form step is - main, validation (the form refused input and says why) or technical (what a user sees when a request fails).**

A step is documented by its main state. Validation and technical states are states of that
step, never steps of the process. An error page seen once during a scan is not the step.

*Example:* The start-date message "Enter the start date as DD.MM.YYYY." is a validation state of step 2.

*Seen in:* Screen page → States of this step

*Labels:* `Main`, `Validation`, `Technical`

*Related:* [Form step](#form-step), [Form probe](#form-probe)

<sub>Last changed in R-69, 2026-10-17.</sub>

<a id="form-probe"></a>

#### Form probe

**A deliberate try on a form step beyond its happy path, defined once in a catalogue; every outcome is recorded as a state of the step.**

Probing happens only when asked: in a form-probing scan, on the steps you marked for probing (a
plain scan presses each form once with test values and never probes). After the happy path
the crawler calls `probe_form` on a marked step. The server tries:
- required fields left empty, wrong formats, values outside the limits (validation);
- every other option (branch); when an option adds fields (AC adds "Wartość pojazdu"),
  those fields get their own validation tries with that option chosen;
- the step's request blocked, answered with a server error, held, or the browser offline
  (technical, simulated in the crawler's own browser only).

A radio group's messages are filed under the group's name (its legend, e.g. "Zakres"), not
one option. Each outcome is one of: next, branch, validation, technical, temporary,
blocked. Probes run where the action limit allows submitting forms, at most 24 per step and
120 per scan unless the portal file says otherwise.

*Example:* On the quote form, "Business" led to a code confirmation (a branch, possibly a new process).

*Seen in:* Screen page → States of this step; Review → Probe suites to approve

*Labels:* `Form probes`

*Related:* [Form step](#form-step), [State kind](#state-kind), [Probe suite](#probe-suite), [Test data](#test-data), [Probe mark](#probe-mark), [Form-probing scan](#form-probing-scan)

<sub>Last changed in R-76, 2026-10-18.</sub>

<a id="probe-mark"></a>

#### Probe mark

**Your instruction on a form step to have the next form-probing scan try it beyond the happy path; shown as an orange Probe tag.**

Map the portal first and see what it has, then mark the form steps worth probing: open the
step's screen (Screens) and press "Mark for probing". The orange tag is a person's mark for
the next scan. Screens lists every form step as marked, probed (with the number of
outcomes) or not probed. A form-probing scan uses the mark when it has probed the step to the end;
"Remove the mark" drops it before that.

*Example:* Step 2 "Your contract" of /sc19/apply carries a Probe tag until the form-probing scan has tried it.

*Seen in:* Screens → Form probes; Screen page → States of this step

*Labels:* `Probe`, `Mark for probing`, `Remove the mark`, `Not probed`, `Probed`

*Related:* [Form probe](#form-probe), [Form-probing scan](#form-probing-scan), [Form step](#form-step)

<sub>Last changed in R-69, 2026-10-17.</sub>

<a id="form-probing-scan"></a>

#### Form-probing scan

**A scan that only probes the marked form steps of a portal; it does not map.**

Ask the assistant to "probe the marked forms". The crawler opens each marked step, presses
on with test values until it is there, and probes it within the budget (24 tries per step,
120 per scan). It does not follow other links. Without marks it is refused with what to do
first. It may submit forms, so a scan that only looks cannot probe. Called a "probe scan"
until MudPuppy 2.0, where a probe run is the headless driver's.

*Example:* "Probe the marked forms of scar-maker as quote-tester."

*Seen in:* Chat

*Labels:* `Probe forms`, `form_probing`

*Related:* [Probe mark](#probe-mark), [Form probe](#form-probe), [Run](#run), [Headless driver (probe run)](#headless-driver)

<sub>Last changed in R-81, 2026-10-20.</sub>

<a id="checkpoint"></a>

#### Checkpoint

**The recorded way back to a screen state, the shortest one a scan took, so a later scan can reach the state again by replaying it.**

Every scan stores, for each state it reached, the address it last opened and the actions it
pressed after it, with the values typed. A later scan replays this instead of exploring from
the start page. Scans from before checkpoints existed are replayed from their observations.
Where a scan once opened the screen straight from its address, that address is used (a
deep link); a screen only reachable by clicking is reached by clicking.

*Example:* The premium result page: open /kalkulator/opcje?…, press "Oblicz składkę" (1 step).

*Seen in:* Scans → Plan next scan ("replays 1 step"); the crawler's go_to_state

*Labels:* `replays N steps`, `opens by its URL`

*Related:* [Directed scan](#directed-scan), [State](#state), [Observation](#observation)

<sub>Last changed in R-66, 2026-10-17.</sub>

<a id="directed-scan"></a>

#### Directed scan

**A scan that starts at recorded screens by replaying how they were reached, instead of mapping from the start page.**

Four kinds. **Focused**: from the screens marked Start here or Focus, only as deep as you set.
**Recheck**: replay to the Recheck-marked screens and record what each shows now, nothing
more. **Retry a path**: replay to a failed action and press it once more, with a variation
(wait longer, other input, don't submit); each try is an attempt. **Continue**: pick up a
stopped scan from the screens with queued items, without redoing what it did. If a replayed
step lands on another screen, the scan says where ("diverged at step 2") and goes on with the
next start point. Skip marks keep actions and screens out of every scan while they are open.

*Example:* A focused scan from the premium result page with depth 1 recorded 15 screens one step from it.

*Seen in:* Scans → Plan next scan; Scans → Pick up (a stopped scan); Chat

*Labels:* `Focused`, `Recheck`, `Retry a path`, `Continue a stopped scan`, `Resume`, `Retry this path`, `Skip it`

*Related:* [Checkpoint](#checkpoint), [Scan mark](#scan-mark), [Run](#run), [Form-probing scan](#form-probing-scan)

<sub>Last changed in R-66, 2026-10-17.</sub>

<a id="scan-mark"></a>

#### Scan mark

**Your instruction on a screen or an action for the next scan, Start here, Focus, Recheck, Retry or Skip, set from the map's side panel.**

Marks are a person's intent, shown as orange tags; they collect in the Next scan plan. A
scan that uses Start here, Focus, Recheck or Retry marks closes them. Skip marks stay until
you remove them and keep the target out of every scan (for example a logout or a delete
button). Probe marks on form steps are the same idea for form-probing scans.

*Example:* Start here on /kalkulator/wynik, then Plan next scan → Focused → Start scan.

*Seen in:* Scans → Map side panel ("Next scan"); Scans → Plan next scan

*Labels:* `Start here`, `Focus`, `Recheck`, `Retry`, `Skip`, `Next scan plan`, `Plan the next scan`

*Related:* [Directed scan](#directed-scan), [Probe mark](#probe-mark)

<sub>Last changed in R-66, 2026-10-17.</sub>

<a id="scan-graph"></a>

#### Scan graph

**One scan drawn as a graph, the screens it saw and the moves it made, with what failed where and the screen it stopped on.**

The Graph tab of a scan's page, and where a scan that stopped or had something fail
opens. Red screens are where an action failed or a control could not be found again; red
lines are moves that failed; "Stopped here" marks the screen the scan ended on, with the
path to it from the first screen. Pick a screen to retry or skip what failed on it, or to
mark it Start here. Resume continues the whole scan. The map (Scans → Map) is every scan
of the portal at once; the scan graph is one.

*Example:* A shop scan stopped on /sklep/produkt/:param: the graph shows /sklep → product, Stopped here, Resume.

*Seen in:* A scan's page → Graph; Scans (Where it stopped; N failed)

*Labels:* `Graph`, `Where it stopped`, `How it went`, `Stopped here`, `Path to where it stopped`, `Screens in the order seen`, `Mark Start here`, `Retry this path`, `Skip it in the next scans`, `Resume`

*Related:* [Directed scan](#directed-scan), [Scan mark](#scan-mark), [Checkpoint](#checkpoint), [Run](#run)

<sub>Last changed in R-74, 2026-10-18.</sub>

<a id="portal-map"></a>

#### Portal map

**Every screen your scans recorded as a node, laid out by how far it is from the start page, under Scans → Map.**

Each screen is one node; several states of one screen (form steps, a validation or error
state) stack as a deck with a count. The lines show the first move into each screen; tick
All links for the rest (every page links to the footer pages, so all of them at once hide
the map). A page's queued, failed and blocked items are chips on its node. Pick one scan or
persona to grey out what it did not see; the list view shows the same screens as a table.
Select a node to see its states, the scans that saw it and where its actions lead, and mark
a form step for probing from there.

*Example:* /kalkulator/pojazd · 5 states · +3 queued, under / in the second row

*Seen in:* Scans → Map

*Labels:* `Screens by depth`, `All links`, `Not in these scans`

*Related:* [Map (live)](#live-map), [Probe mark](#probe-mark), [State](#state), [Frontier](#frontier)

<sub>Last changed in R-69, 2026-10-17.</sub>

<a id="probe-suite"></a>

#### Probe suite

**The form probes worth repeating every time, proposed by the BA agent per form and run only after the owner approves it in Review.**

The BA picks outcomes of a probing scan; the server builds a trace from them (the way to the
step, the values typed, the fault). In Review you keep or drop each variant and say what it
should do, then approve it: it is written into the portal's traces.yaml and runs the same
way every time with `pnpm portal:trace`.

*Example:* "Get a quote": happy-path, business, quote-500, bad-date.

*Seen in:* Review → Probe suites to approve

*Labels:* `Probe suites to approve`, `Approve the suite`

*Related:* [Form probe](#form-probe), [Trace catalogue](#trace-catalogue)

<sub>Last changed in R-69, 2026-10-17.</sub>

<a id="test-data"></a>

#### Test data

**The persona's valid, synthetic values for form fields, by the field's label; probes and autofill use them first.**

When a step's happy path fails with the values the crawler has, the scan names the fields
(missing test data) and the assistant asks you once, then saves your answers in the
persona's test_data. Personal data is refused.

*Example:* Start date: 01.01.2027 for the quote form.

*Seen in:* Assistant; persona files

*Labels:* `Test data`, `missing test data`

*Related:* [Persona](#persona), [Form probe](#form-probe)

<sub>Last changed in R-69, 2026-10-17.</sub>

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

*Related:* [State](#state), [Cluster](#cluster), [Fingerprint profile](#fingerprint-profile)

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

The wait gives up after a quiet limit with no progress (10 s by default) and never lasts
longer than a hard limit (30 s), so a page that keeps loading new parts gets more time than
a stuck one. Progress is a request to a path the page has not asked for before, a new URL,
or more or fewer elements on the page; a poll of the same address is not progress. The
micro-frontend mount wait works the same way (quiet limit 3 s). Both limits can be set per
portal and per URL under `timeouts`.

*Example:* All 12 states of the reference map run are settled.

*Seen in:* States observed → Stabilization; Run trace → settle phase

*Labels:* `Stabilization`, `settled`, `never_stabilized`

*Related:* [State](#state), [Tool call / phase / span](#tool-call)

<sub>Last changed in R-67, 2026-10-16.</sub>

<a id="transition"></a>

#### Transition

**An action that leads from one state to another, such as clicking a menu link, recorded with its safety class and locators.**

States are the dots of the portal map and transitions are the arrows. A transition records
the state it started from, the state it led to (or none), the action that caused it, its
safety class and whether it was executed or skipped. Skipped transitions are kept so the
map shows what exists even where the crawler did not go. Since MudPuppy 2.0 a transition is
also a numbered step of its journey, with the element key, the kind of step and its
result. Called an "edge" (table `edges`) until 2.0; the map still draws it as a line.

*Seen in:* Map diagrams; Run trace; get_run_evidence transitions

*Labels:* `Transition`, `transitions`

*Related:* [State](#state), [Safety class](#safety-class), [Top locator](#top-locator)

<sub>Last changed in R-81, 2026-10-20.</sub>

<a id="portal-scope"></a>

#### Scope / denylist

**The part of a site the crawler may visit (domains and paths in the portal config) and the URLs or actions it must never touch.**

The portal config lists `allowed_domains` and its URL lists (`urls.allowed`, absent for
everything, and `urls.disallowed`, which always wins); anything else is out of scope and
skipped with the reason `out_of_scope` ("excluded by rule …"). The `denylist` names controls
that are forbidden even inside scope, such as logout or payment; those are skipped as
`denylisted`. Both appear as skip reasons on the frontier.

*Example:* reference-insurer allows 127.0.0.1 and lists /__admin/* in urls.disallowed.

*Seen in:* Frontier → Status; skip reasons

*Labels:* `Scope`, `Denylist`, `out_of_scope`, `denylisted`

*Related:* [Frontier](#frontier), [Budget](#budget), [Environment](#environment), [Portal hook](#portal-hook), [Transit zone](#transit-zone)

<sub>Last changed in R-53, 2026-10-14.</sub>

<a id="transit-zone"></a>

#### Transit zone

**The hosts a login passes through on its way to the portal, such as an identity provider; learned on every login, not configured.**

After "Log in" the browser may visit other hosts before it lands on the portal: a single
sign-on provider, a "checking your device" page, a callback. Every host other than the
portal's own that the browser enters while the login runs is that login's transit zone.
During the login the scan's scope does not block it (a focused scan can still log in);
the "do not touch" lists, robots.txt and the action limit still apply. "Logged in" by
address alone is not believed while the browser is still on a transit host. Each provider
page is kept with its snapshot and screenshot as a transit page of the login's redirect
chain (they matter for a migration), never as a screen of the portal, and never explored.

*Example:* Logging in to scar-maker-sso passes through 127.0.0.2 (the identity provider).

*Seen in:* login result (transit_hosts); URLs → redirect hops

*Labels:* `Transit zone`, `transit host`, `transit page`

*Related:* [Scope / denylist](#portal-scope), [Environment](#environment)

<sub>Last changed in R-62, 2026-10-18.</sub>

<a id="portal-hook"></a>

#### Portal hook

**A small piece of the owner's code that fixes one portal's quirk at a set point of a scan, such as adding a cookie or patching a broken script.**

Hooks live in `portals/<id>/hooks.ts` and are switched on in the portal file under `hooks:`
with the point they run at (`onRunStart`, `onBeforePageLoad`, `onPageLoad`,
`onBeforeClickAction`, `onRunEnd`), optionally only on matching URLs. A hook may set cookies,
add a script, run code in the page, skip a page or an action, or open another URL. Every run
is recorded in the trace and the decision log, and a screen a hook changed is marked "patched
by hook", so the documentation never describes the patch as the portal's own behaviour. A
failing hook is recorded and the scan goes on. The crawler agent never writes hooks.

*Example:* An onRunStart hook adds a portal's consent cookie, so its banner never covers the page.

*Seen in:* Scan page → Portal hooks; Decisions

*Labels:* `Hooks`, `patched by hook`

*Related:* [Scope / denylist](#portal-scope), [Environment](#environment), [Fix-plugin](#fix-plugin)

<sub>Last changed in R-53, 2026-10-14.</sub>

<a id="fix-plugin"></a>

#### Fix-plugin

**A tested, reusable solution to one kind of portal quirk, turned on per portal with that portal's own data instead of writing a hook.**

Fixes live in Pathfinder (`@pathfinder/fix-plugins`); a portal turns one on under `fixes:` in
its portal file, with the data it needs (a cookie name, selectors, a URL pattern). Today:
`seed-cookie` (content shown only with a feature-flag cookie), `expand-collapsed` (open
accordions and "show more" before the page is read, never a real link or submit),
`wait-for-mount` (wait for a late micro-frontend) and `detect-stack` (tag a page as new SPA or
legacy). A fix runs like a hook and is recorded as `fix:<name>`; the client's data stays in the
portal file. Each fix is proven against a scar.

*Example:* fixes: [{ use: expand-collapsed, with: { max: 60 } }] opens the closed service sections of a page.

*Seen in:* Portal file → fixes; Decisions (fix:…)

*Labels:* `fixes`, `fix-plugin`

*Related:* [Portal hook](#portal-hook), [Scar (scar-maker)](#scar)

<sub>Last changed in R-59, 2026-10-16.</sub>

<a id="transient-error-page"></a>

#### Transient error page

**A page that only says a server error happened (a 5xx, or a short "technical error, try again later"); the crawler opens it again before recording anything.**

Some portals answer now and then with an error page although the screen works. The crawler
re-opens such a page (at most twice) before it reads it, and notes each attempt
(`transient_error`), so an error page never becomes a screen in place of the real one and the
documentation keeps the real screens. A page still failing after that is recorded as it is.

*Example:* item-3 answered a 503, was re-opened once and came back with its table.

*Seen in:* Decisions (transient_error); Run trace

*Labels:* `transient_error`

*Related:* [Render warning](#render-warning)

<sub>Last changed in R-60, 2026-10-16.</sub>

<a id="render-warning"></a>

#### Render warning

**A note on a screen that some of its stylesheets, scripts or fonts did not load, so its screenshot may show a broken look that is not the portal's design.**

Behind a corporate proxy a CDN can be refused and a page renders unstyled or half working.
The screen then carries a `render:assets_failed` warning naming each failed file, so nobody
documents the broken look as the design. Fix the network (a proxy bypass for the CDN) and
scan again.

*Example:* render:assets_failed: stylesheet …/theme.css (403), script …/widget.js (403).

*Seen in:* Decisions (render:assets_failed)

*Labels:* `render:assets_failed`

*Related:* [Transient error page](#transient-error-page), [Portal network (proxy)](#portal-network)

<sub>Last changed in R-60, 2026-10-16.</sub>

<a id="trace-catalogue"></a>

#### Trace catalogue

**The list of a portal's processes to drive to their end, with the fields to fill by label and variants such as the happy path and each validation error.**

`portals/<id>/traces.yaml` names each process (start page, steps by visible label, the submit)
and its variants; `pnpm --dir apps/crawler portal:trace <portal> <id|all> <persona>` walks each
variant as one trace run, the same way every time. The persona's limit decides whether the
submit is pressed; each step's snapshot keeps the validation messages. A process known to
exist but not mapped yet is a stub (`to_be_discovered`).

*Example:* apply: happy-path reaches the success page; too-young stops at a disabled Next.

*Seen in:* portals/<id>/traces.yaml; portal:trace

*Labels:* `traces.yaml`, `portal:trace`, `variant`

*Related:* [Mode (map / trace)](#mode)

<sub>Last changed in R-64, 2026-10-16.</sub>

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

<a id="form-autofill"></a>

#### Form autofill

**In map mode, the crawler fills a form with test data just before it presses the form's submit button, so it can reach the page behind the form.**

Values come from the persona's inputs when it has one for the field's label, otherwise from
a fixed generator per field type (an e-mail on a test domain, a number inside the field's
limits, the first real option of a list). Each autofill is written to the trace and the
decision log with the field names and values. Where the portal's or persona's limit refuses
the submit, nothing is filled or sent. Every environment is treated the same (spec 021).

*Seen in:* Run page → Trace → form_autofill; Run page → Decisions

*Labels:* `Autofill`, `form_autofill`

*Related:* [Mode (map / trace)](#mode), [Environment](#environment), [Persona](#persona), [Safety class](#safety-class)

<sub>Last changed in R-42, 2026-10-13.</sub>

<a id="page-composition"></a>

#### Page composition

**Per observation, the page's structure: frames, micro-frontend mount points, module loaders, bundles and clickable element counts.**

When the crawler records a page, it observes not just the content but the structure: which
frames it contains (legacy framesets or modern iframes), where micro-frontends mount (`#root`,
`[data-mfe]`), whether modules are loaded dynamically, how many JavaScript bundles are
running and how many clickable elements it found. Page composition shows the page's
architecture, not just its text and forms.

*Seen in:* Run page → State details; State page

*Labels:* `Page composition`, `composition`

*Related:* [Mount point](#mount-point), [State](#state)

<sub>Last changed in R-28, 2026-10-09.</sub>

<a id="mount-point"></a>

#### Mount point

**An element a micro-frontend renders into, such as `#root` or `[data-mfe]`.**

In modern multi-frontend architectures, a shell page contains placeholders (mount points)
where each micro-frontend renders its own tree. The crawler observes and records these:
an element with an id or data attribute that marks it as a destination for a dynamic
subtree. Understanding mount points helps trace how a page is composed from pieces.

*Seen in:* Run page → State details; page composition

*Labels:* `Mount point`, `mfe mount`

*Related:* [Page composition](#page-composition), [State](#state)

<sub>Last changed in R-28, 2026-10-09.</sub>

<a id="div-form"></a>

#### Div form

**Inputs outside any `<form>` element recorded as a form, one per container with a submit-like control.**

Legacy and modern portals sometimes build forms from divs without using the HTML `<form>`
element: input fields as divs or spans, and a submit button elsewhere. The crawler recognizes
them by finding a container with input-like controls and a submit-like button, and records
them as a form. The container's structure shows which fields belong together.

*Seen in:* Run page → Forms; Actions

*Labels:* `Div form`, `form`

*Related:* [Form autofill](#form-autofill), [State](#state)

<sub>Last changed in R-28, 2026-10-09.</sub>

### Documentation

<a id="scans-by-process"></a>

#### Scans by process

**Which scans belong to which documented process, which belong to none, and which look like one process nobody documented yet.**

A scan belongs to a process when the process's documentation cites it or when it walked at
least two of the process's screens (error pages don't count). Scans in no process are listed
so they are not forgotten; scans in no process that share at least half of their screens are
proposed as one group. The BA gets the same list for a process from `open_process_update`.

*Example:* PROC-001 has six scans; two contact-form traces sit in no process and are proposed as one group.

*Seen in:* Scans → By process

*Labels:* `By process`, `In no process`, `Look like one process`

*Related:* [Documentation update](#documentation-update), [Process (PROC)](#process-record), [Run](#run)

<sub>Last changed in R-70, 2026-10-17.</sub>

<a id="documentation-update"></a>

#### Documentation update

**The BA documents a process again by revising its records with what new scans show, never by rebuilding them from fewer scans.**

Ask the assistant to update a process (PROC-… or PRC-…). The BA first reads the process as
it stands, every scan of it (new ones marked), the screens no record cites yet and the error
pages; then it revises. The server refuses a revision that silently drops evidence or
use-case steps (the BA must name what it leaves out and why) and a process that cites only
error pages.

*Example:* Updating PROC-001 revised the process, its use case and four screens and added 12 screen records, from all six scans.

*Seen in:* Chat ("update PROC-001"); A revision's change note ("Dropped 1 evidence link(s) …")

*Labels:* `Dropped`

*Related:* [Scans by process](#scans-by-process), [Revision (Rev)](#revision), [Process (PROC)](#process-record)

<sub>Last changed in R-70, 2026-10-17.</sub>

<a id="process-documentation"></a>

#### Process documentation (export)

**The documentation a team (or an agent) rebuilds a process from, a folder with its steps, business and functional requirements, EARS, contracts, gaps, pictures and process.json.**

One folder per process: README (what the service does), PROCESS_STEPS (each step's states
with screenshots, the wireframe and a table of its fields), BUSINESS_REQUIREMENTS (goals and
rules with decision tables and pseudo-code), FUNCTIONAL_REQUIREMENTS (requirements with
acceptance criteria, NFRs), EARS, CONTRACTS (the APIs each step calls, attempts, samples
recorded outside production) with openapi.yaml, GAPS and process.json for agents. A whole
portal is a folder with its README, glossary, API index and screen list and one folder per
process. Open it on a process record's or process's page (Documentation), download the zip,
or run `pnpm docs:process-export`.

*Example:* reference-insurer PROC-001: 6 steps, 14 fields, 1 endpoint (POST /kalkulator/zakup).

*Seen in:* Docs → a PROC record → Documentation; Processes → a process → Documentation

*Labels:* `Documentation`, `Download the folder (zip)`

*Related:* [EARS statement](#ears), [SRS export](#srs-export), [Process (PROC)](#process-record)

<sub>Last changed in R-68, 2026-10-17.</sub>

### Portal model

<a id="fingerprint-profile"></a>

#### Fingerprint profile

**The rules a portal's pages are fingerprinted with, set in its portal file, such as "a menu link more is the same page".**

Which parts of a page count for its identity is a choice, and portals differ: repeated rows
of a table are data, a form's field names are structure, a menu that gains a link may or
may not make a new page version. A profile writes these choices down: the roles whose
repeats are rows, the roles whose names are form fields, the containers whose names are
ignored, and the similarity threshold. The built-in `rows-v2` is the default; a portal may
define its own and say which one it uses. Every observation and model version records the
profile it was made with, and the portal model never mixes two. An existing portal is
switched by recomputing from the stored snapshots, without a new scan.

*Example:* `fingerprint: { use: no-menu, profiles: { no-menu: { ignore_names_in: [navigation] } } }`

*Seen in:* portal.yaml; Settings → Screen identity; pnpm model:refingerprint

*Labels:* `fingerprint profile`, `rows-v2`, `no-menu`, `ignore_names_in`

*Related:* [Fingerprint](#fingerprint), [State](#state), [Screen threshold (τ)](#screen-threshold)

<sub>Last changed in R-81, 2026-10-20.</sub>

<a id="screen-threshold"></a>

#### Screen threshold (τ)

**How similar two versions of a page must be to count as one screen; a person accepts the value the labelled pairs suggest.**

Two page versions on the same route are one screen when their similarity reaches τ. Until
a person accepts another value it is the fingerprint profile's own threshold (0.9 for
`rows-v2`). When enough page pairs are labelled "the same" and "different", the labels
suggest the τ that separates them best; Settings ▸ Screen identity (or `pnpm model:pairs`)
shows it, and accepting it there (or `pnpm model:decide … accept-tau`) puts it in force for
that portal and profile. The next model version uses it. Pairs are labelled on Same screen?.

*Example:* τ 0.93, accepted by the owner after 60 labelled pairs.

*Seen in:* Settings → Screen identity; Same screen?; pnpm model:pairs

*Labels:* `τ`, `accept-tau`, `threshold`

*Related:* [Fingerprint profile](#fingerprint-profile), [Screen (SCR)](#screen)

<sub>Last changed in R-81, 2026-10-20.</sub>

<a id="portal-model"></a>

#### Portal model

**One stored picture of the portal as it is now, rebuilt from every scan by deterministic code after each run, with screens and links that keep their ids.**

Scans add evidence; the portal model reads all of it and says what the portal looks like
now: which screens exist (each a group of near-identical page versions), which links lead
where, which ones were not seen lately, and which release served each page. It is rebuilt
after every scan (and with `pnpm model:reconcile <portal>`); a rebuild never renames a screen.
Each rebuild is a numbered model version. The raw scans are never changed by it.

*Example:* After two scans, model version 2 of reference-insurer has 17 screens; SC-0008 is the vehicle form with two page versions.

*Seen in:* Home; Changes; Screens; Screens → Map

*Labels:* `portal model`, `model version`, `model`, `Rebuild model`

*Related:* [Screen of the model (SC-)](#model-screen), [Change (deviation)](#deviation), [State](#state)

<sub>Last changed in R-81, 2026-10-21.</sub>

<a id="model-screen"></a>

#### Screen of the model (SC-)

**A screen as the portal model keeps it, a group of page versions that are the same page, with a key like SC-0012 that stays the same across scans.**

The model groups page versions (states) by route and structure, whatever order the scans
saw them in. When a later scan shows that two screens are one, or one is two, the model
merges or splits them and records why (lineage), instead of renaming anything. A person
can say "same screen" or "different screen" for two page versions; the next rebuild follows it.
On screen a screen is Active, Merged or Retired; retired screens are kept.

*Example:* SC-0001 is the start page; its variants r1 and r2 differ only by the release.

*Seen in:* Screens; Screens → Map; Changes

*Labels:* `screen`, `SC-`, `model screen`, `Active`, `Merged`, `Retired`

*Related:* [Portal model](#portal-model), [Variant (r1, r2…)](#screen-variant), [Screen revision (observed)](#screen-revision), [State](#state)

<sub>Last changed in R-81, 2026-10-21.</sub>

<a id="screen-variant"></a>

#### Variant (r1, r2…)

**One way a screen looked, a page version the model keeps in that screen, and why it differs from the first one.**

Every variant says why it differs: Release (the portal part's release changed), Persona
(only one persona sees it), Error, A/B test, Data (content that depends on what was typed)
or Unknown. The why comes from the explanation of the change that brought the variant; the
first one is the Baseline. A screen's page shows its variants side by side.

*Example:* r3 · A/B test? · banner "Oferta specjalna" on 6 of 11 visits.

*Seen in:* Screens → screen page; Screens → Map → inspector; Same screen?

*Labels:* `variant`, `Baseline`, `why`

*Related:* [Screen of the model (SC-)](#model-screen), [Change (deviation)](#deviation), [Same screen? (a pair label)](#same-screen-label)

<sub>Last changed in R-81, 2026-10-21.</sub>

<a id="model-link"></a>

#### Link and action (link states)

**A link leads to another screen and is drawn on the Map; an action stays inside its screen (a dialog, a field) and is only counted on it.**

A link is Active, Not seen since a date (missing on later visits), Not checked (not followed
yet on the part's current release), Retired (gone, kept) or Replaced by a new one. Links on
every page, such as the menu, are bundled on the Map instead of drawn, unless one changed.
"Checked 8 / 11" on a screen counts its actions tried on the current release.

*Example:* Moje polisy · menu link · Not seen since 17 Oct.

*Seen in:* Screens → Map; Screens → screen page

*Labels:* `link`, `action`, `Not seen since`, `Not checked`, `Retired`, `checked`, `bundled`

*Related:* [Screen of the model (SC-)](#model-screen), [Portal model](#portal-model)

<sub>Last changed in R-81, 2026-10-21.</sub>

<a id="journey"></a>

#### Journey

**One continuous path of a scan, from where it started to where it stopped going on, so every step and every typed value has a position.**

A scan is cut into journeys wherever the path is not continuous: a typed address, a replay
to a known screen (Start here), a login, a fresh session. Steps are numbered within their
journey and record the element, the kind (click, fill, select, submit), and what came of it.
Values typed and shown along a journey are kept, so business rules can be found later.

*Seen in:* scan evidence

*Labels:* `journey`, `path`

*Related:* [Run](#run), [Step result](#step-result), [Transition](#transition)

<sub>Last changed in R-81, 2026-10-19.</sub>

<a id="step-result"></a>

#### Step result

**What a visit or a step came to, one of ok, validation, business error, technical error, timeout or blocked.**

Technical error is a server or browser failure; business error is a page that matches a
message the portal names as a refusal (`model.business_errors` in portal.yaml); validation is
the form pointing at its own fields; timeout is a page that never settled; blocked is an
action the safety rules refused. A changed result on a known step is a change of its own.

*Labels:* `step result`, `result`, `business error`, `technical error`

*Related:* [Journey](#journey), [Change (deviation)](#deviation)

<sub>Last changed in R-81, 2026-10-19.</sub>

<a id="release"></a>

#### Release (build)

**The version of the portal's code a page was served by, read from its content-hashed bundle names or from a version header or meta tag the portal names.**

Each visit records the release of the shell and of every embedded app (frame or
micro-frontend). A change seen on a new release is drift; the same change on the same
release needs another explanation (another persona, an A/B test, an error). A portal with
no hashed bundles and no marker shows as "unknown" and changes are judged more slowly.
The shell and each embedded app are portal parts, each with its own releases; old and new
release served at the same time is a rollout. The release marker is a Settings ▸ Hints item.

*Example:* Shell 3e1a · Kalkulator app 9c21; rollout 16 Oct 14:02 – 17 Oct 09:30.

*Seen in:* Home; Changes → release lanes; Settings → Hints

*Labels:* `release`, `build`, `build epoch`, `portal part`, `rollout`

*Related:* [Portal model](#portal-model), [Change (deviation)](#deviation), [Hints (Settings)](#portal-hints)

<sub>Last changed in R-81, 2026-10-21.</sub>

<a id="deviation"></a>

#### Change (deviation)

**A place where a new model version does not fit the previous one, such as a new screen, a page that looks different, an action that is gone or leads elsewhere.**

After each rebuild the model compares itself with the version before. Every difference is
a change, recorded once (seeing it again adds to the same row). Rules R1–R8 explain most
changes from the evidence; the rest wait for a person or for a check the system runs itself.
The Changes page lists them by process and screen, each with its explanation; what needs a
person waits in Review, and Before / after shows the two recorded pages side by side.

*Seen in:* Changes; Changes → Before / after; Review

*Labels:* `change`, `deviation`, `What changed`, `Before / after`

*Related:* [Finding and explanation (hypothesis, H-)](#hypothesis), [Explained automatically (derived fact)](#derived-fact), [Release (build)](#release)

<sub>Last changed in R-81, 2026-10-21.</sub>

<a id="hypothesis"></a>

#### Finding and explanation (hypothesis, H-)

**A finding is what the system noticed; its explanation is why it thinks it happened, such as "this screen changed with a new release", with the evidence and the test that would refute it.**

Inside, both are one claim with a key (H-0001), a kind, its evidence and an event history in
which every status change carries a reason. A claim a published rule decides is explained
automatically; anything else is a finding that needs you, until a person confirms or rejects
it in Review (or with `pnpm model:decide`), always with a one-line reason.

*Example:* Banner on 6 of 11 visits · A/B test? · Needs you.

*Seen in:* Review; Changes; Screens → screen page

*Labels:* `finding`, `explanation`, `claim`, `hypothesis`, `H-`, `Needs you`

*Related:* [Change (deviation)](#deviation), [Explained automatically (derived fact)](#derived-fact)

<sub>Last changed in R-81, 2026-10-21.</sub>

<a id="derived-fact"></a>

#### Explained automatically (derived fact)

**A claim the system confirmed by itself because a published rule decides it from the evidence, shown with its rule and reversible by a person.**

Constitution 6.0.0: the reconciler may record facts that follow from evidence by a published
rule (R1–R8) without approval. Each names its rule, appears on Changes and in Review's
Explained automatically tab, and can be overturned with a reason (Overturn is planned, R-87);
an overturned fact is never written again for the same change.

*Seen in:* Review → Explained automatically; Changes

*Labels:* `explained automatically`, `derived fact`, `overturn`

*Related:* [Finding and explanation (hypothesis, H-)](#hypothesis), [Change (deviation)](#deviation)

<sub>Last changed in R-81, 2026-10-19.</sub>

<a id="model-element-key"></a>

#### Element key of the model

**The name that matches one element across scans, its role, masked name, the containers it sits in and its position when it repeats, such as button|oblicz składkę|main>form "Dane pojazdu"|.**

Not the element key of a screen region (`role "name"#n`), which names elements of one
recorded page. The model's key ignores numbers in names and adds the container path, so the
same button is the same action in every scan; a moved link gets a new key and the model says
which one it replaces.

*Labels:* `element key of the model`, `action key`

*Related:* [Element key](#element-key), [Screen of the model (SC-)](#model-screen)

<sub>Last changed in R-81, 2026-10-19.</sub>

<a id="headless-driver"></a>

#### Headless driver (probe run)

**Code that repeats a recorded path through the portal in a fresh browser session, without the LLM, to check a claim; each repeat (a replay) is one probe run.**

The crawler agent explores; the headless driver only repeats. It walks the clicks and
submits of a recorded journey again, finding each element by its element key of the model,
and fills forms with the values a check needs. Every step goes through the same safety
gates and is recorded like the agent's, marked as driven headless. A step it cannot find
again ends the replay: the check is inconclusive, never failed. `pnpm model:replay` runs
the waiting checks within a budget (20 replays by default). Its runs have the mode
`probe`; they are not form-probing scans, which try marked form steps with wrong data.

*Seen in:* What changed; Scans

*Labels:* `headless driver`, `probe run`, `replay`

*Related:* [Boundary test](#boundary-test), [Change (deviation)](#deviation), [Journey](#journey), [Form-probing scan](#form-probing-scan)

<sub>Last changed in R-81, 2026-10-20.</sub>

<a id="decision-rule"></a>

#### Decision rule

**A business rule found in the scans, where one action leads to different screens depending on the data typed, written as a decision table (DMN).**

When the same button sometimes leads to one screen and sometimes to another, the system
compares the values typed before each press and finds the rule that separates the outcomes,
such as "drivers under 18 are refused". The rule is a claim: its boundary tests check it,
a person confirms it, and the rules export as DMN tables, Markdown pages (the sentence, then
the table) and one CSV (Rules → Export, or `pnpm model:rules-export`).

*Example:* H-0002 "Drivers under 18 are refused" on SC-0003, supported by 3 boundary tests.

*Seen in:* Rules; Rules → In the export; What changed → Decision rules; process export rules/*.dmn

*Labels:* `decision rule`, `business rule`, `DMN`, `Broken`, `Tested`, `Replaced`

*Related:* [Boundary test](#boundary-test), [Finding and explanation (hypothesis, H-)](#hypothesis)

<sub>Last changed in R-81, 2026-10-19.</sub>

<a id="boundary-test"></a>

#### Boundary test

**A replay just below, at and just above a rule's threshold (age 17, 18 and 19 for "under 18"), which supports the rule or refutes it.**

Scans rarely type values right at a threshold, so a mined rule may say "under 22" when the
portal means "under 18". Boundary tests replay a recorded execution with the threshold's
neighbours. All give the predicted outcome: the rule is supported (a person still confirms).
One does not: the rule is refuted and is mined again with the new rows.

*Seen in:* Rules → rule page; What changed → Decision rules

*Labels:* `boundary test`, `supported`, `refuted`, `Pass`, `Fail`

*Related:* [Decision rule](#decision-rule), [Headless driver (probe run)](#headless-driver)

<sub>Last changed in R-81, 2026-10-19.</sub>

<a id="process-proposal"></a>

#### Proposed process (from the model)

**A group of screens the system proposes as one process, because they share ids in their requests, embedded apps, API families, a form or direct links.**

`pnpm model:propose` weighs how strongly each pair of screens belongs together and cuts the
graph into groups (the Leiden method). Each group of two or more screens becomes an open
grouping suggestion on the Processes page, starting at the screen reached from outside the
group. A person accepts, edits or dismisses it; a dismissed group is not proposed again.

*Seen in:* Processes

*Labels:* `proposed process`, `grouping suggestion`

*Related:* [Portal model](#portal-model), [Screen of the model (SC-)](#model-screen)

<sub>Last changed in R-81, 2026-10-19.</sub>

<a id="process-instance"></a>

#### Process instance (trigger and outcome)

**One walk through a process in a scan, from its trigger (the link or button that entered it) to its outcome (completed, exited, error, abandoned or not finished).**

A process starts at its own first screen. The click that opens that screen from outside the
process is its trigger; the pages walked before it are only the way there, never steps. The
walk ends when a business error shows (error), when the person leaves through the menu
(abandoned), when a link leads out of the process (exited), or, at the end of the scan, on
the screen where the process finishes (completed) or anywhere else (incomplete). The
distinct screen sequences of the instances are the process's paths.

*Example:* Pressed on SC-0004 → link Oblicz składkę · 3×; 2 completed · 1 exited.

*Seen in:* Processes → process page → In the portal model; process export README

*Labels:* `trigger`, `outcome`, `ways in`, `paths`

*Related:* [Proposed process (from the model)](#process-proposal), [Explored (process)](#explored-process)

<sub>Last changed in R-81, 2026-10-20.</sub>

<a id="explored-process"></a>

#### Explored (process)

**How far a process was tried on the current releases: every action of its screens once per persona, every pair of consecutive actions once, then random walks inside it.**

`pnpm model:explore` turns what is still missing into replays for the headless driver and
runs them. A pass where every gap could be reached is recorded; it counts as explored
(Thorough) when it found no new change, and the documentation states the bound, e.g.
"Explored to depth 2 plus 50 random walks on builds shell 3e1a; no counterexamples."
Processes not explored on the current releases are the planner's lowest priority.

*Seen in:* Processes → process page → In the portal model; process export README

*Labels:* `explored`, `thorough`, `partial`, `not explored`

*Related:* [Process instance (trigger and outcome)](#process-instance), [Headless driver (probe run)](#headless-driver)

<sub>Last changed in R-81, 2026-10-20.</sub>

<a id="similarity-classifier"></a>

#### Similarity classifier

**A model trained on the "same screen?" labels that weighs every part of two page fingerprints; used instead of the single threshold τ once it tells screens apart better.**

τ compares one number, the overlap of the pages' text and structure shingles. The
classifier also looks at the structure, content, overlay, background calls, embedded apps
and element keys. `pnpm model:classify` trains it on the labelled pairs, holds every fifth
pair back, and compares both on those: when the classifier finds distinct pairs better, the
next model rebuild groups pages with it.

*Seen in:* Settings → Screen identity; pnpm model:classify

*Labels:* `similarity classifier`, `held-out F1`

*Related:* [Fingerprint profile](#fingerprint-profile), [Screen threshold (τ)](#screen-threshold)

<sub>Last changed in R-81, 2026-10-20.</sub>

<a id="same-screen-label"></a>

#### Same screen? (a pair label)

**A person's answer for two recorded versions of a page, Same screen, Same with different data, or Different screens, which the next model rebuild follows.**

The Same screen? page shows two versions side by side, a disagreement between your earlier
label and the automatic grouping first, then each screen's variants against its first one.
Press 1, 2 or 3, optionally say why, and save. The labels group the screens on the next
rebuild and calibrate the screen threshold τ and the similarity classifier. A new answer
replaces the label; every earlier answer, with who gave it and why, stays under Earlier
answers on the pair and in the screen's History.

*Example:* r2 and r3 of Kalkulator — wynik: Same, different data · "the banner depends on the date".

*Seen in:* Review → Same screen?; Screens → Map → inspector; Screens → screen → History

*Labels:* `Same screen?`, `Same`, `different data`, `Different screens`, `pair label`

*Related:* [Variant (r1, r2…)](#screen-variant), [Screen threshold (τ)](#screen-threshold), [Similarity classifier](#similarity-classifier)

<sub>Last changed in R-81, 2026-10-21.</sub>

<a id="check-run"></a>

#### Check run

**A run of replays and tests on the headless driver, with no AI, that checks rules at their boundaries, replays errors and explores processes, as opposed to an AI scan.**

A check run repeats recorded steps exactly, so it costs no tokens and answers yes or no:
did the error come back, did the rule's boundary give the predicted screen, is every action
of a process still there. A person starts one from Rules or a process page (Run the rule
tests, Explore); the assistant starts one after you confirm in the chat. The model takes the
results on its next rebuild.

*Example:* Check run 01a1340c · 64 checks · 20, 21, 22 → pass.

*Seen in:* Rules; Processes → process page; Scans

*Labels:* `check run`, `AI scan`, `Run the rule tests`

*Related:* [Headless driver (probe run)](#headless-driver), [Boundary test](#boundary-test), [Explored (process)](#explored-process)

<sub>Last changed in R-81, 2026-10-21.</sub>

<a id="portal-hints"></a>

#### Hints (Settings)

**What the portal model is told about a portal, its release marker, the cookies that name an A/B test's arm and the texts that mean a business refusal, from the portal file.**

Hints live in `model:` of portal.yaml. When you confirm an A/B test in Review, its cookie is
added to the A/B cookies, so later scans record which arm each visit saw and the variants say
A/B test instead of Unknown. The rest changes through the assistant.

*Example:* Release marker: header x-app-version · A/B cookies: cookie ab_calc.

*Seen in:* Settings → Hints

*Labels:* `Hints`, `release marker`, `A/B cookie`, `business refusal`

*Related:* [Release (build)](#release), [Variant (r1, r2…)](#screen-variant)

<sub>Last changed in R-81, 2026-10-21.</sub>

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

If the code cannot prove an action is read-only it does not assume it is. The effective
ceiling of a run is the lowest limit the portal, its environment and the persona set; with
none set, every class may run (spec 021).

*Example:* On the read-only reference map run the "Porównaj" button was classified mutating (no evidence it is read-only) and skipped.

*Seen in:* Actions → Safety class; Frontier → Safety class

*Labels:* `Safety class`, `read`, `mutating`, `destructive`, `external-side-effect`

*Related:* [Decision (allowed / skipped)](#decision), [Environment](#environment), [Persona](#persona)

<sub>Last changed in R-42, 2026-10-13.</sub>

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

*Related:* [Accessible name](#accessible-name), [Role](#role), [Transition](#transition)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="click-signal"></a>

#### Click signal

**What makes an element without an ARIA role count as clickable, such as a click listener, inline handler, framework handler, pointer cursor or tabindex.**

Elements with no explicit ARIA role but behavioural signals that they respond to clicks are
recorded with `role: generic` and a `found_by` list naming the signals that identified them.
The BA labels the inferred meaning based on context: is it a button, a menu item, a
navigation link or something else.

*Seen in:* Actions → Role; Actions → found_by

*Labels:* `Click signal`, `signal`

*Related:* [Signal-found action](#signal-found-action), [Accessible name](#accessible-name), [Role](#role)

<sub>Last changed in R-28, 2026-10-09.</sub>

<a id="signal-found-action"></a>

#### Signal-found action

**An action issued for an element without an ARIA role but with click signals; the BA labels its meaning inferred from context.**

When the crawler finds an element with click signals but no role, it records an action with
`role: generic` and includes a `found_by` list of the signals (click handler, pointer
cursor, tabindex, framework handler). The meaning of this action — whether it is a button,
menu item or link — is inferred by the BA from where it appears and what it does.

*Seen in:* Actions → Role; Actions → found_by

*Labels:* `Signal-found`, `generic role`

*Related:* [Click signal](#click-signal), [Accessible name](#accessible-name), [Decision (allowed / skipped)](#decision)

<sub>Last changed in R-28, 2026-10-09.</sub>

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

Besides actions, an item can be an address to open: a pop-up window an action opened
("navigate to …", reason "pop-up opened by action …"). The crawler closes pop-ups at once and
visits their address later in its own tab.

*Example:* The reference map run queued 201 items, followed 195 and skipped 6 as unsafe.

*Seen in:* Run page → Frontier

*Labels:* `Frontier`, `pop-up`

*Related:* [Priority / depth](#priority-depth), [Budget](#budget), [Decision (allowed / skipped)](#decision), [Scope / denylist](#portal-scope)

*Read more:* [The frontier, explained](pages/frontier.md)

<sub>Last changed in R-52, 2026-10-12.</sub>

<a id="inferred-link"></a>

#### Inferred link

**A frontier item for a link with the same name and target address as a link the run already clicked, recorded as a transition with no additional click.**

When the next frontier item is a plain link and the run already reached that link's target
address by clicking a link with the same visible name, the server does not hand the item
out. Instead, it records a transition marked `inferred` to the same page, with the evidence
from that earlier click, and marks the item done (`same_target`). If the earlier click
failed, or the name differs (a cart link "Koszyk (1)" after "Koszyk (0)" was clicked), the
link is clicked as usual. This saves the crawler agent from re-walking shared header and
footer menus.

*Example:* On reference-insurer, 319 transitions were recorded but only 32 were clicked; 287 were inferred.

*Seen in:* Frontier report; finish_run coverage (actions_inferred)

*Labels:* `Inferred`, `inferred`

*Related:* [Frontier](#frontier), [Transition](#transition), [Confidence (observed / inferred / needs confirmation)](#confidence), [Shared menu button](#shared-button)

<sub>Last changed in R-35, 2026-10-14.</sub>

<a id="shared-button"></a>

#### Shared menu button

**A button in the page header, menu or footer that every page repeats; once its clicks in a run all lead to the same page, its copies on other pages are recorded as inferred, not clicked again.**

A link in a shared menu is settled by its target address (an inferred link). A button has
no address, and the same button may do something else on another page, so it is only
settled when the run already clicked it from other pages and every one of those clicks
went to one other page. The item is then marked done (`shared_button`) with an inferred
transition to that page. If any click stayed on its page (a menu toggle) or two clicks
landed on different pages, the button is clicked as usual.

*Example:* In one bank map the header's "Wyloguj" was clicked from 14 pages, every time to the start page; now it is clicked once.

*Seen in:* Frontier report

*Labels:* `shared_button`

*Related:* [Inferred link](#inferred-link), [Frontier](#frontier), [Transition](#transition)

<sub>Last changed in R-58, 2026-10-18.</sub>

<a id="next-item"></a>

#### Next item

**In a map run, the frontier item the crawler should work on next, returned by every navigate and act result so the crawler does not have to ask for it.**

After each action in a map run, the `next` field in the result names the next frontier item
to follow, sparing the crawler agent a separate `get_next_frontier_item` call. When `next`
is null, the frontier is empty or a budget constraint has been reached.

*Example:* An act result ends with next.item = link "Kontakt" on the home page, so the agent acts on that action id straight away.

*Seen in:* Run page → Trace (navigate and act results)

*Labels:* `next`, `Next item`

*Related:* [Frontier](#frontier), [Priority / depth](#priority-depth)

<sub>Last changed in R-24, 2026-10-08.</sub>

<a id="priority-depth"></a>

#### Priority / depth

**Priority decides which frontier item is followed next (higher first, then oldest), after links to unvisited kinds of page; depth is how many clicks away from the start page it is.**

The server, not the AI agent, decides the order. First come links to a route template the
run has not visited yet, then items without a link target (buttons, forms, controls), then
links to templates it already visited, such as more product or catalogue pages. Within each
group, the pending item with the highest priority goes first, and among equals the one
queued first. Nothing is skipped by this order. Depth counts navigation steps from the
start page and is limited by the `max_depth` budget.

*Example:* On a shop catalogue with one product already visited, the cart link is followed before the other forty product links.

*Seen in:* Frontier → Priority; Frontier → Depth

*Labels:* `Priority`, `Depth`

*Related:* [Frontier](#frontier), [Budget](#budget)

<sub>Last changed in R-35, 2026-10-14.</sub>

### Recorded evidence

<a id="evidence"></a>

#### Evidence

**What the crawler saved as proof of what it saw, such as page snapshots, screenshots, form fields, locators and network shapes, which every documentation statement must cite.**

Pathfinder never asks you to trust a statement on its own: the crawler stores proof, and
every BA record points at it. Evidence includes an accessibility snapshot, a screenshot and
a layout (element keys with their boxes) per new state, the fields of each form, the ranked
locators and safety class of each action, the shape (not the content) of network calls,
process steps, decisions and, on sandbox only, a Playwright trace. A record can cite a whole
state or one screen region of it. Text evidence is masked only when the portal turns on
`pii_scrub`; screenshots are never masked; request bodies are never stored. The long page
explains each kind, where it lives and how the BA uses it.

*Seen in:* Run page sections; Docs record → Evidence

*Labels:* `Evidence`

*Related:* [Evidence link / cites](#evidence-link), [Target](#target), [Network call shape](#network-call-shape), [Layer A / Layer B](#layers), [Screenshot](#screenshot), [Screen region](#screen-region)

*Read more:* [Evidence, explained](pages/evidence.md)

<sub>Last changed in R-20, 2026-10-04.</sub>

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

<a id="screenshot"></a>

#### Screenshot

**A full-page picture of a state, taken once when the crawler first records it, with no masking.**

When a map or trace run records a new state, the crawler takes one PNG of the whole page at
the persona's viewport width, at the same moment as the accessibility snapshot, before
anything clicks or types on the page. A state seen again keeps its first picture. Very long
pages are cut at 10 000 px, and the cut is noted under the image. If the capture fails, the
state is still recorded, a warning goes to the decision log, and the dashboard shows the
state's wireframe instead. Screenshots are taken on every environment, production
included, and are not masked (constitution 2.0.0).

*Example:* The Kalkulator OC/AC state shows its screenshot on the state page and on every record that cites it.

*Seen in:* Run page → States → Picture; State page → Screenshot; Docs record → Screens

*Labels:* `Screenshot`, `Screens`, `Picture`

*Related:* [State](#state), [Element key](#element-key), [Screen region](#screen-region), [Wireframe](#wireframe)

<sub>Last changed in R-20, 2026-10-04.</sub>

<a id="element-key"></a>

#### Element key

**The name Pathfinder gives one notable element of a recorded page, its role and accessible name plus a number when the same pair repeats, such as textbox "Pojemność silnika".**

Headings, fields, buttons, links, images, tables, lists, forms and landmarks each get a key
in page order: `role "name"`, or just `role` when there is no name, with `#2`, `#3` for
repeats (`link "Więcej"#2`). The same rule runs on the stored snapshot and on the page's
**layout**, the list of keys with their position and size on the screenshot, so a key
always points at the same element in the snapshot, the screenshot and the wireframe. The BA
copies keys from the state's evidence when it cites a screen region.

*Example:* button "Oblicz składkę" is the calculator's submit button; navigation#2 is the second unnamed navigation landmark.

*Seen in:* State page → Show elements; Docs record → Screens legend

*Labels:* `Element key`, `elements`, `layout`

*Related:* [Screen region](#screen-region), [Accessible name](#accessible-name), [Role](#role), [Screenshot](#screenshot)

<sub>Last changed in R-20, 2026-10-04.</sub>

<a id="screen-region"></a>

#### Screen region

**Evidence that points at one element of a state's screenshot, so the dashboard and the export can outline exactly what a record talks about.**

A screen region is a kind of evidence link: a state plus an element key, with an optional
note. A data item cites the field it describes, a rule or requirement about one control
cites that control, and a screen record cites the whole state. The dashboard draws each
cited region as a numbered outline over the screenshot and lists the keys underneath; an
element that has no position on the screenshot (hidden or below the cut) is listed as "not
visible on the screenshot". The image itself is never changed, so one screenshot serves
every record that cites it.

*Example:* DI-004 Pojemność silnika cites the region textbox "Pojemność silnika" on the calculator state.

*Seen in:* Docs record → Screens; Docs record → Evidence

*Labels:* `Screen region`, `screen_region`, `region`

*Related:* [Element key](#element-key), [Evidence link / cites](#evidence-link), [Screenshot](#screenshot), [Data item (DI)](#data-item)

<sub>Last changed in R-20, 2026-10-04.</sub>

<a id="wireframe"></a>

#### Wireframe

**A plain sketch of a recorded page, drawn in one fixed style from its accessibility snapshot, shown where there is no screenshot and downloadable as an editable Excalidraw file.**

Pathfinder draws headings, labelled fields, buttons, links, tables, lists and landmarks in
page order, one under the other, and nothing that is not in the recorded snapshot: it does
not guess the real layout (the screenshot shows that). The same snapshot always gives the
same drawing. Each wireframe comes as an SVG image and as a `.excalidraw` file you can open
on excalidraw.com or in the Excalidraw VS Code extension and edit. `wireframes:build`
redraws them when the style changes.

*Seen in:* State page → Wireframe; Run page → States → Picture; SRS export → Screens

*Labels:* `Wireframe`, `Excalidraw`

*Related:* [Screenshot](#screenshot), [State](#state), [SRS export](#srs-export)

<sub>Last changed in R-21, 2026-10-04.</sub>

<a id="pii-scrubbing"></a>

#### PII scrubbing

**Masking personal data such as e-mails and phone numbers in stored text evidence, off by default and turned on per portal with pii_scrub.**

Until constitution 2.0.0 every snapshot, title, form field and network shape was masked
before it was stored. Pathfinder now runs almost only against test portals with disposable
data, so text evidence is stored as recorded unless the portal config sets
`pii_scrub: true`. Screenshots are never masked. Developer logs and trace error messages
stay masked either way.

*Seen in:* Portal config → pii_scrub

*Labels:* `pii_scrub`, `masked`

*Related:* [Evidence](#evidence), [Environment](#environment)

<sub>Last changed in R-20, 2026-10-04.</sub>

<a id="crawler-open-question"></a>

#### Open question (crawler)

**Something the crawler noticed but cannot explain from the screen, handed to the BA instead of guessed.**

The crawler records facts and does not interpret them. When it meets something puzzling,
such as a button that is disabled for guests, it adds an open question with
`add_open_question` and moves on. The BA picks these up and either answers them from the
evidence or turns them into an open question record for a person.

*Seen in:* Run page → open questions; Docs evidence → open question

*Labels:* `Open question`

*Related:* [Finding and explanation (hypothesis, H-)](#hypothesis)

<sub>Last changed in R-22, 2026-10-03.</sub>

<a id="observation"></a>

#### Observation

**One arrival of the crawler on a page, with the full URL exactly as the browser had it, the hops that led there, and its place in the run.**

Every `navigate`, every action that lands on a page and every return after a re-login is an
observation, also when the run already knows the state. The URL is stored verbatim: every
query and path parameter, the fragment, session ids and tracking parameters included.
Nothing is normalised away, because legacy systems wire screens together through their
URLs. The route template, which decides which screen a page is, still leaves the
parameters out. Since MudPuppy 2.0 an observation also carries its journey, its number in
the run, the step result, the builds it was served by and its context. Called a "page
visit" (table `page_visits`) until 2.0.

*Example:* An observation of the legacy bank statement at `wyciag.do;jsessionid=AB12?konto=4521&typ=M&okres=2026-03&tryb=podglad`, reached by a link from the menu.

*Seen in:* State page → Reached under; get_run_evidence observations; SRS export (URLs observed)

*Labels:* `observations`, `Reached under`

*Related:* [Navigation hop](#navigation-hop), [Parameter inventory](#parameter-inventory), [Entry URL](#entry-url), [State](#state)

<sub>Last changed in R-81, 2026-10-20.</sub>

<a id="navigation-hop"></a>

#### Navigation hop

**One step the browser took from one URL to the next while reaching a page (an HTTP redirect, a meta refresh, a script redirect, a history change or a reload).**

A visit lists its hops in order: `start` (the URL the step began on), `navigate` (the
step's own load), `http` with its 3xx status, `meta_refresh`, `script`, `same_document`
(a history-API or hash change without a page load), `reload`, and `blocked` when the
request gate refused to follow, with the reason. The crawler waits through short
client-side redirects (up to the portal's `client_redirect_wait_ms`, 5 s by default), so a
"Proszę czekać…" interstitial is a hop, not a screen. A login's hops through its transit
zone (an identity provider) are marked `transit`, and the provider pages the browser
settled on carry their title, snapshot and screenshot.

*Example:* `/polisa.php?id=7` → meta_refresh → `/stare/polisa/7` → script → `/ubezpieczenia#/polisy/7`.

*Seen in:* State page → Reached under; get_run_evidence observations

*Labels:* `hops`, `client_redirect_wait_ms`

*Related:* [Observation](#observation), [Entry URL](#entry-url), [Transit zone](#transit-zone)

<sub>Last changed in R-62, 2026-10-18.</sub>

<a id="parameter-inventory"></a>

#### Parameter inventory

**For each screen, every URL parameter its visits carried, the values seen and where each value was set.**

Built from the visits, not stored: for each parameter its name, where it sits (`query`,
`path` such as `;jsessionid=`, or `fragment query` after a hash route), the distinct values
in the order first seen (at most 20 are listed, with a count of all), how many visits
carried it, and the action or hop that brought each new value. The BA reads it with
`get_run_evidence` kind `parameters` and documents dependencies between parameters as
business rules and data items, citing the visits.

*Example:* On the bank statement, `typ` has the values M and R, and `okres` has 2026-03 and 2026. The BA writes the rule that `okres` is RRRR-MM when `typ=M`.

*Seen in:* State page → Reached under; get_run_evidence parameters; SRS export (URL parameters)

*Labels:* `parameters`, `URL parameters`

*Related:* [Observation](#observation), [Business rule (BR)](#business-rule), [Data item (DI)](#data-item)

<sub>Last changed in R-37, 2026-10-12.</sub>

<a id="entry-url"></a>

#### Entry URL

**A distinct URL a screen was observed under, with how it was reached; one screen often has several (old and new address schemes, links with different parameters).**

Entry URLs are the distinct verbatim URLs of a screen's visits. Each one shows how often it
was seen, whether it was reached by the agent's `navigate`, an action, a re-login or the
login, and the kinds of hops on the way. A re-creating team needs them to keep old links
working.

*Seen in:* State page → Reached under; SRS export (URLs observed)

*Labels:* `entry_urls`, `URLs observed`

*Related:* [Observation](#observation), [Navigation hop](#navigation-hop)

<sub>Last changed in R-38, 2026-10-12.</sub>

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

**The point in a process where continuing would submit, buy or send something, where a trace on a portal with a read-only limit stops on purpose.**

When the portal, environment or persona limits actions to `read`, a trace fills the steps it
safely can and stops before the final submit. The outcome `[BNDY]` means the run worked as
intended, not that it failed. Without such a limit the same process continues past the
boundary, on any environment (spec 021).

*Seen in:* Process tab → Outcome [BNDY]

*Labels:* `BNDY`, `boundary_reached`

*Related:* [Process (trace mode)](#trace-process), [Safety class](#safety-class), [Environment](#environment)

<sub>Last changed in R-42, 2026-10-13.</sub>

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
BA reads the new run. Statuses: Open, In progress, Done, Blocked, Cancelled.

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

- Draft: written, not yet reviewed.
- Confirmed: a person approved this revision.
- Rejected: a person sent it back.
- Superseded: a newer revision replaced this draft, or a newer revision was confirmed.
- Withdrawn: the BA retracted the record.

Only the latest draft can be confirmed or rejected. Nobody sets a status by hand, not the
BA agent and not the dashboard; it follows from the reviews.

*Seen in:* Docs tab → Status; Record page

*Labels:* `Status`, `Status now`, `Draft`, `Rejected`, `Superseded`, `Withdrawn`

*Related:* [Revision (Rev)](#revision), [Review (confirm / reject / comment)](#review), [Status (shape and word)](#status-codes)

<sub>Last changed in R-43, 2026-10-14.</sub>

<a id="srs-export"></a>

#### SRS export

**A folder of Markdown files (with Mermaid diagrams) plus records.json that renders a portal's documentation as one SRS a team could rebuild the portal from.**

`pnpm docs:export <portal> [--env <env>] [--confirmed-only]` in `apps/crawler` writes
`data/exports/<portal>-<env>-srs/`: a README, chapters 01–10 in an ISO/IEC/IEEE 29148-style
outline, `11-unknowns.md`, `12-traceability.md`, a change log and `records.json`, a
machine-readable copy of the same records. Every statement keeps its key, revision, status,
confidence and evidence references; no evidence files or request bodies are copied. The
export is deterministic: the same store gives byte-identical files, so two exports can be
compared with `diff -r`.

*Example:* reference-insurer (sandbox, all, drafts marked): 15 files, 158 records.

*Seen in:* data/exports/<portal>-<env>-srs/; `pnpm docs:export`

*Labels:* `Export`, `SRS export`, `records.json`

*Related:* [SRS](#srs), [Confirmed-only mode](#confirmed-only-mode), [Traceability matrix](#traceability-matrix), [Unknowns](#unknowns), [Documentation record](#documentation-record)

*Read more:* [BA wiki: Software requirements specification (SRS)](../wiki/software-requirements-specification.md)

<sub>Last changed in R-16, 2026-10-04.</sub>

<a id="confirmed-only-mode"></a>

#### Confirmed-only mode

**The SRS export mode that renders only revisions a reviewer confirmed, leaving out drafts.**

By default the export renders every current record and marks drafts with a "DRAFT — not
confirmed by a reviewer" callout. With `--confirmed-only` it renders each record's latest
confirmed revision (the confirmed baseline when a newer draft exists) and nothing else, so the
output contains only statements a person has signed off. Rejected and withdrawn records
appear only in the change log, in both modes.

*Seen in:* `pnpm docs:export --confirmed-only`

*Labels:* `--confirmed-only`, `Confirmed only`, `drafts marked`

*Related:* [SRS export](#srs-export), [Record status](#record-status), [Review (confirm / reject / comment)](#review)

<sub>Last changed in R-16, 2026-10-04.</sub>

### Reading the dashboard

<a id="status-codes"></a>

#### Status (shape and word)

**Every status in the dashboard is a small shape plus a word, such as Live, Draft or Failed, so it never relies on colour alone.**

The shape says what kind of state it is, and the word says which one. The same shape and
word mean the same thing on every page.

| Shape | Meaning | Example words |
|---|---|---|
| Filled square | It happened, or is happening | Completed, Confirmed, Observed, Done, Stored, Running, Live, Active |
| Filled square in the marker colour | It needs you | Needs you, Warning, Re-anchor |
| Hollow square | It did not happen (yet) | Interrupted, Stopped, Skipped, To do, Not configured, Rejected, Withdrawn |
| Dashed corners | Not confirmed | Draft, Proposed, Inferred, Suggested, Queued, Pending |
| Cross | It broke | Failed, Error, Unreachable |

A kind that is not a state (a decision "merge", a trace "phase") has no shape and shows as
a plain label. A run can be Completed, Running, Interrupted or Stopped; a record Draft,
Confirmed, Rejected, Superseded or Withdrawn; a proposal Proposed, Applied, Discarded or
Out of date; a process model Observed, Drawn, Draft open or Live.

*Seen in:* Every status column and badge

*Labels:* `Status`, `Live`, `Draft`, `Failed`, `Interrupted`

*Related:* [Record status](#record-status), [Run](#run), [Frontier](#frontier), [Submit boundary](#submit-boundary), [Process model (A as-is, B to-be)](#process-model)

<sub>Last changed in R-43, 2026-10-14.</sub>

<a id="target"></a>

#### Target

**In a record's evidence table, the piece of recorded data the record cites, such as a state, form, action, network call or process step.**

Each evidence link on a record points at one target and says what it supports. Target kinds
are state, transition, observation, action, form, network call, open question,
decision, process, process step, another documentation record, or a review. Click the target
to open it on its run page.

Until R-22 the Actions table also had a "Target" column for a link's address; it is now
called "Links to", so "Target" has only this meaning.

*Seen in:* Record page → Evidence → Target

*Labels:* `Target`

*Related:* [Evidence link / cites](#evidence-link), [Evidence](#evidence)

<sub>Last changed in R-22, 2026-10-03.</sub>

### Proving ground

<a id="proving-ground"></a>

#### Proving ground

**A deliberately awkward legacy estate (shop, bank, insurer and old pages) that Pathfinder runs locally to prove it can cope with known legacy obstacles.**

The proving ground (`apps/proving-ground`) is a fictional Polish group, Grupa Mokradło, with
three brands. A Django backend serves a React shell, micro-frontends, server-rendered legacy
pages, CMS texts and a login. Each screen reproduces one or more entries of the legacy
obstacle catalogue. Like the reference portal it has a written answer key (ground truth),
one file per brand. Its data is disposable and may be changed, submitted and reset at will.

*Example:* The bank's Historia operacji page is an iframe around an old frameset page.

*Seen in:* Docs tab → proving-ground-shop; proving-ground-bank; proving-ground-insurer

*Labels:* `estate`, `Grupa Mokradło`

*Related:* [Reference portal / ground truth](#reference-portal), [Legacy obstacle (catalogue)](#legacy-obstacle), [Quality gate (tier 1)](#quality-gate)

<sub>Last changed in R-25, 2026-10-05.</sub>

<a id="legacy-obstacle"></a>

#### Legacy obstacle (catalogue)

**A thing that makes a legacy portal hard to map or document, such as a frameset or a missing label, listed under a stable LO- id in the obstacle catalogue.**

`docs/legacy-obstacles.md` is a living catalogue. Each entry has an id (LO-01, LO-02, …;
never reused), the place in the proving ground that reproduces it, what Pathfinder is
expected to do, a source and a status (`proposed`, `in scope`, `later`, `withdrawn`). The
quality gates hold one set of assertions per in-scope entry, and the evaluator scores an
obstacles category: did the BA's records name the obstacles the portal contains.

*Example:* LO-10, a "button" that is a div with a click handler and no role.

*Seen in:* docs/legacy-obstacles.md; data/gates/report.json

*Labels:* `LO-xx`, `obstacle`

*Related:* [Proving ground](#proving-ground), [Quality gate (tier 1)](#quality-gate), [Known gap](#known-gap), [Eval (tier 2)](#eval)

<sub>Last changed in R-25, 2026-10-05.</sub>

### Login and credentials

<a id="credential-vault"></a>

#### Credential vault

**The encrypted store of test-user logins and passwords that the crawler server reads, so that no secret is ever written in a config file or shown to the agent.**

Values live in the `credentials` table of the environment's database, one row per portal,
environment and reference name, sealed with AES-256-GCM. You manage them with
`pnpm vault` in `apps/crawler` (`set`, `list`, `delete`, `generate`, `check`, `reveal`).
Only the server decrypts a value, and only to type it into a login form. Values are never
logged, exported or shown in the dashboard.

*Example:* pnpm vault list shows names and key ids, never values.

*Seen in:* pnpm vault

*Labels:* `vault`

*Related:* [Vault key](#vault-key), [Credential reference (ref:NAME)](#credential-ref), [Secret redactor](#secret-redactor), [Server-side login](#server-side-login)

<sub>Last changed in R-26, 2026-10-05.</sub>

<a id="vault-key"></a>

#### Vault key

**The one local key file that seals and opens the vault, kept outside the repository and the database.**

The key is created on first use and read from `PATHFINDER_VAULT_KEY_FILE` (or the default
path). Each row remembers a key id. If the key changes, old rows are refused with a message
asking you to enter the value again. The key is not part of any export. Tests use a
temporary key and fake values.

*Seen in:* pnpm vault errors

*Labels:* `key file`, `PATHFINDER_VAULT_KEY_FILE`

*Related:* [Credential vault](#credential-vault)

<sub>Last changed in R-26, 2026-10-05.</sub>

<a id="credential-ref"></a>

#### Credential reference (ref:NAME)

**A placeholder such as `ref:PG_BANK_PASSWORD` in a persona file that stands for a vault value, so the file holds the name and never the secret.**

A persona's `auth` block lists `ref:NAME` values. When a run starts, the server resolves
every reference against the vault for that portal and environment. A missing one stops the
run before the browser opens and says which name to add (`pnpm vault check <portal>
<persona>` lists them). A persona with references on a portal that has no login block is
refused.

*Example:* `password: ref:PG_BANK_PASSWORD` in personas/proving-ground-bank/client.yaml.

*Seen in:* Persona files → auth

*Labels:* `ref`

*Related:* [Persona](#persona), [Credential vault](#credential-vault), [Login block](#login-block)

<sub>Last changed in R-26, 2026-10-05.</sub>

<a id="login-block"></a>

#### Login block

**The part of a portal config that tells the server how to log in, where the form is, how to find its controls and how to tell success, failure and an expired session.**

The `login:` block in `portal.yaml` gives the login URL, a locator for each control (label,
placeholder or CSS, first match wins), the success and failure signs and the signs of an
expired session. The agent never sees selectors; the server uses the block for the login
tool and for re-login.

*Seen in:* Portal config → login

*Labels:* `login`

*Related:* [Server-side login](#server-side-login), [Re-login](#re-login), [Credential reference (ref:NAME)](#credential-ref)

<sub>Last changed in R-26, 2026-10-05.</sub>

<a id="server-side-login"></a>

#### Server-side login

**The `login` tool lets the agent ask for a login, and the server types the vault values into the form itself, so the agent never handles a secret.**

The agent calls `login` with a reason. The server fills the form, submits it and records the
landing page like a navigation. The result says `logged_in` or `failed` with a reason
(`rejected`, `captcha`, `locked`, `control_not_found`). Tracing is paused during the fill,
and the values never reach the tool result, the records or the logs. Login works the same
on every environment (spec 021).

*Seen in:* Run page → decisions (login)

*Labels:* `login tool`

*Related:* [Login block](#login-block), [Credential vault](#credential-vault), [Secret redactor](#secret-redactor), [Re-login](#re-login), [Hand-off (CAPTCHA)](#captcha-handoff)

<sub>Last changed in R-42, 2026-10-13.</sub>

<a id="re-login"></a>

#### Re-login

**When a session expires mid-run, the server logs in again by itself and returns to the page the agent was going to.**

After each page of a logged-in run, the server checks the login block's expiry signs. On a
match it logs in once, navigates back and writes a `relogin` decision. The agent's call
returns the target state with `relogged_in: true`. If the re-login fails, the call returns
`SESSION_LOST` and the run is marked login-blocked. A re-login is a crawler event, not a step
of any business process.

*Seen in:* Run page → decisions (relogin)

*Labels:* `relogin`, `session expired`

*Related:* [Server-side login](#server-side-login), [Login block](#login-block), [Decision (allowed / skipped)](#decision)

<sub>Last changed in R-26, 2026-10-05.</sub>

<a id="captcha-handoff"></a>

#### Hand-off (CAPTCHA)

**A CAPTCHA does not stop the run; the crawler records it, asks for a human and carries on with the rest, on every environment.**

The crawler never solves a CAPTCHA. It records the state, writes a `handoff` decision, skips
actions inside the CAPTCHA container and opens a crawler question
`Human needed: CAPTCHA on <route template>`. Since spec 021 this is the same on production.
A CAPTCHA on the login page marks the run login-blocked.

*Example:* Human needed: CAPTCHA on /sklep/zamowienie

*Seen in:* Run page → open questions; decisions (handoff)

*Labels:* `handoff`, `Human needed`

*Related:* [Open question (crawler)](#crawler-open-question), [Server-side login](#server-side-login), [Decision (allowed / skipped)](#decision), [Environment](#environment)

<sub>Last changed in R-42, 2026-10-13.</sub>

<a id="secret-redactor"></a>

#### Secret redactor

**A filter that replaces every resolved secret value with `[secret]` before text is logged, stored or returned.**

Every value resolved from the vault is registered with the redactor. It also catches the
URL-encoded and JSON-escaped forms and ignores values shorter than four characters. It
covers logs, the decision log, tool results and trace errors. A test greps the data folder
for the password after a login run and expects no hit.

*Seen in:* [secret] in logs and records

*Labels:* `[secret]`

*Related:* [Credential vault](#credential-vault), [Server-side login](#server-side-login), [PII scrubbing](#pii-scrubbing)

<sub>Last changed in R-26, 2026-10-05.</sub>

### Gates and evals

<a id="quality-gate"></a>

#### Quality gate (tier 1)

**A fast, deterministic test that runs the crawler against the proving ground and checks one legacy obstacle or one earlier finding, with no model and no cost.**

Gates live in `apps/crawler/packages/gates` and run inside `pnpm test`. The setup starts the
proving ground on ports 4200 and 4201 and the reference portal, then each gate drives the
server tools directly and asserts what was recorded. A coverage test fails when an in-scope
catalogue entry has no gate. Gates test Pathfinder's mechanics; they say nothing about how
well the agents decide.

*Seen in:* pnpm test; data/gates/report.json

*Labels:* `gate`, `tier 1`

*Related:* [Legacy obstacle (catalogue)](#legacy-obstacle), [Known gap](#known-gap), [Gate report](#gate-report), [Eval (tier 2)](#eval)

<sub>Last changed in R-27, 2026-10-05.</sub>

<a id="known-gap"></a>

#### Known gap

**A gate for an obstacle Pathfinder does not handle yet; it describes the wanted behaviour, is expected to fail and keeps the run green.**

The report lists known gaps apart from passes. The day the assertions pass, the case fails
with "known gap is fixed", so it is turned into a normal gate and stays fixed.

*Seen in:* data/gates/report.json → known_gap

*Labels:* `gap()`, `known_gap`

*Related:* [Quality gate (tier 1)](#quality-gate), [Gate report](#gate-report), [Legacy obstacle (catalogue)](#legacy-obstacle)

<sub>Last changed in R-27, 2026-10-05.</sub>

<a id="gate-report"></a>

#### Gate report

**The file `data/gates/report.json` that every test run writes, listing each gate's result and the catalogue entries that have no gate.**

It holds one case per gate (id, title, result, time), the uncovered ids and a summary count.
Results are `pass`, `fail`, `known_gap`, `gap_fixed` and `skipped_slow`. The file is
generated and ignored by git.

*Seen in:* data/gates/report.json

*Related:* [Quality gate (tier 1)](#quality-gate), [Known gap](#known-gap), [Slow gate](#slow-gate)

<sub>Last changed in R-27, 2026-10-05.</sub>

<a id="slow-gate"></a>

#### Slow gate

**A gate that has to wait in real time (a session expiry, several fresh browsers), so `pnpm test` skips it and `pnpm test:slow` runs it.**

Slow gates keep the normal test run inside its 3-minute budget. They are still counted for
coverage, and the gate report lists them as `skipped_slow` when they did not run.
`pnpm test:slow` runs the whole gate set with them, together with the browser end-to-end
files (the slow tier).

*Seen in:* pnpm test:slow; data/gates/report.json → skipped_slow

*Labels:* `slow`, `skipped_slow`

*Related:* [Quality gate (tier 1)](#quality-gate), [Gate report](#gate-report), [Slow tier](#slow-tier)

<sub>Last changed in R-34, 2026-10-07.</sub>

<a id="eval"></a>

#### Eval (tier 2)

**A real, paid run of the crawler and BA agents on one portal, scored against its ground truth and compared with a saved baseline.**

`pnpm eval <portal>` in `apps/crawler` runs one trial of one task: it starts the headless
agents with a budget cap, lets the graders score the outcome and writes
`data/evals/<portal>/<timestamp>.json`. It then compares the scores and checks with the
baseline and exits with 1 on a regression. It is never part of `pnpm test`, because it costs
tokens and agents are not deterministic. It is how you see whether a change to a prompt, a
skill or the tools made the agents better or worse. `--crawler-only` skips the BA.
When an agent is cut off by an API error or the account's usage limit, the eval writes no
result at all, so an outage is never scored as agent quality. Run evals one at a time: they
spend the same usage quota as your Claude Code session. The code is `apps/crawler/evals/`,
its words are Anthropic's eval terms (guideline G-33), and new evals follow the
`create-eval` skill.

*Seen in:* pnpm eval; apps/crawler/evals

*Labels:* `tier 2`, `pnpm eval`, `crawler-only`

*Related:* [Eval task / suite](#eval-task), [Eval trial](#eval-trial), [Grader](#grader), [Eval baseline](#eval-baseline), [Eval workspace](#eval-workspace), [Coverage score](#coverage-score), [Crawl coverage score](#crawl-coverage-score), [Password sweep](#password-sweep), [Quality gate (tier 1)](#quality-gate)

<sub>Last changed in R-46, 2026-10-10.</sub>

<a id="eval-task"></a>

#### Eval task / suite

**One test the eval can run, a portal with its ground truth and success criteria; all tasks together are the evaluation suite.**

Tasks are listed in `SUITE` in `apps/crawler/evals/tasks.ts`. A map task has the crawler
map the whole portal; a trace task has it walk one named process toward a goal and is also
graded on that process's steps (e.g. `wikipedia`, "find the article about pickled
cucumbers"). A task for a live site we don't own starts no local server and keeps its ground
truth in `apps/crawler/evals/ground-truth/`.

A map task may also list process traces (R-39): after the map, the crawler traces each
listed ground-truth process as a guest, and the BA documents from all the runs, so its
processes can be scored from traces. `--no-process-traces` leaves them out; the number that
ran is a condition of the trial.

A task may also list forms to probe (`probeForms`, spec 034): after the map, the eval marks
the form steps the map recorded there for probing and runs one form-probing scan, so the
export's Validation section can be scored. `--no-form-probing` leaves it out.

*Seen in:* apps/crawler/evals/tasks.ts

*Labels:* `task`, `suite`, `SUITE`, `trace task`, `process traces`, `processTraces`, `probeForms`

*Related:* [Eval (tier 2)](#eval), [Eval trial](#eval-trial), [Reference portal / ground truth](#reference-portal), [Form-probing scan](#form-probing-scan), [Export quality score](#export-quality-score)

<sub>Last changed in R-68, 2026-10-17.</sub>

<a id="export-quality-score"></a>

#### Export quality score

**How closely a process export matches the ground truth of its portal - steps, fields, validation messages, actions and API calls.**

Scored by `export-quality.ts` in an eval over each exported process's `process.json`, for
ground-truth processes that list export facts (`actions`, `apis`, field `messages`). Five
goal scores (`export_steps`, `export_fields`, `export_validation`, `export_actions`,
`export_apis`) and three counts that should be 0: steps that are not part of the process,
actions leading outside it, and noise calls (icons, analytics) listed as APIs. The export
the owner approved on 2026-10-17 is kept as the reference solution
(`apps/crawler/evals/reference-solutions/`); its test pins its scores, so the problems it
has (R-73) are the only points it loses.

*Seen in:* data/evals/<portal>/*.json → scores.export_*; apps/crawler/evals/reference-solutions

*Labels:* `export_steps`, `export_fields`, `export_validation`, `export_actions`, `export_apis`, `reference solution`

*Related:* [Eval (tier 2)](#eval), [Grader](#grader), [Eval task / suite](#eval-task), [Process documentation (export)](#process-documentation)

<sub>Last changed in R-68, 2026-10-17.</sub>

<a id="eval-trial"></a>

#### Eval trial

**One attempt at a task, one `pnpm eval` run; agents differ from run to run, so a task needs several trials before a score means much.**

Each trial writes one result file in `data/evals/<portal>/`, promoted or not. The baseline
is a copy of the trial chosen as the standard. Comparing one trial with the baseline can
catch a regression only beyond the normal spread, which is what `tolerances.json` allows for.

Each agent session of a trial ends with an outcome: `success`, `budget_end` (the eval's own
budget ran out), `api_error` or `usage_limit` (the account's limit). Only the first two
write a result, stored as `outcomes`; a usage limit exits with code 3. Trials run one at a
time, and each starts its own portal server, refusing a port something else holds.

*Seen in:* data/evals/<portal>/<timestamp>.json

*Labels:* `trial`, `outcome`, `usage_limit`, `budget_end`

*Related:* [Eval (tier 2)](#eval), [Eval task / suite](#eval-task), [Eval baseline](#eval-baseline)

<sub>Last changed in R-52, 2026-10-12.</sub>

<a id="grouping-eval"></a>

#### Grouping eval

**The eval of how well the assistant cuts a portal's recorded scans into processes, scored against the processes a person wrote down.**

`pnpm --dir apps/chat eval <portal>` copies a finished crawler eval's store with every
grouping taken out, asks the assistant what the "Ask the assistant to regroup" button asks,
and scores the groupings it suggests: each known process found, starting on its own first
screen and not the page the user came from, no duplicates or one-screen groupings, and a
reason that cites the links between the screens. Results go to
`data/evals/grouping-<portal>/`.

*Example:* On the reference portal 4 of 5 processes are found; the car quote starts one page too early.

*Seen in:* data/evals/grouping-<portal>/<timestamp>.json

*Labels:* `processes_found`, `clean_starts`, `why_cites`

*Related:* [Eval (tier 2)](#eval), [Eval trial](#eval-trial), [Grader](#grader)

<sub>Last changed in R-78, 2026-10-18.</sub>

<a id="grader"></a>

#### Grader

**The logic that turns a finished trial into one score or check; code-based, model-based (an LLM judge) or human.**

Graders live in `apps/crawler/evals/graders/`, one folder per kind. Code-based ones
(`graders/code/`): documentation coverage, crawl coverage, process steps of a trace, the
password sweep and the run checks. Model-based ones are judges (`graders/model/`), which
answer one narrow question per call and are trusted only once they agree with the owner's
labels, the human grader (`graders/human/labels/`).

*Seen in:* apps/crawler/evals/graders

*Labels:* `grader`, `code-based`, `model-based`, `LLM judge`

*Related:* [Eval (tier 2)](#eval), [Judge (LLM judge)](#judge), [Judge calibration](#judge-calibration), [Coverage score](#coverage-score), [Crawl coverage score](#crawl-coverage-score), [Password sweep](#password-sweep)

<sub>Last changed in R-47, 2026-10-11.</sub>

<a id="eval-baseline"></a>

#### Eval baseline

**The saved result an eval is compared with; a score may fall below it only by the portal's tolerance.**

`data/evals/<portal>/baseline.json` is set with `pnpm eval <portal> --promote`, which moves
the old baseline to `history/`. `tolerances.json` in the same folder sets how many
percentage points each score may drop (default 5, widened per category where two runs of
the same map differed). A check that was true in the baseline must stay true; the
password-hit and widget-action counts must be 0 in every run, baseline or not, and a run
that breaks them is never promoted. Baselines are committed.

*Seen in:* data/evals/<portal>/baseline.json; data/evals/<portal>/tolerances.json

*Labels:* `baseline`, `tolerance`, `promote`

*Related:* [Eval (tier 2)](#eval), [Coverage score](#coverage-score), [Crawl coverage score](#crawl-coverage-score), [Password sweep](#password-sweep)

<sub>Last changed in R-29, 2026-10-09.</sub>

<a id="crawl-coverage-score"></a>

#### Crawl coverage score

**How many of the portal's ground-truth screens the crawler itself reached in an eval, apart from what the BA documented.**

`crawl_screens` in an eval result. A guest persona is scored on the screens a guest can see;
a logged-in persona on the screens behind the login. A screen counts when one of the run's
states has its route (parameter names do not matter: `:slug` and `:param` match). A low
documentation score with a high crawl score points at the BA; a low crawl score points at
the crawler.

*Seen in:* data/evals/<portal>/*.json → scores.crawl_screens

*Labels:* `crawl_screens`

*Related:* [Eval (tier 2)](#eval), [Coverage score](#coverage-score)

<sub>Last changed in R-29, 2026-10-09.</sub>

<a id="password-sweep"></a>

#### Password sweep

**The eval's search for the portal's test passwords in everything a run left behind; it must find none.**

After both agents ran, the eval searches the store (except the vault's encrypted rows), every
file of the run (evidence, logs, unzipped traces), the documentation export and both agents'
transcripts for every password the vault holds for the portal, guest runs included. The
count is `password_hits`; anything above 0 fails the eval. It prints only counts per place,
never a password.

*Seen in:* data/evals/<portal>/*.json → checks.password_hits

*Labels:* `password_hits`

*Related:* [Eval (tier 2)](#eval), [Credential vault](#credential-vault)

<sub>Last changed in R-29, 2026-10-09.</sub>

<a id="eval-workspace"></a>

#### Eval workspace

**A fresh temporary root where an eval's agents record, so your own database and documentation are never touched.**

By default an eval copies the portal and persona configs, the migrations and the persona's
encrypted credential rows into a temp folder and points the agents there, so every eval
starts from nothing. With `--in-place` it uses the real store instead. Since R-45 the
dashboard's data-store picker lists every eval workspace on the machine, newest first
("eval · <portal> · <time>"), so an eval's runs and documentation open from the picker.
A portal with no data in the current store names the stores that hold it.

*Seen in:* pnpm eval --in-place; Header → data store (eval workspaces)

*Labels:* `PATHFINDER_ROOT`, `in-place`, `eval workspaces`

*Related:* [Eval (tier 2)](#eval), [Credential vault](#credential-vault)

<sub>Last changed in R-45, 2026-10-12.</sub>

<a id="judge"></a>

#### Judge (LLM judge)

**A model-based grader that asks Claude one narrow yes/no question about one ground-truth item and one documentation record.**

A judge is declared in one file (`apps/crawler/evals/graders/model/judges/<id>.ts`): its
question, what pass and fail mean, a few labelled examples, and code that picks the
candidate records per ground-truth item. Each call is isolated (no tools, no MCP servers,
an empty config folder) and answers `pass`, `fail` or `unknown` with a one-sentence reason.
Judge scores sit in the eval result's `judges` section, beside the code scores, and are
never compared with the baseline. Its wording version is a hash of the question, the
definitions, the examples and the model: changing any of them makes the judge
uncalibrated again.

*Example:* The glossary-terms judge should fail a record defining "Składka" as the highest amount the insurer pays, which is the portal's meaning of "Suma ubezpieczenia".

*Seen in:* pnpm eval; pnpm eval:judge; apps/crawler/evals/graders/model

*Labels:* `judge`, `LLM judge`, `model-based grader`, `verdict`, `wording version`

*Related:* [Grader](#grader), [Judge labels](#judge-labels), [Judge calibration](#judge-calibration), [Judge isolation check](#judge-isolation-check), [Eval (tier 2)](#eval)

<sub>Last changed in R-47, 2026-10-11.</sub>

<a id="judge-labels"></a>

#### Judge labels

**The owner's own pass or fail, with one sentence why, for each pair a judge is asked about; what the judge is measured against.**

One YAML file per judge (`apps/crawler/evals/graders/human/labels/<judge>.yaml`), filled by
hand. `pnpm eval:draw` adds the judge's pairs from a store and never changes a pair already
there; pairs real output lacks can be added as `hand-made`. Each pair is put in `dev` (used
to tune the judge's wording) or `test` (used once per wording, for the real measure).

*Seen in:* pnpm eval:draw; apps/crawler/evals/graders/human/labels

*Labels:* `labels`, `dev split`, `test split`, `hand-made pair`

*Related:* [Judge (LLM judge)](#judge), [Judge calibration](#judge-calibration), [Reference portal / ground truth](#reference-portal)

<sub>Last changed in R-47, 2026-10-11.</sub>

<a id="judge-calibration"></a>

#### Judge calibration

**Measuring how often a judge agrees with the owner's labels, as two rates (TPR and TNR) and a flip rate; a judge counts only once calibrated.**

`pnpm eval:calibrate <judge> --split dev|test` asks the judge about every labelled pair three
times and compares the majority with the label. TPR (true-positive rate) is the share of the
owner's passes the judge also passed; TNR (true-negative rate) the share of the owner's
fails it also failed. Two rates, because a judge that passes everything has TPR 100 % and
TNR 0 %. The flip rate is the share of pairs whose three answers differed. A judge is
calibrated when its newest `test` report for its current wording has TPR and TNR at 90 % or
more. Reports: `data/evals/judges/<judge>/`.

*Seen in:* pnpm eval:calibrate; eval result judges section

*Labels:* `calibration`, `TPR`, `TNR`, `true-positive rate`, `true-negative rate`, `flip rate`, `calibrated`

*Related:* [Judge (LLM judge)](#judge), [Judge labels](#judge-labels), [Grader](#grader)

<sub>Last changed in R-47, 2026-10-11.</sub>

<a id="judge-isolation-check"></a>

#### Judge isolation check

**One real judge call that proves nothing of your or the project's Claude setup reached the judge.**

`pnpm eval:judge-check` makes one call and reads what Claude Code loaded for it: only the
answer tool, no MCP servers, no plugins, skills or agents of yours or the project's (Claude
Code's built-in ones are allowed), memory inside the judge's temporary config folder, and
under 2 000 input tokens (a leaked CLAUDE.md would add thousands). The judge logs in with the
token in `~/.config/pathfinder/judge-token` (from `claude setup-token`) or, without it, with
your own login.

*Seen in:* pnpm eval:judge-check

*Labels:* `isolation check`, `judge-token`, `PATHFINDER_JUDGE_TOKEN_FILE`

*Related:* [Judge (LLM judge)](#judge)

<sub>Last changed in R-47, 2026-10-11.</sub>

### Chat and workflow

<a id="chat"></a>

#### Chat

**The dashboard page where the BA talks to one assistant that knows where each portal stands and runs the next step for them.**

The Chat page is the guided way in: instead of choosing between agents and skills, the BA
says what they want and the assistant offers only the steps that are valid now. A new
conversation opens with a computed summary of the portal's steps and the moves you can take.
The chat runs in its own local service (`pnpm --dir apps/chat start`); the dashboard only
shows it. While work runs, the MudPuppy animation plays.

*Example:* Opening the chat on reference-insurer shows "scan done" and proposes picking a process.

*Seen in:* Chat page

*Labels:* `Chat`, `conversation`

*Related:* [Orchestrator (assistant)](#orchestrator), [Workflow step](#workflow-step), [Error reference (ERR-…)](#error-reference)

<sub>Last changed in R-30, 2026-10-06.</sub>

<a id="orchestrator"></a>

#### Orchestrator (assistant)

**The assistant behind the chat; it can scan, trace, narrow and document, but cannot change Pathfinder itself.**

The orchestrator calls the chat tools (`workflow_state`, `request_scan`, `save_persona`, …)
and hands the work to the crawler and BA agents. It has no file, shell or web tools: a
request to change agents, skills, rules, code, configuration or safety settings is refused
and named as a developer task in the shell. Safety-gate refusals are quoted word for word.

*Seen in:* Chat page

*Labels:* `assistant`, `orchestrator`

*Related:* [Chat](#chat), [Persona](#persona), [Run](#run)

<sub>Last changed in R-30, 2026-10-06.</sub>

<a id="workflow-step"></a>

#### Workflow step

**One stage of the work on a portal (scan, map, narrow, document, amend), shown in the step tracker as to do, waiting to start, in progress, done, failed or stopped.**

Statuses come from what was recorded, not from what the assistant says: a scan is in
progress while its run is running and done when the run completed. A request shows as
"waiting to start" until its run or documentation session appears. A failed step carries an
error reference. The tracker is correct after a reload or a restart of the chat service.

While a scan's run is running, the step shows `[stop scan]`. Stopping (with `[stop scan]`,
`[stop]` or by asking the assistant) makes the step **stopped**, not failed: no error
reference, what it recorded stays, and `[resume scan]` continues it from the pages still
queued with the same choices (read-only or not, images or not).

*Seen in:* Chat page → step tracker

*Labels:* `step tracker`, `pending`, `in progress`, `failed`, `stopped`, `stop scan`, `resume scan`

*Related:* [Chat](#chat), [Run](#run), [Analysis session](#analysis-session), [Error reference (ERR-…)](#error-reference), [Scan choices (edits, images)](#scan-choices)

<sub>Last changed in R-31, 2026-10-07.</sub>

<a id="scan-choices"></a>

#### Scan choices (edits, images)

**The two questions the assistant asks before each scan, whether it may fill in and submit forms (default no, only look) and whether to skip images (default no).**

A scan only looks unless you allow edits: then it may fill in and submit forms, on
production too, up to the most the environment allows (set in Portal settings). Images load
by default because you need them to see what a page asks for; skipping them maps faster on
image-heavy sites. A skipped image shows an "Image skipped: images turned off for this
scan" box in the screenshot where it would be, and the run's log says why. A resumed scan
keeps its choices unless you change them.

*Example:* "Scan it, you may submit forms, skip images" → edits allowed, images skipped

*Seen in:* Chat page

*Labels:* `read-only`, `allow edits`, `skip images`, `Image skipped`

*Related:* [Environment](#environment), [Portal settings (environments)](#portal-settings), [Workflow step](#workflow-step), [Scan focus](#scan-focus)

<sub>Last changed in R-31, 2026-10-07.</sub>

<a id="scan-focus"></a>

#### Scan focus

**The part of a portal one scan or process trace keeps to, said in the chat; where it starts, which addresses and paths it stays within, which paths it leaves out.**

Without a focus a scan maps the whole portal. A focus starts the scan on a given page, keeps
it on the hosts and paths you name and never opens the paths you leave out (`*` matches
anything). It can only narrow what the portal allows. It belongs to that one run: a resume
keeps it, a new scan does not. Links outside it are listed as not done with the reason
(`scope:excluded_path` for a left-out path).

*Example:* "Only the English site, leave out Special: pages" → start https://en.wikipedia.org/, only en.wikipedia.org, never /wiki/Special:*

*Seen in:* Chat page; Run page → decisions

*Labels:* `focus`, `scope:excluded_path`

*Related:* [Scan choices (edits, images)](#scan-choices), [Scope / denylist](#portal-scope), [Persona](#persona)

<sub>Last changed in R-31, 2026-10-07.</sub>

<a id="error-reference"></a>

#### Error reference (ERR-…)

**The id shown with every error in the chat; a developer finds the technical detail under it in the local chat log.**

Every failure gets an `ERR-` id (time-ordered, 26 characters after the prefix). The detail
goes to `data/logs/chat/<date>.jsonl`, one line per error, kept 30 days and never with
credentials in it. Give the reference to a developer instead of a screenshot.

*Example:* The scan step failed (ERR-01K6Z…).

*Seen in:* Chat page; step tracker

*Labels:* `ERR-`, `reference id`

*Related:* [Chat](#chat), [Workflow step](#workflow-step)

<sub>Last changed in R-30, 2026-10-06.</sub>

<a id="activity-feed"></a>

#### Activity (scan progress)

**The list under the chat of what the conversation's scan did, newest first, with counters for pages found, links queued, steps and time.**

Read from what the crawler recorded, not from the assistant, so it is the same after a
reload or after leaving the page. Lines: a new page, one crawler step (`Clicked … on /a →
/b`), a form found, a problem (error, a page that never settled, an HTTP error), something
not done (with the reason) and a question for the BA. When a running scan records nothing
for 5 minutes the chat says so: the crawler may be stuck.

*Example:* 17 pages found · 113 still queued · 171 / 400 steps · Clicked link "Kontakt" on /logowanie → /kontakt

*Seen in:* Chat page

*Labels:* `Activity`, `pages found`, `still queued`, `Nothing recorded for`

*Related:* [Chat](#chat), [Map (live)](#live-map), [Run](#run)

<sub>Last changed in R-30, 2026-10-06.</sub>

<a id="live-map"></a>

#### Map (live)

**The pages of the conversation's scan drawn beside the chat as the crawler finds them, each hanging off the page it was reached from.**

A discovery tree: for every page, the link the crawler clicked to reach it first. It does
not show every link between pages (that is the state graph on the run's page). Pages found
in the last minute and the page the crawler is on are highlighted. It redraws only when
something changed and stops when the run ends.

*Example:* / → (Kontakt) → /kontakt, highlighted as the current page

*Seen in:* Chat page

*Labels:* `Map`

*Related:* [Activity (scan progress)](#activity-feed), [Run](#run)

<sub>Last changed in R-30, 2026-10-06.</sub>

<a id="portal-dropdown"></a>

#### Portal (dropdown)

**The choice at the top of every page of which portal you work on; the pages follow it until you change it.**

Lists the configured portals and every portal that was scanned, plus "all portals" and
"+ new portal". With a portal chosen, Overview shows only its runs, Docs opens its
documentation and Chat its newest conversation; [new conversation] starts one for it. The
choice is remembered by the browser.

*Example:* portal: wikipedia-org → the chat opens the wikipedia-org conversation

*Seen in:* Page header

*Labels:* `portal`, `all portals`

*Related:* [New portal](#new-portal), [Environment](#environment), [Chat](#chat)

<sub>Last changed in R-31, 2026-10-06.</sub>

<a id="new-portal"></a>

#### New portal

**The form, opened with "+ new portal" in the portal dropdown, that adds a site to work on without editing files.**

Give the address of each environment the site has (production, staging, sandbox; at least
one) and how far the crawler may go on each; a short name is proposed from the first
address. robots.txt is ignored by default (your responsibility). The limit per environment
is the most a scan may ever do there; each scan still only looks unless you allow edits
when the assistant asks (see Scan choices). Saving writes the portal's configuration and a guest persona, checked the
same way a scan checks them, and opens a chat for it.

*Example:* production https://www.wikipedia.org/ (only look) → wikipedia-org, then "scan it"

*Seen in:* New portal page; portal dropdown

*Labels:* `+ new portal`, `robots.txt ignore it`

*Related:* [Portal (dropdown)](#portal-dropdown), [Portal settings (environments)](#portal-settings), [Scope / denylist](#portal-scope), [Persona](#persona), [Scan choices (edits, images)](#scan-choices)

<sub>Last changed in R-31, 2026-10-07.</sub>

<a id="portal-settings"></a>

#### Portal settings (environments)

**The page, opened with [settings] next to the portal dropdown, that lists a portal's environments and adds, changes or revokes them.**

A portal can have a production, a staging and a sandbox environment, each with its own
address and how far the crawler may go there. A scan targets one of them (the assistant
asks when there are several) and the run records it. Revoking an environment keeps the
runs already recorded for it; the last one cannot be revoked. The "data store" switch at
the top is something else: which local database the dashboard reads.

*Example:* wikipedia-org: production https://www.wikipedia.org/ (only look); [revoke] sandbox

*Seen in:* Portal settings page; page header

*Labels:* `[settings]`, `[revoke]`, `production`, `staging`, `sandbox`

*Related:* [New portal](#new-portal), [Portal (dropdown)](#portal-dropdown), [Environment](#environment)

<sub>Last changed in R-31, 2026-10-06.</sub>

<a id="reset-assistant"></a>

#### Reset assistant

**Gives the assistant a fresh context in the same conversation; the history stays on screen and the portal and steps are kept.**

The assistant forgets the earlier messages but is told the portal and where the steps
stand. Use it when it gets confused or the conversation is long. A new conversation instead
starts from zero with its own steps. Refused while the assistant answers: press [stop]
first. After a chat-service restart the assistant is also given the last messages, so the
conversation carries on.

*Example:* [reset assistant] → "Assistant context reset. Your next message starts a fresh session…"

*Seen in:* Chat page

*Labels:* `[reset assistant]`, `[stop]`

*Related:* [Chat](#chat), [Orchestrator (assistant)](#orchestrator)

<sub>Last changed in R-30, 2026-10-06.</sub>

<a id="process-scope"></a>

#### Process scope

**The one process the BA wants documented, given by its start and end screens, the screens in between and a comment per screen.**

Real portals are too big to document whole. The assistant proposes candidates from traced
processes, documented processes and matching screens; the BA confirms start, end and the
screens in the checklist beside the chat. Documentation then cites only evidence from those
screens, and `pnpm docs:export <portal> --scope <id>` exports only that process.

*Seen in:* Chat page → state checklist; docs:export --scope

*Labels:* `scope`, `start state`, `end state`

*Related:* [Process (trace mode)](#trace-process), [State](#state), [SRS export](#srs-export)

<sub>Last changed in R-30, 2026-10-06.</sub>

<a id="amendment"></a>

#### Amendment (to-be)

**A BA note on a screen, a piece of evidence or a wireframe element that says what should change; kept apart from the recorded facts.**

An amendment is a text note, a reference to one wireframe element ("this button should
say …"), or an attached file. It is stored with author, time and target, never mixed into
the as-is records, and exported in its own to-be chapter (`13-to-be-amendments.md`) and in
`records.json` with `to_be: true`, so an agent building the new portal can tell as-is from
to-be. Keys look like `AMD-001`.

*Seen in:* Chat page; SRS export → 13-to-be-amendments.md

*Labels:* `AMD-`, `to-be`, `amendment`

*Related:* [Re-anchor](#re-anchor), [Wireframe](#wireframe), [Screen region](#screen-region), [SRS export](#srs-export), [Screen revision (observed)](#screen-revision)

<sub>Last changed in R-43, 2026-10-14.</sub>

<a id="superseded-amendment"></a>

#### Superseded amendment (retired)

**The old name for an amendment whose element a new scan made out of date; the dashboard now calls it an amendment to re-anchor.**

Until the Salvage Yard redesign (spec 022) an amendment a scan made out of date was called
superseded and was kept until the BA re-applied or dismissed it. The same thing now has
the name "re-anchor", and an amendment whose element survives is carried forward instead.
Exports still list these in `appendix-superseded-amendments.md`.

*Seen in:* appendix-superseded-amendments.md

*Labels:* `superseded`, `re-apply`, `dismiss`

*Related:* [Re-anchor](#re-anchor), [Amendment (to-be)](#amendment), [Run](#run)

*Retired on 2026-10-14:* Renamed in spec 022; the status word is now Re-anchor. Replaced by [re-anchor](#re-anchor).

<sub>Last changed in R-43, 2026-10-14.</sub>

<a id="re-anchor"></a>

#### Re-anchor

**To point an amendment at the element or screen it belongs to now, after a new scan removed the element it was written on; the amendment waits in Review until you do.**

When a scan sees a new revision of a screen, Pathfinder checks every amendment on it. If
the amendment's element is still there, it carries forward to the new revision. If the
element was renamed or removed, or the address now shows a different screen, the
amendment is flagged Re-anchor and listed in Review. You pick the current screen or
element it now belongs to, or dismiss it. Each choice is a new revision; the amendment is
never deleted and nothing is lost.

*Example:* AMD-004 on the "Kontynuuj" button of /kalkulator/pojazd; r2 has no such button, so AMD-004 waits for you to choose another element.

*Seen in:* Review → Amendments to re-anchor; Screen page → Amendments

*Labels:* `Re-anchor`, `Needs re-anchor`, `superseded`

*Related:* [Amendment (to-be)](#amendment), [Screen revision (observed)](#screen-revision), [Review inbox](#review-inbox), [Superseded amendment](#superseded-amendment)

<sub>Last changed in R-43, 2026-10-14.</sub>

<a id="screen-revision"></a>

#### Screen revision (observed)

**One version of a screen as a scan saw it, numbered r1, r2 and so on; a changed screen gets a new revision, not a new screen.**

The first scan that sees a screen records r1. When a later scan sees the same screen with
different content, it adds r2 to the same screen, and the screen page shows which scans
saw each revision. A page that moves to another route is a new screen, not a new
revision. Revisions are only added, never changed. Every amendment is re-checked against a
new revision.

*Example:* Screen "Kalkulator OC/AC": r1 seen by scan 01a1083f, r2 seen by 01a110d5.

*Seen in:* Screens → a screen → Observed revision

*Labels:* `r1`, `r2`, `Observed revision`, `latest`

*Related:* [Re-anchor](#re-anchor), [Amendment (to-be)](#amendment), [Process model (A as-is, B to-be)](#process-model), [Run](#run)

<sub>Last changed in R-43, 2026-10-14.</sub>

<a id="process-model"></a>

#### Process model (A as-is, B to-be)

**One version of a process, either A, the process as the scans observed it, or B and further letters, the process the business wants.**

A process always has process model A, the as-is flow built from what was observed. Rescans
add its revisions; a person can also reorder, remove or add its screens, each change a
signed revision of A (spec 027). You start model B from A (or from another model) and draw
the to-be: edit, reorder, merge and add steps. A process model has numbered revisions (A r1,
B r2); every save makes a new one, with the reviewer's name and the time. Compare puts two
process models side by side. Called "variant" before 2.0; "variant" now means a screen
variant only.

*Example:* PRC-001 "Oblicz składkę OC/AC" has A r1 (4 observed steps) and B r1 (3 designed steps).

*Seen in:* Processes → a process → process model tabs

*Labels:* `Process model`, `A`, `B`, `as-is`, `to-be`

*Related:* [Draft (process draft)](#process-draft), [Change spec](#change-spec), [Live process model (per environment)](#live-process-model), [Screen revision (observed)](#screen-revision), [Amendment (to-be)](#amendment), [As-is sign-off](#as-is-sign-off)

<sub>Last changed in R-81, 2026-10-21.</sub>

<a id="as-is-sign-off"></a>

#### As-is sign-off

**Marking a process's as-is as documented, which records the revision of A it covered so a later change to A shows.**

"Mark as-is documented" on a process page moves the process to the stage "as-is
documented" as a signed revision and remembers which revision of A it covered. When a
rescan or an edit changes A afterwards, the page says "As-is changed since documented
(A r2 → r3)" until someone signs off again. The stage can be moved forward or back at any
time; every move shows in History. The as-is is usually discussed with the business
outside MudPuppy (from the downloaded documentation) before the sign-off.

*Example:* PRC-001 signed off by Anna covering A r1; a rescan added A r2, so the page asks for a new sign-off.

*Seen in:* Processes → a process → As-is documentation

*Labels:* `Mark as-is documented`, `Sign off`, `As-is changed since documented`

*Related:* [Process model (A as-is, B to-be)](#process-model), [As-is documentation](#as-is-documentation), [Archived process](#archived-process)

<sub>Last changed in R-54, 2026-10-18.</sub>

<a id="archived-process"></a>

#### Archived process

**A process taken out of the list, for example one made by mistake; nothing of it is deleted and Restore brings it back.**

Archive on a process page hides the process from Processes and makes its screens count as
in no process again, also for the assistant's grouping suggestions. Its revisions, drafts,
annotations and change specs stay in the store. Processes → Archived lists archived
processes with Restore. Archive and restore are signed revisions of the process.

*Example:* PRC-004 was a duplicate of PRC-002: archived, its 3 screens are back under In no process.

*Seen in:* Processes → Archived; Processes → a process

*Labels:* `Archive`, `Archived`, `Restore`

*Related:* [Process model (A as-is, B to-be)](#process-model), [As-is sign-off](#as-is-sign-off)

<sub>Last changed in R-54, 2026-10-18.</sub>

<a id="process-draft"></a>

#### Draft (process draft)

**Your unsaved work on a to-be process model, which saves itself and which only you see, until you save it as the next revision or discard it.**

Opening a process model to change it starts a draft of its latest revision. The page shows how
many changes it holds since that revision. Save as rN+1 turns the draft into a revision
with your name and the time. Discard draft drops it and keeps the last revision. If
someone saved a newer revision while you drew, saving shows "Someone saved first" and both
versions go to the review inbox as an edit conflict, so you can compare them.

*Seen in:* Processes → a process model → Draft open

*Labels:* `Draft open`, `Save as`, `Discard draft`, `Someone saved first`

*Related:* [Process model (A as-is, B to-be)](#process-model), [Review inbox](#review-inbox), [Status (shape and word)](#status-codes)

<sub>Last changed in R-43, 2026-10-14.</sub>

<a id="change-spec"></a>

#### Change spec

**The document built from the difference between a process's as-is and to-be process models, saying what must change and why, ready to hand to the builders.**

Compare generates it. It has sections: scope, as-is, to-be, the delta step by step, the
records it affects, the migration cut and open questions. You edit any section, and each
save is a revision of the spec. Export it as Markdown, or save it as a documentation
record. It is generated from the process models, so it follows them when you save a new
revision.

*Seen in:* Processes → Compare; Processes → spec.md

*Labels:* `Change spec`, `Compare`, `spec.md`

*Related:* [Process model (A as-is, B to-be)](#process-model), [Amendment (to-be)](#amendment), [SRS export](#srs-export)

<sub>Last changed in R-43, 2026-10-14.</sub>

<a id="live-process-model"></a>

#### Live process model (per environment)

**The process model the BA marked as the one that runs in an environment, such as sandbox or production; each environment has its own marker.**

Mark live in a process's History says "B r2 is what runs in sandbox". The marker is a
revision too: changing it keeps the old one in the history, so you can see what was live
and when. An environment nobody marked shows "Not marked". It records your decision; it does
not deploy anything.

*Seen in:* Processes → History → Mark live; Home → Processes

*Labels:* `Mark live`, `Live`, `Not marked`

*Related:* [Process model (A as-is, B to-be)](#process-model), [Environment](#environment), [Change spec](#change-spec)

<sub>Last changed in R-43, 2026-10-14.</sub>

<a id="proposal"></a>

#### Proposal (assistant proposal)

**A change the assistant suggests in the chat, such as a new amendment or an edited step, which changes nothing until you press Apply.**

A proposal shows what would change. Apply makes it a new revision under your name, the same
way a hand edit does, and shows Undo; Undo restores the earlier content as yet another
revision. Discard drops it. A proposal you leave alone waits in the review inbox, and one
whose target changed meanwhile shows "Out of date".

*Seen in:* Assistant drawer; Review → Assistant proposals

*Labels:* `Proposed`, `Apply`, `Undo`, `Discard`, `Out of date`

*Related:* [Review inbox](#review-inbox), [Amendment (to-be)](#amendment), [Draft (process draft)](#process-draft), [Chat](#chat)

<sub>Last changed in R-43, 2026-10-14.</sub>

<a id="review-inbox"></a>

#### Review inbox

**The one page that lists every open decision, namely records to confirm, amendments to re-anchor, assistant proposals and edit conflicts.**

Anything that waits for a person lands in Review, and the number beside it in the side
menu counts them. You decide in place: confirm or reject a record, re-anchor or dismiss an
amendment, apply or discard a proposal, keep one side of an edit conflict. An item leaves
the inbox when decided; nothing is deleted without a decision.

*Seen in:* Review; Home → Needs you

*Labels:* `Review`, `Needs you`, `inbox`

*Related:* [Re-anchor](#re-anchor), [Proposal (assistant proposal)](#proposal), [Record status](#record-status), [Draft (process draft)](#process-draft)

<sub>Last changed in R-43, 2026-10-14.</sub>

<a id="grouping-suggestion"></a>

#### Grouping suggestion

**A set of screens the assistant proposes as one business process, with the reason they belong together, which you accept, change or ignore.**

After a scan the assistant looks at the screens, the links between them and the forms, and
suggests candidate processes. A suggestion has the Suggested status until you accept it.
Accepting it makes a process with process model A built from those screens. It never invents a
screen that was not recorded.

`pnpm portal:trace` also suggests one per process it drove: the screens of its best run, and
every variant run (happy path, validation errors) named in the reason, so the BA documents
them as one process. A process record then shows one flowchart per cited variant run.

*Seen in:* Processes → Suggested; Home → Processes; Docs → process record

*Labels:* `Suggested`, `grouping`

*Related:* [Process scope](#process-scope), [Process model (A as-is, B to-be)](#process-model), [Proposal (assistant proposal)](#proposal)

<sub>Last changed in R-67, 2026-10-16.</sub>

### Building Pathfinder

<a id="fast-tier"></a>

#### Fast tier

**The crawler tests that run on every commit, in seconds — only the ones your uncommitted change can affect, without browser end-to-end files and gates.**

`pnpm test:fast` in `apps/crawler` asks Vitest which test files import, directly or through
other packages, a file you changed, and runs only those. A change to something the import
graph cannot see (a test harness, fixtures, a migration, a portal or persona file, a config)
runs the whole fast tier instead, still in about 10 seconds. The commit hook runs it.

*Example:* tier: fast (affected) — a one-line change in the fingerprint package runs the tests of fingerprint, crawler and mcp-server that use it.

*Seen in:* pnpm test:fast; the commit hook

*Labels:* `test:fast`, `tier: fast`

*Related:* [Slow tier](#slow-tier), [Quality gate (tier 1)](#quality-gate)

<sub>Last changed in R-34, 2026-10-07.</sub>

<a id="slow-tier"></a>

#### Slow tier

**The browser end-to-end test files (`*.e2e.test.ts`) and the whole gate set, run before committing runtime or gate changes and before a merge.**

`pnpm test:slow` runs two things at once: the files that drive whole crawler runs through
the MCP server with a real browser, and every quality gate including the slow ones against
the proving ground (ports 4200/4201). It takes about three minutes. `pnpm test` still runs
everything and is the check before a merge.

*Seen in:* pnpm test:slow; CLAUDE.md "Verification Before Commit"

*Labels:* `test:slow`, `e2e`, `*.e2e.test.ts`

*Related:* [Fast tier](#fast-tier), [Slow gate](#slow-gate), [Quality gate (tier 1)](#quality-gate)

<sub>Last changed in R-34, 2026-10-07.</sub>

<a id="code-guidelines"></a>

#### Code guidelines

**The rated rules (G-01 to G-32) for how Pathfinder's code is shaped, layered, tested and reviewed, in `docs/code-guidelines.md`.**

Each guideline has an id, the rule, why it exists and what checks it (a lint rule, a test or
the code reviewer). They were proposed as a list and rated by the project owner before any
refactor, so they hold only rules the owner accepted. Reviews cite the ids.

*Example:* G-21: every async call is awaited, returned, or explicitly voided with a reason.

*Seen in:* docs/code-guidelines.md; CLAUDE.md "Code Guidelines"

*Labels:* `G-01`, `guideline`

*Related:* [Agent notes](#agent-notes)

<sub>Last changed in R-34, 2026-10-07.</sub>

<a id="agent-notes"></a>

#### Agent notes

**The short `CLAUDE.md` in every package and app that tells an AI agent (and a person) what the package is for, its layer, public API, rules and where to add things.**

Claude Code reads a folder's `CLAUDE.md` when it works there, so these notes are the first
thing an agent sees. They hold facts only (about 60 lines at most), follow one template and
change in the same commit as the code they describe (guideline G-30).

*Seen in:* apps/*/CLAUDE.md; apps/crawler/packages/*/CLAUDE.md; packages/workflow/CLAUDE.md

*Labels:* `CLAUDE.md`

*Related:* [Code guidelines](#code-guidelines)

<sub>Last changed in R-34, 2026-10-07.</sub>

<a id="mutation-testing"></a>

#### Mutation testing

**A check of the tests themselves — the code is changed in small ways on purpose and every change the tests do not notice is a gap in the tests.**

Each small change is a "mutant" (a `>` turned into `>=`, a condition forced true, a
statement removed). Killed means a test failed, as it should; survived means no test noticed.
The score is the share of mutants killed. It runs on demand, never on every commit:
`pnpm mutate` for the crawler's core packages, `uv run mutmut run` for the dashboard.

*Example:* safety: 929 mutants, 717 killed, 211 survived — 77.3 %.

*Seen in:* pnpm mutate; data/mutation/stryker/<package>/report.html; uv run mutmut results

*Labels:* `mutant`, `mutation score`, `survived`, `killed`, `Stryker`, `mutmut`

*Related:* [Fast tier](#fast-tier), [Behaviour lock](#behaviour-lock)

<sub>Last changed in R-34, 2026-10-08.</sub>

<a id="behaviour-lock"></a>

#### Behaviour lock

**A test that records exactly what the code does today, so a refactor can prove it changed nothing.**

Before code is moved or split, the lock captures its observable result; after every step
the lock must still match. The crawl pipeline's lock runs a map run and a trace run and
compares the recorded states, transitions, decision log and trace spans with a committed
snapshot.

*Seen in:* tests/pipeline-golden.e2e.test.ts; docs/code-guidelines.md G-29

*Labels:* `golden test`, `snapshot`

*Related:* [Code guidelines](#code-guidelines), [Slow tier](#slow-tier)

<sub>Last changed in R-34, 2026-10-08.</sub>

<a id="scar"></a>

#### Scar (scar-maker)

**A real obstacle met at a customer site, rebuilt as a page of the local scar-maker portal so the harness can be proven against it.**

`apps/scar-maker` serves one route per scar (a page-wide POST form, a 403 background call,
German submit labels, a slow SSO login across two hosts, intermittent error pages, a three-step
form with validators, a proxy-only portal …) on two loopback hosts with its own forward proxy.
`scars.yaml` lists each with the field issue it came from, the symptom before and the
behaviour after; every scar has a gate case and the portal is also an eval task. Roadmap
category `[battle-tested-scar]`.

*Example:* SC-16: login through an identity provider on 127.0.0.2 with a 1.5 s redirect chain.

*Seen in:* apps/scar-maker/scars.yaml; gates (SC-nn)

*Labels:* `scar`, `scar-maker`, `SC-`

*Related:* [Fix-plugin](#fix-plugin)

<sub>Last changed in R-56, 2026-10-16.</sub>

## Business-analysis terms

### Documentation

<a id="ears"></a>

#### EARS statement

**A requirement written in one fixed sentence pattern (Easy Approach to Requirements Syntax), such as "When … the system shall …".**

Patterns: ubiquitous ("The calculator shall …"), event ("When …"), state ("While …"),
unwanted ("If …, then …"), optional ("Where …") and complex (a mix). The BA writes one for
every requirement, business rule and NFR while documenting; the export prints them in
EARS.md and lists the records that have none yet.

*Example:* If "Rok produkcji" is below 1990 when "Dalej" is pressed, then the calculator shall stay on "Dane pojazdu".

*Seen in:* Process documentation → EARS

*Labels:* `EARS`

*Related:* [Requirement (REQ)](#requirement), [Business rule (BR)](#business-rule), [Non-functional requirement (NFR)](#nfr), [Process documentation (export)](#process-documentation)

<sub>Last changed in R-68, 2026-10-17.</sub>

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
There are twelve kinds (see Record key for the prefixes). The SRS export renders them into a
readable document.

*Seen in:* Docs tab; SRS export

*Labels:* `Records`, `Record`

*Related:* [Record key](#record-key), [Revision (Rev)](#revision), [Relations / linked records](#relations), [Layer A / Layer B](#layers), [SRS export](#srs-export)

<sub>Last changed in R-16, 2026-10-04.</sub>

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
`synonym_of`, `answers`, `depends_on`, and since R-45 `applies_on` (a rule holds on a
screen), `asks_about` (what an open question is about) and `follows_up` (what a follow-up
would observe). Since R-51 a glossary term also `appears_on` the screens that show it and a
process `contains` the screens it passes through; an assumption or a use case can rest on
a business rule with `depends_on`. Each type allows only certain pairs of record kinds; the server and the store
both refuse any other pair, so no bad link is ever stored. Relations belong to the revision
that states them, so they change with the record.

*Example:* On reference-insurer the most common are uses_term (44), appears_on (41) and contains (39).

*Seen in:* Record page → Relations; Linked records; SRS export (Business rules on this screen; Terms shown; Processes through this screen; Open questions about this)

*Labels:* `Relations`, `Linked records`

*Related:* [Documentation record](#documentation-record), [Traceability](#traceability)

*Read more:* [BA wiki: Traceability](../wiki/traceability.md)

<sub>Last changed in R-45, 2026-10-12.</sub>

<a id="traceability"></a>

#### Traceability

**Being able to follow a requirement back to where it came from and forward to what depends on or tests it.**

In Pathfinder, backward traceability is built in: every record cites evidence and the
evidence names its run. Forward traceability runs through relations (rule → requirement →
use case) and, later, through test tags such as `@REQ-007`. The SRS export includes a
traceability matrix.

*Seen in:* Record page; SRS export

*Labels:* `Traceability`

*Related:* [Evidence link / cites](#evidence-link), [Relations / linked records](#relations), [SRS](#srs), [Traceability matrix](#traceability-matrix)

*Read more:* [BA wiki: Traceability](../wiki/traceability.md)

<sub>Last changed in R-16, 2026-10-04.</sub>

<a id="traceability-matrix"></a>

#### Traceability matrix

**A table that links each requirement, rule or use case to its related records, the evidence it cites and the run that evidence came from.**

The SRS export writes it as `12-traceability.md`: one row per requirement (REQ), business
rule (BR) or use case (UC), then its related records, each evidence link (kind, id, note) and
the run (id, mode, date). It answers "where did this statement come from?" for a reader who
has only the exported files, without the dashboard.

*Example:* BR-030 (WIOSNA10 takes 10% off) → UC-002 → state on /kalkulator/wynik → trace run of FUP-009.

*Seen in:* SRS export → 12-traceability.md

*Labels:* `Traceability matrix`, `12-traceability.md`

*Related:* [Traceability](#traceability), [SRS export](#srs-export), [Evidence link / cites](#evidence-link)

*Read more:* [BA wiki: Traceability](../wiki/traceability.md)

<sub>Last changed in R-16, 2026-10-04.</sub>

<a id="unknowns"></a>

#### Unknowns

**The SRS export's chapter listing everything the documentation could not establish, so a team rebuilding the portal knows what is still open.**

`11-unknowns.md` collects records flagged not observable, records with confidence
`needs_confirmation`, open and blocked follow-ups, open questions, and evidence links whose
target no longer exists. Documentation built from the outside always has gaps (back-office
behaviour, pages behind a login); this chapter makes them explicit instead of hiding them.

*Example:* PROC-005..008 (login and customer area, no test account) and OQ-007 (what happens after "Wniosek przyjęty").

*Seen in:* SRS export → 11-unknowns.md

*Labels:* `Unknowns`, `11-unknowns.md`

*Related:* [SRS export](#srs-export), [Confidence (observed / inferred / needs confirmation)](#confidence), [Assumption (ASM)](#assumption)

<sub>Last changed in R-16, 2026-10-04.</sub>

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

*Related:* [Decision table](#decision-table), [Finding and explanation (hypothesis, H-)](#hypothesis), [Data item (DI)](#data-item)

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
confirmed or replaced once someone who knows the business has looked at it. Every assumption
waits in Review under "Assumptions to check" until a reviewer confirms it; an assumption can
rest on a business rule (`depends_on`), and the rule's page and the SRS export mark it
"To check" until then.

*Example:* ASM-002 "Contact enquiries are answered by phone or e-mail".

*Seen in:* Docs tab → Assumptions; Review → Assumptions to check; SRS export (Assumptions resting on this)

*Labels:* `Assumption`, `ASM`, `Assumptions to check`, `To check`

*Related:* [Confidence (observed / inferred / needs confirmation)](#confidence)

*Read more:* [BA wiki: Assumption](../wiki/assumption.md)

<sub>Last changed in R-51, 2026-10-15.</sub>

<a id="srs"></a>

#### SRS

**Software Requirements Specification, the complete requirements document a team could rebuild the system from.**

Pathfinder keeps requirements as linked records; the SRS export (`pnpm docs:export`) renders
them into one document with chapters, diagrams, a traceability matrix and an Unknowns section.

*Seen in:* SRS export

*Labels:* `SRS`

*Related:* [Traceability](#traceability), [Documentation record](#documentation-record), [As-is documentation](#as-is-documentation), [SRS export](#srs-export)

*Read more:* [BA wiki: Software requirements specification (SRS)](../wiki/software-requirements-specification.md)

<sub>Last changed in R-16, 2026-10-04.</sub>

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
