-- GENERATED from data/migrations/*.up.sql applied in order (currently through 0004_ba_documentation). Do not edit by hand.
-- Regenerate after every migration; see data/schema/README.md.

CREATE TABLE runs (
  id                  TEXT PRIMARY KEY,
  portal_id           TEXT NOT NULL,
  persona_id          TEXT NOT NULL,
  mode                TEXT NOT NULL,  -- 'map' today; deliberately no CHECK so 'trace' needs no migration (FR-022); Zod enforces
  environment         TEXT NOT NULL,
  env_version_or_date TEXT NOT NULL,
  seed_id             TEXT,
  viewport            TEXT NOT NULL,
  locale              TEXT NOT NULL,
  browser             TEXT NOT NULL,
  config_snapshot     TEXT NOT NULL CHECK (json_valid(config_snapshot)),
  status              TEXT NOT NULL DEFAULT 'running'
                      CHECK (status IN ('running','completed','stopped_warning','interrupted')),
  warning             TEXT,           -- run-level warning (block/CAPTCHA, FR-008); required when stopped_warning
  steps_used          INTEGER NOT NULL DEFAULT 0 CHECK (steps_used >= 0),
  elapsed_ms          INTEGER NOT NULL DEFAULT 0 CHECK (elapsed_ms >= 0),  -- accumulated active time, excludes downtime between resumes
  max_depth_reached   INTEGER NOT NULL DEFAULT 0 CHECK (max_depth_reached >= 0),
  started_at          TEXT NOT NULL,
  ended_at            TEXT,
  coverage            TEXT CHECK (coverage IS NULL OR json_valid(coverage)),
  CHECK (status <> 'stopped_warning' OR warning IS NOT NULL)
) STRICT;

CREATE TABLE state_observations (
  run_id       TEXT NOT NULL REFERENCES runs(id),
  state_id     TEXT NOT NULL REFERENCES states(id),
  persona_id   TEXT NOT NULL,
  evidence_ref TEXT NOT NULL CHECK (length(evidence_ref) > 0),
  observed_at  TEXT NOT NULL,
  PRIMARY KEY (run_id, state_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE actions (
  id              TEXT PRIMARY KEY,   -- this IS the action_id
  run_id          TEXT NOT NULL REFERENCES runs(id),
  state_id        TEXT NOT NULL REFERENCES states(id),  -- state the action was extracted from
  role            TEXT NOT NULL,
  accessible_name TEXT,
  action_json     TEXT NOT NULL CHECK (json_valid(action_json)),
  safety_class    TEXT NOT NULL CHECK (safety_class IN ('read','mutating','destructive','external-side-effect')),
  allowed         INTEGER NOT NULL CHECK (allowed IN (0,1)),
  skip_reason     TEXT,
  created_at      TEXT NOT NULL,
  CHECK (allowed = 1 OR skip_reason IS NOT NULL)
) STRICT;

CREATE TABLE edges (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES runs(id),
  from_state    TEXT NOT NULL REFERENCES states(id),
  to_state      TEXT REFERENCES states(id),  -- nullable: skipped edges and actions that led nowhere
  action_json   TEXT NOT NULL CHECK (json_valid(action_json)),
  safety_class  TEXT NOT NULL CHECK (safety_class IN ('read','mutating','destructive','external-side-effect')),
  status        TEXT NOT NULL CHECK (status IN ('executed','skipped')),
  evidence_ref  TEXT NOT NULL CHECK (length(evidence_ref) > 0),
  confidence    TEXT NOT NULL CHECK (confidence IN ('observed','inferred','needs_confirmation')),
  error         TEXT CHECK (error IS NULL OR json_valid(error)),
  stabilization TEXT NOT NULL CHECK (stabilization IN ('settled','never_stabilized')),
  created_at    TEXT NOT NULL
) STRICT;
CREATE INDEX ix_edges_run_id ON edges(run_id);

CREATE TABLE forms (
  id           TEXT PRIMARY KEY,
  run_id       TEXT NOT NULL REFERENCES runs(id),
  state_id     TEXT NOT NULL REFERENCES states(id),
  fields_json  TEXT NOT NULL CHECK (json_valid(fields_json)),
  evidence_ref TEXT NOT NULL CHECK (length(evidence_ref) > 0),
  confidence   TEXT NOT NULL CHECK (confidence IN ('observed','inferred','needs_confirmation')),
  created_at   TEXT NOT NULL
) STRICT;

CREATE TABLE network_calls (
  id             TEXT PRIMARY KEY,
  run_id         TEXT NOT NULL REFERENCES runs(id),
  edge_id        TEXT REFERENCES edges(id),  -- null when observed passively on state load
  method         TEXT NOT NULL,
  url_template   TEXT NOT NULL,
  status         INTEGER NOT NULL,
  req_schema     TEXT NOT NULL CHECK (json_valid(req_schema)),  -- shape only, no PII
  res_schema     TEXT NOT NULL CHECK (json_valid(res_schema)),  -- shape only, no PII
  console_errors TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(console_errors) AND json_type(console_errors) = 'array'),
  created_at     TEXT NOT NULL
) STRICT;

CREATE TABLE open_questions (
  id         TEXT PRIMARY KEY,
  run_id     TEXT NOT NULL REFERENCES runs(id),
  text       TEXT NOT NULL,
  about_ref  TEXT NOT NULL,  -- polymorphic (state/edge/form id), validated by the tool, no FK
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','addressed')),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE rule_candidates (
  id           TEXT PRIMARY KEY,
  run_id       TEXT NOT NULL REFERENCES runs(id),
  text         TEXT NOT NULL,
  about_ref    TEXT NOT NULL,
  evidence_ref TEXT NOT NULL CHECK (length(evidence_ref) > 0),
  confidence   TEXT NOT NULL CHECK (confidence = 'inferred'),
  created_at   TEXT NOT NULL
) STRICT;

-- Rebuilt by 0002_portal_workspaces: portal_id added, fingerprint uniqueness and the cluster index
-- rescoped per portal (FR-026, FR-027).
CREATE TABLE states (
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
CREATE UNIQUE INDEX ux_states_portal_fingerprint ON states(portal_id, fingerprint);
CREATE INDEX ix_states_portal_cluster ON states(portal_id, cluster_id);

-- Rebuilt by 0002_portal_workspaces: status CHECK adds 'robots_disallowed' (FR-003).
-- Server-owned frontier: pending queue + done + skipped in one table. Visited set = state_observations + status 'done'.
CREATE TABLE frontier (
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
-- get_next_frontier_item: WHERE run_id=? AND status='pending' ORDER BY priority DESC, id; also covers run_id lookups.
CREATE INDEX ix_frontier_queue ON frontier(run_id, status, priority DESC, id);

-- Rebuilt by 0002_portal_workspaces: kind CHECK adds 'note' (FR-009), for the page's own requests to
-- robots-disallowed URLs and other observations that did not change the run's course.
-- FR-021 decision log (persisted in SQLite; pino also mirrors each entry to stdout).
CREATE TABLE decision_log (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL REFERENCES runs(id),
  kind        TEXT NOT NULL CHECK (kind IN ('skip','refuse','merge','split','warning','note')),
  rule        TEXT,             -- rule/cap that applied
  reason      TEXT NOT NULL,
  subject_ref TEXT,             -- state/edge/frontier/action id concerned
  detail_json TEXT CHECK (detail_json IS NULL OR json_valid(detail_json)),
  created_at  TEXT NOT NULL
) STRICT;

-- Added by 0002_portal_workspaces: one fetched robots.txt per host per fetch (FR-001 to FR-007). The
-- latest row per (run_id, host) is the policy in force. evidence_ref always points at a record, even
-- for a 404 or a failed fetch.
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

-- Added by 0002_portal_workspaces: operator exports and deletions (FR-028). No FK on portal_id: it
-- must outlive a delete of that portal's runs. Never touched by portal:delete.
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

-- Added by 0003_trace (R-17 spec 005): one row per MCP server process; orders trace_spans across
-- processes and records how tracing was configured.
CREATE TABLE trace_boots (
  id          TEXT PRIMARY KEY,
  started_at  TEXT NOT NULL,
  ended_at    TEXT,            -- set on clean shutdown; NULL = crashed or still running
  environment TEXT NOT NULL,   -- data/db/<env> this process writes
  server      TEXT NOT NULL CHECK (server IN ('pathfinder')),  -- room for the BA server later
  pid         INTEGER NOT NULL,
  version     TEXT NOT NULL,   -- @pathfinder/mcp-server package version + git short SHA if available
  trace_level TEXT NOT NULL CHECK (trace_level IN ('off','standard','verbose')),
  pw_trace    TEXT NOT NULL CHECK (pw_trace IN ('non_production','all'))  -- 'all' = PATHFINDER_PW_TRACE=1
) STRICT;

-- Added by 0003_trace: one row per call/phase/event of a boot. Ordered by (boot_id, seq); a run's
-- spans span boots in rare crash/resume cases, so callers order by boot.started_at then seq.
CREATE TABLE trace_spans (
  id             TEXT PRIMARY KEY,
  boot_id        TEXT NOT NULL REFERENCES trace_boots(id),
  seq            INTEGER NOT NULL,  -- in-process counter; unique per boot
  run_id         TEXT REFERENCES runs(id),          -- NULL for calls outside any run (FR-016)
  parent_id      TEXT REFERENCES trace_spans(id),   -- NULL for call spans and between-calls events
  kind           TEXT NOT NULL CHECK (kind IN ('call','phase','event')),
  name           TEXT NOT NULL,  -- vocabulary in specs/005-crawl-run-observability-trace/contracts/trace-spans.md
  status         TEXT NOT NULL CHECK (status IN ('running','ok','refused','stopped','error','unfinished')),
  started_at     TEXT NOT NULL,
  ended_at       TEXT,           -- NULL while running/unfinished and for events
  duration_ms    INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  attrs_json     TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(attrs_json) AND json_type(attrs_json) = 'object'),  -- scrubbed, <= 8 KB
  payload_ref    TEXT,           -- evidence file (<sha256>.json) with the full scrubbed payload
  summary        TEXT NOT NULL,  -- masked one-liner for list views
  decision_id    TEXT REFERENCES decision_log(id),  -- only on 'event decision'
  tool_use_id    TEXT,           -- 'call' only; from _meta["claudecode/toolUseId"]
  agent_id       TEXT,           -- 'call' only; from _meta["claudecode/agentId"] when sent
  rationale      TEXT CHECK (rationale IS NULL OR length(rationale) <= 300),  -- 'call' only; masked; agent-stated
  pw_trace_path  TEXT,           -- 'call' only; relative to data/
  between_calls  INTEGER NOT NULL DEFAULT 0 CHECK (between_calls IN (0,1)),  -- 1 = event of a run with no active call
  CHECK (
    duration_ms IS NOT NULL
    OR kind = 'event'
    OR status IN ('running','unfinished')
  )
) STRICT;
CREATE UNIQUE INDEX ux_trace_spans_boot_seq ON trace_spans(boot_id, seq);
CREATE INDEX ix_trace_spans_run ON trace_spans(run_id, parent_id, boot_id, seq);
CREATE INDEX ix_trace_spans_tool_use ON trace_spans(tool_use_id);
CREATE INDEX ix_trace_spans_decision ON trace_spans(decision_id);

-- Added by 0003_trace: imported crawler agent transcript, one row per content block, joined to
-- trace_spans by tool_use_id (research §12; contracts/agent-import.md).
CREATE TABLE agent_turns (
  id                    TEXT PRIMARY KEY,
  agent_id              TEXT NOT NULL,
  agent_type            TEXT NOT NULL,  -- 'crawler'
  session_id            TEXT,           -- parent Claude Code session
  message_uuid          TEXT NOT NULL,  -- transcript entry 'uuid' (one entry per content block)
  block_index           INTEGER NOT NULL,  -- entry apiBlockIndex (else position in content)
  api_message_id        TEXT,           -- assistant message.id; groups the blocks of one API response
  run_id                TEXT REFERENCES runs(id),  -- assignment rule in research §12; NULL if no match
  role                  TEXT NOT NULL CHECK (role IN ('assistant','user')),
  kind                  TEXT NOT NULL CHECK (kind IN ('text','thinking','tool_use','tool_result')),
  tool_use_id           TEXT,           -- tool_use/tool_result
  tool_name             TEXT,           -- tool_use
  text                  TEXT,           -- masked, <= 4 KB (text blocks; tool_use input as scrubbed JSON)
  payload_ref           TEXT,           -- evidence file when over the cap
  is_error              INTEGER CHECK (is_error IS NULL OR is_error IN (0,1)),  -- tool_result
  model                 TEXT,           -- assistant messages
  input_tokens          INTEGER,        -- once per api_message_id, on its highest block_index row
  output_tokens         INTEGER,        -- max over the message's entries (research §12)
  cache_read_tokens     INTEGER,
  cache_creation_tokens INTEGER,
  matched               INTEGER NOT NULL DEFAULT 0 CHECK (matched IN (0,1)),  -- tool_use of mcp__pathfinder__* with a matching span
  created_at            TEXT NOT NULL,  -- transcript 'timestamp'
  imported_at           TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX ux_agent_turns_agent_message_block ON agent_turns(agent_id, message_uuid, block_index);
CREATE INDEX ix_agent_turns_run ON agent_turns(run_id, created_at);
CREATE INDEX ix_agent_turns_tool_use ON agent_turns(tool_use_id);

-- Added by 0004_ba_documentation (R-13): Layer B, the BA deliverable. Sessions, records, revisions,
-- evidence links, relations, reviews, follow-up tasks. See specs/004-ba-documentation/data-model.md.
CREATE TABLE analysis_sessions (
  id          TEXT PRIMARY KEY,
  portal_id   TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('running','completed','interrupted')),
  passes_json TEXT NOT NULL CHECK (json_valid(passes_json) AND json_type(passes_json) = 'array'),
  summary     TEXT,           -- required when status = 'completed'
  gaps_json   TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(gaps_json) AND json_type(gaps_json) = 'array'),
  started_at  TEXT NOT NULL,
  ended_at    TEXT,           -- NULL while running
  CHECK (status <> 'completed' OR summary IS NOT NULL)
) STRICT;

-- Which runs a session read (must belong to the session's portal; checked by the tool, not the schema).
CREATE TABLE analysis_session_runs (
  session_id TEXT NOT NULL REFERENCES analysis_sessions(id),
  run_id     TEXT NOT NULL REFERENCES runs(id),
  PRIMARY KEY (session_id, run_id)
) STRICT, WITHOUT ROWID;

-- One row per documented thing; content lives in its revisions. latest_rev/confirmed_rev/title/withdrawn
-- are denormalised by the status engine in the same transaction as the revision/review write (fast
-- listing; checked by docs:audit).
CREATE TABLE doc_records (
  id            TEXT PRIMARY KEY,
  portal_id     TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN (
                   'capability','screen','process','use_case','requirement','nfr','business_rule',
                   'glossary_term','data_item','assumption','open_question','followup'
                 )),
  key           TEXT NOT NULL,   -- '<PREFIX>-<seq 3+ digits>'
  seq           INTEGER NOT NULL,
  title         TEXT NOT NULL,
  latest_rev    INTEGER NOT NULL,
  confirmed_rev INTEGER,
  withdrawn     INTEGER NOT NULL DEFAULT 0 CHECK (withdrawn IN (0,1)),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (portal_id, key),
  UNIQUE (portal_id, kind, seq)
) STRICT;

-- Immutable except `status`, which only the status engine changes (research.md §4). `responds_to_review`
-- forward-references doc_reviews, created further below (SQLite does not check a referenced table exists
-- at CREATE TABLE time).
CREATE TABLE doc_revisions (
  id                 TEXT PRIMARY KEY,
  record_id          TEXT NOT NULL REFERENCES doc_records(id),
  rev_no             INTEGER NOT NULL,
  session_id         TEXT NOT NULL REFERENCES analysis_sessions(id),
  change             TEXT NOT NULL CHECK (change IN ('create','revise','withdraw')),
  content_json       TEXT NOT NULL CHECK (json_valid(content_json)),
  confidence         TEXT NOT NULL CHECK (confidence IN ('observed','inferred','needs_confirmation')),
  not_observable     INTEGER NOT NULL DEFAULT 0 CHECK (not_observable IN (0,1)),
  status             TEXT NOT NULL CHECK (status IN ('draft','confirmed','rejected','superseded')),
  change_note        TEXT,        -- required for change IN ('revise','withdraw')
  responds_to_review TEXT REFERENCES doc_reviews(id),
  created_at         TEXT NOT NULL,
  UNIQUE (record_id, rev_no),
  CHECK (change NOT IN ('revise','withdraw') OR change_note IS NOT NULL)
) STRICT;

-- Evidence for a revision. target_id is polymorphic (resolved by the tool; no FK). run_id is the run the
-- evidence came from, resolved at write time; NULL only for target_kind IN ('doc_record','review') since
-- a human answer or another doc is not run-bound (research.md §5).
CREATE TABLE doc_evidence_links (
  id          TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL REFERENCES doc_revisions(id),
  target_kind TEXT NOT NULL CHECK (target_kind IN (
                 'state','edge','action','form','network_call','rule_candidate','open_question',
                 'decision','process','process_step','doc_record','review'
               )),
  target_id   TEXT NOT NULL,
  run_id      TEXT REFERENCES runs(id),
  note        TEXT,
  CHECK (run_id IS NOT NULL OR target_kind IN ('doc_record','review'))
) STRICT;
-- run_id -> records reverse lookups (FR-033).
CREATE INDEX ix_doc_evidence_links_run_id ON doc_evidence_links(run_id);
-- get_evidence(target_kind, target_id) and evidence resolution.
CREATE INDEX ix_doc_evidence_links_target ON doc_evidence_links(target_kind, target_id);

-- Typed record -> record relations, versioned with the revision that asserts them. Process steps and
-- personas are not records: steps live in process_steps (0005), the persona in the process record's
-- content.
CREATE TABLE doc_relations (
  from_revision_id TEXT NOT NULL REFERENCES doc_revisions(id),
  to_record_id     TEXT NOT NULL REFERENCES doc_records(id),
  type             TEXT NOT NULL CHECK (type IN (
                      'contains','describes','refines','enforces','appears_on','uses_term',
                      'synonym_of','answers','depends_on'
                    )),
  PRIMARY KEY (from_revision_id, to_record_id, type)
) STRICT, WITHOUT ROWID;

-- Written only by docs:review. text required for reject/comment; confirm needs no text.
CREATE TABLE doc_reviews (
  id          TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL REFERENCES doc_revisions(id),
  action      TEXT NOT NULL CHECK (action IN ('confirm','reject','comment')),
  reviewer    TEXT NOT NULL,
  text        TEXT,
  created_at  TEXT NOT NULL,
  CHECK (action = 'confirm' OR text IS NOT NULL)
) STRICT;

-- Operational status of a 'followup' doc_record; transitions by deterministic code only (research §11).
CREATE TABLE followup_tasks (
  record_id      TEXT PRIMARY KEY REFERENCES doc_records(id),
  status         TEXT NOT NULL CHECK (status IN ('open','in_progress','done','blocked','cancelled')),
  run_id         TEXT REFERENCES runs(id),
  blocked_reason TEXT,        -- required when status = 'blocked'
  updated_at     TEXT NOT NULL,
  CHECK (status <> 'blocked' OR blocked_reason IS NOT NULL)
) STRICT;
