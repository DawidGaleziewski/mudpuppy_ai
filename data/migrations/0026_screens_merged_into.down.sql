-- 0026_screens_merged_into (down): forget every merge. SQLite cannot drop a column that carries a FOREIGN KEY
-- or a CHECK, so screens is rebuilt without merged_into (the runner has foreign_keys OFF during a
-- migration, as 0015 relied on), keeping every other column and row and the UNIQUE key.

CREATE TABLE screens_old (
  id             TEXT PRIMARY KEY,                                  -- UUIDv7
  portal_id      TEXT NOT NULL,
  route_template TEXT NOT NULL,
  cluster_id     TEXT NOT NULL,
  title          TEXT NOT NULL,                                     -- title of the latest revision (display only)
  first_seen_run TEXT NOT NULL REFERENCES runs(id),
  created_at     TEXT NOT NULL,
  UNIQUE (portal_id, route_template, cluster_id)
) STRICT;

INSERT INTO screens_old (id, portal_id, route_template, cluster_id, title, first_seen_run, created_at)
SELECT id, portal_id, route_template, cluster_id, title, first_seen_run, created_at FROM screens;

DROP TABLE screens;
ALTER TABLE screens_old RENAME TO screens;
