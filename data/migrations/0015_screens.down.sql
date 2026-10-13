-- 0015_screens (down): forget screens and revision numbers. SQLite cannot drop a column that carries a
-- FOREIGN KEY, so states is rebuilt without screen_id/screen_rev (the runner has foreign_keys OFF
-- during a migration, as 0014 relied on), keeping every column and row and the 0002/0006 indexes.

DROP INDEX ux_states_screen_rev;

CREATE TABLE states_old (
  id             TEXT PRIMARY KEY,
  portal_id      TEXT NOT NULL,
  fingerprint    TEXT NOT NULL,
  cluster_id     TEXT NOT NULL,
  route_template TEXT NOT NULL,
  title          TEXT NOT NULL,
  evidence_ref   TEXT NOT NULL CHECK (length(evidence_ref) > 0),
  confidence     TEXT NOT NULL CHECK (confidence IN ('observed','inferred','needs_confirmation')),
  stabilization  TEXT NOT NULL CHECK (stabilization IN ('settled','never_stabilized')),
  first_seen_run TEXT NOT NULL REFERENCES runs(id),
  created_at     TEXT NOT NULL,
  screenshot_ref TEXT CHECK (screenshot_ref IS NULL OR length(screenshot_ref) > 0),
  layout_ref     TEXT CHECK (layout_ref IS NULL OR length(layout_ref) > 0)
) STRICT;

INSERT INTO states_old (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref,
                        confidence, stabilization, first_seen_run, created_at, screenshot_ref, layout_ref)
SELECT id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref,
       confidence, stabilization, first_seen_run, created_at, screenshot_ref, layout_ref
FROM states;

DROP TABLE states;
ALTER TABLE states_old RENAME TO states;
CREATE UNIQUE INDEX ux_states_portal_fingerprint ON states(portal_id, fingerprint);
CREATE INDEX ix_states_portal_cluster ON states(portal_id, cluster_id);

DROP TABLE screens;
