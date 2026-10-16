-- 0021_free_environment_names (down): restore the IN ('sandbox','staging','production') CHECK on
-- credentials.environment and process_live.environment (tables rebuilt as in the up). This FAILS if any row
-- already uses another environment name (the copy violates the CHECK and the runner rolls back); delete or
-- rename those rows first. That is accepted: free names cannot be represented by the old triple.

CREATE TABLE credentials_old (
  id          TEXT PRIMARY KEY,                                   -- UUIDv7
  portal_id   TEXT NOT NULL CHECK (length(portal_id) > 0),        -- config id; portals are files, no FK
  environment TEXT NOT NULL CHECK (environment IN ('sandbox','staging','production')),
  ref_name    TEXT NOT NULL CHECK (ref_name GLOB '[A-Za-z_]*' AND length(ref_name) <= 64),
  ciphertext  BLOB NOT NULL,                                      -- AES-256-GCM ciphertext || 16-byte tag
  nonce       BLOB NOT NULL CHECK (length(nonce) = 12),
  key_id      TEXT NOT NULL CHECK (length(key_id) = 8),           -- first 8 hex of sha256(key)
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (portal_id, environment, ref_name)
) STRICT;

INSERT INTO credentials_old (id, portal_id, environment, ref_name, ciphertext, nonce, key_id, created_at, updated_at)
SELECT id, portal_id, environment, ref_name, ciphertext, nonce, key_id, created_at, updated_at FROM credentials;

DROP TABLE credentials;
ALTER TABLE credentials_old RENAME TO credentials;

CREATE TABLE process_live_old (
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

INSERT INTO process_live_old (id, process_id, environment, variant_id, variant_rev, author, reason, created_at)
SELECT id, process_id, environment, variant_id, variant_rev, author, reason, created_at FROM process_live;

DROP TABLE process_live;
ALTER TABLE process_live_old RENAME TO process_live;

CREATE INDEX ix_process_live_process_env ON process_live (process_id, environment, created_at);
