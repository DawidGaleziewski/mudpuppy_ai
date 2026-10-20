-- 0033_fingerprint_profiles (spec 039 T111–T115, owner answers 3 and 7 of 2026-10-20): the
-- fingerprint profile a portal's pages were fingerprinted with, recorded on every observation,
-- every component row and every model version, so the reconciler never compares two profiles;
-- and the τ a person accepted per portal and profile. `NULL` profile = rows before 0033, read as
-- the built-in `rows-v2`. The profile columns carry no REFERENCES so the down can drop them.

CREATE TABLE fingerprint_profiles (
  portal_id  TEXT NOT NULL CHECK (length(portal_id) > 0),
  id         TEXT NOT NULL CHECK (id GLOB '?*@[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]'),
  name       TEXT NOT NULL CHECK (length(name) > 0),
  rules_json TEXT NOT NULL CHECK (json_valid(rules_json) AND json_type(rules_json) = 'object'),
  first_seen TEXT NOT NULL,
  PRIMARY KEY (portal_id, id)
) STRICT, WITHOUT ROWID;

ALTER TABLE observations ADD COLUMN fingerprint_profile TEXT
  CHECK (fingerprint_profile IS NULL OR length(fingerprint_profile) > 0);
ALTER TABLE state_components ADD COLUMN profile TEXT
  CHECK (profile IS NULL OR length(profile) > 0);
ALTER TABLE model_versions ADD COLUMN fingerprint_profile TEXT
  CHECK (fingerprint_profile IS NULL OR length(fingerprint_profile) > 0);

CREATE TABLE tau_acceptances (
  id          TEXT PRIMARY KEY,                                   -- UUIDv7
  portal_id   TEXT NOT NULL CHECK (length(portal_id) > 0),
  profile     TEXT NOT NULL CHECK (length(profile) > 0),
  tau         REAL NOT NULL CHECK (tau > 0 AND tau <= 1),
  labels      INTEGER NOT NULL CHECK (labels >= 0),               -- pair labels it was calibrated on
  f1          REAL CHECK (f1 IS NULL OR (f1 >= 0 AND f1 <= 1)),
  accepted_by TEXT NOT NULL CHECK (length(accepted_by) > 0),
  accepted_at TEXT NOT NULL
) STRICT;
CREATE INDEX ix_tau_acceptances_portal ON tau_acceptances (portal_id, profile, accepted_at);
