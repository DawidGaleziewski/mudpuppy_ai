# MudPuppy 2.0: UX requirements for the designer

Spec 039 · R-81 · 2026-10-18. A brief for the UX designer's consultation. It says what changes in
the product, who uses it for what, which pages are needed, and which decisions we want from you.
The technical design is `design.md`; you do not need it, but § 3 (vocabulary) helps.

## 1. What MudPuppy is

MudPuppy documents existing web portals (an insurer's quote calculator, a bank's client area) so a
team can migrate or rebuild them. An AI crawler explores the portal and records every page and
action; an AI business analyst (BA agent) writes the documentation from that evidence; a person
(the BA, our user) reviews, corrects and exports it. The console is a local web app (FastAPI +
htmx), in the **Salvage Yard** design system (`docs/design/salvage-yard/`: brand book, components,
16 detailed screens, 12 wireframes).

Today's navigation: **Home · Processes · Screens · Docs · Review · Scans · Settings**, plus the
assistant (a chat drawer that can start scans, group processes and answer questions).

## 2. What changes in 2.0

v1 records each scan and shows what it saw. v2 keeps **one living model of the portal** and, after
every scan, works out **what changed, when and why**:

| v1 | v2 |
| --- | --- |
| Each scan adds pages; rescans can create duplicate screens | Screens keep their identity across scans; splits and merges are recorded with a reason |
| The map shows every link ever clicked, old and new | The map shows the portal **now**: moved links once, removed links marked, unvisited parts marked as unchecked, not as gone |
| A screen's versions (r1, r2…) don't say why they differ | Each variant says why: a new release, another persona, an error, an A/B test |
| Business rules are unverified notes | Business rules as decision tables ("age < 18 → exit page"), **tested** at their boundaries (17, 18, 19), re-tested after each release |
| Processes are grouped when someone asks | The system proposes processes after each scan (trigger, start, outcomes); the user edits if they want |
| "Is it complete?" is a feeling | Each process says how far it was explored, on which release |
| The user reviews many per-page verdicts | Most differences are explained automatically; the user sees only the ones that need a person, and can overturn any automatic explanation |

The user's main new jobs:

1. **"What changed since last time?"** after a portal release, at a glance.
2. **Confirm or correct** what the system could not decide (an A/B test, an unexplained error, a
   business rule, a process boundary), with a reason.
3. **Trust the documentation for a migration**: business rules with tests, processes with clear
   start and end, coverage per process.
4. **Overturn** an automatic explanation that is wrong, and see that it stays overturned.

## 3. Users and context

- **Primary: the BA** (business analyst; not a developer). Polish and English portals; works on
  several portals; reviews in sessions of 15–60 minutes. Owner direction (2026-10-18): "I don't
  want to review everything. Reviewing should be an option."
- **Secondary: the migration team** reading the export (developers, testers): needs rules,
  contracts, processes; reads the export more than the console.
- **Context:** desktop, 1280 px and up; local app; long-running scans in the background (minutes);
  the assistant drawer is open on many pages.

## 4. Principles for the design

- **Exceptions first.** Default views show what needs a person; everything explained automatically
  is one click away, never hidden.
- **Every claim shows its evidence** (a screenshot region, the visit, the scan) and its confidence
  (observed, inferred, needs confirmation). This is a hard product rule.
- **Every decision asks for a reason** (one line), and the reason is shown later wherever the
  decision is visible.
- **Plain words.** The model's vocabulary (abstract state, journey, hypothesis, deviation, build
  epoch) is internal. Proposed UI words are in `design.md` § 3; we want your proposal.
- **Time is a first-class axis.** Releases (builds) and scans are the timeline; most pages need a
  "as of release / scan" context.
- **Nothing disappears.** Removed things are marked and kept; history is browsable.
- **Read-mostly.** The console reads; writes (confirm, reject, label, overturn, rebuild) go
  through commands, so every write button gives clear feedback and can fail politely.

## 5. Pages and requirements

Each item: what the user must be able to do. `UX-R` ids let us trace them. Priority: **P1** needed
for 2.0, **P2** wanted, **P3** later.

### 5.1 Home (P1)

- **UX-R01** See, per portal, the latest release seen, the last scan, and counts: changes since the
  last release, items waiting for a person, processes explored / not explored.
- **UX-R02** A warning when a portal shows no release marker ("changes are detected more slowly").
- **UX-R03** Jump straight to "What changed" and to "Needs you".

### 5.2 What changed (new, P1)

The page that answers "what changed since last time".

- **UX-R10** Choose a range: since the last release, since a date, between two scans.
- **UX-R11** A list of changes grouped by screen and process: new screens, new or removed actions,
  links that now lead elsewhere, results that changed (now an error), business rules that broke.
- **UX-R12** Each change shows its explanation (new release, another persona, A/B test, flaky
  error, removed, replaced by…) and whether it was **explained automatically** or **needs you**.
- **UX-R13** Before / after for a change: two screenshots or wireframes with the changed region
  marked; the differing context (release, persona, inputs, flags).
- **UX-R14** A release timeline per portal part (the shell and each embedded app have their own
  releases); gradual rollouts (old and new release served together) visible.

### 5.3 Needs you / Review (reworked, P1)

Today Review lists documentation records and per-page verdicts. In 2.0 it also holds the
system's claims.

- **UX-R20** One queue of everything waiting for a person: documentation records (as today),
  claims that need interpretation (A/B test, backend change, an error that always happens for one
  input, a link removed without a release, unexplained behaviour), business rules ready to confirm,
  process proposals, screen-identity conflicts.
- **UX-R21** Each item: the one-sentence claim, its evidence, the tests run and their results
  ("tested at 17, 18, 19: pass"), and actions: confirm, reject (reason required), comment.
- **UX-R22** A second tab, **Explained automatically**: every automatic explanation, with its rule
  in plain words ("explained as a new release because the page's code changed at 14:02"), and an
  **Overturn** action with a reason. Overturned items are shown as such everywhere.
- **UX-R23** Filters by kind, portal part, process, age; counts per kind.
- **UX-R24** Bulk confirm for similar items (e.g. 12 links "removed with release 3e1a").

### 5.4 Screens (reworked, P1)

- **UX-R30** The screen list shows status (active, merged, retired), number of variants, when last
  seen, and coverage (actions checked on the current release).
- **UX-R31** Screen detail: its **variants** (r1, r2…) each with **why it differs** (release, persona,
  error, A/B, unknown), screenshots side by side.
- **UX-R32** Its **actions** with status: active, not seen since (date), not checked on this release,
  retired; per persona where they differ ("only premium customers see this").
- **UX-R33** Its **history**: split from / merged into other screens, with the reason (a person's
  label or the automatic grouping), and the documentation affected.
- **UX-R34** "Same screen?" labelling (P2): show two page versions side by side; answer *same*,
  *same with different data*, *different*, optionally why. Used rarely, but must be fast (keyboard).
  Also reachable from a screen conflict in Review.

### 5.5 Map (reworked, P1)

- **UX-R40** The map of the portal **now**: screens and links of the current model; internal
  actions (dialogs, validation) inside the screen, not as lines.
- **UX-R41** Link states visible: active, not seen since, not checked on this release, retired,
  replaced (old → new).
- **UX-R42** Overlay a process (its screens and trigger highlighted) and a release (what changed).
- **UX-R43** Switch to one scan's own path (as today) for debugging.
- **UX-R44** Scale: up to ~300 screens; global navigation (menus on every page) hidden or bundled
  by default.

### 5.6 Processes (reworked, P1)

- **UX-R50** Processes proposed by the system appear automatically after scans, marked as proposed;
  the user accepts, renames, splits, merges, moves screens or rejects (reason required). A person's
  edit is never undone by a later proposal; when the system would change an edited process, it
  shows a suggestion instead.
- **UX-R51** Process detail: trigger (the link or button that starts it, and from where),
  preconditions (logged in as…), member screens in order, outcomes (completed, exited, error,
  abandoned) with their screens.
- **UX-R52** Paths: the distinct ways through the process with counts of cases; one case's path
  ("this scan went A → B → exit page because age 17").
- **UX-R53** **Explored**: how far it was explored on which release ("every action and pair of
  actions tried, 50 random walks, nothing new"), and what is missing; a button to explore further
  (with an estimated duration).
- **UX-R54** The business rules inside the process (link to 5.7) and its documentation (one PROC
  record per process).

### 5.7 Business rules (new, P1)

- **UX-R60** A list of rules per portal and process: where the decision is made (screen and
  button), status (proposed, tested, confirmed, broken, replaced), last tested.
- **UX-R61** A rule as a **decision table** (inputs, conditions, result), readable by a BA and a
  developer; "decided on data not visible from the UI" when the portal chooses on hidden data.
- **UX-R62** Its boundary tests and results (17 / 18 / 19 → result), rerun history, and the
  release where it last changed ("threshold moved from 18 to 21 with release 9c21").
- **UX-R63** Confirm, reject, reword (the wording goes into the documentation).

### 5.8 Scans (adjusted, P2)

- **UX-R70** Scans now include automatic **check runs** (replays and tests, no AI); show them
  apart from the AI scans, with what they checked and found.
- **UX-R71** A scan's paths (journeys) as a list or tree (backtracks branch), each step with its
  result (ok, validation, business error, technical error, timeout, blocked).
- **UX-R72** "Rebuild model" for a portal, with progress and a summary of what changed in the model.

### 5.9 Settings (adjusted, P2)

- **UX-R80** Per portal, optional hints: where the release version shows, which cookies name an
  A/B test, which messages are business refusals ("we can't insure you"); each with an explanation
  and an example.
- **UX-R81** Budgets for automatic checks per scan.

### 5.10 Assistant (adjusted, P2)

- **UX-R90** The assistant can answer "what changed?", start a rebuild or a check run, and name or
  explain proposals; its proposals appear in the same queues (5.3, 5.6) marked as from the assistant.

## 6. States to design

For each P1 page: empty (new portal, no scans), first scan running, model being rebuilt, nothing
needs you, very long queues (500+ items), a portal without release markers, a conflict (two labels
contradict), a failed write (the command refused, with its message).

## 7. Constraints

- Salvage Yard components and tokens; status colours per `03-colour-guide.md`; no new fonts.
- Server-rendered pages with htmx live regions; no single-page app.
- Desktop first (1280 px); usable at 1024 px.
- Portal content stays in its language (Polish labels, screen titles); console copy in English.
- Accessibility: keyboard for every review action; screen reader labels; contrast per the guide.

## 8. What we want from the consultation

1. **Information architecture**: where "What changed", "Needs you" and "Business rules" live in the
   seven sections (new sections or inside existing ones), and how time (release / scan) is chosen
   across pages.
2. **UI vocabulary**: words for the concepts in `design.md` § 3 (screen variant, link, change,
   claim, explained automatically, release, case, path).
3. **Wireframes** for the P1 pages (5.1–5.7) and their states (§ 6).
4. **The review flow**: how a BA works through a queue quickly (keyboard, bulk, reasons), and how
   overturning an automatic explanation is made safe and visible.
5. **The before / after view** for a change (screenshots, wireframes, changed region, context diff).
6. **The decision table** presentation for BA and developer readers, on screen and in the export.

Open for your input: should "Needs you" be a global inbox across portals; how much of the release
timeline belongs on Home; whether the map should default to "now" or to "this release vs previous".

## 9. Reference material

- Current screens: `docs/design/salvage-yard/screens/` (01 Home … 16 Reconcile states) and
  `screenshots/screens/`.
- Design system: `docs/design/salvage-yard/docs/04-design-system.md`, `components.html`.
- BA walkthrough of v1: `docs/how-to-use.md`.
- The product decisions behind 2.0: `spec.md` (this folder).
