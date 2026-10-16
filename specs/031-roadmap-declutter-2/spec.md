# Spec 031: Roadmap declutter 2 — decision-free leftovers in one branch (R-67)

Branch `feature/031-r67-roadmap-declutter` · Created 2026-10-16 · Status: done, merged 2026-10-16 (v1.0.34). SC-001,
SC-002 met; SC-003 met (R-55 down to S07); SC-004 not met (LO-27 deferred, findings F-09)

**Input**: owner, 2026-10-16: "ok declutter the roadmap. Merge all smaller and maybe some larger
tasks into one branch task and start doing. Work as long as possible." The list was proposed in the
same session ("Fully explained, no decision from you needed", items 1–8, plus the two small calls
Claude makes and reports). Owner decisions still open under [battle-tested-scar] (transit zones,
D-8, D-9, sub-resource 429, remaining env defaults, numbered sections, R-33 US4, R-36 F-13) are
**not** touched. Sources: roadmap rows R-35, R-55, R-58, R-60, R-61, R-62, R-63, R-64;
`specs/030-battle-tested-scars/findings.md` F-05, F-07, F-08, F-10, F-11, F-13, F-14, F-15 and its
close-out review; `specs/026-frontier-order/findings.md` F-05, F-07; field pack `04` GC-10.

## Problem

After the [battle-tested-scar] merge (v1.0.33) the roadmap carries a tail of fully explained work
spread over nine items, each "in progress" for a part nobody has to decide on. This feature does
that tail in one branch so those items can close or shrink to their owner decisions.

## User stories

### US1 One wait for slow pages everywhere (R-60, F-10) — P1

Owner decision D-2 Q1: one shared wait (condition, quiet limit, hard limit) for login, `navigate`,
`act` and the mount wait. Login uses it since spec 030.

1. **Given** a page that keeps loading new resources for longer than today's 10 s settle limit,
   **when** the crawler settles it, **then** it waits while the page makes progress (new resources,
   DOM growth, URL change), up to a hard limit, and observes the finished page.
2. **Given** a page whose only activity is a repeating poll of the same URL, or a hung request,
   **then** that is not progress: the settle gives up after the quiet limit, as today.
3. **Given** a micro-frontend that mounts late while its bundles are still loading, **then** the
   mount wait gives it more time while it progresses, and gives up early when nothing happens.
4. The limits come from the portal file (`timeouts`) with defaults; every R-28 gate stays green and
   the bank estate's per-page time does not grow (F-08).

### US2 The environment is visible and the parts agree (R-61, F-11) — P2

1. **Given** the dashboard serving a store of environment E, **then** its header names E.
2. **Given** a live `pathfinder` MCP server registered on another environment or another checkout
   than the dashboard's, **then** the dashboard says so (the chat starts its servers on its own
   environment, so they agree by construction).
3. **Given** the environment guard, **then** its mutation score is measured and its surviving
   mutants are killed or explained.

### US3 Credential values are masked, ids are not (R-62 (7), GC-10) — P2

1. **Given** a persona whose id equals its login name, **when** a run starts, **then**
   `runs.persona_id` keeps the readable id; the password and other secret values are still masked
   everywhere.

### US4 Corporate CA (R-63) — P3

1. **Given** a portal behind TLS inspection with a corporate root certificate in a PEM file,
   **when** the portal file names it (`network.ca_file`), **then** the browser trusts that CA
   without ignoring every certificate error, and the doctor checks the file.

### US5 Trace variants are grouped and drawn (R-64) — P2

1. **Given** `pnpm portal:trace` drove the variants of trace T, **then** the runs are grouped as one
   process with each run as a variant, so `narrow` (and the BA's session warning) sees them as
   grouped.
2. **Given** a process with several variants, **then** the dashboard draws one flowchart per
   variant.

### US6 Frontier and shop leftovers (R-55, R-58 (2)(3)) — P2

1. **Given** a checkout form whose submit is pressed in a map run on sandbox, **then** the form is
   filled first and the confirmation page is reached (S05).
2. **Given** a frontier item whose element is hidden or gone when it is handed out, **then**
   visibility is checked at hand-out; a hidden element is revealed when its opener is known, else the
   item is settled `unreachable` without spending an agent turn (S07).
3. **Given** link names that differ only by a trailing count ("Koszyk (0)", "Koszyk (3)"), **then**
   they count as the same link for same-target inference (Claude's call, reported to the owner).
4. **Given** shared navigation (the global menu present on every state), **then** its items are not
   handed out again from each state once their target was visited.
5. **Given** a BA data item whose `name_verbatim` is a code name (snake_case, equals the input's
   `name` attribute but not its label), **then** an eval check counts it (F-05@026).

### US7 Script-written pop-ups (R-35, LO-27) — P3

1. **Given** an action that opens a window with no URL and writes its content by script, **then**
   the crawler reads that window's content as a state of its own (or records it as a pop-up note
   with its content when it cannot), closes it and carries on in the opener; LO-27 becomes a gate.

### US8 Tests that the findings asked for (spec 030 F-05, F-07, F-08, F-13, F-14, F-15) — P2

1. An `act` that crashes retires its item (F-05).
2. A hook's `inPage` named inner function works under a `tsx`-started server (F-07).
3. The bank's first logged-in page settles within a budget after login (F-08 perf case).
4. The doctor's proxy probe also tries a CONNECT tunnel to an http target (F-13).
5. The `no-script-edits` hook refuses `cat >>`, `python3 - <<EOF` and `sed -i` on tracked files
   (F-14).
6. The pre-commit hook runs the dashboard review tests when `apps/crawler/scripts/` changes (F-15).

### US9 Deferred guideline findings (spec 030 close-out) — P3

The 13 deferred findings are behaviour-neutral refactors of hubs (G-02/G-03/G-04/G-01/G-30/G-22).
As many as fit are done here, one file per change with the right test tier (refactor-code skill);
the rest stay listed. (Open decision 7 asked whether to make a new item; this feature takes them,
which the owner may reverse by dropping the commits.)

## Edge cases

- A page with a continuous animation or a websocket: not progress (streams are already excluded;
  DOM size unchanged by animation).
- A CA file that does not exist or is not PEM: `start_run` refuses with the path; the doctor names
  it.
- `portal:trace` with one variant: still grouped (a process with one variant).
- A trailing count inside the name ("3 items in Koszyk"): only a trailing `(n)` / `[n]` is dropped.
- Shared navigation whose target differs per state (relative links): only items with the same
  resolved target and name are deduplicated.

## Functional requirements

- **FR-001** Settle and the mount wait use `waitForCondition` with progress = new request URL,
  DOM node count or URL change; a repeated request URL is not progress. Quiet limit = today's limit
  (settle 10 s, mounts `mfe_wait_ms`), hard limit from `timeouts.settle_hard_ms` /
  `mfe_hard_ms` (defaults 30 s).
- **FR-002** The dashboard header shows the environment of the open store; a warning names live
  servers on another environment or checkout (from `data/servers/*.json`).
- **FR-003** Mutation testing runs on the environment guard; the result is in findings.
- **FR-004** Only credential secret values are registered with the redactor where an identifier
  equal to them is stored; `runs.persona_id` stays readable.
- **FR-005** `network.ca_file` (PEM) is trusted by the browser context; a doctor check reads it.
- **FR-006** `portal:trace` groups the runs of one trace as one process with variants.
- **FR-007** The dashboard draws a flowchart per process variant.
- **FR-008** Checkout fill-before-submit reaches S05 on the proving-ground shop (gate).
- **FR-009** Visibility at hand-out (S07).
- **FR-010** Trailing counts are dropped for same-target inference.
- **FR-011** Shared-navigation items are not re-handed out across states once their target was
  visited.
- **FR-012** An eval check `ba_code_names` counts code-name data items.
- **FR-013** LO-27 for script-written windows becomes a gate.
- **FR-014** The six test cases of US8 exist and pass.
- **FR-015** Deferred guideline findings fixed or still listed, each behaviour-neutral.

## Success criteria

- **SC-001** Fast tier, slow tier and every app's suite green at close-out; every R-28 gate green.
- **SC-002** The bank estate's mean per-page settle time after login does not grow by more than
  10 % (F-08 perf case).
- **SC-003** R-55, R-60, R-61 (built parts), R-62 GC-10, R-63, R-64 close or shrink to their owner
  decisions on the roadmap.
- **SC-004** LO-27 is a gate.

## Out of scope

Transit zones (R-62 Q3), D-8, D-9, the sub-resource 429, the remaining `sandbox` defaults, R-50 and
numbered sections, R-58 batch drain, R-65 (5) `api_endpoint`, R-66, R-33 US4, R-36, R-32 and every
paid eval run beyond one confirmation trial per changed area.
