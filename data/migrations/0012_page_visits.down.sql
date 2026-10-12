-- 0012_page_visits (down): forget visits and verbatim API call URLs. Citations of a visit become
-- citations of the visit's state, the URL kept in the note (as 0006's down keeps a region key).

CREATE TABLE doc_evidence_links_old (
  id          TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL REFERENCES doc_revisions(id),
  target_kind TEXT NOT NULL CHECK (target_kind IN (
                 'state','edge','action','form','network_call','rule_candidate','open_question',
                 'decision','process','process_step','doc_record','review','screen_region'
               )),
  target_id   TEXT NOT NULL,
  run_id      TEXT REFERENCES runs(id),
  note        TEXT,
  region      TEXT CHECK (region IS NULL OR length(region) > 0),  -- element key; screen_region only
  CHECK (run_id IS NOT NULL OR target_kind IN ('doc_record','review')),
  CHECK ((target_kind = 'screen_region') = (region IS NOT NULL))
) STRICT;

INSERT INTO doc_evidence_links_old (id, revision_id, target_kind, target_id, run_id, note, region)
SELECT l.id, l.revision_id,
       CASE l.target_kind WHEN 'page_visit' THEN 'state' ELSE l.target_kind END,
       CASE l.target_kind WHEN 'page_visit' THEN COALESCE(v.state_id, l.target_id) ELSE l.target_id END,
       l.run_id,
       CASE WHEN l.target_kind = 'page_visit'
            THEN 'visit ' || COALESCE(v.url, l.target_id) || CASE WHEN l.note IS NULL THEN '' ELSE ': ' || l.note END
            ELSE l.note END,
       l.region
FROM doc_evidence_links l LEFT JOIN page_visits v ON l.target_kind = 'page_visit' AND v.id = l.target_id;

DROP TABLE doc_evidence_links;
ALTER TABLE doc_evidence_links_old RENAME TO doc_evidence_links;

CREATE INDEX ix_doc_evidence_links_run_id ON doc_evidence_links(run_id);
CREATE INDEX ix_doc_evidence_links_target ON doc_evidence_links(target_kind, target_id);

ALTER TABLE network_calls DROP COLUMN url;
DROP INDEX idx_page_visits_state;
DROP INDEX idx_page_visits_run_state;
DROP TABLE page_visits;
