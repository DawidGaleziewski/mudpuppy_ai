-- 0016_amendment_revisions (up): amendments carry a current revision number and a screen, their history
-- lives in the append-only amendment_revisions, and the status vocabulary becomes
-- active | needs_reanchor | dismissed | withdrawn (superseded rows become needs_reanchor; the superseded_*
-- columns stay as the history of why). Spec 022 research.md R3/R4.
-- SQLite cannot alter a CHECK, so amendments is rebuilt (as 0014 did) with every column and row kept;
-- the old `status <> 'superseded' OR ...` CHECK goes with the status. No new index: the PK of
-- amendment_revisions serves "history of one amendment", and no contract query needs more yet.

CREATE TABLE amendments_new (
  id                TEXT PRIMARY KEY,                              -- UUIDv7
  key               TEXT NOT NULL CHECK (key GLOB 'AMD-[0-9][0-9][0-9]*'),  -- AMD-nnn, per portal
  portal_id         TEXT NOT NULL CHECK (length(portal_id) > 0),
  scope_id          TEXT REFERENCES process_scopes(id),
  target_kind       TEXT NOT NULL CHECK (target_kind IN ('state','evidence','wireframe_element')),
  target_id         TEXT NOT NULL CHECK (length(target_id) > 0),   -- polymorphic, no FK; moves to the newest state when carried forward
  kind              TEXT NOT NULL CHECK (kind IN ('note','element_ref','attachment')),
  text              TEXT,
  attachment_sha256 TEXT CHECK (attachment_sha256 IS NULL OR length(attachment_sha256) = 64),
  attachment_name   TEXT,
  author            TEXT NOT NULL CHECK (length(author) > 0),
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','needs_reanchor','dismissed','withdrawn')),
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
  rev               INTEGER NOT NULL DEFAULT 1 CHECK (rev >= 1),  -- the head's current revision number
  screen_id         TEXT REFERENCES screens(id),                   -- the screen the amendment belongs to
  UNIQUE (portal_id, key),
  CHECK (kind <> 'note' OR text IS NOT NULL),
  CHECK (kind <> 'attachment' OR (attachment_sha256 IS NOT NULL AND attachment_name IS NOT NULL)),
  CHECK (status <> 'dismissed' OR dismissed_at IS NOT NULL),
  CHECK (status <> 'withdrawn' OR withdrawn_at IS NOT NULL)
) STRICT;

-- Backfill: superseded -> needs_reanchor at rev 2 (rev 1 is its creation); a dismissed or withdrawn
-- row is also rev 2 so the head always equals its newest revision. screen_id comes from the target state
-- (target_kind 'state'), else from the state with the anchor fingerprint in the same portal, else NULL.
INSERT INTO amendments_new (id, key, portal_id, scope_id, target_kind, target_id, kind, text,
  attachment_sha256, attachment_name, author, status, anchor_fingerprint, anchor_route_template,
  anchor_element, superseded_by_run, superseded_reason, superseded_detail, superseded_at,
  dismissed_at, reapplied_as, reapplies, created_at, withdrawn_at, rev, screen_id)
SELECT a.id, a.key, a.portal_id, a.scope_id, a.target_kind, a.target_id, a.kind, a.text,
  a.attachment_sha256, a.attachment_name, a.author,
  CASE a.status WHEN 'superseded' THEN 'needs_reanchor' ELSE a.status END,
  a.anchor_fingerprint, a.anchor_route_template,
  a.anchor_element, a.superseded_by_run, a.superseded_reason, a.superseded_detail, a.superseded_at,
  a.dismissed_at, a.reapplied_as, a.reapplies, a.created_at, a.withdrawn_at,
  CASE WHEN a.status = 'active' THEN 1 ELSE 2 END,
  COALESCE(
    (SELECT s.screen_id FROM states s WHERE a.target_kind = 'state' AND s.id = a.target_id),
    (SELECT s.screen_id FROM states s WHERE s.portal_id = a.portal_id AND s.fingerprint = a.anchor_fingerprint))
FROM amendments a;

DROP TABLE amendments;
ALTER TABLE amendments_new RENAME TO amendments;
CREATE INDEX idx_amendments_target ON amendments (portal_id, target_kind, target_id);
CREATE INDEX idx_amendments_status ON amendments (portal_id, status);

CREATE TABLE amendment_revisions (
  amendment_id          TEXT NOT NULL REFERENCES amendments(id),
  rev                   INTEGER NOT NULL CHECK (rev >= 1),
  base_rev              INTEGER CHECK (base_rev IS NULL OR base_rev >= 1),  -- the revision this one was written on top of; NULL for r1
  change                TEXT NOT NULL CHECK (change IN ('create','edit','carry_forward','needs_reanchor','reanchor','withdraw','restore','dismiss')),
  author                TEXT NOT NULL CHECK (length(author) > 0),           -- reviewer, or 'scan:<run id>' for automatic carry-forward
  status                TEXT NOT NULL CHECK (status IN ('active','needs_reanchor','dismissed','withdrawn')),
  target_kind           TEXT NOT NULL CHECK (target_kind IN ('state','evidence','wireframe_element')),
  target_id             TEXT NOT NULL CHECK (length(target_id) > 0),
  text                  TEXT,
  anchor_fingerprint    TEXT,
  anchor_route_template TEXT,
  anchor_element        TEXT CHECK (anchor_element IS NULL OR (json_valid(anchor_element) AND json_type(anchor_element) = 'object')),
  reason                TEXT,                                               -- e.g. 'element_removed: the link "Zaloguj się" is gone'
  run_id                TEXT REFERENCES runs(id),                           -- the scan that caused a carry-forward / needs-reanchor
  created_at            TEXT NOT NULL,
  PRIMARY KEY (amendment_id, rev),
  CHECK ((rev = 1) = (base_rev IS NULL))
) STRICT, WITHOUT ROWID;

INSERT INTO amendment_revisions (amendment_id, rev, base_rev, change, author, status, target_kind, target_id,
  text, anchor_fingerprint, anchor_route_template, anchor_element, reason, run_id, created_at)
SELECT id, 1, NULL, 'create', author, 'active', target_kind, target_id,
  text, anchor_fingerprint, anchor_route_template, anchor_element, NULL, NULL, created_at
FROM amendments;

INSERT INTO amendment_revisions (amendment_id, rev, base_rev, change, author, status, target_kind, target_id,
  text, anchor_fingerprint, anchor_route_template, anchor_element, reason, run_id, created_at)
SELECT id, 2, 1,
  CASE status WHEN 'needs_reanchor' THEN 'needs_reanchor' WHEN 'dismissed' THEN 'dismiss' ELSE 'withdraw' END,
  CASE WHEN status = 'needs_reanchor' AND superseded_by_run IS NOT NULL THEN 'scan:' || superseded_by_run ELSE author END,
  status, target_kind, target_id,
  text, anchor_fingerprint, anchor_route_template, anchor_element,
  CASE WHEN status = 'needs_reanchor' AND superseded_reason IS NOT NULL
       THEN superseded_reason || COALESCE(': ' || superseded_detail, '') END,
  CASE WHEN status = 'needs_reanchor' THEN superseded_by_run END,
  CASE status WHEN 'needs_reanchor' THEN COALESCE(superseded_at, created_at)
              WHEN 'dismissed' THEN COALESCE(dismissed_at, created_at)
              ELSE COALESCE(withdrawn_at, created_at) END
FROM amendments WHERE status <> 'active';
