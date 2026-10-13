-- 0018_ba_processes (up): the BA's cut of the portal (screens 04-07). Spec 022 data-model.md M5.
-- Same pattern as amendments (0016): a head row with the current revision number, append-only revision
-- rows beside it; every write goes through the chat service, a stale base_rev answers 409.
-- Distinct from the crawler's trace `processes` (spec 004) and from `process_scopes` (spec 010), which
-- the backfill at the end migrates in. Indexes: one per named read (process_live: the live variant per
-- environment; grouping_suggestions: the open list and the "dismissed before" refusal, FR-007).
-- ba_processes.suggestion_id and grouping_suggestions.process_id reference each other (accept links both);
-- SQLite accepts the forward reference, and the migration runner checks foreign keys at the end.

CREATE TABLE grouping_suggestions (
  id              TEXT PRIMARY KEY,                                  -- UUIDv7
  portal_id       TEXT NOT NULL CHECK (length(portal_id) > 0),
  name            TEXT NOT NULL CHECK (length(name) > 0),
  persona         TEXT NOT NULL CHECK (length(persona) > 0),
  steps           TEXT NOT NULL CHECK (json_valid(steps) AND json_type(steps) = 'array'),  -- ordered as-is steps, all observed
  why             TEXT NOT NULL CHECK (length(why) > 0),             -- the assistant's reason
  screens_key     TEXT NOT NULL CHECK (length(screens_key) > 0),     -- sorted state ids joined with ','; a dismissed key is refused
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','dismissed')),
  conversation_id TEXT REFERENCES chat_conversations(id),
  process_id      TEXT REFERENCES ba_processes(id),                  -- set on accept
  decided_by      TEXT,
  decided_at      TEXT,
  created_at      TEXT NOT NULL,
  CHECK (status = 'open' OR decided_at IS NOT NULL),
  CHECK (status <> 'accepted' OR process_id IS NOT NULL)
) STRICT;

CREATE INDEX ix_grouping_suggestions_portal_status ON grouping_suggestions (portal_id, status);
CREATE INDEX ix_grouping_suggestions_portal_screens ON grouping_suggestions (portal_id, screens_key);

CREATE TABLE ba_processes (
  id            TEXT PRIMARY KEY,                                    -- UUIDv7
  portal_id     TEXT NOT NULL CHECK (length(portal_id) > 0),
  key           TEXT NOT NULL CHECK (key GLOB 'PRC-[0-9][0-9][0-9]*'),  -- PRC-nnn, per portal
  name          TEXT NOT NULL CHECK (length(name) > 0),
  persona       TEXT NOT NULL CHECK (length(persona) > 0),           -- the persona the as-is was observed as
  stage         TEXT NOT NULL CHECK (stage IN ('scoped','as_is_documented','to_be_design','migrating','migrated')),  -- a process can move back
  rev           INTEGER NOT NULL CHECK (rev >= 1),                   -- the head's current process revision
  source        TEXT NOT NULL CHECK (source IN ('suggestion','scope','new')),
  scope_id      TEXT REFERENCES process_scopes(id),                  -- the scope it was migrated from
  suggestion_id TEXT REFERENCES grouping_suggestions(id),            -- the accepted suggestion
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (portal_id, key)
) STRICT;

CREATE TABLE ba_process_revisions (
  process_id TEXT NOT NULL REFERENCES ba_processes(id),
  rev        INTEGER NOT NULL CHECK (rev >= 1),
  base_rev   INTEGER CHECK (base_rev IS NULL OR base_rev >= 1),      -- NULL for r1
  change     TEXT NOT NULL CHECK (change IN ('create','rename','stage','restore')),
  author     TEXT NOT NULL CHECK (length(author) > 0),
  name       TEXT NOT NULL CHECK (length(name) > 0),                 -- the values after the change
  stage      TEXT NOT NULL CHECK (stage IN ('scoped','as_is_documented','to_be_design','migrating','migrated')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (process_id, rev),
  CHECK ((rev = 1) = (base_rev IS NULL))
) STRICT, WITHOUT ROWID;

CREATE TABLE process_variants (
  id                       TEXT PRIMARY KEY,                         -- UUIDv7
  process_id               TEXT NOT NULL REFERENCES ba_processes(id),
  label                    TEXT NOT NULL CHECK (length(label) > 0),  -- A, B, C...
  kind                     TEXT NOT NULL CHECK (kind IN ('as_is','to_be')),  -- as_is = A, observed, rescans add revisions
  rev                      INTEGER NOT NULL CHECK (rev >= 1),        -- the head's current revision
  branched_from_variant_id TEXT REFERENCES process_variants(id),     -- NULL for A
  branched_from_rev        INTEGER CHECK (branched_from_rev IS NULL OR branched_from_rev >= 1),
  created_at               TEXT NOT NULL,
  UNIQUE (process_id, label),
  CHECK ((branched_from_variant_id IS NULL) = (branched_from_rev IS NULL))
) STRICT;

CREATE TABLE process_variant_revisions (
  variant_id    TEXT NOT NULL REFERENCES process_variants(id),
  rev           INTEGER NOT NULL CHECK (rev >= 1),
  base_rev      INTEGER CHECK (base_rev IS NULL OR base_rev >= 1),   -- NULL for r1
  change        TEXT NOT NULL CHECK (change IN ('create','branch','save','restore','observe')),
  author        TEXT NOT NULL CHECK (length(author) > 0),            -- reviewer name, or 'scan:<run id>' for observe
  steps         TEXT NOT NULL CHECK (json_valid(steps) AND json_type(steps) = 'array'),  -- ordered ProcessStep objects
  note          TEXT,                                                -- the one line the history shows
  run_id        TEXT REFERENCES runs(id),                            -- for observe
  restored_from INTEGER CHECK (restored_from IS NULL OR restored_from >= 1),  -- for restore
  created_at    TEXT NOT NULL,
  PRIMARY KEY (variant_id, rev),
  CHECK ((rev = 1) = (base_rev IS NULL))
) STRICT, WITHOUT ROWID;

-- Scratch: one open draft of one person over one to-be variant, updated in place, deleted on save/discard.
-- A base_rev older than the variant's head is an edit conflict (Review "Edit conflicts").
CREATE TABLE process_drafts (
  variant_id TEXT NOT NULL REFERENCES process_variants(id),
  author     TEXT NOT NULL CHECK (length(author) > 0),
  base_rev   INTEGER NOT NULL CHECK (base_rev >= 1),
  steps      TEXT NOT NULL CHECK (json_valid(steps) AND json_type(steps) = 'array'),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (variant_id, author)
) STRICT, WITHOUT ROWID;

-- The live variant per environment is the newest row for (process_id, environment).
CREATE TABLE process_live (
  id          TEXT PRIMARY KEY,                                      -- UUIDv7
  process_id  TEXT NOT NULL REFERENCES ba_processes(id),
  environment TEXT NOT NULL CHECK (environment IN ('sandbox','staging','production')),
  variant_id  TEXT NOT NULL,
  variant_rev INTEGER NOT NULL CHECK (variant_rev >= 1),
  author      TEXT NOT NULL CHECK (length(author) > 0),
  reason      TEXT,
  created_at  TEXT NOT NULL,
  FOREIGN KEY (variant_id, variant_rev) REFERENCES process_variant_revisions(variant_id, rev)
) STRICT;

CREATE INDEX ix_process_live_process_env ON process_live (process_id, environment, created_at);

CREATE TABLE change_spec_revisions (
  process_id       TEXT NOT NULL REFERENCES ba_processes(id),
  rev              INTEGER NOT NULL CHECK (rev >= 1),
  base_rev         INTEGER CHECK (base_rev IS NULL OR base_rev >= 1),  -- NULL for r1
  left_variant_id  TEXT NOT NULL,                                    -- what was compared
  left_rev         INTEGER NOT NULL CHECK (left_rev >= 1),
  right_variant_id TEXT NOT NULL,
  right_rev        INTEGER NOT NULL CHECK (right_rev >= 1),
  sections         TEXT NOT NULL CHECK (json_valid(sections) AND json_type(sections) = 'object'),  -- scope, as_is, to_be, delta, records, migration_cut, open_questions
  author           TEXT NOT NULL CHECK (length(author) > 0),
  doc_key          TEXT CHECK (doc_key IS NULL OR length(doc_key) > 0),  -- the doc record key when saved to Docs
  created_at       TEXT NOT NULL,
  PRIMARY KEY (process_id, rev),
  CHECK ((rev = 1) = (base_rev IS NULL)),
  FOREIGN KEY (left_variant_id, left_rev) REFERENCES process_variant_revisions(variant_id, rev),
  FOREIGN KEY (right_variant_id, right_rev) REFERENCES process_variant_revisions(variant_id, rev)
) STRICT, WITHOUT ROWID;

-- Backfill from process_scopes (T035): the newest scope of each (portal, process name) becomes one BA
-- process (source 'scope', stage 'scoped', PRC-001.. in name order per portal) with revision r1 and variant A
-- r1 (as_is) whose observed steps run start -> selected states (route_template order) -> end. Author 'BA',
-- timestamps = the scope's created_at; older scopes stay as they are. Ids are UUIDv7 built from that
-- timestamp (48-bit ms, version 7, variant 10xx, random rest), kept in a temp table so the rows link up.
CREATE TEMP TABLE _scope_backfill AS
WITH ranked AS (
  SELECT s.*, row_number() OVER (PARTITION BY portal_id, process_name ORDER BY created_at DESC, id DESC) AS rnk
  FROM process_scopes s
),
newest AS (
  SELECT *, row_number() OVER (PARTITION BY portal_id ORDER BY process_name) AS n,
         CAST((julianday(created_at) - 2440587.5) * 86400000 AS INTEGER) AS ms
  FROM ranked WHERE rnk = 1
)
SELECT id AS scope_id, portal_id, process_name, persona, created_at, start_state_id, end_state_id, selected_state_ids,
       printf('PRC-%03d', n) AS key,
       lower(printf('%08x-%04x-7%s-%s%s-%s', ms >> 16, ms & 65535, substr(hex(randomblob(9)), 1, 3),
                    substr('89ab', 1 + (abs(random()) % 4), 1), substr(hex(randomblob(2)), 1, 3), hex(randomblob(6)))) AS process_id,
       lower(printf('%08x-%04x-7%s-%s%s-%s', ms >> 16, ms & 65535, substr(hex(randomblob(9)), 1, 3),
                    substr('89ab', 1 + (abs(random()) % 4), 1), substr(hex(randomblob(2)), 1, 3), hex(randomblob(6)))) AS variant_id
FROM newest;

INSERT INTO ba_processes (id, portal_id, key, name, persona, stage, rev, source, scope_id, suggestion_id, created_at, updated_at)
SELECT process_id, portal_id, key, process_name, persona, 'scoped', 1, 'scope', scope_id, NULL, created_at, created_at
FROM _scope_backfill;

INSERT INTO ba_process_revisions (process_id, rev, base_rev, change, author, name, stage, created_at)
SELECT process_id, 1, NULL, 'create', 'BA', process_name, 'scoped', created_at FROM _scope_backfill;

INSERT INTO process_variants (id, process_id, label, kind, rev, branched_from_variant_id, branched_from_rev, created_at)
SELECT variant_id, process_id, 'A', 'as_is', 1, NULL, NULL, created_at FROM _scope_backfill;

INSERT INTO process_variant_revisions (variant_id, rev, base_rev, change, author, steps, note, run_id, restored_from, created_at)
SELECT b.variant_id, 1, NULL, 'create', 'BA',
       (SELECT json_group_array(json_object('id', 's' || t.n, 'title', t.title, 'route', t.route_template,
                                            'state_id', t.state_id, 'screen_id', t.screen_id,
                                            'observed', json('true'), 'from', json('[]'), 'annotations', json('[]')))
          FROM (SELECT row_number() OVER (ORDER BY u.ord, u.route_template, u.state_id) AS n,
                       u.title, u.route_template, u.state_id, u.screen_id
                  FROM (SELECT 0 AS ord, st.id AS state_id, st.title, st.route_template, st.screen_id
                          FROM states st WHERE st.id = b.start_state_id
                        UNION ALL
                        SELECT 1, st.id, st.title, st.route_template, st.screen_id
                          FROM json_each(b.selected_state_ids) j JOIN states st ON st.id = j.value
                         WHERE st.id <> b.start_state_id AND st.id <> b.end_state_id
                        UNION ALL
                        SELECT 2, st.id, st.title, st.route_template, st.screen_id
                          FROM states st WHERE st.id = b.end_state_id) u
                 ORDER BY n) t),
       'Migrated from process scope', NULL, NULL, b.created_at
FROM _scope_backfill b;

DROP TABLE _scope_backfill;
