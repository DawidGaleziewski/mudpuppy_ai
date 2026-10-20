-- 0032_transitions_observations (spec 039 T110, owner 2026-10-20): the design's names. `edges` becomes
-- `transitions`, `page_visits` becomes `observations`, and every column naming them follows
-- (`edge_id` → `transition_id`, `from_visit_id` → `from_observation_id`, `page_visit_id` →
-- `observation_id`, first/last seen ids). ALTER … RENAME rewrites the foreign keys, CHECKs and indexes
-- that name them; the evidence and mark kinds 'edge' / 'page_visit' sit in CHECK lists, so those two
-- tables are rebuilt with 'transition' / 'observation', every row kept.

ALTER TABLE edges RENAME TO transitions;
ALTER TABLE transitions RENAME COLUMN from_visit_id TO from_observation_id;
DROP INDEX ix_edges_run_id;
CREATE INDEX ix_transitions_run_id ON transitions (run_id);
DROP INDEX ux_edges_journey_seq;
CREATE UNIQUE INDEX ux_transitions_journey_seq ON transitions (journey_id, seq) WHERE journey_id IS NOT NULL;

ALTER TABLE page_visits RENAME TO observations;
ALTER TABLE observations RENAME COLUMN edge_id TO transition_id;
DROP INDEX idx_page_visits_run_state;
CREATE INDEX idx_observations_run_state ON observations (run_id, state_id);
DROP INDEX idx_page_visits_state;
CREATE INDEX idx_observations_state ON observations (state_id);
DROP INDEX ux_page_visits_run_seq;
CREATE UNIQUE INDEX ux_observations_run_seq ON observations (run_id, seq) WHERE seq IS NOT NULL;

ALTER TABLE network_calls RENAME COLUMN edge_id TO transition_id;
ALTER TABLE process_steps RENAME COLUMN edge_id TO transition_id;
ALTER TABLE probe_outcomes RENAME COLUMN edge_id TO transition_id;
ALTER TABLE observation_builds RENAME COLUMN page_visit_id TO observation_id;
ALTER TABLE model_transitions RENAME COLUMN first_seen_edge_id TO first_seen_transition_id;
ALTER TABLE model_transitions RENAME COLUMN last_seen_edge_id TO last_seen_transition_id;
ALTER TABLE build_epochs RENAME COLUMN first_visit_id TO first_observation_id;
ALTER TABLE build_epochs RENAME COLUMN last_visit_id TO last_observation_id;
ALTER TABLE entity_refs RENAME COLUMN page_visit_id TO observation_id;
ALTER TABLE entity_refs RENAME COLUMN edge_id TO transition_id;

CREATE TABLE doc_evidence_links_new (
  id          TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL REFERENCES doc_revisions(id),
  target_kind TEXT NOT NULL CHECK (target_kind IN (
                 'state','transition','action','form','network_call','rule_candidate','open_question',
                 'decision','process','process_step','doc_record','review','screen_region',
                 'observation'
               )),
  target_id   TEXT NOT NULL,
  run_id      TEXT REFERENCES runs(id),
  note        TEXT,
  region      TEXT CHECK (region IS NULL OR length(region) > 0),  -- element key; screen_region only
  CHECK (run_id IS NOT NULL OR target_kind IN ('doc_record','review')),
  CHECK ((target_kind = 'screen_region') = (region IS NOT NULL))
) STRICT;
INSERT INTO doc_evidence_links_new (id, revision_id, target_kind, target_id, run_id, note, region)
SELECT id, revision_id,
       CASE target_kind WHEN 'edge' THEN 'transition' WHEN 'page_visit' THEN 'observation' ELSE target_kind END,
       target_id, run_id, note, region
FROM doc_evidence_links;
DROP INDEX ix_doc_evidence_links_run_id;
DROP INDEX ix_doc_evidence_links_target;
DROP TABLE doc_evidence_links;
ALTER TABLE doc_evidence_links_new RENAME TO doc_evidence_links;
CREATE INDEX ix_doc_evidence_links_run_id ON doc_evidence_links(run_id);
CREATE INDEX ix_doc_evidence_links_target ON doc_evidence_links(target_kind, target_id);

CREATE TABLE marks_new (
  id             TEXT PRIMARY KEY,                                   -- UUIDv7
  portal_id      TEXT NOT NULL CHECK (length(portal_id) > 0),
  kind           TEXT NOT NULL CHECK (kind IN ('start','focus','probe','retry','recheck','skip')),
  target_kind    TEXT NOT NULL CHECK (target_kind IN ('form_step','state','transition')),
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
INSERT INTO marks_new (id, portal_id, kind, target_kind, target_id, created_by, created_at, used_by_run_id,
                       used_at, origin, hypothesis_id, priority)
SELECT id, portal_id, kind, CASE target_kind WHEN 'edge' THEN 'transition' ELSE target_kind END, target_id,
       created_by, created_at, used_by_run_id, used_at, origin, hypothesis_id, priority
FROM marks;
DROP INDEX ux_marks_open;
DROP TABLE marks;
ALTER TABLE marks_new RENAME TO marks;
CREATE UNIQUE INDEX ux_marks_open ON marks (portal_id, kind, target_kind, target_id) WHERE used_by_run_id IS NULL;
