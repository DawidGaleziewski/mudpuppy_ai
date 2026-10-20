-- 0032_transitions_observations (down): back to 0031's names, every row kept.

CREATE TABLE marks_old (
  id             TEXT PRIMARY KEY,                                   -- UUIDv7
  portal_id      TEXT NOT NULL CHECK (length(portal_id) > 0),
  kind           TEXT NOT NULL CHECK (kind IN ('start','focus','probe','retry','recheck','skip')),
  target_kind    TEXT NOT NULL CHECK (target_kind IN ('form_step','state','edge')),
  target_id      TEXT NOT NULL CHECK (length(target_id) > 0),
  created_by     TEXT NOT NULL CHECK (length(created_by) > 0),       -- the person (reviewer name)
  created_at     TEXT NOT NULL,
  used_by_run_id TEXT REFERENCES runs(id),                           -- set when a scan used the mark
  used_at        TEXT,
  origin         TEXT NOT NULL DEFAULT 'person' CHECK (origin IN ('person','planner')),
  hypothesis_id  TEXT REFERENCES hypotheses(id),
  priority       INTEGER CHECK (priority IS NULL OR priority BETWEEN 1 AND 6),
  CHECK ((used_by_run_id IS NULL) = (used_at IS NULL))
) STRICT;
INSERT INTO marks_old (id, portal_id, kind, target_kind, target_id, created_by, created_at, used_by_run_id,
                       used_at, origin, hypothesis_id, priority)
SELECT id, portal_id, kind, CASE target_kind WHEN 'transition' THEN 'edge' ELSE target_kind END, target_id,
       created_by, created_at, used_by_run_id, used_at, origin, hypothesis_id, priority
FROM marks;
DROP INDEX ux_marks_open;
DROP TABLE marks;
ALTER TABLE marks_old RENAME TO marks;
CREATE UNIQUE INDEX ux_marks_open ON marks (portal_id, kind, target_kind, target_id) WHERE used_by_run_id IS NULL;

CREATE TABLE doc_evidence_links_old (
  id          TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL REFERENCES doc_revisions(id),
  target_kind TEXT NOT NULL CHECK (target_kind IN (
                 'state','edge','action','form','network_call','rule_candidate','open_question',
                 'decision','process','process_step','doc_record','review','screen_region',
                 'page_visit'
               )),
  target_id   TEXT NOT NULL,
  run_id      TEXT REFERENCES runs(id),
  note        TEXT,
  region      TEXT CHECK (region IS NULL OR length(region) > 0),  -- element key; screen_region only
  CHECK (run_id IS NOT NULL OR target_kind IN ('doc_record','review')),
  CHECK ((target_kind = 'screen_region') = (region IS NOT NULL))
) STRICT;
INSERT INTO doc_evidence_links_old (id, revision_id, target_kind, target_id, run_id, note, region)
SELECT id, revision_id,
       CASE target_kind WHEN 'transition' THEN 'edge' WHEN 'observation' THEN 'page_visit' ELSE target_kind END,
       target_id, run_id, note, region
FROM doc_evidence_links;
DROP INDEX ix_doc_evidence_links_run_id;
DROP INDEX ix_doc_evidence_links_target;
DROP TABLE doc_evidence_links;
ALTER TABLE doc_evidence_links_old RENAME TO doc_evidence_links;
CREATE INDEX ix_doc_evidence_links_run_id ON doc_evidence_links(run_id);
CREATE INDEX ix_doc_evidence_links_target ON doc_evidence_links(target_kind, target_id);

ALTER TABLE entity_refs RENAME COLUMN transition_id TO edge_id;
ALTER TABLE entity_refs RENAME COLUMN observation_id TO page_visit_id;
ALTER TABLE build_epochs RENAME COLUMN last_observation_id TO last_visit_id;
ALTER TABLE build_epochs RENAME COLUMN first_observation_id TO first_visit_id;
ALTER TABLE model_transitions RENAME COLUMN last_seen_transition_id TO last_seen_edge_id;
ALTER TABLE model_transitions RENAME COLUMN first_seen_transition_id TO first_seen_edge_id;
ALTER TABLE observation_builds RENAME COLUMN observation_id TO page_visit_id;
ALTER TABLE probe_outcomes RENAME COLUMN transition_id TO edge_id;
ALTER TABLE process_steps RENAME COLUMN transition_id TO edge_id;
ALTER TABLE network_calls RENAME COLUMN transition_id TO edge_id;

DROP INDEX ux_observations_run_seq;
DROP INDEX idx_observations_state;
DROP INDEX idx_observations_run_state;
ALTER TABLE observations RENAME COLUMN transition_id TO edge_id;
ALTER TABLE observations RENAME TO page_visits;
CREATE INDEX idx_page_visits_run_state ON page_visits (run_id, state_id);
CREATE INDEX idx_page_visits_state ON page_visits (state_id);
CREATE UNIQUE INDEX ux_page_visits_run_seq ON page_visits (run_id, seq) WHERE seq IS NOT NULL;

DROP INDEX ux_transitions_journey_seq;
DROP INDEX ix_transitions_run_id;
ALTER TABLE transitions RENAME COLUMN from_observation_id TO from_visit_id;
ALTER TABLE transitions RENAME TO edges;
CREATE INDEX ix_edges_run_id ON edges(run_id);
CREATE UNIQUE INDEX ux_edges_journey_seq ON edges (journey_id, seq) WHERE journey_id IS NOT NULL;
