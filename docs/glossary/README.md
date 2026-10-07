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
records what is there. Off production it fills a form with test data before pressing its
submit button (form autofill), so the pages behind forms are mapped too; on production it
never submits.

**Trace** mode follows one named business process, such as "Oblicz składkę OC/AC", with
inputs from the persona, and records the ordered steps and what the portal did after each.
On production it stops at the submit boundary. The BA asks for trace runs through
follow-up tasks when a map run is not enough.

*Seen in:* Runs table → Mode

*Labels:* `Mode`, `map`, `trace`

*Related:* [Run](#run), [Process (trace mode)](#trace-process), [Submit boundary](#submit-boundary), [Follow-up task (FUP)](#follow-up-task), [Form autofill](#form-autofill)

<sub>Last changed in R-20, 2026-10-04.</sub>

<a id="environment"></a>

#### Environment (sandbox / production)

**Which copy of a site a scan targets, production (the live site), staging or sandbox; each has its own address and limit of how far the crawler may go.**

A portal has one or more environments (see Portal settings). A public address must be
declared production. Since constitution 4.0.0 production is not read-only by rule: the
crawler may fill, submit and log in up to the limit the BA set for that environment, which
on a live site really happens. Each scan from the chat only looks unless you allow edits
for it (see Scan choices). Production keeps a conservative rate limit, an identifying
User-Agent, and stops on a CAPTCHA. Each run records its environment. Separately, the
dashboard's "data store" switch picks which local database file (`data/db/<name>.sqlite`)
it reads; runs of every environment can be in one store.

*Example:* wikipedia-org: production https://www.wikipedia.org/ (only look); reference-insurer: sandbox

*Seen in:* Portal settings; Runs table → Environment

*Labels:* `Environment`, `sandbox`, `staging`, `production`

*Related:* [Safety class](#safety-class), [Scope / denylist](#portal-scope), [Form autofill](#form-autofill), [Portal settings (environments)](#portal-settings), [Scan choices (edits, images)](#scan-choices)

<sub>Last changed in R-31, 2026-10-07.</sub>

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
found, what was missed and what was over-claimed (`pnpm docs:evaluate`, see Coverage
score). Its data is safe to show and stable, which is why glossary examples come from it.

*Seen in:* Docs tab → reference-insurer; portals/reference-insurer

*Labels:* `reference-insurer`, `ground truth`

*Related:* [Run](#run), [Documentation record](#documentation-record), [Coverage score](#coverage-score), [Over-claim](#over-claim)

<sub>Last changed in R-16, 2026-10-04.</sub>

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

*Example:* Goal run 2026-10-04 on reference-insurer: screens 100 (17/17), rules 100 (16/16), 0 over-claims.

*Seen in:* data/exports/<portal>-eval.json; `pnpm docs:evaluate`

*Labels:* `Score`, `Coverage`

*Related:* [Reference portal / ground truth](#reference-portal), [Over-claim](#over-claim)

<sub>Last changed in R-16, 2026-10-04.</sub>

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

<a id="form-autofill"></a>

#### Form autofill

**In map mode off production, the crawler fills a form with test data just before it presses the form's submit button, so it can reach the page behind the form.**

Values come from the persona's inputs when it has one for the field's label, otherwise from
a fixed generator per field type (an e-mail on a test domain, a number inside the field's
limits, the first real option of a list). Each autofill is written to the trace and the
decision log with the field names and values. On production the submit itself is refused,
so nothing is filled or sent there.

*Seen in:* Run page → Trace → form_autofill; Run page → Decisions

*Labels:* `Autofill`, `form_autofill`

*Related:* [Mode (map / trace)](#mode), [Environment (sandbox / production)](#environment), [Persona](#persona), [Safety class](#safety-class)

<sub>Last changed in R-20, 2026-10-04.</sub>

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

*Related:* [Evidence](#evidence), [Environment (sandbox / production)](#environment)

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
and the values never reach the tool result, the records or the logs. Login is refused on
production.

*Seen in:* Run page → decisions (login)

*Labels:* `login tool`

*Related:* [Login block](#login-block), [Credential vault](#credential-vault), [Secret redactor](#secret-redactor), [Re-login](#re-login), [Hand-off (CAPTCHA)](#captcha-handoff)

<sub>Last changed in R-26, 2026-10-05.</sub>

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

**On a sandbox or staging portal, a CAPTCHA does not stop the run; the crawler records it, asks for a human and carries on with the rest.**

The crawler never solves a CAPTCHA. Off production, it records the state, writes a `handoff`
decision, skips actions inside the CAPTCHA container and opens a crawler question
`Human needed: CAPTCHA on <route template>`. On production a CAPTCHA is still a block and
the run stops with a warning. A CAPTCHA on the login page marks the run login-blocked.

*Example:* Human needed: CAPTCHA on /sklep/zamowienie

*Seen in:* Run page → open questions; decisions (handoff)

*Labels:* `handoff`, `Human needed`

*Related:* [Open question (crawler)](#crawler-open-question), [Server-side login](#server-side-login), [Decision (allowed / skipped)](#decision), [Environment (sandbox / production)](#environment)

<sub>Last changed in R-26, 2026-10-05.</sub>

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
`pnpm test:slow` runs the whole gate set with them, for example at night.

*Seen in:* pnpm test:slow; data/gates/report.json → skipped_slow

*Labels:* `slow`, `skipped_slow`

*Related:* [Quality gate (tier 1)](#quality-gate), [Gate report](#gate-report)

<sub>Last changed in R-27, 2026-10-05.</sub>

<a id="eval"></a>

#### Eval (tier 2)

**A real, paid run of the crawler and BA agents on one portal, scored against its ground truth and compared with a saved baseline.**

`pnpm eval <portal>` in `apps/crawler` starts the headless agents with a budget cap, runs
the evaluator and writes `data/evals/<portal>/<timestamp>.json`. It then compares the
scores and checks with the baseline and exits with 1 on a regression. It is never part of
`pnpm test`, because it costs tokens and agents are not deterministic. It is how you see
whether a change to a prompt, a skill or the tools made the agents better or worse.

*Seen in:* pnpm eval

*Labels:* `tier 2`, `pnpm eval`

*Related:* [Eval baseline](#eval-baseline), [Eval workspace](#eval-workspace), [Coverage score](#coverage-score), [Quality gate (tier 1)](#quality-gate)

<sub>Last changed in R-27, 2026-10-05.</sub>

<a id="eval-baseline"></a>

#### Eval baseline

**The saved result an eval is compared with; a score may fall below it only by the portal's tolerance.**

`data/evals/<portal>/baseline.json` is set with `pnpm eval <portal> --promote`, which moves
the old baseline to `history/`. `tolerances.json` in the same folder sets how far recall and
precision may drop (default 0.05). A check that was true in the baseline must stay true.
Baselines are committed.

*Seen in:* data/evals/<portal>/baseline.json

*Labels:* `baseline`, `tolerance`, `promote`

*Related:* [Eval (tier 2)](#eval), [Coverage score](#coverage-score)

<sub>Last changed in R-27, 2026-10-05.</sub>

<a id="eval-workspace"></a>

#### Eval workspace

**A fresh temporary root where an eval's agents record, so your own database and documentation are never touched.**

By default an eval copies the portal and persona configs, the migrations and the persona's
encrypted credential rows into a temp folder and points the agents there, so every eval
starts from nothing. With `--in-place` it uses the real store instead, and the runs then show
in the dashboard.

*Seen in:* pnpm eval --in-place

*Labels:* `PATHFINDER_ROOT`, `in-place`

*Related:* [Eval (tier 2)](#eval), [Credential vault](#credential-vault)

<sub>Last changed in R-27, 2026-10-05.</sub>

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

*Related:* [Environment (sandbox / production)](#environment), [Portal settings (environments)](#portal-settings), [Workflow step](#workflow-step), [Scan focus](#scan-focus)

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

*Related:* [New portal](#new-portal), [Environment (sandbox / production)](#environment), [Chat](#chat)

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

*Related:* [New portal](#new-portal), [Portal (dropdown)](#portal-dropdown), [Environment (sandbox / production)](#environment)

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

*Related:* [Superseded amendment](#superseded-amendment), [Wireframe](#wireframe), [Screen region](#screen-region), [SRS export](#srs-export)

<sub>Last changed in R-30, 2026-10-06.</sub>

<a id="superseded-amendment"></a>

#### Superseded amendment

**An amendment a fresh run made out of date because the screen or element it targets changed; kept, never deleted, until the BA re-applies or dismisses it.**

After a run the BA started finishes, Pathfinder checks every active amendment against what
the run saw: same address but a different screen (`state_replaced`), the targeted element
renamed (`element_changed`) or gone (`element_removed`). A screen the run did not visit
leaves its amendments active. Superseded ones are listed in "Superseded amendments" with
reason, run and time; re-apply creates a new active copy on a current screen, dismiss
retires it. Exports list them in `appendix-superseded-amendments.md`.

*Seen in:* Superseded amendments view; appendix-superseded-amendments.md

*Labels:* `superseded`, `re-apply`, `dismiss`

*Related:* [Amendment (to-be)](#amendment), [Run](#run)

<sub>Last changed in R-30, 2026-10-06.</sub>

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
