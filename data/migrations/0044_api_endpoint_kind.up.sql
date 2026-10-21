-- 0044_api_endpoint_kind (up): a new BA record kind `api_endpoint` (key prefix API; spec 038 T008 / R-65 (5),
-- FR-008, field source C-10: the BA documents a call from a network shape), brought onto spec 039 as T076's
-- api_endpoint row. First written as 0029 against the 0028 schema; rewritten against 0043.
-- doc_records.kind is a CHECK list, so the table is rebuilt with every row kept (the runner has
-- foreign_keys OFF during a migration, as 0028 relies on); tables that reference doc_records by name keep
-- referencing the rebuilt one. The rebuild keeps process_id (0036), ux_doc_records_one_proc and the two
-- PROC triggers (dropped with the table, recreated below). No view reads doc_records (doc_evidence,
-- amendments_with_target and amendment_revisions_with_target read other tables), so none is dropped.
-- The two relation triple triggers read doc_records, so they are dropped first and recreated with two
-- more triples:
--   appears_on : api_endpoint -> screen                      (the call is made on that screen)
--   depends_on : process | use_case | requirement -> api_endpoint
-- The list equals RELATION_RULES (drift test: docs/tests/relation-triples.test.ts). No new index.

DROP TRIGGER trg_doc_relations_triple_insert;
DROP TRIGGER trg_doc_relations_triple_update;

CREATE TABLE doc_records_new (
  id            TEXT PRIMARY KEY,
  portal_id     TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN (
                   'capability','screen','process','use_case','requirement','nfr','business_rule',
                   'glossary_term','data_item','assumption','open_question','followup','api_endpoint'
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

INSERT INTO doc_records_new (id, portal_id, kind, key, seq, title, latest_rev, confirmed_rev, withdrawn, created_at, updated_at, process_id)
SELECT id, portal_id, kind, key, seq, title, latest_rev, confirmed_rev, withdrawn, created_at, updated_at, process_id FROM doc_records;

DROP TABLE doc_records;
ALTER TABLE doc_records_new RENAME TO doc_records;
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
      (NEW.type = 'appears_on' AND fr.kind IN ('data_item','glossary_term','api_endpoint') AND tr.kind = 'screen') OR
      (NEW.type = 'uses_term'  AND tr.kind = 'glossary_term') OR
      (NEW.type = 'synonym_of' AND fr.kind = 'glossary_term' AND tr.kind = 'glossary_term') OR
      (NEW.type = 'answers'    AND fr.kind IN ('assumption','requirement','business_rule') AND tr.kind = 'open_question') OR
      (NEW.type = 'depends_on' AND (fr.kind = tr.kind OR (fr.kind IN ('assumption','use_case') AND tr.kind = 'business_rule') OR (fr.kind IN ('process','use_case','requirement') AND tr.kind = 'api_endpoint'))) OR
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
      (NEW.type = 'appears_on' AND fr.kind IN ('data_item','glossary_term','api_endpoint') AND tr.kind = 'screen') OR
      (NEW.type = 'uses_term'  AND tr.kind = 'glossary_term') OR
      (NEW.type = 'synonym_of' AND fr.kind = 'glossary_term' AND tr.kind = 'glossary_term') OR
      (NEW.type = 'answers'    AND fr.kind IN ('assumption','requirement','business_rule') AND tr.kind = 'open_question') OR
      (NEW.type = 'depends_on' AND (fr.kind = tr.kind OR (fr.kind IN ('assumption','use_case') AND tr.kind = 'business_rule') OR (fr.kind IN ('process','use_case','requirement') AND tr.kind = 'api_endpoint'))) OR
      (NEW.type = 'applies_on' AND fr.kind = 'business_rule' AND tr.kind = 'screen') OR
      (NEW.type = 'asks_about' AND fr.kind = 'open_question') OR
      (NEW.type = 'follows_up' AND fr.kind = 'followup' AND tr.kind IN ('process','capability','screen','business_rule','open_question','use_case'))
    )
)
BEGIN
  SELECT RAISE(ABORT, 'RELATION_NOT_ALLOWED: (from kind, type, to kind) is not an allowed triple');
END;
