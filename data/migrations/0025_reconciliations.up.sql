-- 0025_reconciliations (up): the BA's proposed reading of a group of differing states, and the owner's
-- confirmation (spec 033, data-model.md "New table reconciliations"). snapshot_json is the group as the BA
-- saw it; proposal_json and confirmed_json are arrays validated by Zod (@pathfinder/docs-model).
-- Indexes: the open/confirmed reconciliations of a portal; one open proposal per group (a newer proposal
-- supersedes the open one).

CREATE TABLE reconciliations (
  id             TEXT PRIMARY KEY,                                   -- UUIDv7
  portal_id      TEXT NOT NULL CHECK (length(portal_id) > 0),
  group_key      TEXT NOT NULL CHECK (length(group_key) > 0),
  group_kind     TEXT NOT NULL CHECK (group_kind IN ('action','route','replay')),
  snapshot_json  TEXT NOT NULL CHECK (json_valid(snapshot_json) AND json_type(snapshot_json) = 'object'),
  proposal_json  TEXT NOT NULL CHECK (json_valid(proposal_json) AND json_type(proposal_json) = 'array'),
  proposed_by    TEXT NOT NULL CHECK (length(proposed_by) > 0),      -- BA session id or 'BA'
  proposed_at    TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('proposed','confirmed','superseded')),
  confirmed_json TEXT CHECK (confirmed_json IS NULL OR (json_valid(confirmed_json) AND json_type(confirmed_json) = 'array')),
  confirmed_by   TEXT CHECK (confirmed_by IS NULL OR length(confirmed_by) > 0),
  confirmed_at   TEXT,
  CHECK ((status = 'confirmed') = (confirmed_json IS NOT NULL)),
  CHECK ((confirmed_json IS NULL) = (confirmed_by IS NULL) AND (confirmed_json IS NULL) = (confirmed_at IS NULL))
) STRICT;

CREATE INDEX ix_reconciliations_portal_status ON reconciliations (portal_id, status);
CREATE UNIQUE INDEX ux_reconciliations_open ON reconciliations (portal_id, group_key) WHERE status = 'proposed';
