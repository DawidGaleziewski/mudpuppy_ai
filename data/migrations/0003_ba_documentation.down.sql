-- 0003_ba_documentation (down): drop in reverse dependency order. Purely additive up, so down is a
-- plain set of drops; no data from other migrations is touched.

DROP TABLE followup_tasks;
DROP TABLE doc_reviews;
DROP TABLE doc_relations;
DROP TABLE doc_evidence_links;
DROP TABLE doc_revisions;
DROP TABLE doc_records;
DROP TABLE analysis_session_runs;
DROP TABLE analysis_sessions;
