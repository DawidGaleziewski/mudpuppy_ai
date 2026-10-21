-- 0035_drop_v1_claims (down): the v1 claim tables come back empty; evidence may cite a rule
-- candidate again (the dropped links are not restored).

CREATE TABLE rule_candidates (
  id           TEXT PRIMARY KEY,
  run_id       TEXT NOT NULL REFERENCES runs(id),
  text         TEXT NOT NULL,
  about_ref    TEXT NOT NULL,
  evidence_ref TEXT NOT NULL CHECK (length(evidence_ref) > 0),
  confidence   TEXT NOT NULL CHECK (confidence = 'inferred'),
  created_at   TEXT NOT NULL
) STRICT;

CREATE TABLE reconciliations (
  id             TEXT PRIMARY KEY,
  portal_id      TEXT NOT NULL CHECK (length(portal_id) > 0),
  group_key      TEXT NOT NULL CHECK (length(group_key) > 0),
  group_kind     TEXT NOT NULL CHECK (group_kind IN ('action','route','replay')),
  snapshot_json  TEXT NOT NULL CHECK (json_valid(snapshot_json) AND json_type(snapshot_json) = 'object'),
  proposal_json  TEXT NOT NULL CHECK (json_valid(proposal_json) AND json_type(proposal_json) = 'array'),
  proposed_by    TEXT NOT NULL CHECK (length(proposed_by) > 0),
  proposed_at    TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('proposed','confirmed','superseded')),
  confirmed_json TEXT CHECK (confirmed_json IS NULL OR (json_valid(confirmed_json) AND json_type(confirmed_json) = 'array')),
  confirmed_by   TEXT CHECK (confirmed_by IS NULL OR length(confirmed_by) > 0),
  confirmed_at   TEXT,
  CHECK ((status = 'confirmed') = (confirmed_json IS NOT NULL)),
  CHECK ((confirmed_json IS NULL) = (confirmed_by IS NULL) AND (confirmed_json IS NULL) = (confirmed_at IS NULL))
) STRICT;
CREATE INDEX ix_reconciliations_portal_status ON reconciliations (portal_id, status);
CREATE UNIQUE INDEX ux_reconciliations_open ON reconciliations (portal_id, group_key) WHERE status = 'proposed';

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
  region      TEXT CHECK (region IS NULL OR length(region) > 0),
  CHECK (run_id IS NOT NULL OR target_kind IN ('doc_record','review')),
  CHECK ((target_kind = 'screen_region') = (region IS NOT NULL))
) STRICT;
INSERT INTO doc_evidence_links_new (id, revision_id, target_kind, target_id, run_id, note, region)
SELECT id, revision_id, target_kind, target_id, run_id, note, region FROM doc_evidence_links;
DROP INDEX ix_doc_evidence_links_run_id;
DROP INDEX ix_doc_evidence_links_target;
DROP TABLE doc_evidence_links;
ALTER TABLE doc_evidence_links_new RENAME TO doc_evidence_links;
CREATE INDEX ix_doc_evidence_links_run_id ON doc_evidence_links(run_id);
CREATE INDEX ix_doc_evidence_links_target ON doc_evidence_links(target_kind, target_id);
