-- 0029_capture_v2 (up): MudPuppy 2.0 Layer A capture (spec 039 M1, design § 5): builds per scope,
-- fingerprint components per state, journeys, attribute writes, and the new columns on the visit
-- (`page_visits` = the design's observations) and the edge (`edges` = the design's transitions; the
-- physical names stay, F-06@039). Additive: the new columns on existing tables are nullable so v1
-- rows and fixtures stay valid; the writers' Zod schemas require them on every v2 write. A
-- transition's target observation is the visit whose `edge_id` names it (no column, F-07@039).

-- One build of one scope of a portal: the signature of its content-hashed assets or a marker.
CREATE TABLE builds (
  id          TEXT PRIMARY KEY,                                      -- UUIDv7
  portal_id   TEXT NOT NULL CHECK (length(portal_id) > 0),
  scope       TEXT NOT NULL CHECK (length(scope) > 0),               -- 'shell', 'mfe:<folder>', 'frame:<host><path>'
  signature   TEXT NOT NULL CHECK (length(signature) > 0),           -- sha256, 'marker:<value>' or 'unknown'
  source      TEXT NOT NULL CHECK (source IN ('assets','marker','unknown')),
  assets_json TEXT NOT NULL CHECK (json_valid(assets_json) AND json_type(assets_json) = 'array'),
  first_seen  TEXT NOT NULL,
  UNIQUE (portal_id, scope, signature)
) STRICT;

-- The fingerprint v2 components of a state (design § 5.4); written once, with the state.
CREATE TABLE state_components (
  state_id       TEXT PRIMARY KEY REFERENCES states(id),
  structure_hash TEXT NOT NULL CHECK (length(structure_hash) = 64),
  content_hash   TEXT NOT NULL CHECK (length(content_hash) = 64),
  overlay_hash   TEXT NOT NULL CHECK (length(overlay_hash) = 64),
  calls_hash     TEXT NOT NULL CHECK (length(calls_hash) = 64),
  mounts_hash    TEXT NOT NULL CHECK (length(mounts_hash) = 64),
  minhash        BLOB NOT NULL CHECK (length(minhash) = 512),         -- 128 × uint32, big-endian
  element_keys   TEXT NOT NULL CHECK (json_valid(element_keys) AND json_type(element_keys) = 'array')
) STRICT, WITHOUT ROWID;

-- One continuous path of a run (design § 5.7). A backtrack is a child journey that inherits its
-- parent's steps up to branch_seq. end_reason/ended_at are set once, when the journey ends.
CREATE TABLE journeys (
  id                TEXT PRIMARY KEY,
  run_id            TEXT NOT NULL REFERENCES runs(id),
  parent_journey_id TEXT REFERENCES journeys(id),
  branch_seq        INTEGER CHECK (branch_seq IS NULL OR branch_seq >= 0),
  start_kind        TEXT NOT NULL CHECK (start_kind IN
                      ('entry_url','checkpoint','login','backtrack','resume','fresh_session')),
  checkpoint_id     TEXT REFERENCES checkpoints(id),
  end_reason        TEXT CHECK (end_reason IN
                      ('outcome','backtrack','reset','logout','error','budget','run_end')),
  started_at        TEXT NOT NULL,
  ended_at          TEXT,
  CHECK ((parent_journey_id IS NULL) = (branch_seq IS NULL)),
  CHECK ((end_reason IS NULL) = (ended_at IS NULL))
) STRICT;
CREATE INDEX ix_journeys_run ON journeys (run_id, started_at);

-- Persona attributes, typed inputs and shown values, by journey position (design § 5.8).
CREATE TABLE attribute_writes (
  id          TEXT PRIMARY KEY,
  journey_id  TEXT NOT NULL REFERENCES journeys(id),
  seq         INTEGER NOT NULL CHECK (seq >= 0),         -- 0 = journey start; else the transition seq
  name        TEXT NOT NULL CHECK (length(name) > 0),    -- 'persona.segment', 'input.wartość_pojazdu', 'shown.składka'
  source      TEXT NOT NULL CHECK (source IN ('persona','input','shown')),
  value_type  TEXT NOT NULL CHECK (value_type IN ('number','date','enum','bool','text','missing')),
  value_num   REAL,
  value_text  TEXT,
  element_key TEXT,                                      -- the field or label it came from
  created_at  TEXT NOT NULL,
  UNIQUE (journey_id, seq, name)
) STRICT;

-- The visit (observation): its journey, order in the run, step result, context and flags.
ALTER TABLE page_visits ADD COLUMN journey_id TEXT REFERENCES journeys(id);
ALTER TABLE page_visits ADD COLUMN seq INTEGER CHECK (seq IS NULL OR seq >= 1);
ALTER TABLE page_visits ADD COLUMN result TEXT CHECK (result IS NULL OR result IN
  ('ok','validation','business_error','technical_error','timeout','blocked'));
ALTER TABLE page_visits ADD COLUMN context_key TEXT CHECK (context_key IS NULL OR length(context_key) = 64);
ALTER TABLE page_visits ADD COLUMN flags_json TEXT NOT NULL DEFAULT '{}'
  CHECK (json_valid(flags_json) AND json_type(flags_json) = 'object');
CREATE UNIQUE INDEX ux_page_visits_run_seq ON page_visits (run_id, seq) WHERE seq IS NOT NULL;

CREATE TABLE observation_builds (
  page_visit_id TEXT NOT NULL REFERENCES page_visits(id),
  build_id      TEXT NOT NULL REFERENCES builds(id),
  PRIMARY KEY (page_visit_id, build_id)
) STRICT, WITHOUT ROWID;

-- The edge (transition): its journey position, the visit it started from, the element key, kind,
-- step result and who drove it.
ALTER TABLE edges ADD COLUMN journey_id TEXT REFERENCES journeys(id);
ALTER TABLE edges ADD COLUMN seq INTEGER CHECK (seq IS NULL OR seq >= 1);
ALTER TABLE edges ADD COLUMN from_visit_id TEXT REFERENCES page_visits(id);
ALTER TABLE edges ADD COLUMN element_key TEXT;
ALTER TABLE edges ADD COLUMN kind TEXT CHECK (kind IS NULL OR kind IN
  ('click','fill','select','check','submit','navigate','back'));
ALTER TABLE edges ADD COLUMN result TEXT CHECK (result IS NULL OR result IN
  ('ok','validation','business_error','technical_error','timeout','blocked'));
ALTER TABLE edges ADD COLUMN driver TEXT NOT NULL DEFAULT 'agent' CHECK (driver IN ('agent','headless'));
CREATE UNIQUE INDEX ux_edges_journey_seq ON edges (journey_id, seq) WHERE journey_id IS NOT NULL;

-- The endpoint schema of a call (design § 5.3): sha256 of its response shape; NULL for documents.
ALTER TABLE network_calls ADD COLUMN schema_hash TEXT CHECK (schema_hash IS NULL OR length(schema_hash) = 64);
CREATE INDEX ix_network_calls_schema ON network_calls (url_template, method, schema_hash);
