-- 0035_drop_v1_claims (up, spec 039 T076): hypotheses (0031) replace the v1 claim tables. The BA's
-- differing-states verdicts (`reconciliations`, spec 033) and the crawler's rule candidates
-- (`rule_candidates`) have no writers or readers left; documentation evidence can no longer cite a
-- rule candidate (links that did are dropped with it; store data is test data).

DROP INDEX ux_reconciliations_open;
DROP INDEX ix_reconciliations_portal_status;
DROP TABLE reconciliations;
DROP TABLE rule_candidates;

CREATE TABLE doc_evidence_links_new (
  id          TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL REFERENCES doc_revisions(id),
  target_kind TEXT NOT NULL CHECK (target_kind IN (
                 'state','transition','action','form','network_call','open_question',
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
SELECT id, revision_id, target_kind, target_id, run_id, note, region
FROM doc_evidence_links WHERE target_kind <> 'rule_candidate';
DROP INDEX ix_doc_evidence_links_run_id;
DROP INDEX ix_doc_evidence_links_target;
DROP TABLE doc_evidence_links;
ALTER TABLE doc_evidence_links_new RENAME TO doc_evidence_links;
CREATE INDEX ix_doc_evidence_links_run_id ON doc_evidence_links(run_id);
CREATE INDEX ix_doc_evidence_links_target ON doc_evidence_links(target_kind, target_id);
