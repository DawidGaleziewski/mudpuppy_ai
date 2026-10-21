# MudPuppy 2.0 design: the reconciled portal model

Spec 039 · R-81 · 2026-10-18. Adapted from the owner's `user_input/system_design/Design.md` (the
source) to the codebase. The source keeps the literature background and the reasoning; this file
is what gets built. Where the two differ, this file wins, and § Changes from the source says why.

## 1. Summary

MudPuppy 2.0 adds a stored, rebuildable **portal model** (Layer M) between the raw evidence
(Layer A) and the BA's documentation (Layer B). A deterministic **reconciler** rebuilds it after
every run. Every difference between a run and the model is a **deviation**; rules R1–R8 explain
most of them as **derived facts**, the rest become **hypotheses** with tests that could refute
them. **Decision rules** are mined from recorded inputs, written as DMN tables and kept true by
boundary tests. **Process** becomes one concept with a trigger, member screens and outcomes. A
**planner** turns what the model does not know into deterministic probes. v2 starts from an empty
store.

```text
           crawler (LLM agent)            headless driver (no LLM)
                 │  map / trace runs            │  replays, boundary tests, walks
                 ▼                              ▼
  ┌──────────────────────────────────────────────────────────┐
  │ Layer A · evidence (append-only)                          │
  │ runs · observations · journeys · transitions · states     │
  │ builds · attribute_writes · network_calls · evidence files│
  └──────────────────────────────────────────────────────────┘
                 │ reconciler (@pathfinder/model, deterministic)
                 ▼
  ┌──────────────────────────────────────────────────────────┐
  │ Layer M · portal model (rebuildable, stable ids)          │
  │ model_versions · screens + members + lineage · action     │
  │ classes · model transitions · coverage · build epochs ·   │
  │ parameter roles                                           │
  ├──────────────────────────────────────────────────────────┤
  │ Interpretation: deviations · hypotheses (+tests, events)  │
  │ decision rules · process proposals · process instances    │
  └──────────────────────────────────────────────────────────┘
        │  planner → marks (origin planner)   ▲ decisions (labels, confirms,
        ▼                                     │ overturns) bind the next reconcile
  probes for the driver                       │
                 ┌───────────────────────────────────────────┐
                 │ Layer B · documentation (BA via tools)     │
                 │ doc records · amendments · process models  │
                 │ SRS / process export + DMN                 │
                 └───────────────────────────────────────────┘
```

Two loops: the **query loop** (planner → probes → new evidence → reconcile) and the **decision
loop** (people confirm, label or overturn → constraints for the next reconcile).

## 2. Changes from the source

| # | Source | Here | Why |
| --- | --- | --- | --- |
| C-1 | Back-fill old rows, v1 and v2 fingerprints side by side, `legacy_*` links, keep writing `edges` until phase 2, compatibility view | **None of it.** v2 starts from an empty store; obsolete tables are dropped (§ 17) | Owner 2026-10-18: all data is test data |
| C-2 | `INTEGER` ids, no `STRICT`, no JSON checks | UUIDv7 `TEXT` ids, `STRICT`, `json_valid`, ISO 8601 UTC ms timestamps (`data/schema/README.md`); human keys where people cite them | Store conventions (`sqlite-conventions` skill) |
| C-3 | New `observations` table beside `page_visits` and `state_observations` | `page_visits` is renamed `observations` and extended; `state_observations` stays as the per-run aggregate | One per-visit table |
| C-4 | New `endpoint_schemas` table | `network_calls.schema_hash` (+ index); `endpoint_schemas` is a view | `network_calls` already stores `req_schema` / `res_schema` |
| C-5 | "Nine pipeline steps" with numbers | The real named steps of `process-page.ts` (§ 5.1); the golden test changes with them | The source's numbering does not match the code |
| C-6 | Reconciler in the store package; "the dashboard calls the same code" | Pure logic in a new `@pathfinder/model` package, writes in `@pathfinder/store`; the Python dashboard reads Layer M read-only and triggers a reconcile through a TypeScript command | The dashboard is Python and opens the store read-only |
| C-7 | Python worker writes hypotheses | `apps/miner` prints JSON; `pnpm model:import` validates with Zod and writes | Constitution: Python writes only through the TypeScript schemas |
| C-8 | Replays and walks: mechanism unstated | Always the headless driver, no LLM (§ 9) | Otherwise the cost and the number of runs explode |
| C-9 | Trace `processes` become journeys | Journeys, plus `trace_runs` (one per trace run) keeping its name, goal, outcome, boundary and promotion status | Principle IV's `recorded → replay_verified → documented` lives on it |
| C-10 | `entity_refs` switch-over in phase 5 with mapping of old rows | `entity_refs` exists from M1 and every new reference uses it from the start | Nothing to map on an empty store |

Everything else (algorithms, thresholds, rules, lifecycle, evals) is the source's.

## 3. Vocabulary

Internal names (schema, code, agents) follow web-app model inference, process mining and active
automata learning. The BA-facing UI keeps plain words; `ux-requirements.md` and the glossary
settle the copy.

| Internal | Meaning | UI word (proposal) |
| --- | --- | --- |
| concrete state (`states`) | one exact page version | page version |
| abstract state (`screens`) | a class of near-duplicate page versions | screen |
| member (`screen_members`) | a concrete state in a screen, r1, r2… | variant |
| observation | one visit to a page | visit |
| journey | one continuous path in a run | path |
| transition | one action, observation → observation | step |
| model transition | screen → action class → screen, across runs | link |
| action class | one element of a screen, matched across runs by its element key | action |
| step result | ok, validation, business_error, technical_error, timeout, blocked | result |
| build, build epoch | what a scope served; the period it served it | release |
| deviation | a place a run did not fit the model | change |
| hypothesis | a testable claim | finding / claim |
| derived fact | a hypothesis confirmed by a published rule | explained automatically |
| decision point, decision rule | a system response that depends on data; its DMN table | business rule |
| process instance | one journey's pass through a process | case |
| trace variant | a distinct screen sequence of a process | path variant |

"Cluster" survives only as the explorer's crawl-time guess. "Process" without a qualifier means
the Layer M process.

## 4. Invariants (unchanged from v1)

- **Evidence first.** Every claim cites Layer A with `observed`, `inferred` or `needs_confirmation`.
- **Raw evidence is never rewritten.** Layer A is append-only; Layer M is rebuilt; interpretation
  references evidence.
- **Capture everything** (`legacy-capture-everything`): URLs, query parameters, redirects, pages
  without ARIA, mounts, frames. The model decides what counts toward identity; capture drops nothing.
- **Portal-agnostic.** Portal knowledge enters only through hooks (§ 5.10) and person-made labels.
- **Versioned model.** Screens and transitions can disappear and return; status changes are
  recorded, nothing in the model is deleted.
- **The BA writes only through its tools; agents never write SQL** (MCP only).
- **End product:** documentation good enough to rebuild the portal per process (R-68), now with
  tested decision rules, process boundaries and endpoint contracts.

## 5. Layer A: capture

### 5.1 Pipeline

`processPage` (`mcp-server/src/runtime/pipeline/process-page.ts`) keeps its order (G-18, locked by
`tests/pipeline-golden.e2e.test.ts`). Changes per named step:

| Step | Change |
| --- | --- |
| `settle` | unchanged; a settle that does not finish sets step result `timeout` |
| `observe` | also returns script and stylesheet responses (URL, frame, initiator), the response headers the portal hook names, cookie and storage keys matching the hook's flag patterns, and label–value pairs on the page (§ 5.8) |
| `net_drain` | unchanged; each drained call gets `schema_hash` |
| `fingerprint` | fingerprint v2 and its components (§ 5.4); the explorer's provisional cluster as today |
| `record_state` | writes `states` and `state_components`; the provisional screen as today (explorer only) |
| `record_forms` | unchanged |
| `record_transition` (was the edge) | writes a `transitions` row with element key, kind, step result, intent; ends or opens journeys (§ 5.7) |
| `record_api_calls` | links calls to the transition (`network_calls.transition_id`) |
| `record_visit` (was `page_visits`) | writes the `observations` row with journey, seq, URL, step result, context key, flags, builds |
| `enqueue_frontier` | each action gets its element key |
| new `record_attributes` | after `record_visit`: shown values; after a fill / select / check: the input (§ 5.8) |

### 5.2 Builds

Each observation records the build of every scope on the page.

1. Collect the script and stylesheet URLs loaded by the document and each frame.
2. Assign each to a scope: assets requested by a micro-frontend mount (frame, initiator, remote
   entry URL; the mount detection of R-37/R-38) belong to that scope, the rest to `shell`.
3. Keep assets whose name or query carries a content hash:
   `[.\-_]([0-9a-f]{8,}|[A-Za-z0-9_-]{16,})\.(m?js|css)$`, or `?v=` / `?hash=`.
4. Signature = sha256 of the sorted unique asset paths of the scope.
5. A portal hook's version header, meta tag or version endpoint replaces the signature (`source = marker`).
6. Neither: build `unknown`, the portal is flagged on Home and Settings; drift falls back to
   persistence (§ 20).

### 5.3 Endpoint schemas

For every captured call, `schema_hash` = sha256 of the response's sorted JSON key paths with their
value types (values ignored). `network_calls` already stores `req_schema` and `res_schema`.

### 5.4 Fingerprint v2 and components

v2 is the only fingerprint (`@pathfinder/fingerprint`):

- **Accessible names are masked** like text, so "Koszyk (3)" and "Koszyk (4)" hash alike.
- **Runs of two or more consecutive siblings with the same structural signature collapse** into
  one node marked repeated; their text leaves the hash (repeated rows are data).
- Query strings stay out of identity; parameter roles decide in Layer M (§ 6.4).
- Identity = sha256(route template ‖ collapsed masked tree ‖ overlays). Structural signature of a
  subtree = hash of its role and its children's signatures, names excluded, bottom-up.

Components per state (`state_components`): structure hash (roles only, repeats collapsed), content
hash (masked names and text outside repeated runs), overlay hash, calls hash (sorted endpoint
templates requested while settling), mounts hash (sorted scopes mounted), MinHash (128 × uint32
over the set of role-path shingles; the existing level-2 MinHash code), element keys (JSON array
of every actionable element on the page).

### 5.5 Element keys

`role | masked accessible name | container path | ordinal`

- Name: masked as in v2, lower-cased, spaces collapsed.
- Container path: nearest landmark role and its name, then the nearest heading above.
- Ordinal: position among same role and name in the same container, only when more than one.

Example: `button|oblicz składkę|main>form "Dane pojazdu"|`. Element keys match actions across runs
and anchor documentation. The locator descriptors (Principle III) stay on `actions`.

### 5.6 Observations and step results

| Result | When |
| --- | --- |
| `technical_error` | the browser's error page, or HTTP ≥ 500 on the document or a blocking request |
| `validation` | today's validation signals |
| `business_error` | the page matches an error template a person or the agent labelled business (e.g. a refusal to insure) |
| `timeout` | settle did not finish |
| `blocked` | the safety gate refused the action |
| `ok` | none of the above |

Context key = sha256(sorted build ids ‖ audience ‖ experiment arm). Audience = sha256 of the
persona's attribute set and the environment. Experiment arm = the values of the hook's flags, else empty.

### 5.7 Journeys and transitions

A journey ends whenever the path is not continuous. A new one starts on a fresh session, a
navigation the crawler typed, a checkpoint replay, a login, or a backtrack. A backtrack starts a
**child journey** that inherits its parent's steps up to the branch point. Fills, selects and
checks are transitions too, usually without a new page, so every typed value has a position.

A trace run keeps its name, goal, outcome, boundary and promotion status (Principle IV) on
`trace_runs`; its steps are the transitions of its journeys, with the agent's `intent` per step.

### 5.8 Attribute writes

- **Persona** attributes at seq 0 of each root journey.
- **Inputs:** each fill, select or check writes `input.<field>` (field = normalised label of its
  element key).
- **Shown values:** after each observation, label–value pairs (definition lists, table header and
  cell, "label: value" text) write `shown.<label>` raw. Fingerprints mask numbers; attribute
  writes keep them, because rules depend on them.
- **Snapshot** at transition n = per name, the write with the largest seq below n, along the
  journey and its ancestors up to their branch points. A name with no write is `missing`, never a default.

Personas are synthetic, so raw values are stored (`usefulness-over-security`).

### 5.9 Schema (migrations 0029–0033)

```sql
-- 0029_entity_refs_builds.sql
CREATE TABLE builds (
  id          TEXT PRIMARY KEY,                       -- UUIDv7
  portal_id   TEXT NOT NULL CHECK (length(portal_id) > 0),
  scope       TEXT NOT NULL,                          -- 'shell' or a mount name
  signature   TEXT NOT NULL,
  source      TEXT NOT NULL CHECK (source IN ('assets','marker','unknown')),
  assets_json TEXT NOT NULL CHECK (json_valid(assets_json) AND json_type(assets_json) = 'array'),
  first_seen  TEXT NOT NULL,
  UNIQUE (portal_id, scope, signature)
) STRICT;

ALTER TABLE network_calls ADD COLUMN schema_hash TEXT;      -- NULL only for non-JSON responses
ALTER TABLE network_calls ADD COLUMN transition_id TEXT REFERENCES transitions(id);
CREATE INDEX ix_network_calls_schema ON network_calls (url_template, method, schema_hash);
-- network_calls.edge_id is dropped with edges (§ 17)

CREATE TABLE entity_refs (                            -- typed references, § 15
  id                  TEXT PRIMARY KEY,
  observation_id      TEXT REFERENCES observations(id),
  transition_id       TEXT REFERENCES transitions(id),
  state_id            TEXT REFERENCES states(id),
  screen_id           TEXT REFERENCES screens(id),
  action_class_id     TEXT REFERENCES action_classes(id),
  model_transition_id TEXT REFERENCES model_transitions(id),
  process_id          TEXT REFERENCES ba_processes(id),
  hypothesis_id       TEXT REFERENCES hypotheses(id),
  network_call_id     TEXT REFERENCES network_calls(id),
  element_key         TEXT,
  CHECK ((observation_id IS NOT NULL) + (transition_id IS NOT NULL) + (state_id IS NOT NULL)
       + (screen_id IS NOT NULL) + (action_class_id IS NOT NULL)
       + (model_transition_id IS NOT NULL) + (process_id IS NOT NULL)
       + (hypothesis_id IS NOT NULL) + (network_call_id IS NOT NULL) = 1),
  CHECK (element_key IS NULL OR screen_id IS NOT NULL)
) STRICT;
-- Foreign keys to tables created by later migrations are checked on write, not on creation.

-- 0030_state_components.sql
CREATE TABLE state_components (
  state_id       TEXT PRIMARY KEY REFERENCES states(id),
  structure_hash TEXT NOT NULL,
  content_hash   TEXT NOT NULL,
  overlay_hash   TEXT NOT NULL,
  calls_hash     TEXT NOT NULL,
  mounts_hash    TEXT NOT NULL,
  minhash        BLOB NOT NULL CHECK (length(minhash) = 512),   -- 128 × uint32
  element_keys   TEXT NOT NULL CHECK (json_valid(element_keys) AND json_type(element_keys) = 'array')
) STRICT;

-- 0031_journeys_observations_transitions.sql (one release: they reference each other)
CREATE TABLE journeys (
  id                TEXT PRIMARY KEY,
  run_id            TEXT NOT NULL REFERENCES runs(id),
  parent_journey_id TEXT REFERENCES journeys(id),
  branch_seq        INTEGER CHECK (branch_seq IS NULL OR branch_seq >= 0),
  start_kind        TEXT NOT NULL CHECK (start_kind IN
                      ('entry_url','checkpoint','login','backtrack','resume','fresh_session')),
  checkpoint_id     TEXT REFERENCES checkpoints(id),
  end_reason        TEXT CHECK (end_reason IN
                      ('outcome','backtrack','reset','logout','error','budget','run_end')),
  started_at        TEXT NOT NULL,
  ended_at          TEXT,
  CHECK ((parent_journey_id IS NULL) = (branch_seq IS NULL))
) STRICT;

ALTER TABLE page_visits RENAME TO observations;
ALTER TABLE observations ADD COLUMN journey_id TEXT REFERENCES journeys(id);   -- NOT NULL in Zod
ALTER TABLE observations ADD COLUMN seq INTEGER;                              -- order within the run
ALTER TABLE observations ADD COLUMN result TEXT CHECK (result IN
  ('ok','validation','business_error','technical_error','timeout','blocked'));
ALTER TABLE observations ADD COLUMN context_key TEXT;
ALTER TABLE observations ADD COLUMN flags_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(flags_json));
CREATE UNIQUE INDEX ux_observations_run_seq ON observations (run_id, seq);
-- observations.edge_id is dropped (the transition's to_observation_id says how we got here).
-- db-admin may rebuild the table instead of ALTERs to get NOT NULL on the new columns; the
-- store is empty at v2, so a rebuild is free.

CREATE TABLE observation_builds (
  observation_id TEXT NOT NULL REFERENCES observations(id),
  build_id       TEXT NOT NULL REFERENCES builds(id),
  PRIMARY KEY (observation_id, build_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE transitions (
  id                  TEXT PRIMARY KEY,
  run_id              TEXT NOT NULL REFERENCES runs(id),
  journey_id          TEXT NOT NULL REFERENCES journeys(id),
  seq                 INTEGER NOT NULL CHECK (seq >= 1),
  from_observation_id TEXT NOT NULL REFERENCES observations(id),
  to_observation_id   TEXT REFERENCES observations(id),      -- NULL: no new page
  action_id           TEXT NOT NULL REFERENCES actions(id),
  element_key         TEXT NOT NULL,
  kind                TEXT NOT NULL CHECK (kind IN
                        ('click','fill','select','check','submit','navigate','back')),
  result              TEXT NOT NULL CHECK (result IN
                        ('ok','validation','business_error','technical_error','timeout','blocked')),
  safety_class        TEXT NOT NULL CHECK (safety_class IN
                        ('read','mutating','destructive','external-side-effect')),  -- Principle V
  status              TEXT NOT NULL CHECK (status IN ('executed','skipped','inferred')),
  intent              TEXT,                                  -- the agent's words, trace steps
  outcomes_json       TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(outcomes_json)),
  replay_of_id        TEXT REFERENCES transitions(id),
  driver              TEXT NOT NULL CHECK (driver IN ('agent','headless')),
  evidence_ref        TEXT NOT NULL CHECK (length(evidence_ref) > 0),
  confidence          TEXT NOT NULL CHECK (confidence IN ('observed','inferred','needs_confirmation')),
  stabilization       TEXT NOT NULL CHECK (stabilization IN ('settled','never_stabilized')),
  error               TEXT CHECK (error IS NULL OR json_valid(error)),
  created_at          TEXT NOT NULL,
  UNIQUE (journey_id, seq)
) STRICT;
CREATE INDEX ix_transitions_run ON transitions (run_id);
CREATE INDEX ix_transitions_action ON transitions (action_id);

CREATE TABLE trace_runs (                    -- replaces trace `processes`; Principle IV status
  run_id                 TEXT PRIMARY KEY REFERENCES runs(id),
  name                   TEXT NOT NULL,
  goal                   TEXT NOT NULL,
  followup_record_id     TEXT REFERENCES doc_records(id),
  status                 TEXT NOT NULL CHECK (status IN ('recorded','replay_verified','documented')),
  outcome                TEXT CHECK (outcome IN ('goal_reached','boundary_reached','stopped','abandoned')),
  boundary_transition_id TEXT REFERENCES transitions(id),
  observed_result        TEXT,
  not_observable         TEXT,
  ended_at               TEXT,
  CHECK (outcome IS NOT 'boundary_reached'
         OR (boundary_transition_id IS NOT NULL AND not_observable IS NOT NULL))
) STRICT;

-- 0032_attribute_writes.sql
CREATE TABLE attribute_writes (
  id          TEXT PRIMARY KEY,
  journey_id  TEXT NOT NULL REFERENCES journeys(id),
  seq         INTEGER NOT NULL CHECK (seq >= 0),    -- 0 = journey start; else the transition seq
  name        TEXT NOT NULL,                        -- 'persona.segment', 'input.vehicle_value', 'shown.premium'
  source      TEXT NOT NULL CHECK (source IN ('persona','input','shown')),
  value_type  TEXT NOT NULL CHECK (value_type IN ('number','date','enum','bool','text','missing')),
  value_num   REAL,
  value_text  TEXT,
  element_key TEXT,
  UNIQUE (journey_id, seq, name)
) STRICT;

-- 0033_portal_hooks_flags.sql: the hook values live in portal.yaml (§ 5.10); this migration only
-- adds `runs.build_flag` ('ok','unknown_builds') for the Home warning.
```

`edges`-shaped reads (the BA's evidence, the run graph R-74, the export) move to `transitions`.

### 5.10 Portal hooks

Optional, in `portals/<portal>/portal.yaml`, validated by Zod (`@pathfinder/config`):

```yaml
model:
  build_marker:            # any one; replaces asset signatures
    header: x-app-version
    meta: app-version
    endpoint: /api/version
  experiment_flags:        # cookie / storage keys whose values name an A/B arm
    - cookie: ab_variant
  business_errors:         # templates that make a page a business_error
    - text: "Nie możemy zaproponować ubezpieczenia"
  global_nav_share: 0.6    # tuning, § 6.5
  replay_budget: 20        # per run, § 9
  probe_budget: 120        # per run, the existing limit
```

The agent may propose a business error template as a hypothesis; a person confirms it into the hook.

## 6. Layer M: the portal model

Stored and rebuildable: the reconciler recomputes it from Layer A plus decisions at any time,
and ids stay the same. It replaces the screen graph computed on each Map load.

### 6.1 Canonical clustering

Per portal:

1. **Partition by route key** (§ 6.4). A state seen under several route keys takes the most
   frequent; ties go to the lexically smallest.
2. **Distance** d(a, b) = 1 − estimated Jaccard of the MinHash signatures. Partitions over 500
   states use LSH banding (32 bands × 4 rows, fixed seeds) for candidate pairs; others count as 1.
3. **Must-link:** clone or near-duplicate labels and confirmed `same_as` merge into super-nodes first.
4. **Average-linkage:** merge the closest pair while distance ≤ 1 − τ and no cannot-link
   (`distinct` label, confirmed `different_from`) joins them; ties break on the lexically smallest
   fingerprint in each cluster.
5. **Map to stable ids** (§ 6.2).

A must-link group containing a cannot-link pair is a **label conflict**: it goes to Review and the
group is kept apart until a person fixes the labels.

### 6.2 Stable ids and lineage

1. For each new cluster C and existing screen S: overlap = shared concrete states.
2. Assign greedily by largest overlap; ties prefer the screen with more anchored doc records, then
   the smaller id. Each side is used once.
3. An unassigned cluster becomes a new screen.
4. A screen left without a cluster gets `merge` lineage into the screen that took most of its
   members, or `retire` if none.
5. When a screen's members end up in several clusters, it keeps the largest; the others get `split`.
6. Only membership changes are written; unchanged rows keep their `from_model_version`.

**Path dependence.** Ids depend on the screen registry, so an incremental history and a single full
rebuild can differ. The rebuild gate (§ 19) therefore keeps the registry, and a fourth gate checks
that reconciling runs one by one or all at once gives the same **membership** (ids may differ only
where lineage records why).

`states.cluster_id` and the explorer's provisional screen stay for crawl time only; F-01@038's
seeding reads `screen_members` of the current model version.

### 6.3 Threshold calibration

- τ = 0.9 until the portal has 30 clone or near-duplicate labels and 30 distinct labels.
- Then τ = the similarity maximising F1 of detecting distinct pairs, swept 0.50–0.99 by 0.01. The
  report also gives the statistical threshold (median similarity of near-duplicate pairs).
- The labelling queue shows pairs within 0.05 of τ, closest first; each label also becomes a
  must-link or cannot-link. Labels are the training set for M6.

### 6.4 Parameter roles

Each path or query parameter of a route template has a role:

- **identity:** at least two values each have two or more observations, and their sets of
  structure hashes do not overlap;
- **data:** values vary, structure does not;
- **ignored:** one value seen.

A person can override (a confirmed hypothesis). Route key = template with identity parameters
written out (`/sekcja/3`, `/polisa/:param?action=edit`). Fixes R-50 and F-16@030.

### 6.5 Action classes and model transitions

Each Layer A transition maps to one model transition: (from screen, action class, to screen,
result). Rows are upserted by that key, so ids survive rebuilds.

- `is_global`: the action's container is banner, navigation or contentinfo on ≥ 60 % of screens
  (`global_nav_share`).
- Self-loops are `internal` (dialogs, validation, fills): shown in the screen, not on the Map.
- A moved link (same screen pair, new element key) gives two action classes; R6 records `replaces`.
- Scans ▸ Map reads the non-internal model transitions of the current model version; one run's
  graph still reads Layer A.

### 6.6 Coverage and status

Absence is judged from what each observation shows, not from what the crawler clicked: every
observation checks every action class of its screen against `state_components.element_keys`.

Per run, audience and observed screen: present in any observation → streak 0; absent in all →
streak + 1, at most once per run.

| Status | Condition |
| --- | --- |
| `active` | present or executed in the current build epoch, for some audience |
| `not_seen_since` | absent in ≥ 2 consecutive runs of the current epoch, for every audience where it was ever present |
| `untested` | its screen was not observed in the current epoch for an audience where it was present |
| `retired` | a confirmed `removed` hypothesis |

Frequency is ignored on purpose (it reflects the crawler's choices). A model transition's status
follows its action class; an action still present but leading elsewhere is a `target_mismatch`.

### 6.7 Build epochs

Per scope and environment, observations ordered by capture time; a new epoch starts when a new
signature appears in two consecutive observations of that scope. Alternating old and new builds
mark both epochs `overlaps_previous` (gradual rollout). A screen's current epoch = the latest
epochs of the scopes mounted on its members.

### 6.8 Schema (migration 0034)

```sql
CREATE TABLE model_versions (
  id                    TEXT PRIMARY KEY,
  portal_id             TEXT NOT NULL,
  seq                   INTEGER NOT NULL CHECK (seq >= 1),     -- 1, 2, 3… per portal
  built_at              TEXT NOT NULL,
  algorithm             TEXT NOT NULL,                         -- 'minhash-avglink-v1'
  threshold             REAL NOT NULL CHECK (threshold BETWEEN 0 AND 1),
  observation_watermark TEXT NOT NULL,                         -- max observations.id (UUIDv7 sorts by time)
  decision_watermark    TEXT NOT NULL,                         -- max hypothesis_events.id
  stats_json            TEXT NOT NULL CHECK (json_valid(stats_json)),
  UNIQUE (portal_id, seq)
) STRICT;

-- screens: rebuilt on the empty store (drops merged_into, cluster_id; adds model columns)
CREATE TABLE screens (
  id             TEXT PRIMARY KEY,
  key            TEXT NOT NULL,                     -- 'SC-0012', stable, cited by people
  portal_id      TEXT NOT NULL,
  route_key      TEXT NOT NULL,
  title          TEXT NOT NULL,                     -- latest member's title, display only
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','merged','retired')),
  first_model_version TEXT NOT NULL REFERENCES model_versions(id),
  created_at     TEXT NOT NULL,
  UNIQUE (portal_id, key)
) STRICT;

CREATE TABLE screen_members (
  screen_id          TEXT NOT NULL REFERENCES screens(id),
  state_id           TEXT NOT NULL REFERENCES states(id),
  ordinal            INTEGER NOT NULL CHECK (ordinal >= 1),   -- r1, r2… by first sighting
  assigned_by        TEXT NOT NULL CHECK (assigned_by IN ('clustering','constraint')),
  from_model_version TEXT NOT NULL REFERENCES model_versions(id),
  to_model_version   TEXT REFERENCES model_versions(id),      -- NULL = current
  PRIMARY KEY (screen_id, state_id, from_model_version)
) STRICT, WITHOUT ROWID;
CREATE UNIQUE INDEX ux_screen_members_current ON screen_members (state_id) WHERE to_model_version IS NULL;

CREATE TABLE screen_lineage (
  id               TEXT PRIMARY KEY,
  model_version_id TEXT NOT NULL REFERENCES model_versions(id),
  kind             TEXT NOT NULL CHECK (kind IN ('split','merge','retire','revive')),
  from_screen_id   TEXT NOT NULL REFERENCES screens(id),
  to_screen_id     TEXT REFERENCES screens(id),
  members_moved    INTEGER NOT NULL CHECK (members_moved >= 0)
) STRICT;

CREATE TABLE state_pair_labels (
  portal_id   TEXT NOT NULL,
  state_a     TEXT NOT NULL REFERENCES states(id),
  state_b     TEXT NOT NULL REFERENCES states(id),
  label       TEXT NOT NULL CHECK (label IN ('clone','near_duplicate','distinct')),
  nd_kind     TEXT CHECK (nd_kind IN ('cosmetic','dynamic_data','duplication')),
  labelled_by TEXT NOT NULL,
  labelled_at TEXT NOT NULL,
  reason      TEXT,
  CHECK (state_a < state_b),
  PRIMARY KEY (state_a, state_b)
) STRICT, WITHOUT ROWID;

-- 0045 (owner decision 2026-10-21): every answer stays. state_pair_labels is the current label (a new
-- answer replaces it); this table gets one row per answer and is append-only, so the earlier person's
-- label and reason stay in History (design v2-14). Backfilled with one row per existing label.
CREATE TABLE state_pair_label_history (
  id          TEXT PRIMARY KEY,                    -- UUIDv7
  portal_id   TEXT NOT NULL,
  state_a     TEXT NOT NULL REFERENCES states(id),
  state_b     TEXT NOT NULL REFERENCES states(id),
  label       TEXT NOT NULL CHECK (label IN ('clone','near_duplicate','distinct')),
  nd_kind     TEXT CHECK (nd_kind IS NULL OR nd_kind IN ('cosmetic','dynamic_data','duplication')),
  labelled_by TEXT NOT NULL,
  labelled_at TEXT NOT NULL,
  reason      TEXT,
  CHECK (state_a < state_b),
  CHECK (nd_kind IS NULL OR label = 'near_duplicate')
) STRICT;
-- indexes: (state_a, state_b, labelled_at) for one pair's history; (portal_id)

CREATE TABLE parameter_roles (
  portal_id      TEXT NOT NULL,
  route_template TEXT NOT NULL,
  param          TEXT NOT NULL,                    -- 'path:2' or 'query:action'
  role           TEXT NOT NULL CHECK (role IN ('identity','data','ignored')),
  decided_by     TEXT NOT NULL CHECK (decided_by IN ('reconciler','person')),
  hypothesis_id  TEXT REFERENCES hypotheses(id),   -- the override, when a person decided
  PRIMARY KEY (portal_id, route_template, param)
) STRICT, WITHOUT ROWID;

CREATE TABLE action_classes (
  id          TEXT PRIMARY KEY,
  screen_id   TEXT NOT NULL REFERENCES screens(id),
  element_key TEXT NOT NULL,
  kind        TEXT NOT NULL,
  is_global   INTEGER NOT NULL DEFAULT 0 CHECK (is_global IN (0,1)),
  UNIQUE (screen_id, element_key, kind)
) STRICT;

CREATE TABLE model_transitions (
  id                       TEXT PRIMARY KEY,
  from_screen_id           TEXT NOT NULL REFERENCES screens(id),
  action_class_id          TEXT NOT NULL REFERENCES action_classes(id),
  to_screen_id             TEXT REFERENCES screens(id),
  result                   TEXT NOT NULL,
  internal                 INTEGER NOT NULL CHECK (internal IN (0,1)),
  support                  INTEGER NOT NULL CHECK (support >= 1),
  first_seen_transition_id TEXT NOT NULL REFERENCES transitions(id),
  last_seen_transition_id  TEXT NOT NULL REFERENCES transitions(id),
  guard_hypothesis_id      TEXT REFERENCES hypotheses(id),
  status                   TEXT NOT NULL CHECK (status IN ('active','not_seen_since','untested','retired')),
  status_model_version     TEXT NOT NULL REFERENCES model_versions(id)
) STRICT;
CREATE UNIQUE INDEX ux_model_transitions_key ON model_transitions
  (from_screen_id, action_class_id, IFNULL(to_screen_id, ''), result);

CREATE TABLE action_coverage (
  action_class_id             TEXT NOT NULL REFERENCES action_classes(id),
  audience_key                TEXT NOT NULL,
  last_present_observation_id TEXT REFERENCES observations(id),
  last_absent_observation_id  TEXT REFERENCES observations(id),
  absent_run_streak           INTEGER NOT NULL DEFAULT 0 CHECK (absent_run_streak >= 0),
  last_executed_transition_id TEXT REFERENCES transitions(id),
  PRIMARY KEY (action_class_id, audience_key)
) STRICT, WITHOUT ROWID;

CREATE TABLE build_epochs (
  id                   TEXT PRIMARY KEY,
  portal_id            TEXT NOT NULL,
  scope                TEXT NOT NULL,
  environment          TEXT NOT NULL,
  build_id             TEXT NOT NULL REFERENCES builds(id),
  first_observation_id TEXT NOT NULL REFERENCES observations(id),
  last_observation_id  TEXT NOT NULL REFERENCES observations(id),
  overlaps_previous    INTEGER NOT NULL DEFAULT 0 CHECK (overlaps_previous IN (0,1))
) STRICT;
```

`states.screen_id` / `screen_rev` (the crawl-time provisional assignment) are renamed
`provisional_screen` / `provisional_rev`, so nothing outside the explorer reads them by accident.

## 7. The reconciler

Deterministic code: the same Layer A and decisions give the same model, whatever order runs
happened in.

**Where.** `apps/crawler/packages/model` (`@pathfinder/model`): pure functions over plain data
(clustering, id mapping, parameter roles, epochs, coverage, deviations, rules R1–R8, planner),
unit-tested on fixtures (Principle VII). `@pathfinder/store` gets `model-writer.ts` (loads inputs,
writes outputs in one transaction). Entry points: the MCP server after `finish_run`, and
`pnpm model:reconcile <portal> [--rebuild]` (the dashboard's "Rebuild model" button invokes it,
like `docs:review`).

**Steps**, one SQLite transaction per portal:

1. Load observations and transitions above the observation watermark, decisions above the decision watermark.
2. Compute `state_components` for new concrete states (if the pipeline did not).
3. Update builds and build epochs.
4. Update parameter roles; recompute route keys of affected states.
5. Re-cluster route partitions that gained states or labels; map to stable ids; write membership changes and lineage.
6. Map new transitions to action classes and model transitions; update coverage and statuses.
7. Check each new journey against the previous model version; write deviations.
8. Apply rules R1–R8: write derived hypotheses, request replays (as planner marks).
9. Re-evaluate hypotheses whose tests finished.
10. Compute process boundary weights; call the miner for communities (§ 13.3) when the graph changed.
11. Run the planner (§ 14).
12. Write the `model_versions` row.

**Guarantees** (each a gate, § 19): idempotent (a second pass writes nothing); order-independent
(shuffled insertion gives identical membership and ids); rebuildable (drop the model tables except
the registry — `screens`, `action_classes`, the `model_transitions` key — and ids are identical);
history-independent membership (§ 6.2).

**Cost.** Only changed partitions re-cluster; a full rebuild is O(n²) per route partition and runs
offline. Pure code, no tokens.

## 8. Deviations and rules R1–R8

### 8.1 Detection

The reconciler walks each new journey's transitions against the previous model version.

| Kind | When |
| --- | --- |
| `new_screen` | the target is a screen created in this version |
| `new_member` | a new concrete state joined an existing screen |
| `new_action` | the action class did not exist before |
| `missing_action` | an action class reached absent streak 2 |
| `target_mismatch` | a known action class led to a screen it never led to before |
| `result_mismatch` | a known transition gave a different step result |
| `rule_mismatch` | a rule's boundary test returned a target the rule does not predict |

Each deviation stores a reference observation (the most recent of the same screen or action
class, same audience first, then the previous epoch), the changed components and the context
difference. A structural change is attributed to a scope by diffing the element keys of the two
concrete states and finding the mount containing the added and removed ones. Later occurrences
attach as evidence to the first row (dedup key `subject_key`).

### 8.2 Rules

Run in order; the first that decides ends the chain. "Replay" = the headless driver re-runs the
journey prefix with the same persona and inputs in a fresh session (§ 9).

| Rule | Applies to | Check | Writes |
| --- | --- | --- | --- |
| R1 errors | result `technical_error` or `timeout` | replay twice | all fail → `deterministic_error` (person: business rule or defect); any succeeds → `flaky`, derived |
| R2 drift | any deviation | the build of the scope owning the changed region differs from the reference | `structural_drift`, derived, with the epoch boundary |
| R3 backend | result or target change, equal frontend builds | an endpoint schema on the transition changed | `backend_drift`, person |
| R4 context | audience or inputs differ, same builds | replay with the reference context and with this one | each reproduces its own result → `context_variant`, derived; the differing attributes go to decision mining |
| R5 randomness | same builds, audience and inputs, or R4 did not reproduce | replay three times | results alternate and one flag separates them → `ab_test`, person; else `nondeterministic` for the agent |
| R6 absence | `missing_action` | scope build changed? present for another audience? a new action connects the same screens in this epoch? | build changed → `removed`, derived; other audience → `context_variant`, derived; new action → `replaces`, derived; none → `removed`, person |
| R7 targets | `target_mismatch` | same epoch and audience? | yes → decision point candidate; no → R2 |
| R8 rules | `rule_mismatch` | replay reproduces it | `decision_drift`, derived; the rule is re-mined on the new epoch |

A deviation no rule decides becomes `ambiguous` in the agent's queue; the agent writes a hypothesis with a test.

### 8.3 Schema (migration 0035, with hypotheses)

```sql
CREATE TABLE deviations (
  id                       TEXT PRIMARY KEY,
  portal_id                TEXT NOT NULL,
  model_version_id         TEXT NOT NULL REFERENCES model_versions(id),
  kind                     TEXT NOT NULL CHECK (kind IN ('new_screen','new_member','new_action',
                             'missing_action','target_mismatch','result_mismatch','rule_mismatch')),
  subject_key              TEXT NOT NULL,          -- 'new_member:SC-0012:<state id>'
  observation_id           TEXT REFERENCES observations(id),
  transition_id            TEXT REFERENCES transitions(id),
  reference_observation_id TEXT REFERENCES observations(id),
  screen_id                TEXT REFERENCES screens(id),
  action_class_id          TEXT REFERENCES action_classes(id),
  changed_components       TEXT NOT NULL CHECK (json_valid(changed_components) AND json_type(changed_components) = 'array'),
  context_diff             TEXT NOT NULL CHECK (json_valid(context_diff) AND json_type(context_diff) = 'object'),
  status                   TEXT NOT NULL CHECK (status IN ('open','waiting_test','explained')),
  created_at               TEXT NOT NULL,
  UNIQUE (portal_id, kind, subject_key)
) STRICT;

CREATE TABLE deviation_occurrences (
  deviation_id   TEXT NOT NULL REFERENCES deviations(id),
  observation_id TEXT REFERENCES observations(id),
  transition_id  TEXT REFERENCES transitions(id),
  CHECK ((observation_id IS NULL) <> (transition_id IS NULL))
) STRICT;
```

## 9. Replays (deterministic, no LLM)

Every replay, boundary test, regression suite and exploration walk runs through the **headless
driver**: the crawler tools in-process (`mcp-server/src/local-client.ts`), driven by code (the
pattern of `trace-driver.ts`), with `replay.ts` re-finding each element by its locators. Every call
is gated, recorded and traced exactly like the agent's; transitions carry `driver = 'headless'`.

- **Run kind:** `runs.mode = 'probe'` (Zod enum; the column has no CHECK). A probe run consumes
  planner marks in priority order until its budget ends.
- **Budget:** `replay_budget` per run (default 20 replays) and the existing probe limits
  (24 per step, 120 per run).
- **Cheap starts:** from checkpoints (spec 027) instead of the entry page; logged-in sessions reused
  where the persona allows; identical prefixes run once per run and are cached by
  (persona, inputs, prefix of element keys).
- **Divergence:** when a replay cannot re-find an element, the transition is `skipped` with the
  reason, and the hypothesis test is `inconclusive`, never `fail`.
- **Safety:** unchanged; the persona's and portal's limits apply to the driver as to the agent.

Cost: browser time only. The LLM is used for map and trace runs, for naming and wording, and for
`ambiguous` hypotheses.

## 10. Hypotheses

Every testable claim about the portal is a hypothesis. Replaces `reconciliations` and
`rule_candidates`; gives every merge a recorded reason.

### 10.1 Schema (migration 0035)

```sql
CREATE TABLE hypotheses (
  id               TEXT PRIMARY KEY,
  key              TEXT NOT NULL,          -- 'H-0001', per portal
  portal_id        TEXT NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN (
                     'same_as','different_from','parameter_role',
                     'structural_drift','backend_drift','decision_drift',
                     'context_variant','ab_test','flaky','nondeterministic','deterministic_error',
                     'removed','replaces','coverage_gap','business_error_template',
                     'decision_rule','process_boundary','correlation_id','ambiguous')),
  claim            TEXT NOT NULL CHECK (length(claim) > 0),   -- one sentence a BA can read
  claim_json       TEXT NOT NULL CHECK (json_valid(claim_json)),
  claim_hash       TEXT NOT NULL,                             -- sha256 of canonical claim_json
  status           TEXT NOT NULL CHECK (status IN
                     ('proposed','testing','supported','refuted','confirmed','rejected','superseded')),
  origin           TEXT NOT NULL CHECK (origin IN ('rule','agent','person')),
  rule             TEXT CHECK (rule IS NULL OR rule GLOB 'R[1-8]'),
  confidence       TEXT NOT NULL CHECK (confidence IN ('observed','inferred','needs_confirmation')),
  fitness          REAL,
  precision        REAL,
  support          INTEGER,
  counterexamples  INTEGER,
  deviation_id     TEXT REFERENCES deviations(id),
  superseded_by    TEXT REFERENCES hypotheses(id),
  model_version_id TEXT NOT NULL REFERENCES model_versions(id),
  created_at       TEXT NOT NULL,
  CHECK ((origin = 'rule') = (rule IS NOT NULL)),
  UNIQUE (portal_id, key)
) STRICT;
CREATE INDEX ix_hypotheses_portal_status ON hypotheses (portal_id, status);
CREATE UNIQUE INDEX ux_hypotheses_refuted_claim ON hypotheses (portal_id, kind, claim_hash)
  WHERE status = 'refuted';

CREATE TABLE hypothesis_evidence (
  hypothesis_id TEXT NOT NULL REFERENCES hypotheses(id),
  ref_id        TEXT NOT NULL REFERENCES entity_refs(id),
  role          TEXT NOT NULL CHECK (role IN ('supports','contradicts','context')),
  PRIMARY KEY (hypothesis_id, ref_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE hypothesis_tests (
  id              TEXT PRIMARY KEY,
  hypothesis_id   TEXT NOT NULL REFERENCES hypotheses(id),
  probe_suite_id  TEXT REFERENCES probe_suites(id),
  mark_id         TEXT REFERENCES marks(id),
  refutes_if_json TEXT NOT NULL CHECK (json_valid(refutes_if_json)),
  result_json     TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  verdict         TEXT CHECK (verdict IN ('pass','fail','inconclusive')),
  run_id          TEXT REFERENCES runs(id),
  created_at      TEXT NOT NULL
) STRICT;

CREATE TABLE hypothesis_events (
  id            TEXT PRIMARY KEY,
  hypothesis_id TEXT NOT NULL REFERENCES hypotheses(id),
  from_status   TEXT,
  to_status     TEXT NOT NULL,
  actor         TEXT NOT NULL CHECK (length(actor) > 0),  -- 'reconciler', 'ba-agent', 'crawler', a reviewer
  reason        TEXT NOT NULL CHECK (length(reason) > 0), -- required (R-78 (1))
  at            TEXT NOT NULL
) STRICT;

ALTER TABLE open_questions ADD COLUMN hypothesis_id TEXT REFERENCES hypotheses(id);
ALTER TABLE marks ADD COLUMN origin TEXT NOT NULL DEFAULT 'person' CHECK (origin IN ('person','planner'));
ALTER TABLE marks ADD COLUMN hypothesis_id TEXT REFERENCES hypotheses(id);
ALTER TABLE marks ADD COLUMN priority INTEGER CHECK (priority IS NULL OR priority BETWEEN 1 AND 6);
```

A hypothesis's status is derived from its events by deterministic code (Principle VI), never set directly.

### 10.2 Lifecycle

```text
proposed ──► testing ──► supported ──► confirmed ──► superseded
   │             │                                    (a newer claim replaces it,
   │             └──► refuted (kept forever)             e.g. a rule re-mined in a new epoch)
   └──► rejected (by a person, with a reason)
```

- Evidence is referenced, never copied.
- Refuted hypotheses stay; the tools refuse a claim equal to a refuted one (`claim_hash`).
- Several hypotheses may compete for one deviation until a test decides.
- An agent hypothesis needs at least one test with `refutes_if_json`, except `same_as`,
  `different_from` (decided by a person's label) and `process_boundary` (decided by a person).

### 10.3 Who confirms what

| Kind | Confirmed by | Why |
| --- | --- | --- |
| `structural_drift`, `flaky`, `context_variant`, `removed` after a build change, `replaces`, `decision_drift`, `coverage_gap` (closed by its visit), `parameter_role` from the reconciler | reconciler, derived fact | follows from evidence by a published rule; reversible in Review |
| `same_as`, `different_from` | a person's label | defines identity; feeds clustering constraints |
| `decision_rule` | a person, after its boundary tests pass | becomes documentation and a guard |
| `process_boundary`, `correlation_id`, `business_error_template` | a person | defines what is documented and cut out |
| `ab_test`, `backend_drift`, `deterministic_error`, `nondeterministic`, `removed` within one build, `ambiguous` | a person | needs interpretation |

A person can overturn any derived fact; the overturn is recorded with a reason and later
reconciles treat it as a constraint.

### 10.4 Tools

- **Crawler** (`mcp__pathfinder__*`): `add_rule_candidate` becomes `add_hypothesis` (kinds
  `decision_rule`, `ambiguous`, `business_error_template`; origin `agent`); `add_open_question` gains
  an optional hypothesis key.
- **BA** (`mcp__pathfinder-ba__*`): `list_hypotheses`, `get_hypothesis`, `propose_hypothesis`
  (requires a test unless exempt), `add_hypothesis_test`, `list_deviations`; `list_differing_states`
  and `propose_verdicts` are removed (spec 033's flow becomes hypotheses).
- **Review writes** (dashboard and chat): `pnpm model:decide` (confirm, reject, overturn, label a
  pair, set a parameter role), validated by Zod, appends `hypothesis_events` / `state_pair_labels`,
  like `docs:review`.

## 11. Decision mining

Decision rules are mined per decision point from attribute snapshots, written as DMN tables, and
kept true by boundary tests (de Leoni and Mannhardt; the crawler chooses its inputs).

### 11.1 Decision points and the observation table

A **decision point** is an action class whose executions, within one build epoch and environment,
lead to two or more (target screen, step result) pairs; validation counts. Two buttons are two
action classes, not a decision point.

One row per execution: target = (to screen, result); features = the attribute snapshot just before
the transition (persona, inputs, shown values, within the process instance and its journey
ancestors); missing stays missing; each date also gives its age in whole years and days at
capture; attributes constant across rows and text attributes with more than 20 distinct values
are dropped.

### 11.2 The miner app

`apps/miner` (uv, Python ≥ 3.12, scikit-learn ≥ 1.3, igraph, leidenalg). Not on the crawler's
runtime path.

- `uv run pathfinder-miner rules --store <db> --portal <id> --out rules.json`: reads the store
  read-only (`mode=ro`), builds the tables, mines, prints JSON matching the Zod schema
  `MinedRulesFile` (`@pathfinder/core`).
- `uv run pathfinder-miner communities --graph graph.json --out communities.json` (§ 13.3).
- `pnpm model:import <file>` validates and writes `decision_rule` hypotheses and their boundary
  tests; the reconciler calls the miner and the import as step 10 when Python is available, and
  reports "miner not run" otherwise.

### 11.3 Learning

1. `DecisionTreeClassifier(criterion="entropy", max_depth=4, min_samples_leaf=max(2, ceil(0.02 * rows)), random_state=0)`.
2. Each root-to-leaf path is a rule; paths with the same target merge; at most 7 conditions per rule.
3. **Overlap step:** for each leaf, its misclassified rows; if at least `min_samples_leaf` and one
   other target is more than half of them, fit a second tree on them and add its rules as alternatives.
4. **Score:** fitness = share of rows whose actual target the rules allow; precision = mean of
   1 / (targets allowed).
5. Mine only when every target has ≥ 5 rows; otherwise a `decision_rule` hypothesis "needs data"
   with input-variation probes (planner priority 5).

An overlap is a signal; R4 and R5 replays tell why: the same branch every time means data the
crawler cannot see (credit check, time of day); alternating branches mean randomness or A/B.

### 11.4 DMN

Stored in `claim_json`, exported as DMN 1.3 XML with the SRS and the process export (R-68):

```json
{
  "decision_point": {"screen": "SC-0012", "action": "button|oblicz składkę|main>form \"Dane kierowcy\"|"},
  "hit_policy": "U",
  "inputs": [
    {"name": "derived.driver_birth_date.age_years", "type": "number"},
    {"name": "persona.segment", "type": "enum"}
  ],
  "outputs": [{"name": "next", "type": "screen"}],
  "rules": [
    {"when": {"derived.driver_birth_date.age_years": "< 18"}, "then": "SC-0040 exit-process-page"},
    {"when": {"derived.driver_birth_date.age_years": ">= 18", "persona.segment": "premium"}, "then": "SC-0015"},
    {"when": {"derived.driver_birth_date.age_years": ">= 18", "persona.segment": "standard"}, "then": "SC-0014"}
  ],
  "fitness": 0.98, "precision": 1.0, "rows": 42
}
```

Hit policy U when rules do not overlap; C when they do, with "the portal chooses between these on
data the crawler does not record".

### 11.5 Boundary tests

- Numeric `x < t`: inputs at t − δ, t, t + δ; δ = the attribute's smallest observed step (1 for
  integers and currency units, 1 day for dates, 1 year for derived ages).
- Categorical: one test per value seen.
- Other attributes keep a reference row's values; the test replays that row's journey prefix with
  the changed inputs (headless driver).
- `refutes_if_json` = any target the rule does not predict.

The tests form a probe suite for owner review, as today; once they pass and the rule is confirmed,
the suite is the rule's regression suite.

### 11.6 Decision drift

- A new build epoch of a scope rendering the decision point, or an endpoint schema change on its
  transitions → the planner reruns the rule's regression suite (priority 1).
- Every confirmed rule's suite also runs weekly by default (`pnpm model:regress <portal>`; Q-3).
- A failed test is a `rule_mismatch`; R8 confirms `decision_drift`, supersedes the rule and re-mines.
- After mining, guards along each path of a process are intersected per attribute; paths whose
  guards cannot all hold become `ambiguous` hypotheses.

## 12. Agents and the chat

| Agent | Change |
| --- | --- |
| crawler (`.claude/agents/crawler.md`) | `add_hypothesis` replaces `add_rule_candidate`; no other change: it maps and traces; the driver does replays |
| BA (`.claude/agents/ba.md`, `ba-practice`) | works from the model (screens, model transitions, processes, rules) instead of per-run graphs; writes hypotheses with tests for `ambiguous` items; names process proposals; cites through `entity_refs`; documents rules from confirmed DMN tables. **Waits for the owner's R-77 review** (Q-1) |
| chat orchestrator (`apps/chat/agents/orchestrator.md`) | grouping tools become "name these proposals"; new tools to read changes and hypotheses; reconcile and probe runs as actions the owner can start |

## 13. Processes

A process is a trigger, member screens with their transitions, and outcomes; the navigation that
reaches the trigger is not part of it.

### 13.1 Definition

| Part | Definition |
| --- | --- |
| Trigger | a model transition from a screen outside the process into its start screen, through a non-global action class; several allowed |
| Start screen | the target of a trigger |
| Member screens | screens reached from the start screen before an outcome, through non-global transitions |
| Outcomes | completed (confirmation), exited (exit page), error (`business_error`), abandoned (left through global navigation) |
| Entry path | how a journey reached the trigger; kept on instances, never documented as steps |
| Preconditions | what must hold to reach the trigger (e.g. logged in as a role); login is its own process and a precondition |

Leaving through global navigation ends an instance as abandoned: the home page never becomes step
1 (R-77), and processes behind the login wall stay their own.

### 13.2 Boundary signals

1. **Correlation ids:** within a journey, a value that first appears in a response body and later in
   a request URL or body (keys ending in id, number or uuid, or ≥ 8 high-entropy characters).
   Screens between first and last use belong to one instance. Values stored hashed.
2. **Mounts:** screens rendered by the same micro-frontend scope.
3. **Endpoint families:** endpoint templates grouped by path prefix up to the first parameter.
4. **Form steps:** today's `form_steps` chains.

### 13.3 Proposals

w(a, b) = 3 × shared correlation id + 2 × Jaccard(scopes) + 2 × Jaccard(endpoint families) + 1 ×
same form + 1 × direct non-global transition, over pairs of non-global screens sharing a transition
or a signal. Weights are starting values, tuned with the grouping eval (spec 038).

The reconciler writes the weighted graph; the miner runs Leiden (seed 0, resolution 1.0); the
reconciler derives each community's triggers, start screen and outcomes (§ 13.1) and stores it as a
`process_boundary` hypothesis plus a `grouping_suggestions` row. The BA agent (or the chat
assistant) names each and writes the reason; it is saved as a process proposal directly (R-78
direction, constitution 6.0.0). A person accepts it into `ba_processes`, edits it, or rejects it with
a reason. A later regroup never undoes a person's edit or rejection: those are constraints (R-78 (d)).

Each proposal carries its scopes and endpoint families as a hint for the cut; where the
micro-frontend boundary and the service boundary disagree, it says so.

### 13.4 Schema (migration 0036)

```sql
CREATE TABLE correlation_ids (
  id                  TEXT PRIMARY KEY,
  journey_id          TEXT NOT NULL REFERENCES journeys(id),
  key_path            TEXT NOT NULL,          -- 'response:$.quote.id'
  value_hash          TEXT NOT NULL,
  endpoint_family     TEXT NOT NULL,
  first_transition_id TEXT NOT NULL REFERENCES transitions(id),
  last_transition_id  TEXT NOT NULL REFERENCES transitions(id)
) STRICT;

CREATE TABLE process_instances (
  id                    TEXT PRIMARY KEY,
  process_id            TEXT NOT NULL REFERENCES ba_processes(id),
  journey_id            TEXT NOT NULL REFERENCES journeys(id),
  trigger_transition_id TEXT NOT NULL REFERENCES transitions(id),
  last_transition_id    TEXT NOT NULL REFERENCES transitions(id),
  outcome               TEXT NOT NULL CHECK (outcome IN
                          ('completed','exited','error','abandoned','incomplete')),
  outcome_screen_id     TEXT REFERENCES screens(id),
  correlation_id        TEXT REFERENCES correlation_ids(id),
  model_version_id      TEXT NOT NULL REFERENCES model_versions(id)
  -- 0043 (ALTER TABLE, T079): screens_json TEXT, JSON array of the model screen ids walked,
  -- start screen first (the trace variant); NULL on rows written before 0043.
) STRICT;

ALTER TABLE ba_processes ADD COLUMN start_screen_id TEXT REFERENCES screens(id);
ALTER TABLE ba_processes ADD COLUMN boundary_hypothesis_id TEXT REFERENCES hypotheses(id);

CREATE TABLE process_triggers (
  process_id          TEXT NOT NULL REFERENCES ba_processes(id),
  model_transition_id TEXT NOT NULL REFERENCES model_transitions(id),
  PRIMARY KEY (process_id, model_transition_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE process_explorations (
  id             TEXT PRIMARY KEY,
  process_id     TEXT NOT NULL REFERENCES ba_processes(id),
  epoch_set      TEXT NOT NULL CHECK (json_valid(epoch_set) AND json_type(epoch_set) = 'array'),
  depth          INTEGER NOT NULL CHECK (depth >= 0),
  random_walks   INTEGER NOT NULL CHECK (random_walks >= 0),
  new_deviations INTEGER NOT NULL CHECK (new_deviations >= 0),
  completed_at   TEXT NOT NULL
) STRICT;

-- one concept: exactly one PROC record per process
ALTER TABLE doc_records ADD COLUMN process_id TEXT REFERENCES ba_processes(id);
CREATE UNIQUE INDEX ux_doc_records_one_proc ON doc_records (process_id) WHERE kind = 'process';
CREATE TRIGGER doc_records_proc_needs_process BEFORE INSERT ON doc_records
  WHEN NEW.kind = 'process' AND NEW.process_id IS NULL
  BEGIN SELECT RAISE(ABORT, 'PROC record needs process_id'); END;
-- the same check BEFORE UPDATE; db-admin uses the real kind value of PROC records

ALTER TABLE process_variants RENAME TO process_models;
ALTER TABLE process_variant_revisions RENAME TO process_model_revisions;
```

Trace variants (distinct screen sequences) are computed from process instances on read.

| v1 | v2 | Layer |
| --- | --- | --- |
| trace `processes` + `process_steps` | `trace_runs` + journeys + transitions | A |
| `ba_processes` (PRC-nnn) | the process | M |
| PROC doc record | its documentation, exactly one | B |
| `process_variants` (as-is, to-be) | `process_models` | B |

## 14. The query loop

### 14.1 Planner priorities

| Priority | Source | Probe |
| --- | --- | --- |
| 1 | a build epoch changed for a scope with confirmed rules | those rules' regression suites |
| 2 | rules R1, R4, R5 | replays |
| 3 | hypotheses in `testing` | their tests |
| 4 | model transitions `untested` in the current epoch, on screens with anchored docs | coverage visits |
| 5 | decision points with < 5 rows per target | input-variation probes |
| 6 | processes not explored in the current epoch | counterexample search |

Within a priority, items with more anchored doc records go first. The planner writes `marks` with
origin `planner` and a priority; probe runs (§ 9) consume them. Coverage visits to screens the
driver cannot reach by replay (no recorded path) become a focused map run for the agent, shown to
the owner as a suggestion with its estimated cost.

### 14.2 Stopping rule

For a process in the current build epoch:

1. **Depth 1:** every action class of every member screen executed at least once per audience in scope.
2. **Depth 2:** every pair of consecutive action classes (a, then b on a's target) executed once.
3. **Random walks:** 50 walks of up to 15 steps inside the process, inputs sampled from observed values.

Explored when a full pass finds no new deviation. The documentation states the bound: "Explored to
depth 2 plus 50 random walks on builds shell 3e1a and quote-mfe 9c21; no counterexamples." All of it
runs on the headless driver.

## 15. References and anchors

`entity_refs` (§ 5.9) is the only way anything points at evidence or model objects:

- `doc_evidence_links`, `amendments` and every `about_ref` column carry `ref_id REFERENCES
  entity_refs(id)` from the start (v1's polymorphic `target_id` / `about_ref` columns are dropped).
- **Anchors:** an amendment anchor is a ref with `screen_id` and `element_key`.
- **Review triggers:** an anchor needs review only when its screen is merged, split or retired
  (the lineage row is the reason), or its element key is `not_seen_since` in the current epoch for
  every audience. A new member never pushes an amendment to `needs_reanchor`.
- **Confidence:** a claim labelled observed links to observations or transitions; inferred links to
  a confirmed hypothesis; needs confirmation links to an unconfirmed one.

## 16. Dashboard and export

Functional pages land per milestone in Salvage Yard; the UX designer's consultation
(`ux-requirements.md`) decides the final information architecture. The export (`docs:export`,
`docs:process-export`) gains: DMN files per confirmed rule, each process's
trigger, outcomes and explored bound, endpoint contracts by schema hash, and the model version
it was built from.

## 17. Removed in v2

Nothing is migrated (C-1). Dropped or replaced:

| Removed | Replaced by |
| --- | --- |
| `edges` (and every `edge_id`: `network_calls`, `page_visits`, `process_steps`, `probe_outcomes`) | `transitions` (`transition_id`) |
| `page_visits` | `observations` (renamed) |
| `processes`, `process_steps` | `trace_runs`, journeys, transitions, attribute writes |
| `reconciliations` | hypotheses |
| `rule_candidates` | `decision_rule` hypotheses |
| `screens.merged_into`, `screens.cluster_id`, the `(portal_id, route_template, cluster_id)` key | model membership, lineage, `same_as` |
| `states.screen_id` / `screen_rev` as the authority | `screen_members`; renamed `provisional_*` |
| polymorphic `target_id` / `about_ref` / `target` columns | `ref_id` → `entity_refs` |
| `process_variants`, `process_variant_revisions` | renamed `process_models`, `process_model_revisions` |
| fingerprint v1 | v2 |
| BA tools `list_differing_states`, `propose_verdicts`; crawler tool `add_rule_candidate` | hypothesis tools |
| dashboard `queries_map.py` lifting, `queries_reconcile.py`, `queries_differing.py` | read models over Layer M |

All store data is deleted at the start of M0 (plan § Data reset).

## 18. Constitution amendment (6.0.0, MAJOR)

MAJOR because it redefines the data model and Principle III's outputs. Proposed changes:

1. **Technical Constraints ▸ Data model:** "Three layers: A (evidence, append-only), M (the portal
   model, rebuilt by deterministic code from A plus recorded decisions, with stable ids), and B (the
   BA deliverable). Interpretation (deviations, hypotheses, decision rules, process proposals)
   references A and M and never edits them."
2. **New, under Principle VI: Derived facts.** "The reconciler may record facts that follow from
   evidence by a published rule (R1–R8, and clustering under person-made labels) without a person's
   approval. Each derived fact names its rule and its evidence, appears in Review, and can be
   overturned by a person. An overturn is recorded with a reason and binds later reconciles.
   Everything else, including any agent hypothesis, grouping, rule wording or merge, stays a
   proposal until a person confirms it. Agents may save proposals directly. The list of rules that
   may write derived facts is part of this constitution; adding one is an amendment."
3. **Principle III:** the crawler emits "a few flagged hypotheses (decision rules, ambiguous
   behaviour)" instead of `rule_candidates`; replays and probes may be run by deterministic code
   (the headless driver) through the same gated tools.
4. **Technical Constraints ▸ Python:** "a Python worker MAY compute analysis (decision mining,
   community detection) from a read-only store connection; its output is written only through a
   TypeScript command that validates it with Zod."
5. **Logging:** "every skip, merge and split is auditable via a decision log" is satisfied by
   `screen_lineage` and `hypothesis_events`.

## 19. Evals and gates

### 19.1 Scenario switchboard

The reference portal (`packages/reference-portal`) gets flags (env `REFERENCE_SCENARIOS=a,b`) that
each inject one known change; ground truth per scenario in `apps/crawler/evals/ground-truth/`
(YAML, G-34). Each scenario runs as a **gate** (headless driver, deterministic) in the slow tier.

| Scenario | Injection | Expected |
| --- | --- | --- |
| Deployment | new bundle hash plus one added form field | `structural_drift`, derived, epoch boundary at the switch |
| Persona variant | a button only for segment premium | `context_variant`; a decision rule on `persona.segment` |
| A/B test | banner text for 50 % of sessions, by cookie | `ab_test` naming the cookie |
| Flaky page | HTTP 500 on 20 % of loads of one page | `flaky`, derived |
| Deterministic error | HTTP 500 for one input value | `deterministic_error`, waiting for a person |
| Moved link | a link moves from the body into the menu | `replaces`, derived; one screen pair on the Map |
| Renamed button | label changes, position stays | `replaces` |
| Removed link | a link removed with a deployment | `removed`, derived; status retired |
| Not visited | a screen the run is told to skip | `untested`, never removed |
| Threshold rule | exit page when age < 18 | rule with t = 18; boundary tests at 17, 18, 19 |
| Overlapping rule | 30 % of standard customers to manual review at random | hit policy C plus `nondeterministic` |
| Rule drift | threshold moves to 21 with a deployment | `rule_mismatch`, then `decision_drift` within one run |
| Repeated rows | "add another driver" adds rows | one screen; no new members once rows collapse |
| Numbered sections | `/sekcja/1` … `/sekcja/6` with different forms | path parameter is identity; six screens |

### 19.2 Reconciler gates (unit and property tests in `@pathfinder/model`)

- **Order independence:** shuffle state insertion 10 times; membership and ids identical.
- **Idempotence:** reconcile twice; the second pass writes nothing.
- **Rebuild:** drop model tables except the registry; rebuild; ids identical.
- **History independence:** runs one by one vs all at once; identical membership.

### 19.3 Eval trials (LLM)

- `pnpm eval reference-insurer` (crawler + BA) at or above the v1 baseline (`data/evals/reference-insurer/baseline.json`, archived at M0) on screens, processes, rules, export.
- Grouping eval (`apps/chat/evals`) at or above its baseline.
- One trial per milestone from M2; ~$7 a trial.

## 20. Risks

- **No build marker:** epochs come from persistence (a structural change holding for one audience
  over two runs, the old form not returning); slower, less certain. The portal is flagged.
- **Independent deployments:** epochs per scope; a shared library changing several scopes yields
  several drift facts with one boundary.
- **Backend-only changes:** endpoint schemas and weekly regression catch part of them.
- **Chosen inputs:** rules describe logic; branch frequencies mean nothing and are never documented.
- **Hidden data:** shows as overlapping rules; documented as "decided on data not visible from the
  UI", never guessed.
- **Starting values:** boundary weights, 60 % global share, depth 2, 50 walks, τ 0.9: tuned by the evals.
- **Element-key churn:** a renamed heading changes every key under it; R6's `replaces` pairs them
  per screen pair, and the Repeated rows / Renamed button scenarios watch it.
- **Wrong derived facts hide defects:** every derived fact is listed in Review with its rule; the
  switchboard gates guard each rule.
- **One long branch:** see plan § Risks.
- **Personal data:** synthetic personas; correlation ids hashed; real accounts would need hashing
  of text attribute values and a retention period.
- **Volume:** `attribute_writes` grows with every fill; model tables stay small.

## 21. The 12 issues

| # | Issue | Resolved by |
| --- | --- | --- |
| 1 | Cluster ids not stable across scans | § 6.1–6.2 |
| 2 | Whole-tree hash; revisions don't say why | § 5.4, § 8 |
| 3 | Route identity too coarse | § 6.4 |
| 4 | Edges never reconciled; absence unclear | § 6.5–6.6 |
| 5 | Screen graph not stored | § 6.5, § 6.8 |
| 6 | Three meanings of process | § 13 |
| 7 | Process start and end undefined | § 13.1 |
| 8 | Grouping only on request; reasons lost | § 13.3, `hypothesis_events` |
| 9 | Reconciliation only per node | § 8, § 10 |
| 10 | Polymorphic references; fragile anchors | § 15 |
| 11 | Identity depends on visit order | § 6.1, § 19.2 |
| 12 | Much evidence per state, little meaning per edge | § 5.7, § 6.5 |

## 22. References

The papers and what each contributes are listed in the source (`user_input/system_design/Design.md`
§ References): Yandrapally et al. ICSE 2020; Corazza et al. ESEM 2021; de Leoni and Mannhardt;
Mannhardt et al. CAiSE 2016; Gallego-Fontenla et al. (C2D2); Scheibel and Rinderle-Ma 2023;
Isberner et al. CAV 2015 (LearnLib); OMG DMN 1.3.
