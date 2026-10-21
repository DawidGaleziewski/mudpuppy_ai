-- 0040_evidence_refs (up, spec 039 design § 15, owner answer 13 "move now"): evidence links and
-- open questions point at what they cite through `entity_refs`, with real foreign keys, instead of
-- v1's polymorphic `target_kind`/`target_id`/`region` and `about_ref`.
-- `entity_refs` gains a column per kind of thing the BA cites (actions, forms, open questions,
-- decisions, reviews, records, trace processes and steps, form steps) and an `evidence_file` (an
-- evidence store file, content-addressed, no row); an element key may go with a state (a screen
-- region) as well as a model screen. The view `doc_evidence` reads a link with the kind and id it
-- cites. The new `ref_id` foreign keys are deferred: an open question cites a state through a ref,
-- and a ref may cite an open question, so a portal delete removes both in one transaction.

-- v1 had no foreign keys here: a link or question naming a row that is gone cites nothing, and
-- goes (store data is disposable in 2.0; the foreign key check after the migration needs it).
DELETE FROM open_questions WHERE NOT EXISTS (SELECT 1 FROM states x WHERE x.id = about_ref)
  AND NOT EXISTS (SELECT 1 FROM transitions x WHERE x.id = about_ref)
  AND NOT EXISTS (SELECT 1 FROM forms x WHERE x.id = about_ref);
DELETE FROM doc_evidence_links WHERE NOT CASE target_kind
  WHEN 'state' THEN EXISTS (SELECT 1 FROM states x WHERE x.id = target_id)
  WHEN 'screen_region' THEN EXISTS (SELECT 1 FROM states x WHERE x.id = target_id)
  WHEN 'transition' THEN EXISTS (SELECT 1 FROM transitions x WHERE x.id = target_id)
  WHEN 'action' THEN EXISTS (SELECT 1 FROM actions x WHERE x.id = target_id)
  WHEN 'form' THEN EXISTS (SELECT 1 FROM forms x WHERE x.id = target_id)
  WHEN 'network_call' THEN EXISTS (SELECT 1 FROM network_calls x WHERE x.id = target_id)
  WHEN 'open_question' THEN EXISTS (SELECT 1 FROM open_questions x WHERE x.id = target_id)
  WHEN 'decision' THEN EXISTS (SELECT 1 FROM decision_log x WHERE x.id = target_id)
  WHEN 'process' THEN EXISTS (SELECT 1 FROM processes x WHERE x.id = target_id)
  WHEN 'process_step' THEN EXISTS (SELECT 1 FROM process_steps x WHERE x.id = target_id)
  WHEN 'doc_record' THEN EXISTS (SELECT 1 FROM doc_records x WHERE x.id = target_id)
  WHEN 'review' THEN EXISTS (SELECT 1 FROM doc_reviews x WHERE x.id = target_id)
  WHEN 'observation' THEN EXISTS (SELECT 1 FROM observations x WHERE x.id = target_id)
  ELSE 0 END;

CREATE TABLE entity_refs_new (
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
  action_id           TEXT REFERENCES actions(id),
  form_id             TEXT REFERENCES forms(id),
  open_question_id    TEXT REFERENCES open_questions(id),
  decision_id         TEXT REFERENCES decision_log(id),
  review_id           TEXT REFERENCES doc_reviews(id),
  doc_record_id       TEXT REFERENCES doc_records(id),
  trace_process_id    TEXT REFERENCES processes(id),
  trace_step_id       TEXT REFERENCES process_steps(id),
  form_step_id        TEXT REFERENCES form_steps(id),
  evidence_file       TEXT CHECK (evidence_file IS NULL OR length(evidence_file) > 0),
  element_key         TEXT CHECK (element_key IS NULL OR length(element_key) > 0),
  CHECK ((observation_id IS NOT NULL) + (transition_id IS NOT NULL) + (state_id IS NOT NULL)
       + (screen_id IS NOT NULL) + (action_class_id IS NOT NULL)
       + (model_transition_id IS NOT NULL) + (process_id IS NOT NULL)
       + (hypothesis_id IS NOT NULL) + (network_call_id IS NOT NULL)
       + (action_id IS NOT NULL) + (form_id IS NOT NULL) + (open_question_id IS NOT NULL)
       + (decision_id IS NOT NULL) + (review_id IS NOT NULL) + (doc_record_id IS NOT NULL)
       + (trace_process_id IS NOT NULL) + (trace_step_id IS NOT NULL)
       + (form_step_id IS NOT NULL) + (evidence_file IS NOT NULL) = 1),
  CHECK (element_key IS NULL OR screen_id IS NOT NULL OR state_id IS NOT NULL)
) STRICT;
INSERT INTO entity_refs_new (id, observation_id, transition_id, state_id, screen_id, action_class_id,
  model_transition_id, process_id, hypothesis_id, network_call_id, element_key)
SELECT id, observation_id, transition_id, state_id, screen_id, action_class_id, model_transition_id,
  process_id, hypothesis_id, network_call_id, element_key FROM entity_refs;

-- Every evidence link becomes a ref of its kind (the link's id, prefixed, is the ref's id).
INSERT INTO entity_refs_new (id, state_id, element_key, transition_id, action_id, form_id,
  network_call_id, open_question_id, decision_id, trace_process_id, trace_step_id, doc_record_id,
  review_id, observation_id)
SELECT 'evidence:' || id,
  CASE WHEN target_kind IN ('state', 'screen_region') THEN target_id END,
  CASE WHEN target_kind = 'screen_region' THEN region END,
  CASE WHEN target_kind = 'transition' THEN target_id END,
  CASE WHEN target_kind = 'action' THEN target_id END,
  CASE WHEN target_kind = 'form' THEN target_id END,
  CASE WHEN target_kind = 'network_call' THEN target_id END,
  CASE WHEN target_kind = 'open_question' THEN target_id END,
  CASE WHEN target_kind = 'decision' THEN target_id END,
  CASE WHEN target_kind = 'process' THEN target_id END,
  CASE WHEN target_kind = 'process_step' THEN target_id END,
  CASE WHEN target_kind = 'doc_record' THEN target_id END,
  CASE WHEN target_kind = 'review' THEN target_id END,
  CASE WHEN target_kind = 'observation' THEN target_id END
FROM doc_evidence_links;

-- An open question's subject: a state, a transition or a form (the id said which only by where it
-- was found).
INSERT INTO entity_refs_new (id, state_id, transition_id, form_id)
SELECT 'about:' || q.id,
  CASE WHEN EXISTS (SELECT 1 FROM states s WHERE s.id = q.about_ref) THEN q.about_ref END,
  CASE WHEN NOT EXISTS (SELECT 1 FROM states s WHERE s.id = q.about_ref)
        AND EXISTS (SELECT 1 FROM transitions t WHERE t.id = q.about_ref) THEN q.about_ref END,
  CASE WHEN NOT EXISTS (SELECT 1 FROM states s WHERE s.id = q.about_ref)
        AND NOT EXISTS (SELECT 1 FROM transitions t WHERE t.id = q.about_ref) THEN q.about_ref END
FROM open_questions q;

DROP TABLE entity_refs;
ALTER TABLE entity_refs_new RENAME TO entity_refs;

CREATE TABLE doc_evidence_links_new (
  id          TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL REFERENCES doc_revisions(id),
  ref_id      TEXT NOT NULL REFERENCES entity_refs(id) DEFERRABLE INITIALLY DEFERRED,
  run_id      TEXT REFERENCES runs(id),
  note        TEXT
) STRICT;
INSERT INTO doc_evidence_links_new (id, revision_id, ref_id, run_id, note)
SELECT id, revision_id, 'evidence:' || id, run_id, note FROM doc_evidence_links;
DROP INDEX ix_doc_evidence_links_run_id;
DROP INDEX ix_doc_evidence_links_target;
DROP TABLE doc_evidence_links;
ALTER TABLE doc_evidence_links_new RENAME TO doc_evidence_links;
CREATE INDEX ix_doc_evidence_links_run_id ON doc_evidence_links(run_id);
CREATE INDEX ix_doc_evidence_links_revision ON doc_evidence_links(revision_id);
CREATE INDEX ix_doc_evidence_links_ref ON doc_evidence_links(ref_id);

CREATE TABLE open_questions_new (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES runs(id),
  text          TEXT NOT NULL,
  ref_id        TEXT NOT NULL REFERENCES entity_refs(id) DEFERRABLE INITIALLY DEFERRED,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','addressed')),
  created_at    TEXT NOT NULL,
  hypothesis_id TEXT REFERENCES hypotheses(id)
) STRICT;
INSERT INTO open_questions_new (id, run_id, text, ref_id, status, created_at, hypothesis_id)
SELECT id, run_id, text, 'about:' || id, status, created_at, hypothesis_id FROM open_questions;
DROP TABLE open_questions;
ALTER TABLE open_questions_new RENAME TO open_questions;

-- The kind and id a ref names, in the vocabulary the BA cites with (`target_kind`, `target_id`).
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
  END AS target_kind,
  coalesce(r.state_id, r.transition_id, r.action_id, r.form_id, r.network_call_id,
    r.open_question_id, r.decision_id, r.trace_process_id, r.trace_step_id, r.doc_record_id,
    r.review_id, r.observation_id) AS target_id,
  CASE WHEN r.state_id IS NOT NULL THEN r.element_key END AS region
FROM doc_evidence_links l JOIN entity_refs r ON r.id = l.ref_id;
