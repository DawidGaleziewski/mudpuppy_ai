-- 0006_screenshots_wireframes (down): drop screenshots, layouts and wireframes; turn screen-region
-- links back into state links (the element key is kept in the note) and restore the 0004 shape.

CREATE TABLE doc_evidence_links_old (
  id          TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL REFERENCES doc_revisions(id),
  target_kind TEXT NOT NULL CHECK (target_kind IN (
                 'state','edge','action','form','network_call','rule_candidate','open_question',
                 'decision','process','process_step','doc_record','review'
               )),
  target_id   TEXT NOT NULL,
  run_id      TEXT REFERENCES runs(id),
  note        TEXT,
  CHECK (run_id IS NOT NULL OR target_kind IN ('doc_record','review'))
) STRICT;

INSERT INTO doc_evidence_links_old (id, revision_id, target_kind, target_id, run_id, note)
SELECT id, revision_id,
       CASE target_kind WHEN 'screen_region' THEN 'state' ELSE target_kind END,
       target_id, run_id,
       CASE WHEN target_kind = 'screen_region'
            THEN 'region ' || region || CASE WHEN note IS NULL THEN '' ELSE ': ' || note END
            ELSE note END
FROM doc_evidence_links;

DROP TABLE doc_evidence_links;
ALTER TABLE doc_evidence_links_old RENAME TO doc_evidence_links;

CREATE INDEX ix_doc_evidence_links_run_id ON doc_evidence_links(run_id);
CREATE INDEX ix_doc_evidence_links_target ON doc_evidence_links(target_kind, target_id);

DROP TABLE state_wireframes;

ALTER TABLE states DROP COLUMN layout_ref;
ALTER TABLE states DROP COLUMN screenshot_ref;
