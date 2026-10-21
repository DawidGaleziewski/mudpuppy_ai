-- 0031_interpretation (up): MudPuppy 2.0 interpretation (spec 039 M3, design § 8, § 10, § 15): deviations
-- (every place a new model version does not fit the previous one), hypotheses (every testable claim:
-- derived facts the reconciler applies by a published rule, and proposals that wait for a person),
-- their evidence, tests and events, and `entity_refs`, the typed reference every new pointer at
-- evidence or model objects uses. `reconciliations` and `rule_candidates` stay until their readers move
-- to hypotheses (T050); nothing here references them.

-- A typed reference with real foreign keys: exactly one target, an element key only with a screen.
CREATE TABLE entity_refs (
  id                  TEXT PRIMARY KEY,
  page_visit_id       TEXT REFERENCES page_visits(id),       -- an observation
  edge_id             TEXT REFERENCES edges(id),             -- a transition
  state_id            TEXT REFERENCES states(id),
  screen_id           TEXT REFERENCES model_screens(id),
  action_class_id     TEXT REFERENCES action_classes(id),
  model_transition_id TEXT REFERENCES model_transitions(id),
  process_id          TEXT REFERENCES ba_processes(id),
  hypothesis_id       TEXT REFERENCES hypotheses(id),
  network_call_id     TEXT REFERENCES network_calls(id),
  element_key         TEXT CHECK (element_key IS NULL OR length(element_key) > 0),
  CHECK ((page_visit_id IS NOT NULL) + (edge_id IS NOT NULL) + (state_id IS NOT NULL)
       + (screen_id IS NOT NULL) + (action_class_id IS NOT NULL)
       + (model_transition_id IS NOT NULL) + (process_id IS NOT NULL)
       + (hypothesis_id IS NOT NULL) + (network_call_id IS NOT NULL) = 1),
  CHECK (element_key IS NULL OR screen_id IS NOT NULL)
) STRICT;

CREATE TABLE deviations (
  id                       TEXT PRIMARY KEY,
  portal_id                TEXT NOT NULL CHECK (length(portal_id) > 0),
  model_version_id         TEXT NOT NULL REFERENCES model_versions(id),
  kind                     TEXT NOT NULL CHECK (kind IN ('new_screen','new_member','new_action',
                             'missing_action','target_mismatch','result_mismatch','rule_mismatch')),
  subject_key              TEXT NOT NULL CHECK (length(subject_key) > 0),   -- dedup key
  screen_id                TEXT REFERENCES model_screens(id),
  state_id                 TEXT REFERENCES states(id),
  action_class_id          TEXT REFERENCES action_classes(id),
  before_json              TEXT CHECK (before_json IS NULL OR json_valid(before_json)),
  after_json               TEXT CHECK (after_json IS NULL OR json_valid(after_json)),
  changed_components       TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(changed_components) AND json_type(changed_components) = 'array'),
  context_diff             TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(context_diff) AND json_type(context_diff) = 'object'),
  status                   TEXT NOT NULL CHECK (status IN ('open','waiting_test','explained')),
  created_at               TEXT NOT NULL,
  UNIQUE (portal_id, kind, subject_key)
) STRICT;
CREATE INDEX ix_deviations_portal_status ON deviations (portal_id, status);

-- A later model version that showed the same deviation again: evidence on the first row.
CREATE TABLE deviation_occurrences (
  deviation_id     TEXT NOT NULL REFERENCES deviations(id),
  model_version_id TEXT NOT NULL REFERENCES model_versions(id),
  PRIMARY KEY (deviation_id, model_version_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE hypotheses (
  id               TEXT PRIMARY KEY,
  key              TEXT NOT NULL CHECK (key GLOB 'H-[0-9][0-9][0-9][0-9]*'),     -- cited by people
  portal_id        TEXT NOT NULL CHECK (length(portal_id) > 0),
  kind             TEXT NOT NULL CHECK (kind IN (
                     'same_as','different_from','parameter_role',
                     'structural_drift','backend_drift','decision_drift',
                     'context_variant','ab_test','flaky','nondeterministic','deterministic_error',
                     'removed','replaces','coverage_gap','business_error_template',
                     'decision_point','decision_rule','process_boundary','correlation_id','ambiguous')),
  claim            TEXT NOT NULL CHECK (length(claim) > 0),          -- one sentence a BA can read
  claim_json       TEXT NOT NULL CHECK (json_valid(claim_json)),
  claim_hash       TEXT NOT NULL CHECK (length(claim_hash) = 64),
  origin           TEXT NOT NULL CHECK (origin IN ('rule','agent','person')),
  rule             TEXT CHECK (rule IS NULL OR rule GLOB 'R[1-8]'),
  derived          INTEGER NOT NULL DEFAULT 0 CHECK (derived IN (0,1)),  -- applied without a person
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
  CHECK (derived = 0 OR origin = 'rule'),
  UNIQUE (portal_id, key)
) STRICT;
CREATE INDEX ix_hypotheses_portal_kind ON hypotheses (portal_id, kind);
CREATE INDEX ix_hypotheses_claim ON hypotheses (portal_id, kind, claim_hash);

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
  inputs_json     TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(inputs_json) AND json_type(inputs_json) = 'object'),
  refutes_if_json TEXT NOT NULL CHECK (json_valid(refutes_if_json)),
  result_json     TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  verdict         TEXT CHECK (verdict IS NULL OR verdict IN ('pass','fail','inconclusive')),
  run_id          TEXT REFERENCES runs(id),
  created_at      TEXT NOT NULL
) STRICT;
CREATE INDEX ix_hypothesis_tests_hypothesis ON hypothesis_tests (hypothesis_id);

-- Every status change, with its reason (R-78 (1)); a hypothesis's status is derived from these.
CREATE TABLE hypothesis_events (
  id            TEXT PRIMARY KEY,
  hypothesis_id TEXT NOT NULL REFERENCES hypotheses(id),
  from_status   TEXT CHECK (from_status IS NULL OR from_status IN
                  ('proposed','testing','supported','refuted','confirmed','rejected','superseded')),
  to_status     TEXT NOT NULL CHECK (to_status IN
                  ('proposed','testing','supported','refuted','confirmed','rejected','superseded')),
  actor         TEXT NOT NULL CHECK (length(actor) > 0),    -- 'reconciler', 'ba-agent', 'crawler' or a reviewer
  reason        TEXT NOT NULL CHECK (length(reason) > 0),
  at            TEXT NOT NULL
) STRICT;
CREATE INDEX ix_hypothesis_events_hypothesis ON hypothesis_events (hypothesis_id, at);

ALTER TABLE marks ADD COLUMN origin TEXT NOT NULL DEFAULT 'person' CHECK (origin IN ('person','planner'));
ALTER TABLE marks ADD COLUMN hypothesis_id TEXT REFERENCES hypotheses(id);
ALTER TABLE marks ADD COLUMN priority INTEGER CHECK (priority IS NULL OR priority BETWEEN 1 AND 6);
ALTER TABLE open_questions ADD COLUMN hypothesis_id TEXT REFERENCES hypotheses(id);
