# Pathfinder reconciled portal model: design

Oct 18, 2026 · @Dawid

## Summary

Pathfinder gets a stored, rebuildable **portal model** between the raw crawl evidence and the BA's documentation. A deterministic **reconciler** builds it after every run; agents and people only add decisions on top.

What changes:

- **Layer A records five new things:** the build that served each page, the inputs and shown values at each step, observation-to-observation transitions grouped into journeys, a result per step, and fingerprint components.
- **Screens become abstract states** from an order-independent clustering, with stable ids and a recorded lineage of splits and merges. Visit order no longer changes identity.
- **Edges are matched across runs** into model transitions with coverage (last present, last absent, last executed). "Not seen" and "gone" become different statuses.
- **Every difference between a run and the model is a deviation.** Rules R1–R8 settle most of them automatically (drift, context variants, flaky failures) and flag A/B tests for a person. The rest become hypotheses for the agent, each with a test that could refute it.
- **Data-dependent branches are mined into decision rules**, written as DMN decision tables, each with boundary tests rerun on every new build.
- **"Process" becomes one concept** with a trigger, member screens and outcomes. Boundaries are proposed from micro-frontend mounts, API families and correlation ids.

What does not change: raw evidence is never rewritten, the BA writes only through its tools, and judgments still need a person. One amendment lets facts derived by code apply automatically (Constitution amendment).

Delivery is six phases. Each ends with a gate on the reference-insurer eval (Phases and acceptance gates).

## Vocabulary

Names now follow three bodies of literature: web-app model inference (crawlers such as Crawljax), process mining (event logs, decision mining, conformance checking, concept drift) and active automata learning (LearnLib). The full map of what each current name becomes is in Glossary.

The decisions that matter most:

| Today | From now on | Why |
| --- | --- | --- |
| state | concrete state (table stays `states`) | One exact page version; "concrete" separates it from the abstract state |
| screen | abstract state; "screen" stays as the BA-facing label and table name | The literature's term for a class of near-duplicate pages |
| revision r1, r2 of a screen | member r1, r2; why it differs comes from its context and hypotheses | "Revision" implied a time order, but members also differ by persona, environment or A/B arm |
| state\_observations, page\_visits | observation (one visit) | Process mining's event |
| edges (per run) | transition (observation → observation) in Layer A; model transition (abstract state → abstract state) in Layer M | Separates what happened from what we believe exists |
| state\_kind main/validation/technical | step result: ok, validation, business\_error, technical\_error, timeout, blocked | Recorded per observation and transition |
| trace processes | journey | Process mining's case; "case" and "trace" collide with insurance cases and Playwright traces |
| reconciliations, rule\_candidates | hypotheses | One table for testable claims, as in automata learning |
| process\_variants (as-is, to-be) | process models | Frees "variant" for its process-mining meaning: a distinct path through a process |
| probe | probe, kept; it is a query in automata-learning terms | Probe suites become a hypothesis's tests |

Two words leave model talk: "cluster" as an identity (it is only the explorer's crawl-time guess) and "process" without a qualifier.

## What stays

Today's requirements carry over unchanged and constrain every section below.

- **Evidence first.** Every claim cites Layer A with a confidence label: observed, inferred or needs confirmation. Hypotheses reuse these labels.
- **Raw data is never rewritten.** New Layer A columns are captured at write time. Values derived for old rows go into separate tables (`state_components`) or are versioned (`fp_version`).
- **Capture everything.** URLs, query parameters, redirects, pages without ARIA, mounts and frames stay captured. The model decides what counts toward identity; capture never drops data.
- **Portal-agnostic.** Portal-specific knowledge enters only through hooks (build markers, flag names, business error templates) and person-made labels.
- **Versioning.** Abstract states and transitions can disappear and return. Status changes are recorded; nothing is deleted.
- **The BA writes only through its tools; the assistant proposes and a person applies.** Refined by one amendment: facts that follow mechanically from evidence apply automatically and stay reversible (Constitution amendment).
- **End product: documentation good enough to rebuild the portal per process (R-68).** The model adds what a rebuild needs most: decision rules, process boundaries and contract evidence from endpoint schemas.

DDL in this document is SQLite. `portal_id` and foreign keys to existing tables follow today's names and types; check each against migration 0028 before applying. New migrations start at 0029.

## Architecture

The design adds one stored layer and two loops. Layer A stays the append-only record; Layer M, the portal model, is rebuilt from it plus decisions; Layer B documents Layer M.

&#91;embedded content: architecture · three layers, the reconciler and two loops\]

The planner loop turns hypotheses into probes for the crawler. The decision loop feeds confirmed labels and overturned facts back into the next reconcile as constraints.

| Layer | Holds | Written by | Rule |
| --- | --- | --- | --- |
| A · Evidence | runs, observations, transitions, journeys, builds, attribute writes, network calls, concrete states | crawler pipeline | append-only |
| M · Portal model | abstract states, lineage, action classes, model transitions, coverage, build epochs, parameter roles | reconciler | rebuildable from A plus decisions; ids stable |
| Interpretation | deviations, hypotheses and their tests, decision rules, process proposals | reconciler rules, BA agent, people | references evidence, never edits it |
| B · Documentation | doc records, amendments, process models, SRS export | the BA through its tools, people | anchored through entity refs |

## Layer A: what the crawler records

Five additions make every later step possible: builds, observations with step results, transitions with inputs, journeys, and fingerprint components. The pipeline writes them at capture time; existing rows are never updated.

### Pipeline changes

The page pipeline (`mcp-server/src/runtime/pipeline/`) keeps its nine steps. These change:

| Step | Change |
| --- | --- |
| 3 capture | Also record script and stylesheet responses (URL, frame, initiator), response headers named in the portal hook, and cookie and storage keys matching the portal's flag patterns. |
| 4 fingerprint | Compute fingerprint v2 and its components. States first seen before the switch keep v1. |
| 5 form step and state kind | Also set the step result. |
| 6 recordState | Writes the provisional screen as today. The authoritative assignment moves to the reconciler. |
| 7 observation | Write one `observations` row per visit, with builds and context key. |
| 8 extract actions | Compute an element key for every action. |
| 9 edge | Write a `transitions` row (observation → observation) with inputs and step result. Keep writing `edges` until phase 2 ends. |

### Build signatures

Each observation records the build of every scope on the page. Without it, drift cannot be told apart from persona or A/B differences.

1. Collect the script and stylesheet URLs loaded by the document and each frame.
2. Assign each asset to a scope. Assets requested by a micro-frontend mount (by frame, initiator or remote entry URL) belong to that scope; the rest belong to `shell`.
3. Keep assets whose file name or query carries a content hash: `[.\-_]([0-9a-f]{8,}|[A-Za-z0-9_-]{16,})\.(m?js|css)$`, or `?v=` and `?hash=` parameters.
4. Signature = sha256 of the sorted, unique asset paths of the scope.
5. If the portal hook names a version header, meta tag or version endpoint, its value replaces the signature.
6. No hashed assets and no marker: build `unknown`, and the portal is flagged. Drift then falls back to persistence (Risks).

Backend changes do not show in bundles. For each API response, record an endpoint schema: the hash of its JSON key paths and value types, values ignored.

```sql
-- 0029_builds.sql
CREATE TABLE builds (
  id          INTEGER PRIMARY KEY,
  portal_id   TEXT NOT NULL,
  scope       TEXT NOT NULL,           -- 'shell' or a micro-frontend name
  signature   TEXT NOT NULL,
  source      TEXT NOT NULL CHECK (source IN ('assets','marker','unknown')),
  assets_json TEXT NOT NULL,           -- asset paths the signature was built from
  UNIQUE (portal_id, scope, signature)
);

CREATE TABLE endpoint_schemas (
  id                INTEGER PRIMARY KEY,
  portal_id         TEXT NOT NULL,
  endpoint_template TEXT NOT NULL,     -- 'POST /api/quote/:id/price'
  schema_hash       TEXT NOT NULL,
  schema_json       TEXT NOT NULL,     -- key paths and types, no values
  UNIQUE (portal_id, endpoint_template, schema_hash)
);
```

### Fingerprint v2 and components

v2 changes two things in the identity hash; everything else stays as in v1.

- **Masking also covers accessible names**, so "Koszyk (3)" and "Koszyk (4)" hash alike.
- **Runs of two or more consecutive siblings with the same structural signature collapse** into one node marked repeated, and their text leaves the hash. Repeated rows are data. This targets the "duplication" near-duplicates, which no technique handled in the ICSE 2020 study.

Query strings stay out of state identity. Whether a parameter matters is decided in Layer M (Parameter roles).

Identity v2 = sha256(route template ‖ collapsed, masked tree ‖ overlays). The structural signature of a subtree = hash of its role and its children's signatures, names excluded, computed bottom-up.

```sql
-- 0030_state_components.sql
ALTER TABLE states ADD COLUMN fp_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE state_components (
  state_id       INTEGER PRIMARY KEY REFERENCES states(id),
  structure_hash TEXT NOT NULL,   -- roles only, names removed, repeats collapsed
  content_hash   TEXT NOT NULL,   -- masked names and text outside repeated runs
  overlay_hash   TEXT NOT NULL,
  calls_hash     TEXT NOT NULL,   -- sorted endpoint templates requested while settling
  mounts_hash    TEXT NOT NULL,   -- sorted micro-frontend scopes mounted
  minhash        BLOB NOT NULL,   -- 128 x uint32 over the SET of role-path shingles
  element_keys   TEXT NOT NULL    -- JSON array of every actionable element on the page
);
```

Components are written for new states and back-filled for old ones from stored ARIA snapshots. A v2 state may duplicate a v1 state of the same page; both land in one abstract state as clones.

### Element keys

Element key = `role | masked accessible name | container path | ordinal`.

- Name: masked as in v2, lower-cased, spaces collapsed.
- Container path: the nearest landmark role and its name, then the nearest heading above the element.
- Ordinal: position among elements with the same role and name in the same container, only when there is more than one.

Example: `button|oblicz składkę|main>form "Dane pojazdu"|`. Element keys match actions across runs and anchor amendments.

### Observations

```sql
-- 0031_observations.sql
CREATE TABLE observations (
  id            INTEGER PRIMARY KEY,
  run_id        INTEGER NOT NULL REFERENCES runs(id),
  journey_id    INTEGER NOT NULL REFERENCES journeys(id),
  seq           INTEGER NOT NULL,     -- order within the run
  state_id      INTEGER NOT NULL REFERENCES states(id),
  page_visit_id INTEGER REFERENCES page_visits(id),
  url           TEXT NOT NULL,        -- full URL, query string included
  result        TEXT NOT NULL CHECK (result IN
                  ('ok','validation','business_error','technical_error','timeout','blocked')),
  context_key   TEXT NOT NULL,        -- hash of build ids, audience, experiment arm
  flags_json    TEXT NOT NULL DEFAULT '{}',
  captured_at   TEXT NOT NULL,
  UNIQUE (run_id, seq)
);

CREATE TABLE observation_builds (
  observation_id INTEGER NOT NULL REFERENCES observations(id),
  build_id       INTEGER NOT NULL REFERENCES builds(id),
  PRIMARY KEY (observation_id, build_id)
);

CREATE TABLE observation_endpoint_schemas (
  observation_id     INTEGER NOT NULL REFERENCES observations(id),
  endpoint_schema_id INTEGER NOT NULL REFERENCES endpoint_schemas(id),
  PRIMARY KEY (observation_id, endpoint_schema_id)
);
```

`state_observations` stays as the per-run aggregate (run × state, page composition). Old runs are back-filled from `page_visits`, with build `unknown`.

Step results:

| Result | When |
| --- | --- |
| technical\_error | the browser's own error page, or HTTP ≥ 500 on the document or a blocking request |
| validation | today's validation signals |
| business\_error | the page matches an error template a person or the agent labelled as business, such as a refusal to insure |
| timeout | settle did not finish |
| blocked | the safety gate refused the action |
| ok | none of the above |

Audience = sha256 of the persona's attribute set and the environment. Experiment arm = the values of flags named in the portal hook, else empty.

### Journeys and transitions

A journey ends whenever the path is not continuous. A new journey starts on a fresh session, a navigation the crawler typed rather than clicked, a checkpoint replay, or a backtrack. A backtrack starts a child journey that inherits its parent's steps up to the branch point.

```sql
-- 0032_journeys_transitions.sql
CREATE TABLE journeys (
  id                INTEGER PRIMARY KEY,
  run_id            INTEGER NOT NULL REFERENCES runs(id),
  parent_journey_id INTEGER REFERENCES journeys(id),
  branch_seq        INTEGER,          -- parent's transition seq it branches after
  start_kind        TEXT NOT NULL CHECK (start_kind IN
                      ('entry_url','checkpoint','login','backtrack','resume')),
  checkpoint_id     INTEGER REFERENCES checkpoints(id),
  end_reason        TEXT CHECK (end_reason IN
                      ('outcome','backtrack','reset','logout','error','budget','run_end')),
  legacy_process_id INTEGER REFERENCES processes(id)  -- trace-run processes migrated here
);

CREATE TABLE transitions (
  id                  INTEGER PRIMARY KEY,
  run_id              INTEGER NOT NULL REFERENCES runs(id),
  journey_id          INTEGER NOT NULL REFERENCES journeys(id),
  seq                 INTEGER NOT NULL, -- position within the journey
  from_observation_id INTEGER NOT NULL REFERENCES observations(id),
  to_observation_id   INTEGER REFERENCES observations(id),  -- NULL if no new page
  action_id           INTEGER NOT NULL REFERENCES actions(id),
  element_key         TEXT NOT NULL,
  kind                TEXT NOT NULL CHECK (kind IN
                        ('click','fill','select','check','submit','navigate','back')),
  result              TEXT NOT NULL,    -- same values as observations.result
  replay_of_id        INTEGER REFERENCES transitions(id),
  legacy_edge_id      INTEGER REFERENCES edges(id),
  UNIQUE (journey_id, seq)
);

CREATE TABLE transition_network_calls (
  transition_id   INTEGER NOT NULL REFERENCES transitions(id),
  network_call_id INTEGER NOT NULL REFERENCES network_calls(id),
  PRIMARY KEY (transition_id, network_call_id)
);
```

Fills, selects and checks are transitions too, usually without a new page. That gives every typed value a position in the journey.

### Attribute writes

```sql
-- 0033_attribute_writes.sql
CREATE TABLE attribute_writes (
  id          INTEGER PRIMARY KEY,
  journey_id  INTEGER NOT NULL REFERENCES journeys(id),
  seq         INTEGER NOT NULL, -- 0 = journey start (persona); else the transition that made it known
  name        TEXT NOT NULL,    -- 'persona.segment', 'input.vehicle_value', 'shown.premium'
  source      TEXT NOT NULL CHECK (source IN ('persona','input','shown')),
  value_type  TEXT NOT NULL CHECK (value_type IN ('number','date','enum','bool','text','missing')),
  value_num   REAL,
  value_text  TEXT,
  element_key TEXT,             -- the field or label it came from
  UNIQUE (journey_id, seq, name)
);
```

- **Persona attributes** are written at seq 0 of each root journey.
- **Inputs:** each fill, select or check writes `input.<field>`, where field = the normalised label of its element key.
- **Shown values:** after each observation, label–value pairs on the page (definition lists, table header and cell, "label: value" text) write `shown.<label>` with the raw value. Fingerprints mask numbers; attribute writes keep them, because rules depend on them.
- **Snapshot** at transition n = for each name, the write with the largest seq below n, along the journey and its ancestors up to their branch points. A name with no write is missing, never a default.

Personas are synthetic, so raw values are stored. Real accounts would require hashing text values (Risks).

## Layer M: the portal model

The portal model is stored and rebuildable: the reconciler can recompute it from Layer A plus decisions at any time, and ids stay the same. It replaces the screen graph computed on every Map load.

### Abstract states: canonical clustering

Today's clustering uses an in-memory index per run and is deterministic only for a given insertion order. The reconciler's clustering depends only on the set of concrete states and the constraints.

For each portal:

1. **Partition by route key.** A concrete state's route key = its route template with identity parameters written out (Parameter roles). A state seen under several route keys takes the most frequent; ties go to the lexically smallest.
2. **Distance.** d(a, b) = 1 − estimated Jaccard similarity of the two MinHash signatures (structure shingles, repeats collapsed). Partitions over 500 states use LSH banding (32 bands × 4 rows, fixed seeds) for candidate pairs; other pairs count as distance 1.
3. **Must-link.** States joined by clone or near-duplicate labels, or by confirmed `same_as` hypotheses, are merged into super-nodes first.
4. **Average-linkage clustering.** Merge the closest pair of clusters while their distance ≤ 1 − τ and no cannot-link (a distinct label or a confirmed `different_from`) joins them. Ties break on the lexically smallest fingerprint in each cluster.
5. **Map clusters to stable ids** (next subsection).

A must-link group that contains a cannot-link pair is a label conflict. It goes to Review, and the group is kept apart until a person fixes the labels. Partitions hold the states of one route, so O(n² log n) per partition is affordable.

### Stable ids and lineage

New clusters are matched to existing abstract states by shared members, so ids survive re-clustering.

1. For each new cluster C and existing abstract state S: overlap = number of concrete states in both.
2. Assign greedily by largest overlap. Ties prefer the abstract state with more anchored doc records, then the lower id. Each side is used once.
3. An unassigned cluster becomes a new abstract state.
4. An abstract state left without a cluster gets `merge` lineage into the abstract state that took most of its members, or `retire` if it has none.
5. When one abstract state's members end up in several clusters, it keeps the largest; the others get `split` lineage rows.
6. Only membership changes are written; unchanged rows keep their `from_model_version`.

```sql
-- 0034_model.sql
CREATE TABLE model_versions (
  id                    INTEGER PRIMARY KEY,
  portal_id             TEXT NOT NULL,
  built_at              TEXT NOT NULL,
  algorithm             TEXT NOT NULL,  -- e.g. 'saf-minhash-avglink-v1'
  threshold             REAL NOT NULL,  -- τ used
  observation_watermark INTEGER NOT NULL,  -- max observations.id included
  decision_watermark    INTEGER NOT NULL,  -- max hypothesis_events.id included
  stats_json            TEXT NOT NULL
);

ALTER TABLE screens ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active','merged','retired'));
ALTER TABLE screens ADD COLUMN route_key TEXT;

CREATE TABLE screen_members (
  screen_id          INTEGER NOT NULL REFERENCES screens(id),
  state_id           INTEGER NOT NULL REFERENCES states(id),
  ordinal            INTEGER NOT NULL,  -- r1, r2… by first sighting; display only
  assigned_by        TEXT NOT NULL CHECK (assigned_by IN ('saf','constraint')),
  from_model_version INTEGER NOT NULL REFERENCES model_versions(id),
  to_model_version   INTEGER REFERENCES model_versions(id),  -- NULL = current
  PRIMARY KEY (screen_id, state_id, from_model_version)
);

CREATE TABLE screen_lineage (
  id               INTEGER PRIMARY KEY,
  model_version_id INTEGER NOT NULL REFERENCES model_versions(id),
  kind             TEXT NOT NULL CHECK (kind IN ('split','merge','retire','revive')),
  from_screen_id   INTEGER NOT NULL REFERENCES screens(id),
  to_screen_id     INTEGER REFERENCES screens(id),
  members_moved    INTEGER NOT NULL
);
```

`states.screen_id` and `screen_rev` keep the crawl-time provisional assignment. After phase 2 only the explorer reads them. F-01 from spec 038 still matters: it seeds the explorer's provisional index from `screen_members`.

### Threshold calibration

The ICSE 2020 study found that thresholds do not transfer between apps; app-specific thresholds improved model quality by 34% on average. τ becomes a per-portal setting learned from labels.

```sql
CREATE TABLE state_pair_labels (
  portal_id   TEXT NOT NULL,
  state_a     INTEGER NOT NULL REFERENCES states(id),
  state_b     INTEGER NOT NULL REFERENCES states(id),
  label       TEXT NOT NULL CHECK (label IN ('clone','near_duplicate','distinct')),
  nd_kind     TEXT CHECK (nd_kind IN ('cosmetic','dynamic_data','duplication')),
  labelled_by TEXT NOT NULL,
  labelled_at TEXT NOT NULL,
  reason      TEXT,
  CHECK (state_a < state_b),
  PRIMARY KEY (state_a, state_b)
);
```

- τ = 0.9 until the portal has 30 clone or near-duplicate labels and 30 distinct labels.
- Then τ = the similarity that maximises F1 of detecting distinct pairs on the labels, swept from 0.50 to 0.99 in steps of 0.01. The run also reports the paper's statistical threshold (median similarity of near-duplicate pairs) for comparison.
- The labelling queue shows the BA pairs within 0.05 of τ, closest first. Every label also becomes a must-link or cannot-link.
- Labels collected now are the training set for phase 6, a classifier over all components as in the tree-kernel study.

### Parameter roles

Route templates fold a path segment into `/:param` after 10 distinct values, and query strings never count. That merges six numbered sections today and hides `action=edit` versus `view` (R-50). In the model, each path or query parameter of a route template has a role.

- **Identity:** at least two values each have two or more observations, and their sets of structure hashes do not overlap.
- **Data:** values vary but structure does not.
- **Ignored:** only one value seen.
- A person can override any role; the override is a confirmed hypothesis.

Route key = route template with identity parameters written out, e.g. `/sekcja/3` or `/polisa/:param?action=edit`.

```sql
CREATE TABLE parameter_roles (
  portal_id      TEXT NOT NULL,
  route_template TEXT NOT NULL,
  param          TEXT NOT NULL,   -- 'path:2' or 'query:action'
  role           TEXT NOT NULL CHECK (role IN ('identity','data','ignored')),
  decided_by     TEXT NOT NULL CHECK (decided_by IN ('reconciler','person')),
  PRIMARY KEY (portal_id, route_template, param)
);
```

### Model transitions and action classes

Each Layer A transition maps to one model transition: from abstract state, action class, to abstract state, step result.

```sql
CREATE TABLE action_classes (
  id          INTEGER PRIMARY KEY,
  screen_id   INTEGER NOT NULL REFERENCES screens(id),
  element_key TEXT NOT NULL,
  kind        TEXT NOT NULL,
  is_global   INTEGER NOT NULL DEFAULT 0,  -- banner/navigation/contentinfo on ≥ 60% of screens
  UNIQUE (screen_id, element_key, kind)
);

CREATE TABLE model_transitions (
  id                       INTEGER PRIMARY KEY,
  from_screen_id           INTEGER NOT NULL REFERENCES screens(id),
  action_class_id          INTEGER NOT NULL REFERENCES action_classes(id),
  to_screen_id             INTEGER REFERENCES screens(id),  -- NULL when no page resulted
  result                   TEXT NOT NULL,
  internal                 INTEGER NOT NULL,                -- from = to
  support                  INTEGER NOT NULL,
  first_seen_transition_id INTEGER NOT NULL REFERENCES transitions(id),
  last_seen_transition_id  INTEGER NOT NULL REFERENCES transitions(id),
  guard_hypothesis_id      INTEGER REFERENCES hypotheses(id),
  status                   TEXT NOT NULL CHECK (status IN
                             ('active','not_seen_since','untested','retired')),
  status_model_version     INTEGER NOT NULL REFERENCES model_versions(id)
);
CREATE UNIQUE INDEX model_transitions_key ON model_transitions
  (from_screen_id, action_class_id, IFNULL(to_screen_id, 0), result);
```

- Rows are upserted by that key, so ids survive rebuilds. (The index uses `IFNULL` because SQLite treats NULLs as distinct in a plain UNIQUE.)
- Today's 1,526 edge rows collapse to one model transition per key. The 177 self-loops become internal transitions (dialogs, validation, fills), shown in the screen's deck, not on the Map.
- A moved link (same from and to screens, new element key) gives two action classes under one screen pair. When the old one turns absent and the new one appears in the same build epoch, rule R6 records `replaces`.
- Scans ▸ Map reads the non-internal model transitions of the current model version. Filtering to one run still uses Layer A transitions.
- 60% for global navigation is a starting value, tuned per portal.

### Coverage and status

Absence is judged from what each observation shows, not from what the crawler clicked. Each concrete state lists every element key on its page (`state_components.element_keys`), so every observation checks every action class of its abstract state.

```sql
CREATE TABLE action_coverage (
  action_class_id             INTEGER NOT NULL REFERENCES action_classes(id),
  audience_key                TEXT NOT NULL,
  last_present_observation_id INTEGER REFERENCES observations(id),
  last_absent_observation_id  INTEGER REFERENCES observations(id),
  absent_run_streak           INTEGER NOT NULL DEFAULT 0,  -- consecutive runs that looked and missed it
  last_executed_transition_id INTEGER REFERENCES transitions(id),
  PRIMARY KEY (action_class_id, audience_key)
);
```

Per run, audience and observed abstract state: present in any observation → streak 0; absent in all → streak + 1, at most once per run.

| Status | Condition |
| --- | --- |
| active | present or executed in the current build epoch, for some audience |
| not\_seen\_since | absent in ≥ 2 consecutive runs of the current build epoch, for every audience where it was ever present |
| untested | its screen was not observed in the current build epoch for an audience where it was present |
| retired | a confirmed `removed` hypothesis |

Two runs follows C2D2: a change counts only when it persists. "Seen at least once" was also the measure that worked best there. Frequency is ignored on purpose, because it reflects the crawler's choices, not the portal.

A model transition's status follows its action class. An action still present but now leading elsewhere is a `target_mismatch` deviation instead.

### Build epochs

```sql
CREATE TABLE build_epochs (
  id                   INTEGER PRIMARY KEY,
  portal_id            TEXT NOT NULL,
  scope                TEXT NOT NULL,
  environment          TEXT NOT NULL,
  build_id             INTEGER NOT NULL REFERENCES builds(id),
  first_observation_id INTEGER NOT NULL REFERENCES observations(id),
  last_observation_id  INTEGER NOT NULL REFERENCES observations(id),
  overlaps_previous    INTEGER NOT NULL DEFAULT 0  -- old and new builds served in one window
);
```

- Per scope and environment, observations are ordered by capture time. A new epoch starts when a new signature appears in two consecutive observations of that scope.
- If old and new builds alternate (canary releases, CDN caches), the epochs are marked as overlapping: gradual drift in the literature's terms.
- A screen's current epoch = the latest epochs of the scopes mounted on its members.

## The reconciler job

The reconciler is deterministic code: the same Layer A and decisions give the same model, whatever order runs happened in. It runs after every run and on demand.

It lives in the store package (TypeScript, next to `portal-data.ts`), so the orchestrator and the dashboard call the same code. Decision mining runs as a separate Python worker because it needs scikit-learn.

Steps, in one SQLite transaction per portal:

1. Load observations and transitions above the last watermark.
2. Compute `state_components` for new concrete states.
3. Update builds and build epochs.
4. Update parameter roles; recompute route keys of affected states.
5. Re-cluster the route partitions that gained states or labels; map clusters to stable ids; write membership changes and lineage.
6. Map new transitions to action classes and model transitions; update coverage and statuses.
7. Check each new journey against the previous model version and write deviations.
8. Apply rules R1–R8: write derived hypotheses and request replays.
9. Re-evaluate hypotheses whose tests have finished.
10. Write the `model_versions` row.

Guarantees, each with an eval gate (Evals to add):

- **Idempotent:** a second run with no new data writes nothing.
- **Order-independent:** reconciling the same states in shuffled order gives identical membership and ids.
- **Rebuildable:** a full rebuild recomputes clusters and model transitions but keeps the id registry (`screens`, `action_classes`, the `model_transitions` key), so ids do not change.

Re-clustering touches only partitions that changed. A full rebuild costs O(n²) per route partition and runs offline.

## Deviations and classification rules

A deviation is any place where a new run does not fit the previous model version; this is conformance checking. Code explains most deviations; the rest become hypotheses for the agent.

### Detecting deviations

The reconciler walks each new journey's transitions against the previous model version.

| Kind | When |
| --- | --- |
| new\_screen | the target is an abstract state created in this version |
| new\_member | a new concrete state joined an existing abstract state |
| new\_action | the action class did not exist before |
| missing\_action | an action class reached absent\_run\_streak = 2 |
| target\_mismatch | a known action class led to an abstract state it never led to before |
| result\_mismatch | a known transition gave a different step result (ok versus error) |
| rule\_mismatch | a rule's boundary test returned a target the rule does not predict |

Each deviation stores a reference observation: the most recent observation of the same abstract state or action class, same audience first, then the previous build epoch. It also stores the changed components and the context difference. To attribute a structural change to a scope, the reconciler diffs the element keys of the two concrete states and looks up the mount containing the added and removed ones.

```sql
CREATE TABLE deviations (
  id                       INTEGER PRIMARY KEY,
  portal_id                TEXT NOT NULL,
  model_version_id         INTEGER NOT NULL REFERENCES model_versions(id),
  kind                     TEXT NOT NULL CHECK (kind IN ('new_screen','new_member','new_action',
                             'missing_action','target_mismatch','result_mismatch','rule_mismatch')),
  subject_key              TEXT NOT NULL,  -- dedup key, e.g. 'new_member:SC-12:4411'
  observation_id           INTEGER REFERENCES observations(id),
  transition_id            INTEGER REFERENCES transitions(id),
  reference_observation_id INTEGER REFERENCES observations(id),
  screen_id                INTEGER REFERENCES screens(id),
  action_class_id          INTEGER REFERENCES action_classes(id),
  changed_components       TEXT NOT NULL,  -- '["structure","calls"]'
  context_diff             TEXT NOT NULL,  -- build, audience, inputs and flags that differ
  status                   TEXT NOT NULL CHECK (status IN ('open','waiting_test','explained')),
  UNIQUE (portal_id, kind, subject_key)
);
```

The same deviation in later journeys attaches as evidence to the first row; it never creates a new one.

### Rules R1–R8

Rules run in order; the first that decides ends the chain. "Replay" = a probe that re-runs the journey prefix with the same persona and inputs in a fresh session.

| Rule | Applies to | Check | Writes |
| --- | --- | --- | --- |
| R1 errors | result technical\_error or timeout | replay twice | all fail → `deterministic_error`, a person decides business rule or defect; any succeeds → `flaky`, derived |
| R2 drift | any deviation | the build of the scope owning the changed region differs from the reference | `structural_drift`, derived, with the epoch boundary |
| R3 backend | result or target change with equal frontend builds | an endpoint schema on the transition changed | `backend_drift`, needs a person |
| R4 context | audience or inputs differ, same builds | replay with the reference context and with this one | each reproduces its own result → `context_variant`, derived; the differing attributes go to decision mining |
| R5 randomness | same builds, audience and inputs, or R4 did not reproduce | replay three times | results alternate and one flag separates them → `ab_test`, needs a person; otherwise `nondeterministic` for the agent |
| R6 absence | missing\_action | did the owning scope's build change; is the element present for another audience; did a new action connect the same screens in this epoch? | build changed → `removed`, derived; other audience → `context_variant`, derived; new action → `replaces`, derived; none → `removed`, needs a person |
| R7 targets | target\_mismatch | same epoch and audience? | yes → decision point candidate for mining; no → handled by R2 |
| R8 rules | rule\_mismatch | replay reproduces it | `decision_drift`, derived; the rule is re-mined on the new epoch's data |

A deviation no rule decides becomes `ambiguous` in the agent's queue. The agent writes a hypothesis for it, with a test.

Replays have a budget per run (default 20), spent in planner priority order.

## Hypotheses

Every testable claim about the portal is a hypothesis in one table. It replaces `reconciliations` and `rule_candidates`, and gives every merge a recorded reason.

```sql
-- 0035_hypotheses.sql
CREATE TABLE hypotheses (
  id               INTEGER PRIMARY KEY,
  key              TEXT NOT NULL UNIQUE,   -- H-0001
  portal_id        TEXT NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN (
                     'same_as','different_from',
                     'structural_drift','backend_drift','decision_drift',
                     'context_variant','ab_test','flaky','nondeterministic','deterministic_error',
                     'removed','replaces','coverage_gap',
                     'decision_rule','process_boundary','correlation_id','ambiguous')),
  claim            TEXT NOT NULL,          -- one sentence a BA can read
  claim_json       TEXT NOT NULL,          -- structured claim: pair, epoch boundary, DMN table…
  status           TEXT NOT NULL CHECK (status IN
                     ('proposed','testing','supported','refuted','confirmed','rejected','superseded')),
  origin           TEXT NOT NULL CHECK (origin IN ('rule','agent','person')),
  rule             TEXT,                   -- 'R2' when origin = 'rule'
  confidence       TEXT NOT NULL CHECK (confidence IN ('observed','inferred','needs_confirmation')),
  fitness          REAL,
  precision        REAL,
  support          INTEGER,
  counterexamples  INTEGER,
  deviation_id     INTEGER REFERENCES deviations(id),
  superseded_by    INTEGER REFERENCES hypotheses(id),
  model_version_id INTEGER NOT NULL REFERENCES model_versions(id),
  created_at       TEXT NOT NULL
);

CREATE TABLE hypothesis_evidence (
  hypothesis_id INTEGER NOT NULL REFERENCES hypotheses(id),
  ref_id        INTEGER NOT NULL REFERENCES entity_refs(id),
  role          TEXT NOT NULL CHECK (role IN ('supports','contradicts','context')),
  PRIMARY KEY (hypothesis_id, ref_id)
);

CREATE TABLE hypothesis_tests (
  id              INTEGER PRIMARY KEY,
  hypothesis_id   INTEGER NOT NULL REFERENCES hypotheses(id),
  probe_suite_id  INTEGER REFERENCES probe_suites(id),
  mark_id         INTEGER REFERENCES marks(id),
  refutes_if_json TEXT NOT NULL,   -- the observation that would refute the claim
  result_json     TEXT,
  verdict         TEXT CHECK (verdict IN ('pass','fail','inconclusive'))
);

CREATE TABLE hypothesis_events (
  id            INTEGER PRIMARY KEY,
  hypothesis_id INTEGER NOT NULL REFERENCES hypotheses(id),
  from_status   TEXT,
  to_status     TEXT NOT NULL,
  actor         TEXT NOT NULL,     -- 'reconciler', 'ba-agent' or a user id
  reason        TEXT NOT NULL,     -- required, so owner reasons are kept (issue 8)
  at            TEXT NOT NULL
);
```

`entity_refs` is defined in Documentation anchors; migration 0035 creates it first.

### Lifecycle

```text
proposed ──► testing ──► supported ──► confirmed ──► superseded
   │             │                                    (a newer claim replaces it,
   │             └──► refuted (kept forever)             e.g. a rule re-mined in a new epoch)
   └──► rejected (by a person, with a reason)
```

- Evidence is referenced, never copied or edited.
- Refuted hypotheses stay, so the agent does not propose them again. The agent's tool refuses a claim whose `claim_json` equals a refuted one.
- Several hypotheses may compete for one deviation until a test decides.
- An agent hypothesis needs at least one test with `refutes_if_json`. Exceptions: `same_as` and `different_from`, which a person's label decides, and `process_boundary`, which a person decides.

### Who confirms what

| Kind | Confirmed by | Why |
| --- | --- | --- |
| structural\_drift, flaky, context\_variant, removed after a build change, replaces, decision\_drift, coverage\_gap (closed by its visit) | reconciler, as a derived fact | Follows from evidence by a published rule; reversible in Review |
| same\_as, different\_from | a person's label | Defines identity and feeds clustering constraints |
| decision\_rule | a person, after its boundary tests pass | Becomes documentation and a guard |
| process\_boundary, correlation\_id | a person | Defines what is documented and cut out |
| ab\_test, backend\_drift, deterministic\_error, nondeterministic, removed within one build, ambiguous | a person | Needs interpretation |

A person can overturn any derived fact. The overturn is recorded with a reason, and later reconciles treat it as a constraint.

### Migration of today's tables

| Today | Becomes |
| --- | --- |
| reconciliations, owner-confirmed | hypotheses of the matching kind (same page → same\_as, persona variant → context\_variant, error page → deterministic\_error or flaky), status confirmed, origin person |
| reconciliations, unconfirmed | the same, status proposed |
| screens.merged\_into | a confirmed `same_as`, plus clone labels between the first members of the two screens |
| rule\_candidates | `decision_rule` hypotheses, status proposed, re-mined once attribute writes exist |
| open\_questions | stay, for questions to people that no probe can answer; gain a nullable `hypothesis_id` |
| decision\_log | stays for other owner decisions; hypothesis status changes go to `hypothesis_events` |
| marks | stay; gain `origin` (person or planner) and a nullable `hypothesis_id` |

## Decision mining

Decision rules are mined per decision point from attribute snapshots, written as DMN decision tables, and kept true by boundary tests. This is decision mining as framed by de Leoni and Mannhardt, with one advantage over mining passive logs: the crawler chooses its inputs.

### Decision points

A decision point is an action class whose executions, within one build epoch and environment, lead to two or more different (target abstract state, step result) pairs. Validation counts: a submit that sometimes yields validation and sometimes moves on is a decision point.

A user choosing between two buttons is not a decision point; those are two action classes. Only the system's response to the same action is mined.

### Observation table

One row per execution of the decision point in the epoch:

- **Target:** the (to abstract state, step result) pair.
- **Features:** the attribute snapshot just before the transition: persona, inputs and shown values, within the process instance and its journey ancestors.
- **Missing:** an attribute with no write is missing, never carried over from an earlier loop.
- **Derived:** every date attribute also gives its age in whole years and in days at capture time, since rules like "under 18" use them.
- **Dropped:** attributes constant across all rows, and text attributes with more than 20 distinct values (identifiers).

### Learning

The worker uses Python and scikit-learn 1.3 or newer, whose decision trees accept missing values.

1. Fit `DecisionTreeClassifier(criterion="entropy", max_depth=4, min_samples_leaf=max(2, ceil(0.02 * rows)), random_state=0)`.
2. Turn each root-to-leaf path into a rule and merge paths with the same target. Cap a rule at 7 conditions, the readability limit Mannhardt et al. used.
3. **Overlap step:** for each leaf, take the rows it misclassifies. If there are at least `min_samples_leaf` of them and one other target is more than half of them, fit a second tree on them and add its rules as alternatives.
4. **Score:** fitness = share of rows whose actual target the rules allow; precision = mean over rows of 1 / (number of targets the rules allow).
5. Mine only when every target has at least 5 rows. Otherwise write a `decision_rule` hypothesis marked "needs data", with input-variation probes as its tests.

An overlap is a signal: the same inputs led to different targets. The R4 and R5 replays tell why. The same branch every time means data the crawler cannot see, such as a credit check or the time of day. Alternating branches mean randomness or an A/B test.

### DMN output

Each rule is stored in `claim_json` as a decision table and exported as DMN 1.3 XML with the SRS (R-68). Illustrative example:

```json
{
  "decision_point": {"screen": "SC-12", "action": "button|oblicz składkę|main>form \"Dane kierowcy\"|"},
  "hit_policy": "U",
  "inputs": [
    {"name": "derived.driver_birth_date.age_years", "type": "number"},
    {"name": "persona.segment", "type": "enum"}
  ],
  "outputs": [{"name": "next", "type": "screen"}],
  "rules": [
    {"when": {"derived.driver_birth_date.age_years": "< 18"}, "then": "SC-40 exit-process-page"},
    {"when": {"derived.driver_birth_date.age_years": ">= 18", "persona.segment": "premium"}, "then": "SC-15 form, premium"},
    {"when": {"derived.driver_birth_date.age_years": ">= 18", "persona.segment": "standard"}, "then": "SC-14 form"}
  ],
  "fitness": 0.98, "precision": 1.0, "rows": 42
}
```

Hit policy U (unique) when rules do not overlap. C (collect) when they do, with a note that the portal chooses between the listed targets on data the crawler does not record.

### Boundary tests

When a decision rule is proposed, the worker generates its tests:

- **Numeric condition x < t:** inputs at t − δ, t and t + δ. δ is the attribute's smallest observed step: 1 for integers and currency units, 1 day for dates, 1 year for derived ages.
- **Categorical condition:** one test per value seen.
- **Other attributes** keep the values of a reference row that followed the rule's branch. The test replays that row's journey prefix with the changed inputs.
- **Refutation:** each test's `refutes_if_json` is any target the rule does not predict.

The tests form a probe suite for owner review, as today. Once they pass and the rule is confirmed, the suite is the rule's regression suite.

### Decision drift

A rule can change while every page looks the same: the exit age moves from 18 to 21 and no fingerprint changes. Passive detection is slow; in the 2023 decision-drift study a changed threshold was noticed about 500 cases later. So:

- When a new build epoch starts for a scope that renders the decision point, or an endpoint schema changes on its transitions, the planner reruns the rule's regression suite.
- Every confirmed rule's suite also runs on a schedule, weekly by default, because backend rule changes can ship without a frontend build.
- A failed test is a `rule_mismatch` deviation. R8 confirms `decision_drift`, supersedes the rule and re-mines on the new epoch's data.

Rules mined at different points can contradict each other, a limitation de Leoni and Mannhardt name. After mining, the worker intersects the per-attribute intervals of the guards along each path of a process. Paths whose guards cannot all hold become `ambiguous` hypotheses.

## Processes

A process is a trigger, member screens with their transitions, and outcomes; the navigation that reaches the trigger is not part of it. The three meanings of "process" become one model concept, its documentation and its evidence.

### Definition

| Part | Definition |
| --- | --- |
| Trigger | A model transition from a screen outside the process into its start screen, through a non-global action class. A process may have several (menu entry, banner). |
| Start screen | The target of a trigger. |
| Member screens | Screens reached from the start screen before an outcome, through non-global transitions. |
| Outcomes | Where an instance ends: completed (confirmation), exited (exit page), error (business\_error result), abandoned (left through global navigation). |
| Entry path | How a journey reached the trigger. Kept on process instances, never documented as steps. |
| Preconditions | What must hold to reach the trigger, such as being logged in as a role. Login is its own process and a precondition of those behind it. |

Leaving through global navigation ends an instance as abandoned. This stops the home page from becoming step 1 (R-77) and keeps processes behind the login wall visible as their own processes.

### Boundary signals

Four signals show which screens belong together:

1. **Correlation ids.** Within a journey, a value that first appears in a response body and later appears in a request URL or body. Candidates: keys ending in id, number or uuid, or strings of 8 or more high-entropy characters. Screens between its first and last use belong to one instance. Values are stored hashed.
2. **Mounts.** Screens rendered by the same micro-frontend scope.
3. **Endpoint families.** Endpoint templates grouped by path prefix up to the first parameter, such as `/api/quote/*`.
4. **Form steps.** Today's form step chains.

```sql
-- 0036_processes.sql
CREATE TABLE correlation_ids (
  id                  INTEGER PRIMARY KEY,
  journey_id          INTEGER NOT NULL REFERENCES journeys(id),
  key_path            TEXT NOT NULL,   -- 'response:$.quote.id'
  value_hash          TEXT NOT NULL,
  endpoint_family     TEXT NOT NULL,
  first_transition_id INTEGER NOT NULL REFERENCES transitions(id),
  last_transition_id  INTEGER NOT NULL REFERENCES transitions(id)
);
```

### Proposals

The reconciler scores every pair of non-global screens that share a transition or a signal:

w(a, b) = 3 × shared correlation id + 2 × Jaccard(scopes) + 2 × Jaccard(endpoint families) + 1 × same form + 1 × direct non-global transition

The weights are starting values, tuned with the grouping eval from spec 038. Leiden community detection with a fixed seed (0) and resolution 1.0 splits the weighted graph into candidate processes. For each community the reconciler derives triggers, start screen and outcomes by the definitions above.

The BA agent names each candidate, writes the reason and saves it as a process proposal directly (grouping\_suggestions, under C1). A person accepts it into `ba_processes` or rejects it with a reason. Grouping no longer waits for a request (R-78).

Each proposal carries a hint for the cut: its scopes and endpoint families. Where the micro-frontend boundary and the service boundary disagree, the proposal says so; the two are decided separately.

### Process instances

```sql
CREATE TABLE process_instances (
  id                    INTEGER PRIMARY KEY,
  process_id            INTEGER NOT NULL REFERENCES ba_processes(id),
  journey_id            INTEGER NOT NULL REFERENCES journeys(id),
  trigger_transition_id INTEGER NOT NULL REFERENCES transitions(id),
  last_transition_id    INTEGER NOT NULL REFERENCES transitions(id),
  outcome               TEXT NOT NULL CHECK (outcome IN
                          ('completed','exited','error','abandoned','incomplete')),
  outcome_screen_id     INTEGER REFERENCES screens(id),
  correlation_id        INTEGER REFERENCES correlation_ids(id),
  model_version_id      INTEGER NOT NULL REFERENCES model_versions(id)
);
```

Process instances are the cases decision mining uses. Trace variants, the distinct screen sequences, are computed from them on read.

### One concept instead of three

| Today | Becomes | Layer |
| --- | --- | --- |
| processes and process\_steps, one per trace run | journeys and transitions; old tables read-only, linked by `legacy_process_id` | A |
| ba\_processes (PRC-nnn) | the process | M |
| doc\_records PROC-nnn | its process documentation, exactly one per process | B |
| process\_variants (as-is, to-be) | process\_models | B |

One PROC record per process, enforced in SQLite:

```sql
ALTER TABLE doc_records ADD COLUMN process_id INTEGER REFERENCES ba_processes(id);
CREATE UNIQUE INDEX doc_records_one_proc ON doc_records(process_id) WHERE kind = 'PROC';
CREATE TRIGGER doc_records_proc_needs_process BEFORE INSERT ON doc_records
  WHEN NEW.kind = 'PROC' AND NEW.process_id IS NULL
  BEGIN SELECT RAISE(ABORT, 'PROC record needs process_id'); END;

ALTER TABLE process_variants RENAME TO process_models;
CREATE VIEW process_variants AS SELECT * FROM process_models;  -- removed after one release
```

The same check runs as a `BEFORE UPDATE` trigger. Existing PROC records are linked to their PRC by the migration; any that cannot be matched are listed for a person.

## The query loop

After each reconcile, a planner turns what the model does not yet know into probe requests: the query loop of active automata learning. It also defines when a process counts as explored.

### Planner priorities

| Priority | Source | Probe |
| --- | --- | --- |
| 1 | a build epoch changed for a scope with confirmed rules | those rules' regression suites |
| 2 | rules R1, R4 and R5 | replays |
| 3 | hypotheses in `testing` | their tests |
| 4 | model transitions `untested` in the current epoch, on screens with anchored docs | coverage visits |
| 5 | decision points with fewer than 5 rows per target | input-variation probes |
| 6 | processes not yet explored in the current epoch | counterexample search |

Within a priority, items with more anchored doc records go first. The planner writes `marks` with origin `planner`, and focused and probe runs consume them as today. The probe budget per run is set in the portal config.

To keep probes cheap, they start from checkpoints instead of the entry page, and replays reuse logged-in sessions where the persona allows. Identical prefixes run once per run and are cached.

### Stopping rule

A black box can never be proven complete, so "explored" always carries its bound. For a process in the current build epoch, the counterexample search is:

1. **Depth 1:** every action class of every member screen executed at least once per audience in scope.
2. **Depth 2:** every pair of consecutive action classes (a, then b on a's target) executed once.
3. **Random walks:** 50 walks of up to 15 steps inside the process, with inputs sampled from observed values.

The process is explored when a full pass finds no new deviation. Its documentation states the bound, for example: "Explored to depth 2 plus 50 random walks on builds shell 3e1a and quote-mfe 9c21; no counterexamples."

```sql
CREATE TABLE process_explorations (
  id             INTEGER PRIMARY KEY,
  process_id     INTEGER NOT NULL REFERENCES ba_processes(id),
  epoch_set      TEXT NOT NULL,     -- sorted build_epoch ids in force
  depth          INTEGER NOT NULL,
  random_walks   INTEGER NOT NULL,
  new_deviations INTEGER NOT NULL,
  completed_at   TEXT NOT NULL
);
```

Depth-2 pairs are a practical stand-in for conformance-testing methods such as W and Wp, which LearnLib uses to approximate equivalence queries. The documentation must state the bound; the method can change.

## Documentation anchors and references

Docs and amendments anchor to abstract states and element keys, through typed references with real foreign keys. A new member of a screen no longer pushes amendments into needs\_reanchor.

```sql
-- created in 0035, before hypotheses
CREATE TABLE entity_refs (
  id                  INTEGER PRIMARY KEY,
  observation_id      INTEGER REFERENCES observations(id),
  transition_id       INTEGER REFERENCES transitions(id),
  state_id            INTEGER REFERENCES states(id),
  screen_id           INTEGER REFERENCES screens(id),
  action_class_id     INTEGER REFERENCES action_classes(id),
  model_transition_id INTEGER REFERENCES model_transitions(id),
  process_id          INTEGER REFERENCES ba_processes(id),
  hypothesis_id       INTEGER REFERENCES hypotheses(id),
  network_call_id     INTEGER REFERENCES network_calls(id),
  element_key         TEXT,
  CHECK ((observation_id IS NOT NULL) + (transition_id IS NOT NULL) + (state_id IS NOT NULL)
       + (screen_id IS NOT NULL) + (action_class_id IS NOT NULL)
       + (model_transition_id IS NOT NULL) + (process_id IS NOT NULL)
       + (hypothesis_id IS NOT NULL) + (network_call_id IS NOT NULL) = 1),
  CHECK (element_key IS NULL OR screen_id IS NOT NULL)
);
```

`hypothesis_id` points at a table created later in the same migration; SQLite checks foreign keys on write, not on creation.

- **Switch-over (migration 0037, phase 5):** `doc_evidence_links.target`, `amendments.target_id` and `about_ref` become `ref_id REFERENCES entity_refs(id)`. The migration maps each existing (type, id) pair to a ref row and lists those it cannot resolve.
- **Anchors:** an amendment anchor is a ref with `screen_id` and `element_key`.
- **Review triggers:** an anchor needs review only when its screen is merged, split or retired (the lineage row is the reason), or its element key is `not_seen_since` in the current epoch for every audience.
- **Confidence:** a doc claim labelled observed links to observations or transitions; inferred links to a confirmed hypothesis; needs confirmation links to an unconfirmed one.

## Constitution amendment

The constitution needs one addition, alongside C1 from R-78. Without it, every deployment's drift needs a click, and Review fills with facts nobody disputes.

Proposed text:

> **Derived facts.** The reconciler may record facts that follow from evidence by a published rule (R1–R8, and clustering under person-made labels) without a person's approval. Each derived fact names its rule and its evidence, appears in Review, and can be overturned by a person. An overturn is recorded with a reason and binds later reconciles. Everything else, including any agent hypothesis, grouping, rule wording or merge, stays a proposal until a person confirms it. Agents may save proposals directly.

The list of rules that may write derived facts is part of the constitution. Adding a rule is an amendment, not a code change.

## Phases and acceptance gates

Six phases, each ending in a gate that must pass on the reference-insurer eval and on a replay of the sandbox store. Phase 1 is worth doing first and alone: evidence not captured now cannot be recovered later.

| Phase | Builds | Migrations | Gate |
| --- | --- | --- | --- |
| 1 Capture | build signatures, endpoint schemas, fingerprint v2 and components, element keys, observations, journeys, transitions, attribute writes, step results, flags; merge F-01 from spec 038 | 0029–0033 | every new observation has a build or a flagged `unknown`; every journey rebuilds its ordered transitions; every fill has an attribute write; states per screen on sandbox reported before and after v2 |
| 2 Model | reconciler steps 1–6 and 10, canonical clustering, stable ids, lineage, parameter roles, labels and τ calibration, model transitions, coverage, build epochs; Map reads the model | 0034 | order-independence, idempotence and rebuild gates pass; each of the 25 sandbox routes with several screens is merged or justified by a distinct label or an identity parameter |
| 3 Interpretation | deviations, rules R1–R8, hypotheses, planner priorities 2–4, migration of reconciliations and rule\_candidates, constitution amendment | 0035 | the classification scenarios in Evals to add all produce the expected hypothesis |
| 4 Rules | decision mining worker, DMN export, boundary tests, regression on build change and on schedule, planner priorities 1 and 5 | none | injected rules recovered exactly; an injected threshold change after a deployment caught within one run |
| 5 Processes | correlation ids, boundary scoring, proposals, process instances, one process concept, entity\_refs switch-over, anchors, process explorations, planner priority 6 | 0036–0037 | grouping eval (spec 038) at or above baseline; PROC to PRC 1:1 enforced; needs\_reanchor rate on sandbox amendments reported before and after |
| 6 Classifier | similarity classifier over fingerprint components replacing the single τ | none | distinct-pair F1 above the calibrated threshold's on held-out labels |

Migrations 0031 and 0032 ship in one release, since observations and journeys reference each other. `edges` keeps being written until phase 2 passes, then becomes read-only.

## Evals to add

The reference-insurer portal gets a scenario switchboard: config flags that each inject one known change, so every rule has ground truth.

| Scenario | Injection | Expected |
| --- | --- | --- |
| Deployment | new bundle hash plus one added form field | `structural_drift`, derived, epoch boundary at the switch |
| Persona variant | a button shown only to segment premium | `context_variant`; a decision rule on `persona.segment` |
| A/B test | banner text for 50% of sessions, by cookie | `ab_test` naming the cookie |
| Flaky page | HTTP 500 on 20% of loads of one page | `flaky`, derived |
| Deterministic error | HTTP 500 for one input value | `deterministic_error`, waiting for a person |
| Moved link | a link moves from the body into the menu | `replaces`, derived; one screen pair, not two lines on the Map |
| Renamed button | label changes, position stays | `replaces` |
| Removed link | a link removed with a deployment | `removed`, derived; status retired |
| Not visited | a screen the run is told to skip | `untested`, never removed |
| Threshold rule | exit page when age < 18 | rule with t = 18; boundary tests at 17, 18 and 19 |
| Overlapping rule | 30% of standard customers sent to a manual-review page at random | hit policy C, plus a `nondeterministic` hypothesis |
| Rule drift | threshold moves to 21 with a deployment | `rule_mismatch`, then `decision_drift` within one run |
| Repeated rows | "add another driver" adds rows | one abstract state; no new members once rows collapse |
| Numbered sections | `/sekcja/1` to `/sekcja/6` with different forms | the path parameter becomes identity; six abstract states |

Three gates on the reconciler itself:

- **Order independence:** shuffle the insertion order of states 10 times; membership and ids are identical.
- **Idempotence:** reconcile twice; the second pass writes nothing.
- **Rebuild:** drop and rebuild the model tables except the id registry; ids are identical.

## How the 12 issues are resolved

Each of today's issues maps to one part of this design.

| # | Issue | Resolved by |
| --- | --- | --- |
| 1 | Cluster ids not stable across scans | Canonical clustering in the reconciler; stable ids by member overlap |
| 2 | Whole-tree hash; revisions don't say why | v2 name masking and repeated-row collapse; fingerprint components; deviations with a context diff; rules R1–R8 |
| 3 | Route identity too coarse | Parameter roles for path and query parameters |
| 4 | Edges never reconciled; absence unclear | Action classes, model transitions, coverage and statuses |
| 5 | Screen graph not stored | Model transitions stored per model version; `replaces` and `removed` hypotheses |
| 6 | Three meanings of process | Journey (A), process (M), process documentation (B), 1:1 enforced |
| 7 | Process start and end undefined | Trigger, outcomes, entry path, global navigation |
| 8 | Grouping only on request; reasons lost | Proposals after every reconcile; `hypothesis_events` require a reason |
| 9 | Reconciliation only per node | Deviations and hypotheses cover screens, actions, transitions, rules and processes |
| 10 | Polymorphic references; fragile anchors | `entity_refs` with foreign keys; anchors on screen plus element key |
| 11 | Identity depends on visit order | Average-linkage clustering with deterministic ties; the order-independence gate |
| 12 | Much evidence per state, little meaning per edge | Transitions carry inputs, results, calls and builds; model transitions carry support, status and guards |

## Risks and open questions

The largest risk is a portal that exposes no build marker; the rest are bounded.

- **No build marker.** Some portals serve unhashed bundles. Epochs then come from persistence alone: a structural change counts as drift when it holds for one audience over two runs and the old form does not return, as in C2D2. Drift detection there is slower and less certain.
- **Independent deployments.** Micro-frontends deploy separately, and a shared library can change several scopes at once. Epochs are per scope for this reason; a cross-scope change yields several drift facts with one boundary.
- **Backend-only changes.** Invisible in bundles. Endpoint schemas and the weekly rule regression catch part of them, not all.
- **Chosen inputs.** The crawler's inputs are not representative of real users. Rules describe portal logic correctly, but branch frequencies mean nothing and are never documented.
- **Hidden data.** Decisions on data the crawler cannot see (credit checks, internal scores) appear as overlapping rules. The documentation says "decided on data not visible from the UI" and does not guess.
- **Starting values.** Process-boundary weights, the 60% global-navigation share, depth 2 and 50 random walks are guesses, tuned with the evals.
- **Personal data.** Personas are synthetic, so raw attribute values are stored; correlation ids are hashed. If a client portal ever requires real accounts, text attribute writes must be hashed and a retention period set.
- **Volume.** `attribute_writes` grows with every fill; model tables stay small. The 1.2 GB of Playwright traces needs its own retention policy, separate from this design.
- **Open question:** should τ labels be shared across portals built on the same frontend platform, or stay per portal? The ICSE 2020 results argue for per portal.

## References

Papers read in full for this design, with what each contributes:

1. Yandrapally, Stocco, Mesbah. [Near-Duplicate Detection in Web App Model Inference](https://people.ece.ubc.ca/astocco/pubs/2020-Yandrapally-ICSE2020.pdf). ICSE 2020. Clone, near-duplicate and distinct; per-app thresholds; repeated-row duplicates.
2. Corazza, Di Martino, Peron, Starace. [Using Tree Kernels to Detect Near-duplicate States in Automated Model Inference](https://www.arxiv.org/pdf/2108.13322). ESEM 2021. A classifier over several similarity scores.
3. de Leoni, Mannhardt. [Decision Discovery in Business Processes](https://www.math.unipd.it/~deleoni/documenti/dL_M@ChapterDM%20-%20PrePrint.pdf). Decision mining as classification, missing values, DMN, conflicting rules.
4. Mannhardt, de Leoni, Reijers, van der Aalst. [Decision Mining Revisited: Discovering Overlapping Rules](https://www.vdaalst.com/publications/p863.pdf). CAiSE 2016. Overlapping rules, fitness and precision, the 7-condition cap.
5. Gallego-Fontenla, Vidal, Lama. [A Conformance Checking-based Approach for Drift Detection in Business Processes](https://arxiv.org/pdf/1907.04276). C2D2: fitness and precision for drift, persistence, frequency-free measures.
6. Scheibel, Rinderle-Ma. [Online Decision Mining and Decision Drift Analysis](https://www.arxiv.org/pdf/2303.03961). 2023. Four kinds of decision drift; slow passive detection.
7. Isberner, Howar, Steffen. [The Open-Source LearnLib](https://static.aminer.org/pdf/20170130/pdfs/cav/uwtpirezu6lsbq5fxjra1doseck3n8y4.pdf). CAV 2015. Queries, counterexample search, mappers, caches.

To read next: Steffen, Howar, Merten, *Introduction to Active Automata Learning from a Practical Perspective* (SFM 2011), on learning when the system is nondeterministic. Rules are exported in OMG's DMN decision-table format.
