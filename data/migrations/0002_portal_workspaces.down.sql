-- 0002_portal_workspaces (down): reverse in the order in data-model.md. Each rebuild fails (rolling back
-- the whole migration, since the runner applies it in one transaction) if the current data cannot be
-- represented in the old shape: a decision_log row of kind 'note', a frontier row of status
-- 'robots_disallowed', or two portals sharing a states.fingerprint. That is the safe outcome.

DROP TABLE portal_data_log;
DROP TABLE robots_policies;

CREATE TABLE decision_log_old (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL REFERENCES runs(id),
  kind        TEXT NOT NULL CHECK (kind IN ('skip','refuse','merge','split','warning')),
  rule        TEXT,
  reason      TEXT NOT NULL,
  subject_ref TEXT,
  detail_json TEXT CHECK (detail_json IS NULL OR json_valid(detail_json)),
  created_at  TEXT NOT NULL
) STRICT;

INSERT INTO decision_log_old
  (id, run_id, kind, rule, reason, subject_ref, detail_json, created_at)
SELECT id, run_id, kind, rule, reason, subject_ref, detail_json, created_at
FROM decision_log;

DROP TABLE decision_log;
ALTER TABLE decision_log_old RENAME TO decision_log;

CREATE TABLE frontier_old (
  id           TEXT PRIMARY KEY,
  run_id       TEXT NOT NULL REFERENCES runs(id),
  state_id     TEXT NOT NULL REFERENCES states(id),
  action_id    TEXT REFERENCES actions(id),
  action_json  TEXT NOT NULL CHECK (json_valid(action_json)),
  safety_class TEXT NOT NULL CHECK (safety_class IN ('read','mutating','destructive','external-side-effect')),
  status       TEXT NOT NULL CHECK (status IN ('pending','done','skipped_unsafe','out_of_scope','denylisted','budget_reached','unreachable')),
  priority     INTEGER NOT NULL DEFAULT 0,
  depth        INTEGER NOT NULL DEFAULT 0 CHECK (depth >= 0),
  reason       TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  CHECK (status IN ('pending','done') OR reason IS NOT NULL)
) STRICT;

INSERT INTO frontier_old
  (id, run_id, state_id, action_id, action_json, safety_class, status, priority, depth, reason, created_at, updated_at)
SELECT id, run_id, state_id, action_id, action_json, safety_class, status, priority, depth, reason, created_at, updated_at
FROM frontier;

DROP TABLE frontier;
ALTER TABLE frontier_old RENAME TO frontier;

CREATE INDEX ix_frontier_queue ON frontier(run_id, status, priority DESC, id);

CREATE TABLE states_old (
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

INSERT INTO states_old
  (id, fingerprint, cluster_id, route_template, title, evidence_ref, confidence, stabilization, first_seen_run, created_at)
SELECT id, fingerprint, cluster_id, route_template, title, evidence_ref, confidence, stabilization, first_seen_run, created_at
FROM states;

DROP TABLE states;
ALTER TABLE states_old RENAME TO states;

CREATE UNIQUE INDEX ux_states_fingerprint ON states(fingerprint);
CREATE INDEX ix_states_cluster_id ON states(cluster_id);
