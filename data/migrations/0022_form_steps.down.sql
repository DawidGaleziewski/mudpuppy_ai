-- 0022_form_steps (down): forget form steps and state kinds. SQLite cannot drop a column that carries a
-- FOREIGN KEY or a CHECK, so states is rebuilt without form_step_id/state_kind (the runner has
-- foreign_keys OFF during a migration, as 0015's down relied on), keeping every other column and row and
-- the indexes of 0002, 0006 and 0015. Any form_step_id / state_kind value is lost.

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
  layout_ref     TEXT CHECK (layout_ref IS NULL OR length(layout_ref) > 0),
  screen_id      TEXT REFERENCES screens(id),
  screen_rev     INTEGER CHECK (screen_rev IS NULL OR screen_rev >= 1)
) STRICT;

INSERT INTO states_old (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref,
                        confidence, stabilization, first_seen_run, created_at, screenshot_ref, layout_ref,
                        screen_id, screen_rev)
SELECT id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref,
       confidence, stabilization, first_seen_run, created_at, screenshot_ref, layout_ref,
       screen_id, screen_rev
FROM states;

DROP TABLE states;
ALTER TABLE states_old RENAME TO states;
CREATE UNIQUE INDEX ux_states_portal_fingerprint ON states(portal_id, fingerprint);
CREATE INDEX ix_states_portal_cluster ON states(portal_id, cluster_id);
CREATE UNIQUE INDEX ux_states_screen_rev ON states (screen_id, screen_rev);

DROP TABLE form_steps;
