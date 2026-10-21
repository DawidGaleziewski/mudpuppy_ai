-- 0029_capture_v2 (down): back to 0028. The v2 capture tables go; `edges` and `page_visits` are
-- rebuilt without their v2 columns (a column with REFERENCES cannot be dropped), every row kept; the
-- runner has foreign_keys OFF during a migration, so tables referencing them by name keep working.

DROP INDEX ix_network_calls_schema;
ALTER TABLE network_calls DROP COLUMN schema_hash;

DROP INDEX ux_edges_journey_seq;
CREATE TABLE edges_old (
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
INSERT INTO edges_old (id, run_id, from_state, to_state, action_json, safety_class, status, evidence_ref,
  confidence, error, stabilization, created_at)
SELECT id, run_id, from_state, to_state, action_json, safety_class, status, evidence_ref, confidence, error,
  stabilization, created_at FROM edges;
DROP INDEX ix_edges_run_id;
DROP TABLE edges;
ALTER TABLE edges_old RENAME TO edges;
CREATE INDEX ix_edges_run_id ON edges(run_id);

DROP TABLE observation_builds;
DROP INDEX ux_page_visits_run_seq;
CREATE TABLE page_visits_old (
  id         TEXT PRIMARY KEY,
  run_id     TEXT NOT NULL REFERENCES runs(id),
  state_id   TEXT NOT NULL REFERENCES states(id),
  edge_id    TEXT REFERENCES edges(id),  -- the action edge that led here; NULL for navigate and re-login
  via        TEXT NOT NULL CHECK (via IN ('navigate','action','relogin','login')),
  url        TEXT NOT NULL CHECK (length(url) > 0),
  hops_json  TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(hops_json) AND json_type(hops_json) = 'array'),
  created_at TEXT NOT NULL
) STRICT;
INSERT INTO page_visits_old (id, run_id, state_id, edge_id, via, url, hops_json, created_at)
SELECT id, run_id, state_id, edge_id, via, url, hops_json, created_at FROM page_visits;
DROP INDEX idx_page_visits_run_state;
DROP INDEX idx_page_visits_state;
DROP TABLE page_visits;
ALTER TABLE page_visits_old RENAME TO page_visits;
CREATE INDEX idx_page_visits_run_state ON page_visits (run_id, state_id);
CREATE INDEX idx_page_visits_state ON page_visits (state_id);

DROP TABLE attribute_writes;
DROP INDEX ix_journeys_run;
DROP TABLE journeys;
DROP TABLE state_components;
DROP TABLE builds;
