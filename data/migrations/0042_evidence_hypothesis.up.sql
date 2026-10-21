-- 0042_evidence_hypothesis (up, spec 039 owner answer 18): a record may cite a hypothesis of the
-- portal model (a mined decision rule documented as a business rule shares that record's BR key).
-- The ref column exists since 0031; the view `doc_evidence` learns the kind.

DROP VIEW doc_evidence;
CREATE VIEW doc_evidence AS
SELECT l.id, l.revision_id, l.ref_id, l.run_id, l.note,
  CASE
    WHEN r.state_id IS NOT NULL AND r.element_key IS NOT NULL THEN 'screen_region'
    WHEN r.state_id IS NOT NULL THEN 'state'
    WHEN r.transition_id IS NOT NULL THEN 'transition'
    WHEN r.action_id IS NOT NULL THEN 'action'
    WHEN r.form_id IS NOT NULL THEN 'form'
    WHEN r.network_call_id IS NOT NULL THEN 'network_call'
    WHEN r.open_question_id IS NOT NULL THEN 'open_question'
    WHEN r.decision_id IS NOT NULL THEN 'decision'
    WHEN r.trace_process_id IS NOT NULL THEN 'process'
    WHEN r.trace_step_id IS NOT NULL THEN 'process_step'
    WHEN r.doc_record_id IS NOT NULL THEN 'doc_record'
    WHEN r.review_id IS NOT NULL THEN 'review'
    WHEN r.observation_id IS NOT NULL THEN 'observation'
    WHEN r.hypothesis_id IS NOT NULL THEN 'hypothesis'
  END AS target_kind,
  coalesce(r.state_id, r.transition_id, r.action_id, r.form_id, r.network_call_id,
    r.open_question_id, r.decision_id, r.trace_process_id, r.trace_step_id, r.doc_record_id,
    r.review_id, r.observation_id, r.hypothesis_id) AS target_id,
  CASE WHEN r.state_id IS NOT NULL THEN r.element_key END AS region
FROM doc_evidence_links l JOIN entity_refs r ON r.id = l.ref_id;
