-- 0038_similarity_classifiers (up, spec 039 FR-050, T090): the similarity classifier trained for a
-- portal and fingerprint profile on the pair labels, with its held-out F1 against the single
-- threshold. The reconciler clusters with the latest one that beat τ (`better = 1`); otherwise τ.

CREATE TABLE similarity_classifiers (
  id           TEXT PRIMARY KEY,                                    -- UUIDv7
  portal_id    TEXT NOT NULL CHECK (length(portal_id) > 0),
  profile      TEXT NOT NULL CHECK (length(profile) > 0),
  features     TEXT NOT NULL CHECK (json_valid(features) AND json_type(features) = 'array'),
  weights      TEXT NOT NULL CHECK (json_valid(weights) AND json_type(weights) = 'array'),
  intercept    REAL NOT NULL,
  labels       INTEGER NOT NULL CHECK (labels >= 0),
  held_out     INTEGER NOT NULL CHECK (held_out >= 0),
  f1           REAL NOT NULL CHECK (f1 >= 0 AND f1 <= 1),
  tau          REAL NOT NULL CHECK (tau > 0 AND tau <= 1),
  tau_f1       REAL NOT NULL CHECK (tau_f1 >= 0 AND tau_f1 <= 1),
  better       INTEGER NOT NULL CHECK (better IN (0,1)),
  trained_at   TEXT NOT NULL
) STRICT;
CREATE INDEX ix_similarity_classifiers_portal ON similarity_classifiers (portal_id, profile, trained_at);
