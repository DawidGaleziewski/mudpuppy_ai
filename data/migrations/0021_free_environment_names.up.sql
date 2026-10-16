-- 0021_free_environment_names (up): environment names are free names the user declares per portal
-- (owner decision D-1, 2026-10-15, spec 030 R-61), so the IN ('sandbox','staging','production') CHECK on
-- credentials.environment and process_live.environment becomes the format check of the config schema:
-- starts with a-z, then a-z 0-9 or '-', 1 to 40 characters. Both tables are rebuilt (SQLite cannot alter a
-- CHECK); every other column, constraint, FK, UNIQUE and index is unchanged. The runner turns foreign keys
-- off for the rebuild. Nothing references either table.

CREATE TABLE credentials_new (
  id          TEXT PRIMARY KEY,                                   -- UUIDv7
  portal_id   TEXT NOT NULL CHECK (length(portal_id) > 0),        -- config id; portals are files, no FK
  environment TEXT NOT NULL CHECK (environment GLOB '[a-z]*' AND length(environment) BETWEEN 1 AND 40 AND environment NOT GLOB '*[^a-z0-9-]*'),
  ref_name    TEXT NOT NULL CHECK (ref_name GLOB '[A-Za-z_]*' AND length(ref_name) <= 64),
  ciphertext  BLOB NOT NULL,                                      -- AES-256-GCM ciphertext || 16-byte tag
  nonce       BLOB NOT NULL CHECK (length(nonce) = 12),
  key_id      TEXT NOT NULL CHECK (length(key_id) = 8),           -- first 8 hex of sha256(key)
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (portal_id, environment, ref_name)
) STRICT;

INSERT INTO credentials_new (id, portal_id, environment, ref_name, ciphertext, nonce, key_id, created_at, updated_at)
SELECT id, portal_id, environment, ref_name, ciphertext, nonce, key_id, created_at, updated_at FROM credentials;

DROP TABLE credentials;
ALTER TABLE credentials_new RENAME TO credentials;

CREATE TABLE process_live_new (
  id          TEXT PRIMARY KEY,                                      -- UUIDv7
  process_id  TEXT NOT NULL REFERENCES ba_processes(id),
  environment TEXT NOT NULL CHECK (environment GLOB '[a-z]*' AND length(environment) BETWEEN 1 AND 40 AND environment NOT GLOB '*[^a-z0-9-]*'),
  variant_id  TEXT NOT NULL,
  variant_rev INTEGER NOT NULL CHECK (variant_rev >= 1),
  author      TEXT NOT NULL CHECK (length(author) > 0),
  reason      TEXT,
  created_at  TEXT NOT NULL,
  FOREIGN KEY (variant_id, variant_rev) REFERENCES process_variant_revisions(variant_id, rev)
) STRICT;

INSERT INTO process_live_new (id, process_id, environment, variant_id, variant_rev, author, reason, created_at)
SELECT id, process_id, environment, variant_id, variant_rev, author, reason, created_at FROM process_live;

DROP TABLE process_live;
ALTER TABLE process_live_new RENAME TO process_live;

CREATE INDEX ix_process_live_process_env ON process_live (process_id, environment, created_at);
