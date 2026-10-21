-- 0044_api_endpoint_kind (down): back to 0043's kind list. The old kind CHECK cannot hold 'api_endpoint', so
-- the copy below FAILS with a CHECK constraint error while any api_endpoint record exists, and the runner's
-- transaction rolls the down back (refuse, not delete: a record has revisions, evidence and relations, so a
-- silent delete would be far lossier). Withdraw-and-remove such records by hand first.
-- process_id, ux_doc_records_one_proc and the PROC triggers are recreated, and so are the 0020 triple triggers.

DROP TRIGGER trg_doc_relations_triple_insert;
DROP TRIGGER trg_doc_relations_triple_update;

CREATE TABLE doc_records_old (
  id            TEXT PRIMARY KEY,
  portal_id     TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN (
                   'capability','screen','process','use_case','requirement','nfr','business_rule',
                   'glossary_term','data_item','assumption','open_question','followup'
                 )),
  key           TEXT NOT NULL,   -- '<PREFIX>-<seq 3+ digits>'
  seq           INTEGER NOT NULL,
  title         TEXT NOT NULL,
  latest_rev    INTEGER NOT NULL,
  confirmed_rev INTEGER,
  withdrawn     INTEGER NOT NULL DEFAULT 0 CHECK (withdrawn IN (0,1)),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  -- 0036 (ALTER TABLE, spec 039 design § 13.4): the process a PROC record documents, exactly one.
  process_id    TEXT REFERENCES ba_processes(id),
  UNIQUE (portal_id, key),
  UNIQUE (portal_id, kind, seq)
) STRICT;

INSERT INTO doc_records_old (id, portal_id, kind, key, seq, title, latest_rev, confirmed_rev, withdrawn, created_at, updated_at, process_id)
SELECT id, portal_id, kind, key, seq, title, latest_rev, confirmed_rev, withdrawn, created_at, updated_at, process_id FROM doc_records;

DROP TABLE doc_records;
ALTER TABLE doc_records_old RENAME TO doc_records;
CREATE UNIQUE INDEX ux_doc_records_one_proc ON doc_records (process_id) WHERE kind = 'process';
CREATE TRIGGER doc_records_proc_needs_process BEFORE INSERT ON doc_records
  WHEN NEW.kind = 'process' AND NEW.process_id IS NULL
  BEGIN SELECT RAISE(ABORT, 'PROC record needs process_id'); END;
CREATE TRIGGER doc_records_proc_keeps_process BEFORE UPDATE OF kind, process_id ON doc_records
  WHEN NEW.kind = 'process' AND NEW.process_id IS NULL
  BEGIN SELECT RAISE(ABORT, 'PROC record needs process_id'); END;

CREATE TRIGGER trg_doc_relations_triple_insert
BEFORE INSERT ON doc_relations
WHEN EXISTS (
  SELECT 1
  FROM doc_revisions v
  JOIN doc_records fr ON fr.id = v.record_id
  JOIN doc_records tr ON tr.id = NEW.to_record_id
  WHERE v.id = NEW.from_revision_id
    AND NOT (
      (NEW.type = 'contains'   AND fr.kind = 'capability'  AND tr.kind IN ('process','screen')) OR
      (NEW.type = 'contains'   AND fr.kind = 'process'     AND tr.kind = 'screen') OR
      (NEW.type = 'describes'  AND fr.kind = 'use_case'    AND tr.kind = 'process') OR
      (NEW.type = 'refines'    AND fr.kind = 'requirement' AND tr.kind IN ('use_case','capability')) OR
      (NEW.type = 'enforces'   AND fr.kind = 'requirement' AND tr.kind = 'business_rule') OR
      (NEW.type = 'appears_on' AND fr.kind IN ('data_item','glossary_term') AND tr.kind = 'screen') OR
      (NEW.type = 'uses_term'  AND tr.kind = 'glossary_term') OR
      (NEW.type = 'synonym_of' AND fr.kind = 'glossary_term' AND tr.kind = 'glossary_term') OR
      (NEW.type = 'answers'    AND fr.kind IN ('assumption','requirement','business_rule') AND tr.kind = 'open_question') OR
      (NEW.type = 'depends_on' AND (fr.kind = tr.kind OR (fr.kind IN ('assumption','use_case') AND tr.kind = 'business_rule'))) OR
      (NEW.type = 'applies_on' AND fr.kind = 'business_rule' AND tr.kind = 'screen') OR
      (NEW.type = 'asks_about' AND fr.kind = 'open_question') OR
      (NEW.type = 'follows_up' AND fr.kind = 'followup' AND tr.kind IN ('process','capability','screen','business_rule','open_question','use_case'))
    )
)
BEGIN
  SELECT RAISE(ABORT, 'RELATION_NOT_ALLOWED: (from kind, type, to kind) is not an allowed triple');
END;

CREATE TRIGGER trg_doc_relations_triple_update
BEFORE UPDATE OF from_revision_id, to_record_id, type ON doc_relations
WHEN EXISTS (
  SELECT 1
  FROM doc_revisions v
  JOIN doc_records fr ON fr.id = v.record_id
  JOIN doc_records tr ON tr.id = NEW.to_record_id
  WHERE v.id = NEW.from_revision_id
    AND NOT (
      (NEW.type = 'contains'   AND fr.kind = 'capability'  AND tr.kind IN ('process','screen')) OR
      (NEW.type = 'contains'   AND fr.kind = 'process'     AND tr.kind = 'screen') OR
      (NEW.type = 'describes'  AND fr.kind = 'use_case'    AND tr.kind = 'process') OR
      (NEW.type = 'refines'    AND fr.kind = 'requirement' AND tr.kind IN ('use_case','capability')) OR
      (NEW.type = 'enforces'   AND fr.kind = 'requirement' AND tr.kind = 'business_rule') OR
      (NEW.type = 'appears_on' AND fr.kind IN ('data_item','glossary_term') AND tr.kind = 'screen') OR
      (NEW.type = 'uses_term'  AND tr.kind = 'glossary_term') OR
      (NEW.type = 'synonym_of' AND fr.kind = 'glossary_term' AND tr.kind = 'glossary_term') OR
      (NEW.type = 'answers'    AND fr.kind IN ('assumption','requirement','business_rule') AND tr.kind = 'open_question') OR
      (NEW.type = 'depends_on' AND (fr.kind = tr.kind OR (fr.kind IN ('assumption','use_case') AND tr.kind = 'business_rule'))) OR
      (NEW.type = 'applies_on' AND fr.kind = 'business_rule' AND tr.kind = 'screen') OR
      (NEW.type = 'asks_about' AND fr.kind = 'open_question') OR
      (NEW.type = 'follows_up' AND fr.kind = 'followup' AND tr.kind IN ('process','capability','screen','business_rule','open_question','use_case'))
    )
)
BEGIN
  SELECT RAISE(ABORT, 'RELATION_NOT_ALLOWED: (from kind, type, to kind) is not an allowed triple');
END;
