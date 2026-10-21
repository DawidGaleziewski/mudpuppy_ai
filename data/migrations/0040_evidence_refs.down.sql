-- 0040_evidence_refs (down): evidence links and open questions name their target by kind and id
-- again; `entity_refs` keeps only the kinds 0031 had (hypothesis evidence citing another kind goes).

DROP VIEW doc_evidence;

CREATE TABLE doc_evidence_links_old (
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
  region      TEXT CHECK (region IS NULL OR length(region) > 0),
  CHECK (run_id IS NOT NULL OR target_kind IN ('doc_record','review')),
  CHECK ((target_kind = 'screen_region') = (region IS NOT NULL))
) STRICT;
INSERT INTO doc_evidence_links_old (id, revision_id, target_kind, target_id, run_id, note, region)
SELECT l.id, l.revision_id,
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
    ELSE 'observation'
  END,
  coalesce(r.state_id, r.transition_id, r.action_id, r.form_id, r.network_call_id,
    r.open_question_id, r.decision_id, r.trace_process_id, r.trace_step_id, r.doc_record_id,
    r.review_id, r.observation_id),
  l.run_id, l.note,
  CASE WHEN r.state_id IS NOT NULL THEN r.element_key END
FROM doc_evidence_links l JOIN entity_refs r ON r.id = l.ref_id;
DROP INDEX ix_doc_evidence_links_run_id;
DROP INDEX ix_doc_evidence_links_revision;
DROP INDEX ix_doc_evidence_links_ref;
DROP TABLE doc_evidence_links;
ALTER TABLE doc_evidence_links_old RENAME TO doc_evidence_links;
CREATE INDEX ix_doc_evidence_links_run_id ON doc_evidence_links(run_id);
CREATE INDEX ix_doc_evidence_links_target ON doc_evidence_links(target_kind, target_id);

CREATE TABLE open_questions_old (
  id         TEXT PRIMARY KEY,
  run_id     TEXT NOT NULL REFERENCES runs(id),
  text       TEXT NOT NULL,
  about_ref  TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','addressed')),
  created_at TEXT NOT NULL,
  hypothesis_id TEXT REFERENCES hypotheses(id)
) STRICT;
INSERT INTO open_questions_old (id, run_id, text, about_ref, status, created_at, hypothesis_id)
SELECT q.id, q.run_id, q.text, coalesce(r.state_id, r.transition_id, r.form_id), q.status,
  q.created_at, q.hypothesis_id
FROM open_questions q JOIN entity_refs r ON r.id = q.ref_id;
DROP TABLE open_questions;
ALTER TABLE open_questions_old RENAME TO open_questions;

-- Refs of the kinds 0040 added have nothing to point at any more.
DELETE FROM hypothesis_evidence WHERE ref_id IN (SELECT id FROM entity_refs WHERE
  action_id IS NOT NULL OR form_id IS NOT NULL OR open_question_id IS NOT NULL
  OR decision_id IS NOT NULL OR review_id IS NOT NULL OR doc_record_id IS NOT NULL
  OR trace_process_id IS NOT NULL OR trace_step_id IS NOT NULL OR form_step_id IS NOT NULL
  OR evidence_file IS NOT NULL OR (state_id IS NOT NULL AND element_key IS NOT NULL));
UPDATE amendments SET ref_id = NULL WHERE ref_id IN (SELECT id FROM entity_refs WHERE
  screen_id IS NULL);
CREATE TABLE entity_refs_old (
  id                  TEXT PRIMARY KEY,
  observation_id      TEXT REFERENCES observations(id),
  transition_id       TEXT REFERENCES transitions(id),
  state_id            TEXT REFERENCES states(id),
  screen_id           TEXT REFERENCES model_screens(id),
  action_class_id     TEXT REFERENCES action_classes(id),
  model_transition_id TEXT REFERENCES model_transitions(id),
  process_id          TEXT REFERENCES ba_processes(id),
  hypothesis_id       TEXT REFERENCES hypotheses(id),
  network_call_id     TEXT REFERENCES network_calls(id),
  element_key         TEXT CHECK (element_key IS NULL OR length(element_key) > 0),
  CHECK ((observation_id IS NOT NULL) + (transition_id IS NOT NULL) + (state_id IS NOT NULL)
       + (screen_id IS NOT NULL) + (action_class_id IS NOT NULL)
       + (model_transition_id IS NOT NULL) + (process_id IS NOT NULL)
       + (hypothesis_id IS NOT NULL) + (network_call_id IS NOT NULL) = 1),
  CHECK (element_key IS NULL OR screen_id IS NOT NULL)
) STRICT;
INSERT INTO entity_refs_old (id, observation_id, transition_id, state_id, screen_id,
  action_class_id, model_transition_id, process_id, hypothesis_id, network_call_id, element_key)
SELECT id, observation_id, transition_id, state_id, screen_id, action_class_id,
  model_transition_id, process_id, hypothesis_id, network_call_id, element_key
FROM entity_refs WHERE
  (observation_id IS NOT NULL) + (transition_id IS NOT NULL) + (state_id IS NOT NULL)
  + (screen_id IS NOT NULL) + (action_class_id IS NOT NULL) + (model_transition_id IS NOT NULL)
  + (process_id IS NOT NULL) + (hypothesis_id IS NOT NULL) + (network_call_id IS NOT NULL) = 1
  AND (element_key IS NULL OR screen_id IS NOT NULL)
  AND id NOT IN (SELECT 'evidence:' || id FROM doc_evidence_links)
  AND id NOT IN (SELECT 'about:' || id FROM open_questions);
DROP TABLE entity_refs;
ALTER TABLE entity_refs_old RENAME TO entity_refs;
