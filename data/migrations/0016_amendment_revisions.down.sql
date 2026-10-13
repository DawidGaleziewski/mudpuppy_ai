-- 0016_amendment_revisions (down): drop the revisions, rev and screen_id, and bring back the 0008
-- status vocabulary: needs_reanchor -> superseded. The old CHECK wants superseded_at and superseded_reason
-- on such a row, so rows that a newer app set to needs_reanchor without them get created_at and
-- 'state_replaced'. Revision history is lost.

DROP TABLE amendment_revisions;

CREATE TABLE amendments_old (
  id                TEXT PRIMARY KEY,                              -- UUIDv7
  key               TEXT NOT NULL CHECK (key GLOB 'AMD-[0-9][0-9][0-9]*'),  -- AMD-nnn, per portal
  portal_id         TEXT NOT NULL CHECK (length(portal_id) > 0),
  scope_id          TEXT REFERENCES process_scopes(id),
  target_kind       TEXT NOT NULL CHECK (target_kind IN ('state','evidence','wireframe_element')),
  target_id         TEXT NOT NULL CHECK (length(target_id) > 0),   -- polymorphic, no FK; the write tool resolves it
  kind              TEXT NOT NULL CHECK (kind IN ('note','element_ref','attachment')),
  text              TEXT,
  attachment_sha256 TEXT CHECK (attachment_sha256 IS NULL OR length(attachment_sha256) = 64),
  attachment_name   TEXT,
  author            TEXT NOT NULL CHECK (length(author) > 0),
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','dismissed','withdrawn')),
  anchor_fingerprint    TEXT,                                      -- fingerprint of the state when written
  anchor_route_template TEXT,
  anchor_element    TEXT CHECK (anchor_element IS NULL OR (json_valid(anchor_element) AND json_type(anchor_element) = 'object')),  -- role, accessible name, wireframe element id
  superseded_by_run TEXT REFERENCES runs(id),
  superseded_reason TEXT CHECK (superseded_reason IS NULL OR superseded_reason IN ('state_replaced','element_changed','element_removed')),
  superseded_detail TEXT,                                          -- short text for superseded_reason
  superseded_at     TEXT,
  dismissed_at      TEXT,
  reapplied_as      TEXT REFERENCES amendments(id),                -- the new active copy
  reapplies         TEXT REFERENCES amendments(id),                -- the original this row copies
  created_at        TEXT NOT NULL,
  withdrawn_at      TEXT,
  UNIQUE (portal_id, key),
  CHECK (kind <> 'note' OR text IS NOT NULL),
  CHECK (kind <> 'attachment' OR (attachment_sha256 IS NOT NULL AND attachment_name IS NOT NULL)),
  CHECK (status <> 'superseded' OR (superseded_at IS NOT NULL AND superseded_reason IS NOT NULL)),
  CHECK (status <> 'dismissed' OR dismissed_at IS NOT NULL),
  CHECK (status <> 'withdrawn' OR withdrawn_at IS NOT NULL)
) STRICT;

INSERT INTO amendments_old (id, key, portal_id, scope_id, target_kind, target_id, kind, text,
  attachment_sha256, attachment_name, author, status, anchor_fingerprint, anchor_route_template,
  anchor_element, superseded_by_run, superseded_reason, superseded_detail, superseded_at,
  dismissed_at, reapplied_as, reapplies, created_at, withdrawn_at)
SELECT id, key, portal_id, scope_id, target_kind, target_id, kind, text,
  attachment_sha256, attachment_name, author,
  CASE status WHEN 'needs_reanchor' THEN 'superseded' ELSE status END,
  anchor_fingerprint, anchor_route_template,
  anchor_element, superseded_by_run,
  CASE WHEN status = 'needs_reanchor' THEN COALESCE(superseded_reason, 'state_replaced') ELSE superseded_reason END,
  superseded_detail,
  CASE WHEN status = 'needs_reanchor' THEN COALESCE(superseded_at, created_at) ELSE superseded_at END,
  dismissed_at, reapplied_as, reapplies, created_at, withdrawn_at
FROM amendments;

DROP TABLE amendments;
ALTER TABLE amendments_old RENAME TO amendments;
CREATE INDEX idx_amendments_target ON amendments (portal_id, target_kind, target_id);
CREATE INDEX idx_amendments_status ON amendments (portal_id, status);
