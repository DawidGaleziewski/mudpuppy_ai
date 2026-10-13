-- 0015_screens (up): a screen is (portal_id, route_template, cluster_id); each state is one observed
-- revision of its screen, numbered by first sighting (r1, r2, ...). Spec 022 research.md R1/R2.
-- No separate index on states.screen_id: the UNIQUE (screen_id, screen_rev) index leads with it.
-- Which revision a scan saw is state_observations -> states.screen_id/screen_rev; nothing new per observation.
-- screen_id/screen_rev stay NULL-able: a crawler that does not know the columns yet still inserts states.

CREATE TABLE screens (
  id             TEXT PRIMARY KEY,                                  -- UUIDv7
  portal_id      TEXT NOT NULL,
  route_template TEXT NOT NULL,
  cluster_id     TEXT NOT NULL,
  title          TEXT NOT NULL,                                     -- title of the latest revision (display only)
  first_seen_run TEXT NOT NULL REFERENCES runs(id),
  created_at     TEXT NOT NULL,
  UNIQUE (portal_id, route_template, cluster_id)
) STRICT;

ALTER TABLE states ADD COLUMN screen_id TEXT REFERENCES screens(id);
ALTER TABLE states ADD COLUMN screen_rev INTEGER CHECK (screen_rev IS NULL OR screen_rev >= 1);

-- Backfill: one screen per distinct (portal, route, cluster); first_seen_run from its earliest state,
-- title from its latest, created_at = earliest state's created_at. The id is a UUIDv7 built from that
-- timestamp (48-bit ms, version 7, variant 10xx, random rest).
INSERT INTO screens (id, portal_id, route_template, cluster_id, title, first_seen_run, created_at)
WITH ranked AS (
  SELECT portal_id, route_template, cluster_id, title, first_seen_run, created_at,
         row_number() OVER (PARTITION BY portal_id, route_template, cluster_id ORDER BY created_at, id)      AS first_rank,
         row_number() OVER (PARTITION BY portal_id, route_template, cluster_id ORDER BY created_at DESC, id DESC) AS last_rank
  FROM states
),
firsts AS (
  SELECT f.portal_id, f.route_template, f.cluster_id, f.first_seen_run, f.created_at,
         (SELECT l.title FROM ranked l
           WHERE l.portal_id = f.portal_id AND l.route_template = f.route_template
             AND l.cluster_id = f.cluster_id AND l.last_rank = 1) AS title,
         CAST((julianday(f.created_at) - 2440587.5) * 86400000 AS INTEGER) AS ms,
         hex(randomblob(9)) AS r
  FROM ranked f WHERE f.first_rank = 1
)
SELECT lower(printf('%08x-%04x-7%s-%s%s-%s',
                    ms >> 16, ms & 65535, substr(r, 1, 3),
                    substr('89ab', 1 + (abs(random()) % 4), 1), substr(r, 4, 3), substr(r, 7, 12))),
       portal_id, route_template, cluster_id, title, first_seen_run, created_at
FROM firsts;

UPDATE states SET
  screen_id = (SELECT s.id FROM screens s
                WHERE s.portal_id = states.portal_id AND s.route_template = states.route_template
                  AND s.cluster_id = states.cluster_id),
  screen_rev = (SELECT count(*) FROM states o
                 WHERE o.portal_id = states.portal_id AND o.route_template = states.route_template
                   AND o.cluster_id = states.cluster_id
                   AND (o.created_at < states.created_at OR (o.created_at = states.created_at AND o.id <= states.id)));

CREATE UNIQUE INDEX ux_states_screen_rev ON states (screen_id, screen_rev);
