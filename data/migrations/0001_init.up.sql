-- 0001_init (up): Layer A schema for crawler map mode (R-04, T014).
-- Conventions: see data/schema/README.md. Runner (T015) sets PRAGMAs and wraps this file in a transaction.
-- Ids: server-generated UUIDv7 text. Timestamps: UTC ISO 8601 text, millisecond precision, 'Z' suffix.
-- evidence_ref: '<sha256>.<ext>' filename under data/evidence/ (never empty).

CREATE TABLE runs (
  id                  TEXT PRIMARY KEY,
  portal_id           TEXT NOT NULL,
  persona_id          TEXT NOT NULL,
  mode                TEXT NOT NULL,  -- 'map' today; deliberately no CHECK so 'trace' needs no migration (FR-022); Zod enforces
  environment         TEXT NOT NULL,
  env_version_or_date TEXT NOT NULL,
  seed_id             TEXT,
  viewport            TEXT NOT NULL,
  locale              TEXT NOT NULL,
  browser             TEXT NOT NULL,
  config_snapshot     TEXT NOT NULL CHECK (json_valid(config_snapshot)),
  status              TEXT NOT NULL DEFAULT 'running'
                      CHECK (status IN ('running','completed','stopped_warning','interrupted')),
  warning             TEXT,           -- run-level warning (block/CAPTCHA, FR-008); required when stopped_warning
  steps_used          INTEGER NOT NULL DEFAULT 0 CHECK (steps_used >= 0),
  elapsed_ms          INTEGER NOT NULL DEFAULT 0 CHECK (elapsed_ms >= 0),  -- accumulated active time, excludes downtime between resumes
  max_depth_reached   INTEGER NOT NULL DEFAULT 0 CHECK (max_depth_reached >= 0),
  started_at          TEXT NOT NULL,
  ended_at            TEXT,
  coverage            TEXT CHECK (coverage IS NULL OR json_valid(coverage)),
  CHECK (status <> 'stopped_warning' OR warning IS NOT NULL)
) STRICT;

CREATE TABLE states (
  id             TEXT PRIMARY KEY,
  fingerprint    TEXT NOT NULL,
  cluster_id     TEXT NOT NULL,
  route_template TEXT NOT NULL,
  title          TEXT NOT NULL,
  evidence_ref   TEXT NOT NULL CHECK (length(evidence_ref) > 0),
  confidence     TEXT NOT NULL CHECK (confidence IN ('observed','inferred','needs_confirmation')),
  stabilization  TEXT NOT NULL CHECK (stabilization IN ('settled','never_stabilized')),
  first_seen_run TEXT NOT NULL REFERENCES runs(id),
  created_at     TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX ux_states_fingerprint ON states(fingerprint);
CREATE INDEX ix_states_cluster_id ON states(cluster_id);

-- States are global by fingerprint; this records which run/persona saw which state.
-- PK (run_id, state_id) serves get_known_states(run_id) and dedupes repeat sightings within a run.
CREATE TABLE state_observations (
  run_id       TEXT NOT NULL REFERENCES runs(id),
  state_id     TEXT NOT NULL REFERENCES states(id),
  persona_id   TEXT NOT NULL,
  evidence_ref TEXT NOT NULL CHECK (length(evidence_ref) > 0),
  observed_at  TEXT NOT NULL,
  PRIMARY KEY (run_id, state_id)
) STRICT, WITHOUT ROWID;

-- Server-issued action ids (navigate/act output, get_next_frontier_item); the only ids act() accepts.
CREATE TABLE actions (
  id              TEXT PRIMARY KEY,   -- this IS the action_id
  run_id          TEXT NOT NULL REFERENCES runs(id),
  state_id        TEXT NOT NULL REFERENCES states(id),  -- state the action was extracted from
  role            TEXT NOT NULL,
  accessible_name TEXT,
  action_json     TEXT NOT NULL CHECK (json_valid(action_json)),
  safety_class    TEXT NOT NULL CHECK (safety_class IN ('read','mutating','destructive','external-side-effect')),
  allowed         INTEGER NOT NULL CHECK (allowed IN (0,1)),
  skip_reason     TEXT,
  created_at      TEXT NOT NULL,
  CHECK (allowed = 1 OR skip_reason IS NOT NULL)
) STRICT;

CREATE TABLE edges (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES runs(id),
  from_state    TEXT NOT NULL REFERENCES states(id),
  to_state      TEXT REFERENCES states(id),  -- nullable: skipped edges and actions that led nowhere
  action_json   TEXT NOT NULL CHECK (json_valid(action_json)),
  safety_class  TEXT NOT NULL CHECK (safety_class IN ('read','mutating','destructive','external-side-effect')),
  status        TEXT NOT NULL CHECK (status IN ('executed','skipped')),
  evidence_ref  TEXT NOT NULL CHECK (length(evidence_ref) > 0),
  confidence    TEXT NOT NULL CHECK (confidence IN ('observed','inferred','needs_confirmation')),
  error         TEXT CHECK (error IS NULL OR json_valid(error)),
  stabilization TEXT NOT NULL CHECK (stabilization IN ('settled','never_stabilized')),
  created_at    TEXT NOT NULL
) STRICT;
CREATE INDEX ix_edges_run_id ON edges(run_id);

CREATE TABLE forms (
  id           TEXT PRIMARY KEY,
  run_id       TEXT NOT NULL REFERENCES runs(id),
  state_id     TEXT NOT NULL REFERENCES states(id),
  fields_json  TEXT NOT NULL CHECK (json_valid(fields_json)),
  evidence_ref TEXT NOT NULL CHECK (length(evidence_ref) > 0),
  confidence   TEXT NOT NULL CHECK (confidence IN ('observed','inferred','needs_confirmation')),
  created_at   TEXT NOT NULL
) STRICT;

-- Deliberately NO evidence_ref/confidence: the record itself is shape-only observation (R-04 decision).
CREATE TABLE network_calls (
  id             TEXT PRIMARY KEY,
  run_id         TEXT NOT NULL REFERENCES runs(id),
  edge_id        TEXT REFERENCES edges(id),  -- null when observed passively on state load
  method         TEXT NOT NULL,
  url_template   TEXT NOT NULL,
  status         INTEGER NOT NULL,
  req_schema     TEXT NOT NULL CHECK (json_valid(req_schema)),  -- shape only, no PII
  res_schema     TEXT NOT NULL CHECK (json_valid(res_schema)),  -- shape only, no PII
  console_errors TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(console_errors) AND json_type(console_errors) = 'array'),
  created_at     TEXT NOT NULL
) STRICT;

-- Server-owned frontier: pending queue + done + skipped in one table. Visited set = state_observations + status 'done'.
CREATE TABLE frontier (
  id           TEXT PRIMARY KEY,
  run_id       TEXT NOT NULL REFERENCES runs(id),
  state_id     TEXT NOT NULL REFERENCES states(id),
  action_id    TEXT REFERENCES actions(id),  -- null for navigate() refusals that have no extracted action
  action_json  TEXT NOT NULL CHECK (json_valid(action_json)),
  safety_class TEXT NOT NULL CHECK (safety_class IN ('read','mutating','destructive','external-side-effect')),
  status       TEXT NOT NULL CHECK (status IN ('pending','done','skipped_unsafe','out_of_scope','denylisted','budget_reached','unreachable')),
  priority     INTEGER NOT NULL DEFAULT 0,   -- higher first; ties broken by id (UUIDv7 = FIFO)
  depth        INTEGER NOT NULL DEFAULT 0 CHECK (depth >= 0),
  reason       TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  CHECK (status IN ('pending','done') OR reason IS NOT NULL)
) STRICT;
-- get_next_frontier_item: WHERE run_id=? AND status='pending' ORDER BY priority DESC, id; also covers run_id lookups.
CREATE INDEX ix_frontier_queue ON frontier(run_id, status, priority DESC, id);

CREATE TABLE open_questions (
  id         TEXT PRIMARY KEY,
  run_id     TEXT NOT NULL REFERENCES runs(id),
  text       TEXT NOT NULL,
  about_ref  TEXT NOT NULL,  -- polymorphic (state/edge/form id), validated by the tool, no FK
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','addressed')),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE rule_candidates (
  id           TEXT PRIMARY KEY,
  run_id       TEXT NOT NULL REFERENCES runs(id),
  text         TEXT NOT NULL,
  about_ref    TEXT NOT NULL,
  evidence_ref TEXT NOT NULL CHECK (length(evidence_ref) > 0),
  confidence   TEXT NOT NULL CHECK (confidence = 'inferred'),
  created_at   TEXT NOT NULL
) STRICT;

-- FR-021 decision log (persisted in SQLite; pino also mirrors each entry to stdout).
CREATE TABLE decision_log (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL REFERENCES runs(id),
  kind        TEXT NOT NULL CHECK (kind IN ('skip','refuse','merge','split','warning')),
  rule        TEXT,             -- rule/cap that applied
  reason      TEXT NOT NULL,
  subject_ref TEXT,             -- state/edge/frontier/action id concerned
  detail_json TEXT CHECK (detail_json IS NULL OR json_valid(detail_json)),
  created_at  TEXT NOT NULL
) STRICT;
