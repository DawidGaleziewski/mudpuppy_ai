-- 0020_relation_rests_on_rule (up): depends_on also from an assumption or a use case to a business rule
-- (owner 2026-10-15, spec 029: the BA wrote `assumption depends_on business_rule` in the 2026-10-12 trial
-- and `use_case depends_on business_rule` in the 2026-10-15 one, spec 025 F-16). Assumptions stay marked
-- for checking in Review (dashboard), not in the store. The type exists, so only the two 0019 triggers are
-- recreated, their triple list equal to RELATION_RULES (drift test: docs/tests/relation-triples.test.ts).

DROP TRIGGER trg_doc_relations_triple_insert;
DROP TRIGGER trg_doc_relations_triple_update;

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
