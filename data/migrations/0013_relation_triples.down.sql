-- 0013_relation_triples (down): drop the triple triggers; relations are untouched.
DROP TRIGGER trg_doc_relations_triple_update;
DROP TRIGGER trg_doc_relations_triple_insert;
