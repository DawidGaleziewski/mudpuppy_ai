# 11 · Map runs: graph, probing, resume, directed runs, reconciliation

How mapping a portal should work now. It covers:
- what the crawler records beyond the happy path;
- how to restart or narrow a run without starting from zero;
- how people steer the next run from a graph;
- how the BA agent reconciles a screen that came out differently across runs.

Screens: `screens/12–16` (described in `06-screens.md`). Canvas page: "Map runs" (MapGraph is interactive: click nodes, mark them, switch to List). In the UI a run is called a **scan** (D-29); this spec says run.

## 0. Problems → what changes

| Problem today | Now |
|---|---|
| No graph of what was mapped | **Map** view (Scans ▸ Map, screen 12): every screen as a node, every action as an edge, run overlays, clickable |
| Forms are recorded on the happy path only: no wrong data, no other radio options, no validation, no technical errors | **Form probing** (§3): after the happy path, each form step is varied deliberately. Every outcome is recorded as a **state of that step** (screen 13) |
| A failed map must be restarted from the beginning | **Checkpoints** (§4): every state can be reached again by replay. **Resume** from the last good checkpoint, or **retry one path** until it passes (screen 15) |
| You can't start from a different edge or continue a frontier without restarting | **Directed runs** (§5): Continue frontier, Focused (start at a node), Probe forms, Recheck, Retry path (screen 14) |
| Nodes can't be used to steer the crawler | **Marks** (§6): click nodes and edges, then mark them Start here, Focus, Probe, Retry, Recheck or Skip. Marks collect in the **Next run plan** |
| The BA agent documents whichever state it saw, sometimes an error page | **Reconciliation** (§7): different outcomes at the same graph point are grouped, explained (persona, input, temporary issue…) and given a verdict before documenting (screen 16) |

## 1. Concepts

| Term | Meaning |
|---|---|
| **Node** | A screen: one route template + cluster (`/kalkulator/kierowca`). Holds one or more **states** |
| **State** | A fingerprinted condition of the screen (existing term). On a single-page app, one route can have several states, for example **form steps rendered by React on the same URL**: step 1, step 2, step 3 |
| **Edge** | An action from a state: follow a link, submit a form with an input set, choose an option |
| **Outcome** | What an action produced: the resulting state, screenshot, network log and messages |
| **Outcome kind** | `next` (happy path) · `branch` (an input choice leads somewhere else) · `validation` (the form refused the input) · `technical` (error page, toast, endless spinner after a fault) · `temporary` (environment problem, not reproducible) · `blocked` (safety class, credential, captcha) |
| **Probe** | A deliberate variation of an action, made to discover outcomes other than the happy path |
| **Checkpoint** | A recipe to reach a state again: the actions from the seed, the recorded inputs, and prerequisites (persona login, cookies). Replaying it reaches the state without exploring |
| **Frontier** | Discovered but not yet visited actions and pages (the existing term), for example "113 queued" |
| **Mark** | A person's instruction on a node or edge for the next run: Start here, Focus, Probe, Retry, Recheck, Skip |
| **Run plan** | The set of marks, run type, limits and probes that defines the next run |
| **Attempt** | One try at a failing path in a drill-down. Attempts repeat until the path passes |

## 2. The map view (screen 12)

- **Layout:** layered by depth from the seed (`/` at the top). Several states of one route stack as a "deck" with a count ("3 states"). Route families can collapse (`/ubezpieczenia/*`). Frontier items collapse into one dashed cluster node per page ("+38 queued").
- **Node encoding** uses the colour guide:
  - observed: solid plate with a ■ OK shape;
  - has validation, branch or technical states: count chips;
  - failed here: red ✕ with the run id;
  - not reached: dashed ash;
  - blocked: hollow, with the reason;
  - marked: a marker tag (FOCUS, PROBE, RETRY…).
- **Edge encoding:**
  - solid = observed;
  - red = the crawler failed on this action;
  - dashed ash = frontier (not visited);
  - dashed blueprint = planned in the next run.
- **Overlays:** run filter (all runs, or one run), persona, and the layers States, Errors and Frontier. Picking one run greys out what it didn't see.
- **Interactions:**
  - click a node: the inspector shows its states, runs and actions;
  - Shift-click: select several;
  - mark buttons and keyboard shortcuts work on the selection;
  - double-click opens the screen's states (13).
  - Keyboard: arrow keys move between connected nodes, Enter opens, M opens the mark menu.
  - Nodes are real buttons, and the graph has a list view fallback for screen readers and phones.
- **Scale:** the server computes positions; the client pans and zooms. Over ~150 nodes, collapse by route family by default.

## 3. Form probing: recording beyond the happy path

### 3.1 Detecting steps on one URL
After every action the crawler waits for the DOM to settle and fingerprints the state. If the route is unchanged but the fingerprint changed, and the inputs differ, it is a **new step on the same route**. These are numbered per route ("step 1 · dane kierowcy", "step 2 · opcje"). This is how React multi-step forms become visible as separate states.

### 3.2 Order of work
1. **Happy path first** (today's behaviour): fill valid values, go forward and record `next` outcomes.
2. **Then probe each form step** in the plan, from its checkpoint (no need to redo the whole map).

### 3.3 Probe catalogue

| Group | Probe | Records |
|---|---|---|
| Validation | Submit with all required fields empty | Each message, the field it attaches to, and the state. Candidate business rule, e.g. "Zakres is required" from the browser message "Zaznacz jedną z tych opcji." (this portal uses browser-native messages, NFR-001) |
| Validation | Each required field empty, one at a time | One validation state per field (deduplicated by fingerprint) |
| Validation | Wrong format per typed field (email, date, number, postal code, pattern attributes) | Message and state |
| Validation | Boundaries: maxlength + 1, below min, above max | Message and state, or "accepted" |
| Branch | Each option of a radio, select or checkbox that changes visible fields or the next state | A `branch` edge to the new state, explored one level (deeper within budget). Flagged "possible new process" |
| Technical | Block the request the step sends (abort in the browser) | What the user sees: error page, toast, nothing, spinner |
| Technical | Answer that request with HTTP 500 (simulated in the browser) | Error state |
| Technical | Delay that request 30 s | Timeout or spinner state |
| Technical | Go offline at submit | Offline handling |

### 3.4 Safety
- Probes that **submit** run only where the environment's limit is "fill and submit forms".
- **Technical probes are simulated in the crawler's own browser** (request interception). They never send malformed traffic to the server, and are **off for production** unless the portal's settings explicitly allow it.
- Safety classes still apply: an action whose side effects are not allowed is recorded as `blocked`, never probed.
- **Budget:** at most N probes per form step (default 12), plus the run's step limit.
- **Valid test data** comes from the persona's test-data set. Missing values are asked for once, in chat, like credentials.

### 3.5 What the BA agent gets from probing
- Validation messages become **business-rule candidates** (inferred, needs confirmation).
- Branches become **process-variant candidates**.
- Technical states become **error-handling / NFR candidates**.

All of them are linked to the outcome evidence.

## 4. Checkpoints, resume, retry (screen 15)

- **Checkpoints everywhere.** Every recorded state stores its recipe. A run can start at any state by **replaying** the recipe instead of exploring.
- **Replay is checked.** Each intermediate fingerprint must match. A mismatch stops the run with "Replay diverged at step N", showing the expected and seen states, and becomes a reconciliation item.
- **Resume a stopped run:** a new run that replays to the last good checkpoint before the failure. It carries over the stopped run's frontier and is linked as "continues 01a110d5".
- **Retry this path (drill-down):** a focused run that replays to the failing node and re-runs the failing action, with an optional variation (wait longer, don't submit, other inputs, skip the action). Attempts are listed per path. The path is **solved** when an attempt passes; from there you can continue the frontier.
- **Failure classes decide the defaults:**
  - **crawler error** (selector not found, driver crash): retry with a longer wait;
  - **portal error** (HTTP 5xx, error page): record it as a technical state, then recheck later;
  - **blocked** (safety class, credential, captcha): ask the person.

## 5. Directed runs (screen 14)

| Run type | Starts at | Explores |
|---|---|---|
| Full map | Seed `/` | Everything within limits (today's map) |
| Continue frontier | Replays to the pages that own the chosen frontier items | Only those queued items, then onwards within depth |
| Focused | Replays to one or more Start here / Focus nodes | Within depth N from there; Skip-marked nodes and edges excluded |
| Probe forms | Replays to each Probe-marked form step | The probe catalogue only (§3.3) |
| Recheck | Replays to Recheck-marked nodes | Records the current state only, to settle reconciliation |
| Retry path | Replays to the node before the failure | The failing action, as attempts (§4) |

Every run records its type, its parent run (if any), the plan it came from, the persona, the environment and its limits (steps, depth from start, time).

## 6. Marks and the next-run plan (screens 12, 14)

| Mark | On | Means |
|---|---|---|
| **Start here** | node | The next run starts here (replay) |
| **Focus** | node, edge | Explore deeper from here |
| **Probe** | form node or step | Run the probe catalogue on it |
| **Retry** | failed node or edge | Drill down on this path |
| **Recheck** | node with differing states | Replay and record the current state |
| **Skip** | node, edge | Exclude it from the next run (e.g. logout, delete actions) |

Marks are tags on the nodes (marker paint: they are a person's intent). They collect in the **Next run plan** tray, persist per portal until used or cleared, and pre-fill the run builder.

## 7. Reconciliation by the BA agent (screen 16)

### 7.1 When it triggers
- The same from-state and action produced different outcomes across runs (as in your sketch: `/` → step 1 variant 1, variant 2, or another page).
- One route holds several states that are not explained by form steps.
- Replay diverged (§4).

### 7.2 Evidence per outcome
For each outcome: runs, persona, environment, time, HTTP status, frequency ("1 of 3 runs"), whether a recheck reproduced it, and a visual diff against the main state.

### 7.3 Hypotheses the agent must check, in order

| Hypothesis | Signals |
|---|---|
| Persona difference | Outcome differs only between personas |
| Input-driven | Outcome follows a probe or different inputs |
| Temporary / environment | HTTP 5xx, maintenance text, seen once, not reproduced on recheck |
| Session or time | Cookie banner, expired session, time-of-day content |
| Feature flag / A/B | Stable split across runs with the same persona |
| Data-dependent | Differs with the test-data set |

### 7.4 Verdicts
**Main state** · **Variant** (explained by persona, input or flag) · **Validation state** · **Technical error state** · **Temporary, recheck** · **Same state** (merge fingerprints).

The agent proposes a verdict (dashed, inferred); a person confirms it in Review.

### 7.5 Documentation rules
1. A step is documented by its **main state**. Variants, validation and technical states are documented **as states of that step**, never as the step.
2. A temporary state is noted as an **environment issue** (open question or NFR candidate) and queued for **Recheck**. It is not a process step.
3. If the only thing ever observed for a step is an error, the step is **not observed**: open question plus recheck, never "the step is an error page".
4. Variants explained by persona are documented per persona.

## 8. Screens

| Screen | Purpose |
|---|---|
| 12-map-graph | The graph, inspector, marks, next-run plan |
| 13-screen-states | All states of one form screen: steps on one URL, probe outcomes, coverage |
| 14-plan-run | Run builder: type, start point (checkpoint), scope from marks, probes, limits |
| 15-run-recovery | A stopped run: where and why, resume / retry / skip, drill-down attempts |
| 16-reconcile-states | Different outcomes at one graph point; hypotheses, evidence, verdicts, documentation preview |

## 9. Data model additions (sketch)

| Table | Key fields |
|---|---|
| `node` | id, portal_id, route_template, cluster_id, family |
| `state` (exists) | + node_id, step_index (same-route steps), kind (`main` / `variant` / `validation` / `technical` / `temporary`) |
| `edge` | id, from_state_id, action (type, selector, label), input_set_id, safety_class |
| `outcome` | id, edge_id, run_id, to_state_id, outcome_kind, probe_id, http_status, messages[], screenshot, network_log, at |
| `probe` | id, kind (`validation_empty` / `format` / `boundary` / `branch` / `block_request` / `http_500` / `delay` / `offline`), target (field or request), params |
| `checkpoint` | state_id, recipe (actions + inputs), prerequisites (persona, cookies), last_replayed_ok_at |
| `mark` | id, portal_id, target (node or edge), kind, by, created_at, used_by_run_id |
| `run` (exists) | + type, parent_run_id, plan_id, start_checkpoint_id, limits |
| `attempt` | id, path (edge ids), run_id, variation, result, at |
| `reconciliation` | id, group key (from_state + action, or node), outcomes[], hypothesis, verdict, proposed_by, confirmed_by |

## 10. API (sketch)

| Method | Path | Does |
|---|---|---|
| GET | `/portals/{p}/map?run=&persona=` | Nodes, edges, states, overlays, positions |
| POST/DELETE | `/portals/{p}/marks` | Add or remove marks |
| POST | `/portals/{p}/runs` | Start a run from a plan `{type, start_checkpoint_ids, include, exclude, probes, limits}` |
| POST | `/runs/{id}:resume` | Resume from the last good checkpoint (new linked run) |
| POST | `/runs/{id}:stop` | Stop a running run; recorded states and the frontier are kept (Workbench `scan.stop`) |
| POST | `/paths/{id}/attempts` | Retry a path with a variation |
| GET | `/nodes/{id}/states` | States, outcomes and probe coverage of a screen |
| GET/POST | `/portals/{p}/reconciliations`, `/reconciliations/{id}:verdict` | Groups, proposals, confirmations |

## 11. Requirements

| ID | P | Requirement |
|---|---|---|
| FE-M01 | M | The Map view shows nodes, edges and states for the picked portal, with run, persona and layer filters, and a list-view fallback |
| FE-M02 | M | Nodes are keyboard-reachable buttons. Click selects and fills the inspector; Shift-click multi-selects |
| FE-M03 | M | Marks (Start here, Focus, Probe, Retry, Recheck, Skip) can be set on nodes and edges, show as tags, and collect in the Next run plan |
| FE-M04 | M | Same-route form steps are recorded and shown as separate states ("step 1, 2, 3") |
| FE-M05 | M | Probing records validation, branch and technical outcomes as states of the step, with evidence; deduplicated by fingerprint |
| FE-M06 | M | Technical probes are browser-side simulations, off on production by default; submitting probes respect the environment limit and safety classes |
| FE-M07 | M | Every state has a checkpoint. Runs can start by replay, and replay divergence stops the run with a diff |
| FE-M08 | M | A stopped run can be resumed from the last good checkpoint, keeping its frontier, as a linked run |
| FE-M09 | M | A failing path can be retried as attempts with variations until it passes; attempts are listed |
| FE-M10 | M | Run types: Full map, Continue frontier, Focused, Probe forms, Recheck, Retry path, each with limits, persona and environment |
| FE-M11 | M | Reconciliation groups differing outcomes, shows evidence and hypotheses, and records verdicts proposed by the agent and confirmed by a person |
| FE-M12 | M | Documentation follows §7.5: an error page is never documented as the step |
| FE-M13 | S | Validation messages, branches and technical states produce inferred rule, process-variant and NFR candidates linked to evidence |

## 12. Open questions

- **O-M1** Should technical probes ever run on staging or production, or only on sandbox?
- **O-M2** Captchas and one-time codes: skip as `blocked`, or ask a person mid-run?
- **O-M3** Where does the valid test data per persona live (Settings ▸ Personas)?
- **O-M4** The default probe budget per form step (12?) and per run.
- **O-M5** Do Recheck runs need approval on production (they only look)?
