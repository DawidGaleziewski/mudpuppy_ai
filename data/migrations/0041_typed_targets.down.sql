-- 0041_typed_targets (down): amendments, their revisions, marks and chat proposals name their
-- target by kind and id again; the amendment model anchor is `ref_id` again (0037).

DROP VIEW amendment_revisions_with_target;
DROP VIEW amendments_with_target;

CREATE TEMP TABLE target_of AS
SELECT r.id AS ref_id,
  CASE WHEN r.evidence_file IS NOT NULL THEN 'evidence'
       WHEN r.element_key IS NOT NULL THEN 'wireframe_element' ELSE 'state' END AS kind,
  CASE WHEN r.evidence_file IS NOT NULL THEN r.evidence_file
       WHEN r.element_key IS NOT NULL THEN r.state_id || '#' || r.element_key
       ELSE r.state_id END AS id
FROM entity_refs r
WHERE r.id IN (SELECT ref_id FROM amendments UNION SELECT ref_id FROM amendment_revisions);

CREATE TABLE amendment_revisions_old (
  amendment_id          TEXT NOT NULL REFERENCES amendments(id),
  rev                   INTEGER NOT NULL CHECK (rev >= 1),
  base_rev              INTEGER CHECK (base_rev IS NULL OR base_rev >= 1),
  change                TEXT NOT NULL CHECK (change IN ('create','edit','carry_forward','needs_reanchor','reanchor','withdraw','restore','dismiss')),
  author                TEXT NOT NULL CHECK (length(author) > 0),
  status                TEXT NOT NULL CHECK (status IN ('active','needs_reanchor','dismissed','withdrawn')),
  target_kind           TEXT NOT NULL CHECK (target_kind IN ('state','evidence','wireframe_element')),
  target_id             TEXT NOT NULL CHECK (length(target_id) > 0),
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
INSERT INTO amendment_revisions_old (amendment_id, rev, base_rev, change, author, status,
  target_kind, target_id, text, anchor_fingerprint, anchor_route_template, anchor_element, reason,
  run_id, created_at)
SELECT v.amendment_id, v.rev, v.base_rev, v.change, v.author, v.status, t.kind, t.id, v.text,
  v.anchor_fingerprint, v.anchor_route_template, v.anchor_element, v.reason, v.run_id, v.created_at
FROM amendment_revisions v JOIN target_of t ON t.ref_id = v.ref_id;

CREATE TABLE amendments_old (
  id                TEXT PRIMARY KEY,
  key               TEXT NOT NULL CHECK (key GLOB 'AMD-[0-9][0-9][0-9]*'),
  portal_id         TEXT NOT NULL CHECK (length(portal_id) > 0),
  scope_id          TEXT REFERENCES process_scopes(id),
  target_kind       TEXT NOT NULL CHECK (target_kind IN ('state','evidence','wireframe_element')),
  target_id         TEXT NOT NULL CHECK (length(target_id) > 0),
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
  ref_id            TEXT REFERENCES entity_refs(id),
  UNIQUE (portal_id, key),
  CHECK (kind <> 'note' OR text IS NOT NULL),
  CHECK (kind <> 'attachment' OR (attachment_sha256 IS NOT NULL AND attachment_name IS NOT NULL)),
  CHECK (status <> 'dismissed' OR dismissed_at IS NOT NULL),
  CHECK (status <> 'withdrawn' OR withdrawn_at IS NOT NULL)
) STRICT;
INSERT INTO amendments_old (id, key, portal_id, scope_id, target_kind, target_id, kind, text,
  attachment_sha256, attachment_name, author, status, anchor_fingerprint, anchor_route_template,
  anchor_element, superseded_by_run, superseded_reason, superseded_detail, superseded_at,
  dismissed_at, reapplied_as, reapplies, created_at, withdrawn_at, rev, screen_id, ref_id)
SELECT a.id, a.key, a.portal_id, a.scope_id, t.kind, t.id, a.kind, a.text, a.attachment_sha256,
  a.attachment_name, a.author, a.status, a.anchor_fingerprint, a.anchor_route_template,
  a.anchor_element, a.superseded_by_run, a.superseded_reason, a.superseded_detail, a.superseded_at,
  a.dismissed_at, a.reapplied_as, a.reapplies, a.created_at, a.withdrawn_at, a.rev, a.screen_id,
  a.anchor_ref_id
FROM amendments a JOIN target_of t ON t.ref_id = a.ref_id;

DROP TABLE amendment_revisions;
DROP INDEX idx_amendments_status;
DROP INDEX idx_amendments_ref;
DROP TABLE amendments;
ALTER TABLE amendments_old RENAME TO amendments;
ALTER TABLE amendment_revisions_old RENAME TO amendment_revisions;
CREATE INDEX idx_amendments_target ON amendments (portal_id, target_kind, target_id);
CREATE INDEX idx_amendments_status ON amendments (portal_id, status);
DELETE FROM entity_refs WHERE id IN (SELECT ref_id FROM target_of);
DROP TABLE target_of;

CREATE TABLE chat_proposals_old (
  id                    TEXT PRIMARY KEY,
  conversation_id       TEXT NOT NULL REFERENCES chat_conversations(id),
  portal_id             TEXT NOT NULL CHECK (length(portal_id) > 0),
  target_kind           TEXT NOT NULL CHECK (target_kind IN ('amendment','new_amendment')),
  target_id             TEXT CHECK (target_id IS NULL OR length(target_id) > 0),
  base_rev              INTEGER CHECK (base_rev IS NULL OR base_rev >= 1),
  payload               TEXT NOT NULL CHECK (json_valid(payload) AND json_type(payload) = 'object'),
  summary               TEXT NOT NULL CHECK (length(summary) > 0),
  status                TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','applied','discarded','stale')),
  applied_amendment_id  TEXT REFERENCES amendments(id),
  applied_rev           INTEGER CHECK (applied_rev IS NULL OR applied_rev >= 1),
  decided_by            TEXT,
  decided_at            TEXT,
  created_at            TEXT NOT NULL,
  CHECK ((target_kind = 'amendment' AND target_id IS NOT NULL AND base_rev IS NOT NULL)
      OR (target_kind = 'new_amendment' AND target_id IS NULL AND base_rev IS NULL)),
  CHECK (status <> 'applied' OR (applied_amendment_id IS NOT NULL AND applied_rev IS NOT NULL AND decided_at IS NOT NULL)),
  CHECK (status NOT IN ('discarded','stale') OR decided_at IS NOT NULL)
) STRICT;
INSERT INTO chat_proposals_old (id, conversation_id, portal_id, target_kind, target_id, base_rev,
  payload, summary, status, applied_amendment_id, applied_rev, decided_by, decided_at, created_at)
SELECT id, conversation_id, portal_id,
  CASE WHEN amendment_id IS NULL THEN 'new_amendment' ELSE 'amendment' END, amendment_id,
  base_rev, payload, summary, status, applied_amendment_id, applied_rev, decided_by, decided_at,
  created_at
FROM chat_proposals;
DROP INDEX ix_chat_proposals_conversation;
DROP INDEX ix_chat_proposals_portal_status;
DROP TABLE chat_proposals;
ALTER TABLE chat_proposals_old RENAME TO chat_proposals;
CREATE INDEX ix_chat_proposals_conversation ON chat_proposals (conversation_id, created_at);
CREATE INDEX ix_chat_proposals_portal_status ON chat_proposals (portal_id, status);

CREATE TABLE marks_old (
  id             TEXT PRIMARY KEY,
  portal_id      TEXT NOT NULL CHECK (length(portal_id) > 0),
  kind           TEXT NOT NULL CHECK (kind IN ('start','focus','probe','retry','recheck','skip')),
  target_kind    TEXT NOT NULL CHECK (target_kind IN ('form_step','state','transition')),
  target_id      TEXT NOT NULL CHECK (length(target_id) > 0),
  created_by     TEXT NOT NULL CHECK (length(created_by) > 0),
  created_at     TEXT NOT NULL,
  used_by_run_id TEXT REFERENCES runs(id),
  used_at        TEXT,
  origin         TEXT NOT NULL DEFAULT 'person' CHECK (origin IN ('person','planner')),
  hypothesis_id  TEXT REFERENCES hypotheses(id),
  priority       INTEGER CHECK (priority IS NULL OR priority BETWEEN 1 AND 6),
  CHECK ((used_by_run_id IS NULL) = (used_at IS NULL))
) STRICT;
INSERT INTO marks_old (id, portal_id, kind, target_kind, target_id, created_by, created_at,
  used_by_run_id, used_at, origin, hypothesis_id, priority)
SELECT id, portal_id, kind,
  CASE WHEN form_step_id IS NOT NULL THEN 'form_step'
       WHEN state_id IS NOT NULL THEN 'state' ELSE 'transition' END,
  coalesce(form_step_id, state_id, transition_id), created_by, created_at, used_by_run_id,
  used_at, origin, hypothesis_id, priority
FROM marks;
DROP INDEX ux_marks_open;
DROP TABLE marks;
ALTER TABLE marks_old RENAME TO marks;
CREATE UNIQUE INDEX ux_marks_open ON marks (portal_id, kind, target_kind, target_id) WHERE used_by_run_id IS NULL;
