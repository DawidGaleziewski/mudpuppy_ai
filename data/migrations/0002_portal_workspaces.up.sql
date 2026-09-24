-- 0002_portal_workspaces (up): portal-scoped states, robots.txt policies, portal export/delete log (R-11 spec 002).
-- Conventions: see data/schema/README.md. The runner turns PRAGMA foreign_keys off around this file's table
-- rebuilds (SQLite forbids changing it inside a transaction, and with it on a DROP TABLE of a table that
-- other tables reference by foreign key fails as if every child row were orphaned) and runs
-- PRAGMA foreign_key_check before committing.

-- states: add portal_id (backfilled from the first-seen run's portal), rescope fingerprint uniqueness and
-- the cluster index to (portal_id, ...) so states never merge across portals (FR-026, FR-027).
CREATE TABLE states_new (
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
  created_at     TEXT NOT NULL
) STRICT;

INSERT INTO states_new
  (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref, confidence, stabilization, first_seen_run, created_at)
SELECT s.id, r.portal_id, s.fingerprint, s.cluster_id, s.route_template, s.title, s.evidence_ref, s.confidence, s.stabilization, s.first_seen_run, s.created_at
FROM states s
JOIN runs r ON r.id = s.first_seen_run;

DROP TABLE states;
ALTER TABLE states_new RENAME TO states;

CREATE UNIQUE INDEX ux_states_portal_fingerprint ON states(portal_id, fingerprint);
CREATE INDEX ix_states_portal_cluster ON states(portal_id, cluster_id);

-- frontier: new terminal status robots_disallowed (FR-003), required like the other skip statuses.
CREATE TABLE frontier_new (
  id           TEXT PRIMARY KEY,
  run_id       TEXT NOT NULL REFERENCES runs(id),
  state_id     TEXT NOT NULL REFERENCES states(id),
  action_id    TEXT REFERENCES actions(id),  -- null for navigate() refusals that have no extracted action
  action_json  TEXT NOT NULL CHECK (json_valid(action_json)),
  safety_class TEXT NOT NULL CHECK (safety_class IN ('read','mutating','destructive','external-side-effect')),
  status       TEXT NOT NULL CHECK (status IN ('pending','done','skipped_unsafe','out_of_scope','denylisted','robots_disallowed','budget_reached','unreachable')),
  priority     INTEGER NOT NULL DEFAULT 0,   -- higher first; ties broken by id (UUIDv7 = FIFO)
  depth        INTEGER NOT NULL DEFAULT 0 CHECK (depth >= 0),
  reason       TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  CHECK (status IN ('pending','done') OR reason IS NOT NULL)
) STRICT;

INSERT INTO frontier_new
  (id, run_id, state_id, action_id, action_json, safety_class, status, priority, depth, reason, created_at, updated_at)
SELECT id, run_id, state_id, action_id, action_json, safety_class, status, priority, depth, reason, created_at, updated_at
FROM frontier;

DROP TABLE frontier;
ALTER TABLE frontier_new RENAME TO frontier;

-- get_next_frontier_item: WHERE run_id=? AND status='pending' ORDER BY priority DESC, id; also covers run_id lookups.
CREATE INDEX ix_frontier_queue ON frontier(run_id, status, priority DESC, id);

-- decision_log: new kind 'note', for observations that did not change the run's course (FR-009), e.g. the
-- page's own requests to robots-disallowed URLs.
CREATE TABLE decision_log_new (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL REFERENCES runs(id),
  kind        TEXT NOT NULL CHECK (kind IN ('skip','refuse','merge','split','warning','note')),
  rule        TEXT,             -- rule/cap that applied
  reason      TEXT NOT NULL,
  subject_ref TEXT,             -- state/edge/frontier/action id concerned
  detail_json TEXT CHECK (detail_json IS NULL OR json_valid(detail_json)),
  created_at  TEXT NOT NULL
) STRICT;

INSERT INTO decision_log_new
  (id, run_id, kind, rule, reason, subject_ref, detail_json, created_at)
SELECT id, run_id, kind, rule, reason, subject_ref, detail_json, created_at
FROM decision_log;

DROP TABLE decision_log;
ALTER TABLE decision_log_new RENAME TO decision_log;

-- robots_policies: one fetched robots.txt per host per fetch (FR-001 to FR-007). The latest row per
-- (run_id, host) is the policy in force. evidence_ref always points at a record even for 404/failure.
CREATE TABLE robots_policies (
  id             TEXT PRIMARY KEY,
  run_id         TEXT NOT NULL REFERENCES runs(id),
  host           TEXT NOT NULL,
  source_url     TEXT NOT NULL,
  final_url      TEXT,           -- after redirects; null when unreachable before a response
  outcome        TEXT NOT NULL CHECK (outcome IN ('rules','no_rules','unreachable')),
  http_status    INTEGER,        -- null on network error or timeout
  product_token  TEXT NOT NULL,
  group_used     TEXT,           -- the User-Agent line of the applied group ('*' or the token); null unless 'rules'
  crawl_delay_s  REAL,           -- from the applied group; null if absent
  ignored_lines  INTEGER NOT NULL DEFAULT 0,
  truncated      INTEGER NOT NULL CHECK (truncated IN (0,1)),
  content_sha256 TEXT,           -- null when there is no body
  evidence_ref   TEXT NOT NULL CHECK (length(evidence_ref) > 0),
  fetched_at     TEXT NOT NULL
) STRICT;
CREATE INDEX ix_robots_policies_run_host_fetched ON robots_policies(run_id, host, fetched_at);

-- portal_data_log: operator exports and deletions (FR-028). No FK on portal_id: it must outlive a delete
-- of that portal's runs. Never touched by portal:delete.
CREATE TABLE portal_data_log (
  id          TEXT PRIMARY KEY,
  portal_id   TEXT NOT NULL,
  environment TEXT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('export','delete')),
  operator    TEXT NOT NULL,
  counts_json TEXT NOT NULL CHECK (json_valid(counts_json)),
  target      TEXT,             -- export directory; null for delete
  created_at  TEXT NOT NULL
) STRICT;
