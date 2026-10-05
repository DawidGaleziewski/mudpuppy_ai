-- 0007_credentials (up): encrypted test-user credentials per portal and environment (spec 009, R-25).
-- Conventions: see data/schema/README.md. Written only by the vault (@pathfinder/vault), never
-- joined, exported, shown in the dashboard or deleted by portal:delete. Values are AES-256-GCM
-- ciphertext; plaintext never reaches the database.

CREATE TABLE credentials (
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
