-- 0030_portal_model (up): MudPuppy 2.0 Layer M, the portal model (spec 039 M2, design § 6). Rebuilt by
-- the reconciler (`pnpm model:reconcile`) from Layer A plus recorded decisions; ids stay stable through
-- the registry (`model_screens`, `action_classes`, the `model_transitions` key). The crawler's own
-- `screens` (route + cluster, revisions r1, r2…) stay the crawl-time provisional assignment the explorer
-- uses (F-14@039); everything that shows the portal as it is now reads the model.

-- One reconcile of one portal.
CREATE TABLE model_versions (
  id                    TEXT PRIMARY KEY,                               -- UUIDv7
  portal_id             TEXT NOT NULL CHECK (length(portal_id) > 0),
  seq                   INTEGER NOT NULL CHECK (seq >= 1),              -- 1, 2, 3… per portal
  built_at              TEXT NOT NULL,
  algorithm             TEXT NOT NULL CHECK (length(algorithm) > 0),   -- 'minhash-avglink-v1'
  threshold             REAL NOT NULL CHECK (threshold > 0 AND threshold <= 1),
  observation_watermark TEXT,                                           -- max page_visits.id included; NULL when none
  decision_watermark    TEXT,                                           -- max decision id included; NULL when none
  stats_json            TEXT NOT NULL CHECK (json_valid(stats_json) AND json_type(stats_json) = 'object'),
  UNIQUE (portal_id, seq)
) STRICT;

-- The model's screens (abstract states): a class of near-duplicate page versions with a stable id.
CREATE TABLE model_screens (
  id                  TEXT PRIMARY KEY,
  key                 TEXT NOT NULL CHECK (key GLOB 'SC-[0-9][0-9][0-9][0-9]*'),   -- cited by people
  portal_id           TEXT NOT NULL CHECK (length(portal_id) > 0),
  route_key           TEXT NOT NULL CHECK (length(route_key) > 0),
  title               TEXT NOT NULL,                                    -- latest member's title, display only
  status              TEXT NOT NULL CHECK (status IN ('active','merged','retired')),
  first_model_version TEXT NOT NULL REFERENCES model_versions(id),
  created_at          TEXT NOT NULL,
  UNIQUE (portal_id, key)
) STRICT;
CREATE INDEX ix_model_screens_portal ON model_screens (portal_id, status);

-- Which page versions are a screen's members, per model version (to_model_version NULL = current).
CREATE TABLE screen_members (
  screen_id          TEXT NOT NULL REFERENCES model_screens(id),
  state_id           TEXT NOT NULL REFERENCES states(id),
  ordinal            INTEGER NOT NULL CHECK (ordinal >= 1),             -- r1, r2… by first sighting
  assigned_by        TEXT NOT NULL CHECK (assigned_by IN ('clustering','constraint')),
  from_model_version TEXT NOT NULL REFERENCES model_versions(id),
  to_model_version   TEXT REFERENCES model_versions(id),
  PRIMARY KEY (screen_id, state_id, from_model_version)
) STRICT, WITHOUT ROWID;
CREATE UNIQUE INDEX ux_screen_members_current ON screen_members (state_id) WHERE to_model_version IS NULL;

CREATE TABLE screen_lineage (
  id               TEXT PRIMARY KEY,
  model_version_id TEXT NOT NULL REFERENCES model_versions(id),
  kind             TEXT NOT NULL CHECK (kind IN ('split','merge','retire','revive')),
  from_screen_id   TEXT NOT NULL REFERENCES model_screens(id),
  to_screen_id     TEXT REFERENCES model_screens(id),
  members_moved    INTEGER NOT NULL CHECK (members_moved >= 0),
  CHECK ((kind = 'retire') = (to_screen_id IS NULL))
) STRICT;
CREATE INDEX ix_screen_lineage_version ON screen_lineage (model_version_id);

-- A person's "same screen?" answer for a pair of page versions (design § 6.3); also a constraint.
CREATE TABLE state_pair_labels (
  portal_id   TEXT NOT NULL CHECK (length(portal_id) > 0),
  state_a     TEXT NOT NULL REFERENCES states(id),
  state_b     TEXT NOT NULL REFERENCES states(id),
  label       TEXT NOT NULL CHECK (label IN ('clone','near_duplicate','distinct')),
  nd_kind     TEXT CHECK (nd_kind IS NULL OR nd_kind IN ('cosmetic','dynamic_data','duplication')),
  labelled_by TEXT NOT NULL CHECK (length(labelled_by) > 0),
  labelled_at TEXT NOT NULL,
  reason      TEXT,
  CHECK (state_a < state_b),
  CHECK (nd_kind IS NULL OR label = 'near_duplicate'),
  PRIMARY KEY (state_a, state_b)
) STRICT, WITHOUT ROWID;

-- What each parameter of a route template does (design § 6.4); a person's role wins.
CREATE TABLE parameter_roles (
  portal_id      TEXT NOT NULL CHECK (length(portal_id) > 0),
  route_template TEXT NOT NULL CHECK (length(route_template) > 0),
  param          TEXT NOT NULL CHECK (param GLOB 'path:[0-9]*' OR param GLOB 'query:?*'),
  role           TEXT NOT NULL CHECK (role IN ('identity','data','ignored')),
  decided_by     TEXT NOT NULL CHECK (decided_by IN ('reconciler','person')),
  decided_at     TEXT NOT NULL,
  PRIMARY KEY (portal_id, route_template, param)
) STRICT, WITHOUT ROWID;

-- One element of a screen, matched across runs by its element key, with its coverage (design § 6.5–6.6;
-- coverage folded into the row, F-14@039).
CREATE TABLE action_classes (
  id                   TEXT PRIMARY KEY,
  screen_id            TEXT NOT NULL REFERENCES model_screens(id),
  element_key          TEXT NOT NULL CHECK (length(element_key) > 0),
  kind                 TEXT NOT NULL CHECK (kind IN ('click','fill','select','check','submit','navigate','back')),
  is_global            INTEGER NOT NULL DEFAULT 0 CHECK (is_global IN (0,1)),
  status               TEXT NOT NULL CHECK (status IN ('active','not_seen_since','untested','retired')),
  streak_json          TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(streak_json) AND json_type(streak_json) = 'object'),
  status_model_version TEXT NOT NULL REFERENCES model_versions(id),
  UNIQUE (screen_id, element_key, kind)
) STRICT;

-- Screen → action class → screen, across runs (design § 6.5). Upserted by its key.
CREATE TABLE model_transitions (
  id                       TEXT PRIMARY KEY,
  from_screen_id           TEXT NOT NULL REFERENCES model_screens(id),
  action_class_id          TEXT NOT NULL REFERENCES action_classes(id),
  to_screen_id             TEXT REFERENCES model_screens(id),            -- NULL when no page resulted
  result                   TEXT NOT NULL CHECK (result IN ('ok','validation','business_error','technical_error','timeout','blocked')),
  internal                 INTEGER NOT NULL CHECK (internal IN (0,1)),   -- from = to: shown in the screen, not on the Map
  support                  INTEGER NOT NULL CHECK (support >= 1),
  first_seen_edge_id       TEXT NOT NULL REFERENCES edges(id),
  last_seen_edge_id        TEXT NOT NULL REFERENCES edges(id),
  status                   TEXT NOT NULL CHECK (status IN ('active','not_seen_since','untested','retired')),
  status_model_version     TEXT NOT NULL REFERENCES model_versions(id)
) STRICT;
CREATE UNIQUE INDEX ux_model_transitions_key ON model_transitions
  (from_screen_id, action_class_id, IFNULL(to_screen_id, ''), result);

-- Per scope and environment, the period a build served (design § 6.7).
CREATE TABLE build_epochs (
  id                   TEXT PRIMARY KEY,
  portal_id            TEXT NOT NULL CHECK (length(portal_id) > 0),
  scope                TEXT NOT NULL CHECK (length(scope) > 0),
  environment          TEXT NOT NULL CHECK (length(environment) > 0),
  build_id             TEXT NOT NULL REFERENCES builds(id),
  first_visit_id       TEXT NOT NULL REFERENCES page_visits(id),
  last_visit_id        TEXT NOT NULL REFERENCES page_visits(id),
  overlaps_previous    INTEGER NOT NULL DEFAULT 0 CHECK (overlaps_previous IN (0,1)),
  model_version_id     TEXT NOT NULL REFERENCES model_versions(id)
) STRICT;
CREATE INDEX ix_build_epochs_portal ON build_epochs (portal_id, scope, environment);
