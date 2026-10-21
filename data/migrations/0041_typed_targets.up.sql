-- 0041_typed_targets (up, spec 039 design § 15, owner answer 13 "move now"): the last v1 polymorphic
-- targets go.
-- * An amendment and each of its revisions cite what they are written on through `entity_refs`
--   (`ref_id`: a state, a state's element (`element_key`), or an evidence store file). 0037's
--   model anchor becomes `anchor_ref_id`. The views `amendments_with_target` and
--   `amendment_revisions_with_target` read them with the `target_kind` / `target_id` the chat and
--   the dashboard speak (a wireframe element is `<state id>#<element key>`).
-- * A mark names its target in a typed column (a form step, a state or a transition), so "one open
--   mark per kind and target" stays a unique index.
-- * A chat proposal names the amendment it changes (`amendment_id`; NULL = a new amendment).

-- Rows whose target is gone could not keep a foreign key (store data is disposable in 2.0).
CREATE TEMP TABLE gone_marks AS SELECT id FROM marks WHERE NOT CASE target_kind
  WHEN 'form_step' THEN EXISTS (SELECT 1 FROM form_steps x WHERE x.id = target_id)
  WHEN 'state' THEN EXISTS (SELECT 1 FROM states x WHERE x.id = target_id)
  WHEN 'transition' THEN EXISTS (SELECT 1 FROM transitions x WHERE x.id = target_id)
  ELSE 0 END;
UPDATE hypothesis_tests SET mark_id = NULL WHERE mark_id IN (SELECT id FROM gone_marks);
DELETE FROM marks WHERE id IN (SELECT id FROM gone_marks);
DROP TABLE gone_marks;
CREATE TEMP TABLE gone_amendments AS SELECT id FROM amendments WHERE target_kind <> 'evidence'
  AND NOT EXISTS (SELECT 1 FROM states s WHERE s.id = CASE WHEN instr(target_id, '#') > 0
    THEN substr(target_id, 1, instr(target_id, '#') - 1) ELSE target_id END);
DELETE FROM chat_proposals WHERE (target_kind = 'amendment'
    AND NOT EXISTS (SELECT 1 FROM amendments a WHERE a.id = target_id))
  OR target_id IN (SELECT id FROM gone_amendments)
  OR applied_amendment_id IN (SELECT id FROM gone_amendments);
UPDATE amendments SET reapplied_as = NULL WHERE reapplied_as IN (SELECT id FROM gone_amendments);
UPDATE amendments SET reapplies = NULL WHERE reapplies IN (SELECT id FROM gone_amendments);
DELETE FROM amendment_revisions WHERE amendment_id IN (SELECT id FROM gone_amendments)
  OR (target_kind <> 'evidence' AND NOT EXISTS (SELECT 1 FROM states s WHERE s.id = CASE
    WHEN instr(target_id, '#') > 0 THEN substr(target_id, 1, instr(target_id, '#') - 1)
    ELSE target_id END));
DELETE FROM amendments WHERE id IN (SELECT id FROM gone_amendments);
DROP TABLE gone_amendments;

CREATE TABLE marks_new (
  id             TEXT PRIMARY KEY,                                   -- UUIDv7
  portal_id      TEXT NOT NULL CHECK (length(portal_id) > 0),
  kind           TEXT NOT NULL CHECK (kind IN ('start','focus','probe','retry','recheck','skip')),
  form_step_id   TEXT REFERENCES form_steps(id),
  state_id       TEXT REFERENCES states(id),
  transition_id  TEXT REFERENCES transitions(id),
  created_by     TEXT NOT NULL CHECK (length(created_by) > 0),
  created_at     TEXT NOT NULL,
  used_by_run_id TEXT REFERENCES runs(id),
  used_at        TEXT,
  origin         TEXT NOT NULL DEFAULT 'person' CHECK (origin IN ('person','planner')),
  hypothesis_id  TEXT REFERENCES hypotheses(id),
  priority       INTEGER CHECK (priority IS NULL OR priority BETWEEN 1 AND 6),
  CHECK ((form_step_id IS NOT NULL) + (state_id IS NOT NULL) + (transition_id IS NOT NULL) = 1),
  CHECK ((used_by_run_id IS NULL) = (used_at IS NULL))
) STRICT;
INSERT INTO marks_new (id, portal_id, kind, form_step_id, state_id, transition_id, created_by,
  created_at, used_by_run_id, used_at, origin, hypothesis_id, priority)
SELECT id, portal_id, kind,
  CASE WHEN target_kind = 'form_step' THEN target_id END,
  CASE WHEN target_kind = 'state' THEN target_id END,
  CASE WHEN target_kind = 'transition' THEN target_id END,
  created_by, created_at, used_by_run_id, used_at, origin, hypothesis_id, priority
FROM marks;
DROP INDEX ux_marks_open;
DROP TABLE marks;
ALTER TABLE marks_new RENAME TO marks;
CREATE UNIQUE INDEX ux_marks_open ON marks
  (portal_id, kind, coalesce(form_step_id, state_id, transition_id)) WHERE used_by_run_id IS NULL;

CREATE TABLE chat_proposals_new (
  id                    TEXT PRIMARY KEY,                          -- UUIDv7
  conversation_id       TEXT NOT NULL REFERENCES chat_conversations(id),
  portal_id             TEXT NOT NULL CHECK (length(portal_id) > 0),
  amendment_id          TEXT REFERENCES amendments(id),            -- the amendment it changes; NULL = a new one
  base_rev              INTEGER CHECK (base_rev IS NULL OR base_rev >= 1),
  payload               TEXT NOT NULL CHECK (json_valid(payload) AND json_type(payload) = 'object'),
  summary               TEXT NOT NULL CHECK (length(summary) > 0),
  status                TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','applied','discarded','stale')),
  applied_amendment_id  TEXT REFERENCES amendments(id),
  applied_rev           INTEGER CHECK (applied_rev IS NULL OR applied_rev >= 1),
  decided_by            TEXT,
  decided_at            TEXT,
  created_at            TEXT NOT NULL,
  CHECK ((amendment_id IS NULL) = (base_rev IS NULL)),
  CHECK (status <> 'applied' OR (applied_amendment_id IS NOT NULL AND applied_rev IS NOT NULL AND decided_at IS NOT NULL)),
  CHECK (status NOT IN ('discarded','stale') OR decided_at IS NOT NULL)
) STRICT;
INSERT INTO chat_proposals_new (id, conversation_id, portal_id, amendment_id, base_rev, payload,
  summary, status, applied_amendment_id, applied_rev, decided_by, decided_at, created_at)
SELECT id, conversation_id, portal_id, target_id, base_rev, payload, summary, status,
  applied_amendment_id, applied_rev, decided_by, decided_at, created_at
FROM chat_proposals;
DROP INDEX ix_chat_proposals_conversation;
DROP INDEX ix_chat_proposals_portal_status;
DROP TABLE chat_proposals;
ALTER TABLE chat_proposals_new RENAME TO chat_proposals;
CREATE INDEX ix_chat_proposals_conversation ON chat_proposals (conversation_id, created_at);
CREATE INDEX ix_chat_proposals_portal_status ON chat_proposals (portal_id, status);

-- The target of every amendment head and revision as a ref: `target:<amendment>` for the head,
-- `target:<amendment>:<rev>` for a revision.
INSERT INTO entity_refs (id, state_id, element_key, evidence_file)
SELECT 'target:' || id,
  CASE WHEN target_kind = 'state' THEN target_id
       WHEN target_kind = 'wireframe_element' THEN substr(target_id, 1, instr(target_id, '#') - 1) END,
  CASE WHEN target_kind = 'wireframe_element' THEN substr(target_id, instr(target_id, '#') + 1) END,
  CASE WHEN target_kind = 'evidence' THEN target_id END
FROM amendments;
INSERT INTO entity_refs (id, state_id, element_key, evidence_file)
SELECT 'target:' || amendment_id || ':' || rev,
  CASE WHEN target_kind = 'state' THEN target_id
       WHEN target_kind = 'wireframe_element' THEN substr(target_id, 1, instr(target_id, '#') - 1) END,
  CASE WHEN target_kind = 'wireframe_element' THEN substr(target_id, instr(target_id, '#') + 1) END,
  CASE WHEN target_kind = 'evidence' THEN target_id END
FROM amendment_revisions;

CREATE TABLE amendments_new (
  id                TEXT PRIMARY KEY,                              -- UUIDv7
  key               TEXT NOT NULL CHECK (key GLOB 'AMD-[0-9][0-9][0-9]*'),  -- AMD-nnn, per portal
  portal_id         TEXT NOT NULL CHECK (length(portal_id) > 0),
  scope_id          TEXT REFERENCES process_scopes(id),
  ref_id            TEXT NOT NULL REFERENCES entity_refs(id) DEFERRABLE INITIALLY DEFERRED,
  kind              TEXT NOT NULL CHECK (kind IN ('note','element_ref','attachment')),
  text              TEXT,
  attachment_sha256 TEXT CHECK (attachment_sha256 IS NULL OR length(attachment_sha256) = 64),
  attachment_name   TEXT,
  author            TEXT NOT NULL CHECK (length(author) > 0),
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','needs_reanchor','dismissed','withdrawn')),
  anchor_fingerprint    TEXT,
  anchor_route_template TEXT,
  anchor_element    TEXT CHECK (anchor_element IS NULL OR (json_valid(anchor_element) AND json_type(anchor_element) = 'object')),
  superseded_by_run TEXT REFERENCES runs(id),
  superseded_reason TEXT CHECK (superseded_reason IS NULL OR superseded_reason IN ('state_replaced','element_changed','element_removed')),
  superseded_detail TEXT,
  superseded_at     TEXT,
  dismissed_at      TEXT,
  reapplied_as      TEXT REFERENCES amendments(id),
  reapplies         TEXT REFERENCES amendments(id),
  created_at        TEXT NOT NULL,
  withdrawn_at      TEXT,
  rev               INTEGER NOT NULL DEFAULT 1 CHECK (rev >= 1),
  screen_id         TEXT REFERENCES screens(id),
  anchor_ref_id     TEXT REFERENCES entity_refs(id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (portal_id, key),
  CHECK (kind <> 'note' OR text IS NOT NULL),
  CHECK (kind <> 'attachment' OR (attachment_sha256 IS NOT NULL AND attachment_name IS NOT NULL)),
  CHECK (status <> 'dismissed' OR dismissed_at IS NOT NULL),
  CHECK (status <> 'withdrawn' OR withdrawn_at IS NOT NULL)
) STRICT;
INSERT INTO amendments_new (id, key, portal_id, scope_id, ref_id, kind, text, attachment_sha256,
  attachment_name, author, status, anchor_fingerprint, anchor_route_template, anchor_element,
  superseded_by_run, superseded_reason, superseded_detail, superseded_at, dismissed_at,
  reapplied_as, reapplies, created_at, withdrawn_at, rev, screen_id, anchor_ref_id)
SELECT id, key, portal_id, scope_id, 'target:' || id, kind, text, attachment_sha256,
  attachment_name, author, status, anchor_fingerprint, anchor_route_template, anchor_element,
  superseded_by_run, superseded_reason, superseded_detail, superseded_at, dismissed_at,
  reapplied_as, reapplies, created_at, withdrawn_at, rev, screen_id, ref_id
FROM amendments;
DROP INDEX idx_amendments_target;
DROP INDEX idx_amendments_status;
DROP TABLE amendments;
ALTER TABLE amendments_new RENAME TO amendments;
CREATE INDEX idx_amendments_status ON amendments (portal_id, status);
CREATE INDEX idx_amendments_ref ON amendments (ref_id);

CREATE TABLE amendment_revisions_new (
  amendment_id          TEXT NOT NULL REFERENCES amendments(id),
  rev                   INTEGER NOT NULL CHECK (rev >= 1),
  base_rev              INTEGER CHECK (base_rev IS NULL OR base_rev >= 1),
  change                TEXT NOT NULL CHECK (change IN ('create','edit','carry_forward','needs_reanchor','reanchor','withdraw','restore','dismiss')),
  author                TEXT NOT NULL CHECK (length(author) > 0),
  status                TEXT NOT NULL CHECK (status IN ('active','needs_reanchor','dismissed','withdrawn')),
  ref_id                TEXT NOT NULL REFERENCES entity_refs(id) DEFERRABLE INITIALLY DEFERRED,
  text                  TEXT,
  anchor_fingerprint    TEXT,
  anchor_route_template TEXT,
  anchor_element        TEXT CHECK (anchor_element IS NULL OR (json_valid(anchor_element) AND json_type(anchor_element) = 'object')),
  reason                TEXT,
  run_id                TEXT REFERENCES runs(id),
  created_at            TEXT NOT NULL,
  PRIMARY KEY (amendment_id, rev),
  CHECK ((rev = 1) = (base_rev IS NULL))
) STRICT, WITHOUT ROWID;
INSERT INTO amendment_revisions_new (amendment_id, rev, base_rev, change, author, status, ref_id,
  text, anchor_fingerprint, anchor_route_template, anchor_element, reason, run_id, created_at)
SELECT amendment_id, rev, base_rev, change, author, status, 'target:' || amendment_id || ':' || rev,
  text, anchor_fingerprint, anchor_route_template, anchor_element, reason, run_id, created_at
FROM amendment_revisions;
DROP TABLE amendment_revisions;
ALTER TABLE amendment_revisions_new RENAME TO amendment_revisions;

-- What an amendment (head or revision) is written on, as the chat and the dashboard name it.
CREATE VIEW amendments_with_target AS
SELECT a.*,
  CASE WHEN r.evidence_file IS NOT NULL THEN 'evidence'
       WHEN r.element_key IS NOT NULL THEN 'wireframe_element'
       ELSE 'state' END AS target_kind,
  CASE WHEN r.evidence_file IS NOT NULL THEN r.evidence_file
       WHEN r.element_key IS NOT NULL THEN r.state_id || '#' || r.element_key
       ELSE r.state_id END AS target_id
FROM amendments a JOIN entity_refs r ON r.id = a.ref_id;
CREATE VIEW amendment_revisions_with_target AS
SELECT v.*,
  CASE WHEN r.evidence_file IS NOT NULL THEN 'evidence'
       WHEN r.element_key IS NOT NULL THEN 'wireframe_element'
       ELSE 'state' END AS target_kind,
  CASE WHEN r.evidence_file IS NOT NULL THEN r.evidence_file
       WHEN r.element_key IS NOT NULL THEN r.state_id || '#' || r.element_key
       ELSE r.state_id END AS target_id
FROM amendment_revisions v JOIN entity_refs r ON r.id = v.ref_id;
