-- GENERATED from data/migrations/*.up.sql applied in order (currently through 0051_process_scope_merge). Do not edit by hand.
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
  -- 0009 (ALTER TABLE): the mudpuppy server process driving the run; NULL before 0009 (F-14).
  owner_id            TEXT CHECK (owner_id IS NULL OR length(owner_id) > 0),
  owner_pid           INTEGER CHECK (owner_pid IS NULL OR owner_pid > 0),
  -- 0027 (ALTER TABLE): the kind of directed run (NULL = a plain run: full map or trace by mode), the run it
  -- continues or retries, and the plan it came from (spec 034).
  run_type            TEXT CHECK (run_type IS NULL OR run_type IN ('full','continue','focused','recheck','retry','probe','trace')),
  parent_run_id       TEXT REFERENCES runs(id),
  plan_json           TEXT CHECK (plan_json IS NULL OR json_valid(plan_json)),
  CHECK (status <> 'stopped_warning' OR warning IS NOT NULL)
) STRICT;

CREATE TABLE state_observations (
  run_id       TEXT NOT NULL REFERENCES runs(id),
  state_id     TEXT NOT NULL REFERENCES states(id),
  persona_id   TEXT NOT NULL,
  evidence_ref TEXT NOT NULL CHECK (length(evidence_ref) > 0),
  observed_at  TEXT NOT NULL,
  -- 0011 (ALTER TABLE): JSON PageComposition (frames, mounts, loaders, clickables); NULL before 0011 (spec 015).
  composition_json TEXT CHECK (composition_json IS NULL OR json_valid(composition_json)),
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

-- 0032 renamed `edges` to `transitions` (the design's name, spec 039 T110).
CREATE TABLE transitions (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES runs(id),
  from_state    TEXT NOT NULL REFERENCES states(id),
  to_state      TEXT REFERENCES states(id),  -- nullable: skipped transitions and actions that led nowhere
  action_json   TEXT NOT NULL CHECK (json_valid(action_json)),
  safety_class  TEXT NOT NULL CHECK (safety_class IN ('read','mutating','destructive','external-side-effect')),
  status        TEXT NOT NULL CHECK (status IN ('executed','skipped')),
  evidence_ref  TEXT NOT NULL CHECK (length(evidence_ref) > 0),
  confidence    TEXT NOT NULL CHECK (confidence IN ('observed','inferred','needs_confirmation')),
  error         TEXT CHECK (error IS NULL OR json_valid(error)),
  stabilization TEXT NOT NULL CHECK (stabilization IN ('settled','never_stabilized')),
  created_at    TEXT NOT NULL,
  -- 0029 (ALTER TABLE, spec 039): the design's transition columns; NULL on v1 rows.
  journey_id    TEXT REFERENCES journeys(id),
  seq           INTEGER CHECK (seq IS NULL OR seq >= 1),
  from_observation_id TEXT REFERENCES observations(id),
  element_key   TEXT,
  kind          TEXT CHECK (kind IS NULL OR kind IN ('click','fill','select','check','submit','navigate','back')),
  result        TEXT CHECK (result IS NULL OR result IN ('ok','validation','business_error','technical_error','timeout','blocked')),
  driver        TEXT NOT NULL DEFAULT 'agent' CHECK (driver IN ('agent','headless'))
) STRICT;
CREATE INDEX ix_transitions_run_id ON transitions (run_id);
CREATE UNIQUE INDEX ux_transitions_journey_seq ON transitions (journey_id, seq) WHERE journey_id IS NOT NULL;

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
  transition_id  TEXT REFERENCES transitions(id),  -- null when observed passively on state load
  method         TEXT NOT NULL,
  url_template   TEXT NOT NULL,
  status         INTEGER NOT NULL,
  req_schema     TEXT NOT NULL CHECK (json_valid(req_schema)),  -- shape only, no PII
  res_schema     TEXT NOT NULL CHECK (json_valid(res_schema)),  -- shape only, no PII
  console_errors TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(console_errors) AND json_type(console_errors) = 'array'),
  created_at     TEXT NOT NULL,
  -- 0012 (ALTER TABLE): the verbatim request URL (query kept); NULL before 0012 (spec 019).
  url            TEXT,
  -- 0027 (ALTER TABLE): masked sample bodies, at most 4096 characters, recorded only outside production (spec 034).
  req_sample     TEXT CHECK (req_sample IS NULL OR length(req_sample) <= 4096),
  res_sample     TEXT CHECK (res_sample IS NULL OR length(res_sample) <= 4096),
  -- 0029 (ALTER TABLE, spec 039): sha256 of the response shape; NULL for documents and v1 rows.
  schema_hash    TEXT CHECK (schema_hash IS NULL OR length(schema_hash) = 64)
) STRICT;

-- Rebuilt by 0040 (spec 039 § 15): the subject (a state, transition or form) is an `entity_refs` row,
-- no longer the polymorphic `about_ref`.
CREATE TABLE open_questions (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES runs(id),
  text          TEXT NOT NULL,
  ref_id        TEXT NOT NULL REFERENCES entity_refs(id) DEFERRABLE INITIALLY DEFERRED,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','addressed')),
  created_at    TEXT NOT NULL,
  hypothesis_id TEXT REFERENCES hypotheses(id)   -- 0031 (spec 039): the hypothesis it is about
) STRICT;

-- Rebuilt by 0002_portal_workspaces: portal_id added, fingerprint uniqueness and the cluster index
-- rescoped per portal (FR-026, FR-027). screenshot_ref and layout_ref added by 0006 (ALTER TABLE).
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
  created_at     TEXT NOT NULL,
  -- 0006: captured once when the state is first recorded; NULL when capture failed or pre-0006.
  screenshot_ref TEXT CHECK (screenshot_ref IS NULL OR length(screenshot_ref) > 0),
  layout_ref     TEXT CHECK (layout_ref IS NULL OR length(layout_ref) > 0),
  -- 0015 (ALTER TABLE): the screen this state is a revision of, and its number (r1, r2, ... by first sighting).
  screen_id      TEXT REFERENCES screens(id),
  screen_rev     INTEGER CHECK (screen_rev IS NULL OR screen_rev >= 1),
  -- 0022 (ALTER TABLE): the form step this state shows (NULL: no controls, or recorded before 0022) and its kind.
  form_step_id   TEXT REFERENCES form_steps(id),
  state_kind     TEXT NOT NULL DEFAULT 'main' CHECK (state_kind IN ('main','validation','technical'))
) STRICT;
CREATE UNIQUE INDEX ux_states_portal_fingerprint ON states(portal_id, fingerprint);
CREATE INDEX ix_states_portal_cluster ON states(portal_id, cluster_id);
CREATE UNIQUE INDEX ux_states_screen_rev ON states (screen_id, screen_rev);

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
  subject_ref TEXT,             -- state/transition/frontier/action id concerned
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
  server      TEXT NOT NULL CHECK (server IN ('mudpuppy')),  -- room for the BA server later; 0048 renamed it from 'pathfinder'
  pid         INTEGER NOT NULL,
  version     TEXT NOT NULL,   -- @mudpuppy/mcp-server package version + git short SHA if available
  trace_level TEXT NOT NULL CHECK (trace_level IN ('off','standard','verbose')),
  pw_trace    TEXT NOT NULL CHECK (pw_trace IN ('non_production','all'))  -- 'all' = MUDPUPPY_PW_TRACE=1
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
  matched               INTEGER NOT NULL DEFAULT 0 CHECK (matched IN (0,1)),  -- tool_use of mcp__mudpuppy__* with a matching span
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
  -- 0053 (ALTER TABLE, spec 080): the process scope a documentation request named; NULL: the whole portal.
  scope_id    TEXT REFERENCES process_scopes(id),
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
                   'glossary_term','data_item','assumption','open_question','followup','api_endpoint'
                 )),
  key           TEXT NOT NULL,   -- '<PREFIX>-<seq 3+ digits>'
  seq           INTEGER NOT NULL,
  title         TEXT NOT NULL,
  latest_rev    INTEGER NOT NULL,
  confirmed_rev INTEGER,
  withdrawn     INTEGER NOT NULL DEFAULT 0 CHECK (withdrawn IN (0,1)),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  -- 0036 (ALTER TABLE, spec 039 design § 13.4): the process a PROC record documents, exactly one.
  process_id    TEXT REFERENCES ba_processes(id),
  UNIQUE (portal_id, key),
  UNIQUE (portal_id, kind, seq)
) STRICT;
CREATE UNIQUE INDEX ux_doc_records_one_proc ON doc_records (process_id) WHERE kind = 'process';
CREATE TRIGGER doc_records_proc_needs_process BEFORE INSERT ON doc_records
  WHEN NEW.kind = 'process' AND NEW.process_id IS NULL
  BEGIN SELECT RAISE(ABORT, 'PROC record needs process_id'); END;
CREATE TRIGGER doc_records_proc_keeps_process BEFORE UPDATE OF kind, process_id ON doc_records
  WHEN NEW.kind = 'process' AND NEW.process_id IS NULL
  BEGIN SELECT RAISE(ABORT, 'PROC record needs process_id'); END;

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

-- Evidence for a revision. Rebuilt by 0040 (spec 039 § 15): what it cites is an `entity_refs` row with a
-- real foreign key (a screen region: a state ref with an element key); the view `doc_evidence` reads it
-- back as target_kind / target_id / region. run_id is the run the evidence came from, resolved at write
-- time; NULL only for a doc record or a review, which are not run-bound (research.md §5).
CREATE TABLE doc_evidence_links (
  id          TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL REFERENCES doc_revisions(id),
  ref_id      TEXT NOT NULL REFERENCES entity_refs(id) DEFERRABLE INITIALLY DEFERRED,
  run_id      TEXT REFERENCES runs(id),
  note        TEXT
) STRICT;
-- run_id -> records reverse lookups (FR-033).
CREATE INDEX ix_doc_evidence_links_run_id ON doc_evidence_links(run_id);
CREATE INDEX ix_doc_evidence_links_revision ON doc_evidence_links(revision_id);
CREATE INDEX ix_doc_evidence_links_ref ON doc_evidence_links(ref_id);
-- 0040: the kind and id a link cites, in the vocabulary the BA cites with.
CREATE VIEW doc_evidence AS
SELECT l.id, l.revision_id, l.ref_id, l.run_id, l.note,
  CASE
    WHEN r.state_id IS NOT NULL AND r.element_key IS NOT NULL THEN 'screen_region'
    WHEN r.state_id IS NOT NULL THEN 'state'
    WHEN r.transition_id IS NOT NULL THEN 'transition'
    WHEN r.action_id IS NOT NULL THEN 'action'
    WHEN r.form_id IS NOT NULL THEN 'form'
    WHEN r.network_call_id IS NOT NULL THEN 'network_call'
    WHEN r.open_question_id IS NOT NULL THEN 'open_question'
    WHEN r.decision_id IS NOT NULL THEN 'decision'
    WHEN r.trace_process_id IS NOT NULL THEN 'process'
    WHEN r.trace_step_id IS NOT NULL THEN 'process_step'
    WHEN r.doc_record_id IS NOT NULL THEN 'doc_record'
    WHEN r.review_id IS NOT NULL THEN 'review'
    WHEN r.observation_id IS NOT NULL THEN 'observation'
    WHEN r.hypothesis_id IS NOT NULL THEN 'hypothesis'   -- 0042 (owner answer 18)
  END AS target_kind,
  coalesce(r.state_id, r.transition_id, r.action_id, r.form_id, r.network_call_id,
    r.open_question_id, r.decision_id, r.trace_process_id, r.trace_step_id, r.doc_record_id,
    r.review_id, r.observation_id, r.hypothesis_id) AS target_id,
  CASE WHEN r.state_id IS NOT NULL THEN r.element_key END AS region
FROM doc_evidence_links l JOIN entity_refs r ON r.id = l.ref_id;

-- Typed record -> record relations, versioned with the revision that asserts them. Process steps and
-- personas are not records: steps live in process_steps (0005), the persona in the process record's
-- content.
CREATE TABLE doc_relations (
  from_revision_id TEXT NOT NULL REFERENCES doc_revisions(id),
  to_record_id     TEXT NOT NULL REFERENCES doc_records(id),
  type             TEXT NOT NULL CHECK (type IN (
                      'contains','describes','refines','enforces','appears_on','uses_term',
                      'synonym_of','answers','depends_on','applies_on','asks_about','follows_up'
                    )),
  PRIMARY KEY (from_revision_id, to_record_id, type)
) STRICT, WITHOUT ROWID;
-- Triple backstop (0013, extended by 0014 with applies_on, asks_about, follows_up, and by 0019 with
-- glossary_term appears_on screen and process contains screen, and by 0020 with assumption|use_case
-- depends_on business_rule, and by 0044 with api_endpoint appears_on screen and process|use_case|requirement
-- depends_on api_endpoint): the store refuses a relation whose (from kind, type, to kind) is not in
-- RELATION_RULES; the list equals relations.ts (drift test: docs/tests/relation-triples.test.ts).
CREATE TRIGGER trg_doc_relations_triple_insert
BEFORE INSERT ON doc_relations
WHEN EXISTS (
  SELECT 1
  FROM doc_revisions v
  JOIN doc_records fr ON fr.id = v.record_id
  JOIN doc_records tr ON tr.id = NEW.to_record_id
  WHERE v.id = NEW.from_revision_id
    AND NOT (
      (NEW.type = 'contains'   AND fr.kind = 'capability'  AND tr.kind IN ('process','screen')) OR
      (NEW.type = 'contains'   AND fr.kind = 'process'     AND tr.kind = 'screen') OR
      (NEW.type = 'describes'  AND fr.kind = 'use_case'    AND tr.kind = 'process') OR
      (NEW.type = 'refines'    AND fr.kind = 'requirement' AND tr.kind IN ('use_case','capability')) OR
      (NEW.type = 'enforces'   AND fr.kind = 'requirement' AND tr.kind = 'business_rule') OR
      (NEW.type = 'appears_on' AND fr.kind IN ('data_item','glossary_term','api_endpoint') AND tr.kind = 'screen') OR
      (NEW.type = 'uses_term'  AND tr.kind = 'glossary_term') OR
      (NEW.type = 'synonym_of' AND fr.kind = 'glossary_term' AND tr.kind = 'glossary_term') OR
      (NEW.type = 'answers'    AND fr.kind IN ('assumption','requirement','business_rule') AND tr.kind = 'open_question') OR
      (NEW.type = 'depends_on' AND (fr.kind = tr.kind OR (fr.kind IN ('assumption','use_case') AND tr.kind = 'business_rule') OR (fr.kind IN ('process','use_case','requirement') AND tr.kind = 'api_endpoint'))) OR
      (NEW.type = 'applies_on' AND fr.kind = 'business_rule' AND tr.kind = 'screen') OR
      (NEW.type = 'asks_about' AND fr.kind = 'open_question') OR
      (NEW.type = 'follows_up' AND fr.kind = 'followup' AND tr.kind IN ('process','capability','screen','business_rule','open_question','use_case'))
    )
)
BEGIN
  SELECT RAISE(ABORT, 'RELATION_NOT_ALLOWED: (from kind, type, to kind) is not an allowed triple');
END;

CREATE TRIGGER trg_doc_relations_triple_update
BEFORE UPDATE OF from_revision_id, to_record_id, type ON doc_relations
WHEN EXISTS (
  SELECT 1
  FROM doc_revisions v
  JOIN doc_records fr ON fr.id = v.record_id
  JOIN doc_records tr ON tr.id = NEW.to_record_id
  WHERE v.id = NEW.from_revision_id
    AND NOT (
      (NEW.type = 'contains'   AND fr.kind = 'capability'  AND tr.kind IN ('process','screen')) OR
      (NEW.type = 'contains'   AND fr.kind = 'process'     AND tr.kind = 'screen') OR
      (NEW.type = 'describes'  AND fr.kind = 'use_case'    AND tr.kind = 'process') OR
      (NEW.type = 'refines'    AND fr.kind = 'requirement' AND tr.kind IN ('use_case','capability')) OR
      (NEW.type = 'enforces'   AND fr.kind = 'requirement' AND tr.kind = 'business_rule') OR
      (NEW.type = 'appears_on' AND fr.kind IN ('data_item','glossary_term','api_endpoint') AND tr.kind = 'screen') OR
      (NEW.type = 'uses_term'  AND tr.kind = 'glossary_term') OR
      (NEW.type = 'synonym_of' AND fr.kind = 'glossary_term' AND tr.kind = 'glossary_term') OR
      (NEW.type = 'answers'    AND fr.kind IN ('assumption','requirement','business_rule') AND tr.kind = 'open_question') OR
      (NEW.type = 'depends_on' AND (fr.kind = tr.kind OR (fr.kind IN ('assumption','use_case') AND tr.kind = 'business_rule') OR (fr.kind IN ('process','use_case','requirement') AND tr.kind = 'api_endpoint'))) OR
      (NEW.type = 'applies_on' AND fr.kind = 'business_rule' AND tr.kind = 'screen') OR
      (NEW.type = 'asks_about' AND fr.kind = 'open_question') OR
      (NEW.type = 'follows_up' AND fr.kind = 'followup' AND tr.kind IN ('process','capability','screen','business_rule','open_question','use_case'))
    )
)
BEGIN
  SELECT RAISE(ABORT, 'RELATION_NOT_ALLOWED: (from kind, type, to kind) is not an allowed triple');
END;

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

-- One process per trace run. status stays 'recorded' for the crawler; the later values are reserved
-- for QA work (replay) and the BA (documented).
CREATE TABLE processes (
  id                 TEXT PRIMARY KEY,
  run_id             TEXT NOT NULL UNIQUE REFERENCES runs(id),
  portal_id          TEXT NOT NULL,
  persona_id         TEXT NOT NULL,
  name               TEXT NOT NULL,
  goal               TEXT NOT NULL,
  followup_record_id TEXT REFERENCES doc_records(id),
  status             TEXT NOT NULL CHECK (status IN ('recorded','replay_verified','documented')),
  outcome            TEXT CHECK (outcome IN ('goal_reached','boundary_reached','stopped','abandoned')),  -- NULL while running
  boundary_action_id TEXT REFERENCES actions(id),  -- required when outcome = 'boundary_reached'
  observed_result    TEXT,                         -- agent-supplied at finish; facts only
  not_observable     TEXT,                         -- required when outcome = 'boundary_reached'
  created_at         TEXT NOT NULL,
  ended_at           TEXT,
  -- 0034 (ALTER TABLE, spec 039 T081): the step whose click enters the process (its trigger); NULL: none marked.
  trigger_ord        INTEGER CHECK (trigger_ord IS NULL OR trigger_ord >= 1),
  CHECK (outcome IS NOT 'boundary_reached'
         OR (boundary_action_id IS NOT NULL AND not_observable IS NOT NULL))
) STRICT;

-- One row per recorded step. UNIQUE(process_id, ord) also serves the ordered per-process listing.
CREATE TABLE process_steps (
  id             TEXT PRIMARY KEY,
  process_id     TEXT NOT NULL REFERENCES processes(id),
  ord            INTEGER NOT NULL CHECK (ord >= 1),
  intent         TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('navigate','click','fill','check','select')),
  action_id      TEXT REFERENCES actions(id),   -- NULL for navigate
  transition_id  TEXT REFERENCES transitions(id),  -- network calls reach the step via network_calls.transition_id
  value          TEXT,                          -- scrubbed synthetic input for fill/select; NULL otherwise
  state_before   TEXT REFERENCES states(id),
  state_after    TEXT REFERENCES states(id),    -- NULL if nothing changed/settled
  outcomes_json  TEXT NOT NULL CHECK (json_valid(outcomes_json) AND json_type(outcomes_json) = 'array'),
  evidence_ref   TEXT NOT NULL CHECK (length(evidence_ref) > 0),  -- ARIA snapshot after the step
  confidence     TEXT NOT NULL CHECK (confidence IN ('observed','inferred','needs_confirmation')),
  created_at     TEXT NOT NULL,
  UNIQUE (process_id, ord)
) STRICT;

-- Added by 0006_screenshots_wireframes (spec 008): derived wireframes, rebuilt from the state's ARIA
-- snapshot whenever generator_version is stale. Never cited as evidence.
CREATE TABLE state_wireframes (
  state_id          TEXT PRIMARY KEY REFERENCES states(id),
  generator_version TEXT NOT NULL CHECK (length(generator_version) > 0),
  svg_ref           TEXT NOT NULL CHECK (length(svg_ref) > 0),
  excalidraw_ref    TEXT NOT NULL CHECK (length(excalidraw_ref) > 0),
  created_at        TEXT NOT NULL
) STRICT;

-- Added by 0007_credentials (spec 009): encrypted test-user credentials per portal and environment.
-- Written only by the vault; never joined, exported or shown. Values are AES-256-GCM ciphertext.
CREATE TABLE credentials (
  id          TEXT PRIMARY KEY,                                   -- UUIDv7
  portal_id   TEXT NOT NULL CHECK (length(portal_id) > 0),        -- config id; portals are files, no FK
  environment TEXT NOT NULL CHECK (environment GLOB '[a-z]*' AND length(environment) BETWEEN 1 AND 40 AND environment NOT GLOB '*[^a-z0-9-]*'),  -- free name per portal (0021, spec 030 R-61)
  ref_name    TEXT NOT NULL CHECK (ref_name GLOB '[A-Za-z_]*' AND length(ref_name) <= 64),
  ciphertext  BLOB NOT NULL,                                      -- AES-256-GCM ciphertext || 16-byte tag
  nonce       BLOB NOT NULL CHECK (length(nonce) = 12),
  key_id      TEXT NOT NULL CHECK (length(key_id) = 8),           -- first 8 hex of sha256(key)
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (portal_id, environment, ref_name)
) STRICT;

-- Added by 0008_chat_orchestrator (spec 010, R-30): guided chat orchestrator state. Written only by
-- @mudpuppy/chat. Not Layer B evidence records (no evidence_ref/confidence); amendments are never
-- joined into Layer B records. Only the four indexes listed in specs/010-acp-chat-orchestrator/data-model.md.
CREATE TABLE chat_conversations (
  id             TEXT PRIMARY KEY,                                 -- UUIDv7
  portal_id      TEXT CHECK (portal_id IS NULL OR length(portal_id) > 0),  -- NULL until the BA chooses a portal; no FK, portals are files
  goal           TEXT NOT NULL,
  acp_session_id TEXT,
  persona_draft  TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(persona_draft) AND json_type(persona_draft) = 'object'),  -- never holds secrets
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  -- 0049 (ALTER TABLE, spec 043): 'chat' = the Chat page, 'workbench' = a Workbench conversation.
  kind           TEXT NOT NULL DEFAULT 'chat' CHECK (kind IN ('chat','workbench'))
) STRICT;

CREATE TABLE chat_messages (
  id              TEXT PRIMARY KEY,                                -- UUIDv7
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id),
  seq             INTEGER NOT NULL CHECK (seq >= 0),
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content         TEXT NOT NULL,                                   -- credentials never land here (form path bypasses chat)
  tool_name       TEXT,
  error_ref       TEXT,                                            -- ref into data/logs/chat/*.jsonl
  created_at      TEXT NOT NULL,
  UNIQUE (conversation_id, seq)                                    -- the (conversation_id, seq) index
) STRICT;

CREATE TABLE workflow_steps (
  id              TEXT PRIMARY KEY,                                -- UUIDv7
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id),
  portal_id       TEXT NOT NULL CHECK (length(portal_id) > 0),
  step            TEXT NOT NULL CHECK (step IN ('scan','map','narrow','document','amend')),
  -- 0010 (table rebuilt): `stopped` = the BA stopped the step's run on purpose (spec 011 F-04).
  status          TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','pending','in_progress','done','failed','stopped')),
  run_id          TEXT REFERENCES runs(id),
  session_id      TEXT REFERENCES analysis_sessions(id),
  error_ref       TEXT,
  started_at      TEXT,
  finished_at     TEXT,
  updated_at      TEXT NOT NULL
) STRICT;
CREATE INDEX idx_workflow_steps_conversation_step ON workflow_steps (conversation_id, step);

CREATE TABLE process_scopes (
  id                 TEXT PRIMARY KEY,                             -- UUIDv7
  conversation_id    TEXT NOT NULL REFERENCES chat_conversations(id),
  portal_id          TEXT NOT NULL CHECK (length(portal_id) > 0),
  process_name       TEXT NOT NULL CHECK (length(process_name) > 0),
  persona            TEXT NOT NULL CHECK (length(persona) > 0),
  start_state_id     TEXT NOT NULL REFERENCES states(id),
  end_state_id       TEXT NOT NULL REFERENCES states(id),
  selected_state_ids TEXT NOT NULL CHECK (json_valid(selected_state_ids) AND json_type(selected_state_ids) = 'array'),
  comments           TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(comments) AND json_type(comments) = 'object'),  -- state_id -> text
  source             TEXT NOT NULL CHECK (source IN ('agent_proposal','ba_description')),
  created_at         TEXT NOT NULL
) STRICT;

CREATE TABLE amendments (
  id                TEXT PRIMARY KEY,                              -- UUIDv7
  key               TEXT NOT NULL CHECK (key GLOB 'AMD-[0-9][0-9][0-9]*'),  -- AMD-nnn, per portal
  portal_id         TEXT NOT NULL CHECK (length(portal_id) > 0),
  scope_id          TEXT REFERENCES process_scopes(id),
  ref_id            TEXT NOT NULL REFERENCES entity_refs(id) DEFERRABLE INITIALLY DEFERRED,  -- 0041 (spec 039 § 15): what it is written on (a state, a state's element, an evidence file)
  kind              TEXT NOT NULL CHECK (kind IN ('note','element_ref','attachment')),
  text              TEXT,
  attachment_sha256 TEXT CHECK (attachment_sha256 IS NULL OR length(attachment_sha256) = 64),
  attachment_name   TEXT,
  author            TEXT NOT NULL CHECK (length(author) > 0),
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','needs_reanchor','dismissed','withdrawn')),  -- 0016: was 'superseded'
  anchor_fingerprint    TEXT,                                      -- fingerprint of the state when written
  anchor_route_template TEXT,
  anchor_element    TEXT CHECK (anchor_element IS NULL OR (json_valid(anchor_element) AND json_type(anchor_element) = 'object')),  -- role, accessible name, wireframe element id
  superseded_by_run TEXT REFERENCES runs(id),
  superseded_reason TEXT CHECK (superseded_reason IS NULL OR superseded_reason IN ('state_replaced','element_changed','element_removed')),
  superseded_detail TEXT,                                          -- short text for superseded_reason
  superseded_at     TEXT,
  dismissed_at      TEXT,
  reapplied_as      TEXT REFERENCES amendments(id),                -- the new active copy
  reapplies         TEXT REFERENCES amendments(id),                -- the original this row copies
  created_at        TEXT NOT NULL,
  withdrawn_at      TEXT,
  rev               INTEGER NOT NULL DEFAULT 1 CHECK (rev >= 1),  -- 0016: the head's current revision number
  screen_id         TEXT REFERENCES screens(id),                   -- 0016: the screen the amendment belongs to
  anchor_ref_id     TEXT REFERENCES entity_refs(id) DEFERRABLE INITIALLY DEFERRED,  -- 0037 (spec 039 § 15; 0041 renamed from ref_id): the anchor, a model screen + element key
  UNIQUE (portal_id, key),
  CHECK (kind <> 'note' OR text IS NOT NULL),
  CHECK (kind <> 'attachment' OR (attachment_sha256 IS NOT NULL AND attachment_name IS NOT NULL)),
  CHECK (status <> 'dismissed' OR dismissed_at IS NOT NULL),
  CHECK (status <> 'withdrawn' OR withdrawn_at IS NOT NULL)
) STRICT;
CREATE INDEX idx_amendments_status ON amendments (portal_id, status);
CREATE INDEX idx_amendments_ref ON amendments (ref_id);

-- 0012_page_visits (spec 019): one row per arrival on a page, verbatim URL and the hops that led there.
-- 0032 renamed it `observations` (the design's name, spec 039 T110).
CREATE TABLE observations (
  id         TEXT PRIMARY KEY,
  run_id     TEXT NOT NULL REFERENCES runs(id),
  state_id   TEXT NOT NULL REFERENCES states(id),
  transition_id TEXT REFERENCES transitions(id),  -- the action's transition that led here; NULL for navigate and re-login
  via        TEXT NOT NULL CHECK (via IN ('navigate','action','relogin','login')),
  url        TEXT NOT NULL CHECK (length(url) > 0),
  hops_json  TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(hops_json) AND json_type(hops_json) = 'array'),
  created_at TEXT NOT NULL,
  -- 0029 (ALTER TABLE, spec 039): the design's observation columns; NULL on v1 rows.
  journey_id  TEXT REFERENCES journeys(id),
  seq         INTEGER CHECK (seq IS NULL OR seq >= 1),
  result      TEXT CHECK (result IS NULL OR result IN ('ok','validation','business_error','technical_error','timeout','blocked')),
  context_key TEXT CHECK (context_key IS NULL OR length(context_key) = 64),
  flags_json  TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(flags_json) AND json_type(flags_json) = 'object'),
  -- 0033 (ALTER TABLE, spec 039 T112): the fingerprint profile (`name@hash`); NULL = rows-v2, before 0033.
  fingerprint_profile TEXT CHECK (fingerprint_profile IS NULL OR length(fingerprint_profile) > 0)
) STRICT;
CREATE INDEX idx_observations_run_state ON observations (run_id, state_id);
CREATE INDEX idx_observations_state ON observations (state_id);
CREATE UNIQUE INDEX ux_observations_run_seq ON observations (run_id, seq) WHERE seq IS NOT NULL;

-- 0015_screens (spec 022): a screen is (portal_id, route_template, cluster_id); each state is one observed
-- revision of it (states.screen_id + screen_rev). Created by the same migration that adds those columns.
CREATE TABLE screens (
  id             TEXT PRIMARY KEY,                                  -- UUIDv7
  portal_id      TEXT NOT NULL,
  route_template TEXT NOT NULL,
  cluster_id     TEXT NOT NULL,
  title          TEXT NOT NULL,                                     -- title of the latest revision (display only)
  first_seen_run TEXT NOT NULL REFERENCES runs(id),
  created_at     TEXT NOT NULL,
  merged_into    TEXT REFERENCES screens(id) CHECK (merged_into IS NULL OR merged_into <> id), -- 0026: owner-confirmed "same state" merge target; NULL = stands alone
  UNIQUE (portal_id, route_template, cluster_id)
) STRICT;

-- 0016_amendment_revisions (spec 022): append-only history of an amendment; amendments (above, rebuilt by
-- 0016) keeps the head. The head changes only together with a new revision row, in one transaction.
CREATE TABLE amendment_revisions (
  amendment_id          TEXT NOT NULL REFERENCES amendments(id),
  rev                   INTEGER NOT NULL CHECK (rev >= 1),
  base_rev              INTEGER CHECK (base_rev IS NULL OR base_rev >= 1),  -- the revision this one was written on top of; NULL for r1
  change                TEXT NOT NULL CHECK (change IN ('create','edit','carry_forward','needs_reanchor','reanchor','withdraw','restore','dismiss')),
  author                TEXT NOT NULL CHECK (length(author) > 0),           -- reviewer, or 'scan:<run id>' for automatic carry-forward
  status                TEXT NOT NULL CHECK (status IN ('active','needs_reanchor','dismissed','withdrawn')),
  ref_id                TEXT NOT NULL REFERENCES entity_refs(id) DEFERRABLE INITIALLY DEFERRED,  -- 0041: what this revision is written on
  text                  TEXT,
  anchor_fingerprint    TEXT,
  anchor_route_template TEXT,
  anchor_element        TEXT CHECK (anchor_element IS NULL OR (json_valid(anchor_element) AND json_type(anchor_element) = 'object')),
  reason                TEXT,                                               -- e.g. 'element_removed: the link "Zaloguj się" is gone'
  run_id                TEXT REFERENCES runs(id),                           -- the scan that caused a carry-forward / needs-reanchor
  created_at            TEXT NOT NULL,
  PRIMARY KEY (amendment_id, rev),
  CHECK ((rev = 1) = (base_rev IS NULL))
) STRICT, WITHOUT ROWID;
-- 0041: an amendment (head and revisions) with what it is written on, as the chat and the dashboard
-- name it: a state, a wireframe element (`<state id>#<element key>`) or an evidence file.
CREATE VIEW amendments_with_target AS
SELECT a.*,
  CASE WHEN r.evidence_file IS NOT NULL THEN 'evidence'
       WHEN r.element_key IS NOT NULL THEN 'wireframe_element'
       ELSE 'state' END AS target_kind,
  CASE WHEN r.evidence_file IS NOT NULL THEN r.evidence_file
       WHEN r.element_key IS NOT NULL THEN r.state_id || '#' || r.element_key
       ELSE r.state_id END AS target_id
FROM amendments a JOIN entity_refs r ON r.id = a.ref_id;
CREATE VIEW amendment_revisions_with_target AS
SELECT v.*,
  CASE WHEN r.evidence_file IS NOT NULL THEN 'evidence'
       WHEN r.element_key IS NOT NULL THEN 'wireframe_element'
       ELSE 'state' END AS target_kind,
  CASE WHEN r.evidence_file IS NOT NULL THEN r.evidence_file
       WHEN r.element_key IS NOT NULL THEN r.state_id || '#' || r.element_key
       ELSE r.state_id END AS target_id
FROM amendment_revisions v JOIN entity_refs r ON r.id = v.ref_id;

-- 0017_chat_proposals (spec 022 R6): changes the chat assistant proposes and a person applies or discards.
-- The assistant never writes amendments; applying runs the same revision write path as a BA edit.
CREATE TABLE chat_proposals (
  id                    TEXT PRIMARY KEY,                          -- UUIDv7
  conversation_id       TEXT NOT NULL REFERENCES chat_conversations(id),
  portal_id             TEXT NOT NULL CHECK (length(portal_id) > 0),
  amendment_id          TEXT REFERENCES amendments(id),            -- 0041: the amendment it changes (text, re-anchor); NULL = a new amendment
  base_rev              INTEGER CHECK (base_rev IS NULL OR base_rev >= 1),         -- the amendment revision the proposal was made on; NULL for a new one
  payload               TEXT NOT NULL CHECK (json_valid(payload) AND json_type(payload) = 'object'),  -- what to change, e.g. {"text": "..."}
  summary               TEXT NOT NULL CHECK (length(summary) > 0),  -- the one line the drawer shows
  status                TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','applied','discarded','stale')),
  applied_amendment_id  TEXT REFERENCES amendments(id),            -- the created or changed amendment
  applied_rev           INTEGER CHECK (applied_rev IS NULL OR applied_rev >= 1),  -- the revision that applying created
  decided_by            TEXT,
  decided_at            TEXT,
  created_at            TEXT NOT NULL,
  CHECK ((amendment_id IS NULL) = (base_rev IS NULL)),
  CHECK (status <> 'applied' OR (applied_amendment_id IS NOT NULL AND applied_rev IS NOT NULL AND decided_at IS NOT NULL)),
  CHECK (status NOT IN ('discarded','stale') OR decided_at IS NOT NULL)
) STRICT;

CREATE INDEX ix_chat_proposals_conversation ON chat_proposals (conversation_id, created_at);
CREATE INDEX ix_chat_proposals_portal_status ON chat_proposals (portal_id, status);

-- 0018_ba_processes (spec 022 M5): the BA's cut of the portal (screens 04-07). Spec 022 data-model.md M5.
-- Same pattern as amendments (0016): a head row with the current revision number, append-only revision
-- rows beside it; every write goes through the chat service, a stale base_rev answers 409.
-- Distinct from the crawler's trace `processes` (spec 004) and from `process_scopes` (spec 010), which
-- the backfill at the end migrates in. Indexes: one per named read (process_live: the live variant per
-- environment; grouping_suggestions: the open list and the "dismissed before" refusal, FR-007).
-- ba_processes.suggestion_id and grouping_suggestions.process_id reference each other (accept links both);
-- SQLite accepts the forward reference, and the migration runner checks foreign keys at the end.

CREATE TABLE grouping_suggestions (
  id              TEXT PRIMARY KEY,                                  -- UUIDv7
  portal_id       TEXT NOT NULL CHECK (length(portal_id) > 0),
  name            TEXT NOT NULL CHECK (length(name) > 0),
  persona         TEXT NOT NULL CHECK (length(persona) > 0),
  steps           TEXT NOT NULL CHECK (json_valid(steps) AND json_type(steps) = 'array'),  -- ordered as-is steps, all observed
  why             TEXT NOT NULL CHECK (length(why) > 0),             -- the assistant's reason
  screens_key     TEXT NOT NULL CHECK (length(screens_key) > 0),     -- sorted state ids joined with ','; a dismissed key is refused
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','dismissed')),
  conversation_id TEXT REFERENCES chat_conversations(id),
  process_id      TEXT REFERENCES ba_processes(id),                  -- set on accept
  decided_by      TEXT,
  decided_at      TEXT,
  created_at      TEXT NOT NULL,
  CHECK (status = 'open' OR decided_at IS NOT NULL),
  CHECK (status <> 'accepted' OR process_id IS NOT NULL)
) STRICT;

CREATE INDEX ix_grouping_suggestions_portal_status ON grouping_suggestions (portal_id, status);
CREATE INDEX ix_grouping_suggestions_portal_screens ON grouping_suggestions (portal_id, screens_key);

CREATE TABLE ba_processes (
  id            TEXT PRIMARY KEY,                                    -- UUIDv7
  portal_id     TEXT NOT NULL CHECK (length(portal_id) > 0),
  key           TEXT NOT NULL CHECK (key GLOB 'PRC-[0-9][0-9][0-9]*'),  -- PRC-nnn, per portal
  name          TEXT NOT NULL CHECK (length(name) > 0),
  persona       TEXT NOT NULL CHECK (length(persona) > 0),           -- the persona the as-is was observed as
  stage         TEXT NOT NULL CHECK (stage IN ('scoped','as_is_documented','to_be_design','migrating','migrated')),  -- a process can move back
  rev           INTEGER NOT NULL CHECK (rev >= 1),                   -- the head's current process revision
  source        TEXT NOT NULL CHECK (source IN ('suggestion','scope','new')),
  scope_id      TEXT REFERENCES process_scopes(id),                  -- the scope it was migrated from
  suggestion_id TEXT REFERENCES grouping_suggestions(id),            -- the accepted suggestion
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  -- 0028 (ALTER TABLE): NULL = in the list; set = archived, every row kept (spec 027 FR-003); the BA
  -- `process` record it was opened from (spec 027 US6).
  archived_at   TEXT,
  record_key    TEXT CHECK (record_key IS NULL OR record_key GLOB 'PROC-[0-9]*'),
  -- 0036 (ALTER TABLE, spec 039 design § 13.4): the screen its trigger opens, and the
  -- process_boundary hypothesis it was accepted from.
  start_screen_id        TEXT REFERENCES model_screens(id),
  boundary_hypothesis_id TEXT REFERENCES hypotheses(id),
  UNIQUE (portal_id, key)
) STRICT;

-- 0028 rebuilt it: 'archive' / 'unarchive' changes and as_is_rev (spec 027).
CREATE TABLE ba_process_revisions (
  process_id TEXT NOT NULL REFERENCES ba_processes(id),
  rev        INTEGER NOT NULL CHECK (rev >= 1),
  base_rev   INTEGER CHECK (base_rev IS NULL OR base_rev >= 1),      -- NULL for r1
  -- 0051 (table rebuilt): 'merge' = the kept process renamed, or the absorbed one archived as merged into
  -- another; 'unmerge' = undone / split back (spec 078).
  change     TEXT NOT NULL CHECK (change IN ('create','rename','stage','restore','archive','unarchive','merge','unmerge')),
  author     TEXT NOT NULL CHECK (length(author) > 0),
  name       TEXT NOT NULL CHECK (length(name) > 0),                 -- the values after the change
  stage      TEXT NOT NULL CHECK (stage IN ('scoped','as_is_documented','to_be_design','migrating','migrated')),
  as_is_rev  INTEGER CHECK (as_is_rev IS NULL OR as_is_rev >= 1),    -- the A revision a 'stage' change signed off
  created_at TEXT NOT NULL,
  PRIMARY KEY (process_id, rev),
  CHECK ((rev = 1) = (base_rev IS NULL))
) STRICT, WITHOUT ROWID;

-- Renamed by 0036 from process_variants (spec 039 design § 13.4): a process's as-is and to-be models.
-- 0039 renamed the variant columns of the process model tables to model columns (owner answer 8).
CREATE TABLE process_models (
  id                       TEXT PRIMARY KEY,                         -- UUIDv7
  process_id               TEXT NOT NULL REFERENCES ba_processes(id),
  label                    TEXT NOT NULL CHECK (length(label) > 0),  -- A, B, C...
  kind                     TEXT NOT NULL CHECK (kind IN ('as_is','to_be')),  -- as_is = A, observed, rescans add revisions
  rev                      INTEGER NOT NULL CHECK (rev >= 1),        -- the head's current revision
  branched_from_model_id   TEXT REFERENCES process_models(id),       -- NULL for A
  branched_from_rev        INTEGER CHECK (branched_from_rev IS NULL OR branched_from_rev >= 1),
  created_at               TEXT NOT NULL,
  UNIQUE (process_id, label),
  CHECK ((branched_from_model_id IS NULL) = (branched_from_rev IS NULL))
) STRICT;

-- 0028 rebuilt it: 'edit' = a person changed A's steps (spec 027 FR-004). Renamed by 0036 from
-- process_variant_revisions.
CREATE TABLE process_model_revisions (
  model_id      TEXT NOT NULL REFERENCES process_models(id),
  rev           INTEGER NOT NULL CHECK (rev >= 1),
  base_rev      INTEGER CHECK (base_rev IS NULL OR base_rev >= 1),   -- NULL for r1
  -- 0051 (table rebuilt): 'scope' = A rebuilt after screens joined the process's scope; 'merge' = the kept
  -- process's A rebuilt over the merged scope; 'unmerge' = A put back (spec 078).
  change        TEXT NOT NULL CHECK (change IN ('create','branch','save','restore','observe','edit','scope','merge','unmerge')),
  author        TEXT NOT NULL CHECK (length(author) > 0),            -- reviewer name, or 'scan:<run id>' for observe
  steps         TEXT NOT NULL CHECK (json_valid(steps) AND json_type(steps) = 'array'),  -- ordered ProcessStep objects
  note          TEXT,                                                -- the one line the history shows
  run_id        TEXT REFERENCES runs(id),                            -- for observe
  restored_from INTEGER CHECK (restored_from IS NULL OR restored_from >= 1),  -- for restore
  created_at    TEXT NOT NULL,
  PRIMARY KEY (model_id, rev),
  CHECK ((rev = 1) = (base_rev IS NULL))
) STRICT, WITHOUT ROWID;

-- Scratch: one open draft of one person over one to-be model, updated in place, deleted on save/discard.
-- A base_rev older than the model's head is an edit conflict (Review "Edit conflicts").
CREATE TABLE process_drafts (
  model_id   TEXT NOT NULL REFERENCES process_models(id),
  author     TEXT NOT NULL CHECK (length(author) > 0),
  base_rev   INTEGER NOT NULL CHECK (base_rev >= 1),
  steps      TEXT NOT NULL CHECK (json_valid(steps) AND json_type(steps) = 'array'),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (model_id, author)
) STRICT, WITHOUT ROWID;

-- The live process model per environment is the newest row for (process_id, environment).
CREATE TABLE process_live (
  id          TEXT PRIMARY KEY,                                      -- UUIDv7
  process_id  TEXT NOT NULL REFERENCES ba_processes(id),
  environment TEXT NOT NULL CHECK (environment GLOB '[a-z]*' AND length(environment) BETWEEN 1 AND 40 AND environment NOT GLOB '*[^a-z0-9-]*'),  -- free name per portal (0021, spec 030 R-61)
  model_id    TEXT NOT NULL,
  model_rev   INTEGER NOT NULL CHECK (model_rev >= 1),
  author      TEXT NOT NULL CHECK (length(author) > 0),
  reason      TEXT,
  created_at  TEXT NOT NULL,
  FOREIGN KEY (model_id, model_rev) REFERENCES process_model_revisions(model_id, rev)
) STRICT;

CREATE INDEX ix_process_live_process_env ON process_live (process_id, environment, created_at);

-- 0051 (spec 078 T-05): screens added to a process's scope that no observed move reaches yet: in the scope,
-- in no step of A. A screen an observed move links to A's screens joins A's steps and gets no row here.
CREATE TABLE process_scope_screens (
  id         TEXT PRIMARY KEY,                                       -- UUIDv7
  process_id TEXT NOT NULL REFERENCES ba_processes(id),
  state_id   TEXT NOT NULL REFERENCES states(id),                    -- the screen's recorded state (as A's steps name it)
  author     TEXT NOT NULL CHECK (length(author) > 0),
  added_at   TEXT NOT NULL,
  removed_at TEXT,                                                   -- Undo, or it joined A after a later scan
  removed_by TEXT,
  CHECK ((removed_at IS NULL) = (removed_by IS NULL))
) STRICT;

CREATE UNIQUE INDEX ux_process_scope_screens_open ON process_scope_screens (process_id, state_id) WHERE removed_at IS NULL;

-- 0051 (spec 078 T-06): one merge of two saved processes of the same persona: one absorbs the other.
CREATE TABLE process_merges (
  id                    TEXT PRIMARY KEY,                            -- UUIDv7
  portal_id             TEXT NOT NULL CHECK (length(portal_id) > 0),
  kept_process_id       TEXT NOT NULL REFERENCES ba_processes(id),   -- keeps its key, links, rules, docs
  absorbed_process_id   TEXT NOT NULL REFERENCES ba_processes(id),   -- archived as "Merged into ..."
  author                TEXT NOT NULL CHECK (length(author) > 0),
  reason                TEXT,
  kept_name_before      TEXT NOT NULL CHECK (length(kept_name_before) > 0),
  kept_as_is_rev_before INTEGER NOT NULL CHECK (kept_as_is_rev_before >= 1),  -- A's head before the merge
  kept_as_is_rev_after  INTEGER NOT NULL CHECK (kept_as_is_rev_after >= 1),   -- the A revision the merge wrote
  moved_json            TEXT NOT NULL CHECK (json_valid(moved_json) AND json_type(moved_json) = 'array'),  -- [{model_id, from_label, to_label}]
  created_at            TEXT NOT NULL,
  undone_at             TEXT,                                        -- Undo or Split back
  undone_by             TEXT,
  CHECK (kept_process_id <> absorbed_process_id),
  CHECK ((undone_at IS NULL) = (undone_by IS NULL))
) STRICT;

CREATE UNIQUE INDEX ux_process_merges_absorbed_open ON process_merges (absorbed_process_id) WHERE undone_at IS NULL;

CREATE TABLE change_spec_revisions (
  process_id       TEXT NOT NULL REFERENCES ba_processes(id),
  rev              INTEGER NOT NULL CHECK (rev >= 1),
  base_rev         INTEGER CHECK (base_rev IS NULL OR base_rev >= 1),  -- NULL for r1
  left_model_id    TEXT NOT NULL,                                    -- what was compared
  left_rev         INTEGER NOT NULL CHECK (left_rev >= 1),
  right_model_id   TEXT NOT NULL,
  right_rev        INTEGER NOT NULL CHECK (right_rev >= 1),
  sections         TEXT NOT NULL CHECK (json_valid(sections) AND json_type(sections) = 'object'),  -- scope, as_is, to_be, delta, records, migration_cut, open_questions
  author           TEXT NOT NULL CHECK (length(author) > 0),
  doc_key          TEXT CHECK (doc_key IS NULL OR length(doc_key) > 0),  -- the doc record key when saved to Docs
  created_at       TEXT NOT NULL,
  PRIMARY KEY (process_id, rev),
  CHECK ((rev = 1) = (base_rev IS NULL)),
  FOREIGN KEY (left_model_id, left_rev) REFERENCES process_model_revisions(model_id, rev),
  FOREIGN KEY (right_model_id, right_rev) REFERENCES process_model_revisions(model_id, rev)
) STRICT, WITHOUT ROWID;

-- 0022: one step of a form flow on a route template, numbered per (portal, route) in first-seen order.
CREATE TABLE form_steps (
  id             TEXT PRIMARY KEY,                                   -- UUIDv7
  portal_id      TEXT NOT NULL CHECK (length(portal_id) > 0),
  route_template TEXT NOT NULL CHECK (length(route_template) > 0),
  step_index     INTEGER NOT NULL CHECK (step_index >= 1),
  form_name      TEXT,                                               -- the form's accessible name, when it has one
  controls_json  TEXT NOT NULL CHECK (json_valid(controls_json) AND json_type(controls_json) = 'array'),  -- sorted role|name
  label          TEXT NOT NULL CHECK (length(label) > 0),            -- first heading in or above the form, else 'step N'
  first_seen_run TEXT NOT NULL REFERENCES runs(id),
  created_at     TEXT NOT NULL,
  UNIQUE (portal_id, route_template, step_index)
) STRICT;

-- 0023: what each form probe did, and the trace suites built from them (spec 032).
CREATE TABLE probe_outcomes (
  id                   TEXT PRIMARY KEY,                             -- UUIDv7
  run_id               TEXT NOT NULL REFERENCES runs(id),
  from_state_id        TEXT NOT NULL REFERENCES states(id),          -- the happy-path state the probe started on
  form_step_id         TEXT REFERENCES form_steps(id),
  probe_id             TEXT NOT NULL CHECK (length(probe_id) > 0),   -- catalogue id, e.g. required-empty-one
  probe_group          TEXT NOT NULL CHECK (probe_group IN ('validation','branch','technical')),
  target               TEXT,                                         -- field label, option label or request
  inputs_json          TEXT NOT NULL CHECK (json_valid(inputs_json) AND json_type(inputs_json) = 'array'),
  path_json            TEXT NOT NULL CHECK (json_valid(path_json) AND json_type(path_json) = 'object'),  -- { start_url, steps }
  fault                TEXT CHECK (fault IS NULL OR fault IN ('block_request','http_500','delay','offline')),
  outcome_kind         TEXT NOT NULL CHECK (outcome_kind IN ('next','branch','validation','technical','temporary','blocked')),
  to_state_id          TEXT REFERENCES states(id),                   -- NULL when blocked before any page
  accepted             INTEGER NOT NULL DEFAULT 0 CHECK (accepted IN (0,1)),  -- a validation probe the form accepted
  possible_new_process INTEGER NOT NULL DEFAULT 0 CHECK (possible_new_process IN (0,1)),  -- a branch to a screen not seen before
  messages_json        TEXT NOT NULL CHECK (json_valid(messages_json) AND json_type(messages_json) = 'array'),  -- [{field, text, source}]
  http_status          INTEGER,
  reason               TEXT,                                         -- why blocked or skipped
  evidence_ref         TEXT NOT NULL CHECK (length(evidence_ref) > 0),
  transition_id        TEXT REFERENCES transitions(id),              -- the transition the probe's submit produced
  created_at           TEXT NOT NULL
) STRICT;

CREATE INDEX ix_probe_outcomes_run ON probe_outcomes (run_id);
CREATE INDEX ix_probe_outcomes_form_step ON probe_outcomes (form_step_id);

CREATE TABLE probe_suites (
  id            TEXT PRIMARY KEY,                                    -- UUIDv7
  portal_id     TEXT NOT NULL CHECK (length(portal_id) > 0),
  run_id        TEXT NOT NULL REFERENCES runs(id),                   -- the probing run it was built from
  form_step_id  TEXT REFERENCES form_steps(id),                      -- the form's first step
  trace_json    TEXT NOT NULL CHECK (json_valid(trace_json) AND json_type(trace_json) = 'object'),  -- one TraceSpecEntry
  notes_json    TEXT NOT NULL CHECK (json_valid(notes_json) AND json_type(notes_json) = 'array'),   -- [{variant, probe_outcome_id, why}]
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','approved','dismissed')),
  approved_json TEXT CHECK (approved_json IS NULL OR json_valid(approved_json)),
  replaced_json TEXT CHECK (replaced_json IS NULL OR json_valid(replaced_json)),
  decided_by    TEXT,
  decided_at    TEXT,
  created_at    TEXT NOT NULL,
  CHECK (status = 'open' OR decided_at IS NOT NULL),
  CHECK (status <> 'approved' OR approved_json IS NOT NULL)
) STRICT;

CREATE INDEX ix_probe_suites_portal_status ON probe_suites (portal_id, status);

CREATE TABLE marks (
  id             TEXT PRIMARY KEY,                                   -- UUIDv7
  portal_id      TEXT NOT NULL CHECK (length(portal_id) > 0),
  kind           TEXT NOT NULL CHECK (kind IN ('start','focus','probe','retry','recheck','skip')),
  -- 0041 (spec 039 § 15): the target in a typed column, exactly one.
  form_step_id   TEXT REFERENCES form_steps(id),
  state_id       TEXT REFERENCES states(id),
  transition_id  TEXT REFERENCES transitions(id),
  created_by     TEXT NOT NULL CHECK (length(created_by) > 0),       -- the person (reviewer name)
  created_at     TEXT NOT NULL,
  used_by_run_id TEXT REFERENCES runs(id),                           -- set when a scan used the mark
  used_at        TEXT,
  -- 0031 (spec 039): a person's mark or the planner's, the hypothesis it tests, its priority.
  origin         TEXT NOT NULL DEFAULT 'person' CHECK (origin IN ('person','planner')),
  hypothesis_id  TEXT REFERENCES hypotheses(id),
  priority       INTEGER CHECK (priority IS NULL OR priority BETWEEN 1 AND 6),
  CHECK ((form_step_id IS NOT NULL) + (state_id IS NOT NULL) + (transition_id IS NOT NULL) = 1),
  CHECK ((used_by_run_id IS NULL) = (used_at IS NULL))
) STRICT;

-- 0047 (spec 040 T033): one open mark per target and per origin, so a person's and the planner's open mark can share a target.
CREATE UNIQUE INDEX ux_marks_open ON marks
  (portal_id, origin, kind, coalesce(form_step_id, state_id, transition_id)) WHERE used_by_run_id IS NULL;

CREATE TABLE checkpoints (
  id         TEXT PRIMARY KEY,                                               -- UUIDv7
  run_id     TEXT NOT NULL REFERENCES runs(id),
  state_id   TEXT NOT NULL REFERENCES states(id),
  start_url  TEXT NOT NULL CHECK (length(start_url) > 0),
  steps_json TEXT NOT NULL CHECK (json_valid(steps_json) AND json_type(steps_json) = 'array'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (run_id, state_id)
) STRICT;

CREATE INDEX ix_checkpoints_state ON checkpoints (state_id);

CREATE INDEX ix_runs_parent ON runs (parent_run_id);

-- 0029_capture_v2 (spec 039, MudPuppy 2.0 Layer A capture): builds per scope, fingerprint v2 components,
-- journeys, attribute writes, the builds each observation was served by. The 0029 columns of `observations`
-- and `transitions` (named so since 0032) are listed with each table above.
CREATE TABLE builds (
  id          TEXT PRIMARY KEY,                                      -- UUIDv7
  portal_id   TEXT NOT NULL CHECK (length(portal_id) > 0),
  scope       TEXT NOT NULL CHECK (length(scope) > 0),               -- 'shell', 'mfe:<folder>', 'frame:<host><path>'
  signature   TEXT NOT NULL CHECK (length(signature) > 0),           -- sha256, 'marker:<value>' or 'unknown'
  source      TEXT NOT NULL CHECK (source IN ('assets','marker','unknown')),
  assets_json TEXT NOT NULL CHECK (json_valid(assets_json) AND json_type(assets_json) = 'array'),
  first_seen  TEXT NOT NULL,
  UNIQUE (portal_id, scope, signature)
) STRICT;

CREATE TABLE state_components (
  state_id       TEXT PRIMARY KEY REFERENCES states(id),
  structure_hash TEXT NOT NULL CHECK (length(structure_hash) = 64),
  content_hash   TEXT NOT NULL CHECK (length(content_hash) = 64),
  overlay_hash   TEXT NOT NULL CHECK (length(overlay_hash) = 64),
  calls_hash     TEXT NOT NULL CHECK (length(calls_hash) = 64),
  mounts_hash    TEXT NOT NULL CHECK (length(mounts_hash) = 64),
  minhash        BLOB NOT NULL CHECK (length(minhash) = 512),         -- 128 × uint32, big-endian
  element_keys   TEXT NOT NULL CHECK (json_valid(element_keys) AND json_type(element_keys) = 'array'),
  -- 0033 (ALTER TABLE, spec 039 T112): the profile these components were computed with; NULL = rows-v2.
  profile        TEXT CHECK (profile IS NULL OR length(profile) > 0)
) STRICT, WITHOUT ROWID;

CREATE TABLE journeys (
  id                TEXT PRIMARY KEY,
  run_id            TEXT NOT NULL REFERENCES runs(id),
  parent_journey_id TEXT REFERENCES journeys(id),
  branch_seq        INTEGER CHECK (branch_seq IS NULL OR branch_seq >= 0),
  start_kind        TEXT NOT NULL CHECK (start_kind IN ('entry_url','checkpoint','login','backtrack','resume','fresh_session')),
  checkpoint_id     TEXT REFERENCES checkpoints(id),
  end_reason        TEXT CHECK (end_reason IN ('outcome','backtrack','reset','logout','error','budget','run_end')),
  started_at        TEXT NOT NULL,
  ended_at          TEXT,
  CHECK ((parent_journey_id IS NULL) = (branch_seq IS NULL)),
  CHECK ((end_reason IS NULL) = (ended_at IS NULL))
) STRICT;
CREATE INDEX ix_journeys_run ON journeys (run_id, started_at);

CREATE TABLE attribute_writes (
  id          TEXT PRIMARY KEY,
  journey_id  TEXT NOT NULL REFERENCES journeys(id),
  seq         INTEGER NOT NULL CHECK (seq >= 0),         -- 0 = journey start; else the transition seq
  name        TEXT NOT NULL CHECK (length(name) > 0),    -- 'persona.segment', 'input.wartość_pojazdu', 'shown.składka'
  source      TEXT NOT NULL CHECK (source IN ('persona','input','shown')),
  value_type  TEXT NOT NULL CHECK (value_type IN ('number','date','enum','bool','text','missing')),
  value_num   REAL,
  value_text  TEXT,
  element_key TEXT,
  created_at  TEXT NOT NULL,
  UNIQUE (journey_id, seq, name)
) STRICT;

CREATE TABLE observation_builds (
  observation_id TEXT NOT NULL REFERENCES observations(id),
  build_id       TEXT NOT NULL REFERENCES builds(id),
  PRIMARY KEY (observation_id, build_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX ix_network_calls_schema ON network_calls (url_template, method, schema_hash);

-- 0030_portal_model (spec 039, MudPuppy 2.0 Layer M): the portal model, rebuilt by the reconciler from Layer A
-- plus recorded decisions; `screens` stays the crawler's provisional assignment (F-14@039).
CREATE TABLE model_versions (
  id                    TEXT PRIMARY KEY,                               -- UUIDv7
  portal_id             TEXT NOT NULL CHECK (length(portal_id) > 0),
  seq                   INTEGER NOT NULL CHECK (seq >= 1),              -- 1, 2, 3… per portal
  built_at              TEXT NOT NULL,
  algorithm             TEXT NOT NULL CHECK (length(algorithm) > 0),   -- 'minhash-avglink-v1'
  threshold             REAL NOT NULL CHECK (threshold > 0 AND threshold <= 1),
  observation_watermark TEXT,                                           -- max observations.id included; NULL when none
  decision_watermark    TEXT,                                           -- max decision id included; NULL when none
  stats_json            TEXT NOT NULL CHECK (json_valid(stats_json) AND json_type(stats_json) = 'object'),
  -- 0033 (ALTER TABLE, spec 039 T112): the fingerprint profile the version was clustered under.
  fingerprint_profile   TEXT CHECK (fingerprint_profile IS NULL OR length(fingerprint_profile) > 0),
  UNIQUE (portal_id, seq)
) STRICT;

CREATE TABLE model_screens (
  id                  TEXT PRIMARY KEY,
  key                 TEXT NOT NULL CHECK (key GLOB 'SC-[0-9][0-9][0-9][0-9]*'),   -- cited by people
  portal_id           TEXT NOT NULL CHECK (length(portal_id) > 0),
  route_key           TEXT NOT NULL CHECK (length(route_key) > 0),
  title               TEXT NOT NULL,                                    -- latest member's title, display only
  status              TEXT NOT NULL CHECK (status IN ('active','merged','retired')),
  first_model_version TEXT NOT NULL REFERENCES model_versions(id),
  created_at          TEXT NOT NULL,
  UNIQUE (portal_id, key)
) STRICT;
CREATE INDEX ix_model_screens_portal ON model_screens (portal_id, status);

CREATE TABLE screen_members (
  screen_id          TEXT NOT NULL REFERENCES model_screens(id),
  state_id           TEXT NOT NULL REFERENCES states(id),
  ordinal            INTEGER NOT NULL CHECK (ordinal >= 1),             -- r1, r2… by first sighting
  assigned_by        TEXT NOT NULL CHECK (assigned_by IN ('clustering','constraint')),
  from_model_version TEXT NOT NULL REFERENCES model_versions(id),
  to_model_version   TEXT REFERENCES model_versions(id),
  PRIMARY KEY (screen_id, state_id, from_model_version)
) STRICT, WITHOUT ROWID;
CREATE UNIQUE INDEX ux_screen_members_current ON screen_members (state_id) WHERE to_model_version IS NULL;

CREATE TABLE screen_lineage (
  id               TEXT PRIMARY KEY,
  model_version_id TEXT NOT NULL REFERENCES model_versions(id),
  kind             TEXT NOT NULL CHECK (kind IN ('split','merge','retire','revive')),
  from_screen_id   TEXT NOT NULL REFERENCES model_screens(id),
  to_screen_id     TEXT REFERENCES model_screens(id),
  members_moved    INTEGER NOT NULL CHECK (members_moved >= 0),
  CHECK ((kind = 'retire') = (to_screen_id IS NULL))
) STRICT;
CREATE INDEX ix_screen_lineage_version ON screen_lineage (model_version_id);

CREATE TABLE state_pair_labels (
  portal_id   TEXT NOT NULL CHECK (length(portal_id) > 0),
  state_a     TEXT NOT NULL REFERENCES states(id),
  state_b     TEXT NOT NULL REFERENCES states(id),
  label       TEXT NOT NULL CHECK (label IN ('clone','near_duplicate','distinct')),
  nd_kind     TEXT CHECK (nd_kind IS NULL OR nd_kind IN ('cosmetic','dynamic_data','duplication')),
  labelled_by TEXT NOT NULL CHECK (length(labelled_by) > 0),
  labelled_at TEXT NOT NULL,
  reason      TEXT,
  CHECK (state_a < state_b),
  CHECK (nd_kind IS NULL OR label = 'near_duplicate'),
  PRIMARY KEY (state_a, state_b)
) STRICT, WITHOUT ROWID;

-- 0045 (spec 039 R-81): every "Same screen?" answer stays; state_pair_labels above is the current label.
-- Append-only by convention (the code only inserts).
CREATE TABLE state_pair_label_history (
  id          TEXT PRIMARY KEY,
  portal_id   TEXT NOT NULL CHECK (length(portal_id) > 0),
  state_a     TEXT NOT NULL REFERENCES states(id),
  state_b     TEXT NOT NULL REFERENCES states(id),
  label       TEXT NOT NULL CHECK (label IN ('clone','near_duplicate','distinct')),
  nd_kind     TEXT CHECK (nd_kind IS NULL OR nd_kind IN ('cosmetic','dynamic_data','duplication')),
  labelled_by TEXT NOT NULL CHECK (length(labelled_by) > 0),
  labelled_at TEXT NOT NULL,
  reason      TEXT,
  CHECK (state_a < state_b),
  CHECK (nd_kind IS NULL OR label = 'near_duplicate')
) STRICT;
CREATE INDEX idx_state_pair_label_history_pair ON state_pair_label_history (state_a, state_b, labelled_at);
CREATE INDEX idx_state_pair_label_history_portal ON state_pair_label_history (portal_id);

CREATE TABLE parameter_roles (
  portal_id      TEXT NOT NULL CHECK (length(portal_id) > 0),
  route_template TEXT NOT NULL CHECK (length(route_template) > 0),
  param          TEXT NOT NULL CHECK (param GLOB 'path:[0-9]*' OR param GLOB 'query:?*'),
  role           TEXT NOT NULL CHECK (role IN ('identity','data','ignored')),
  decided_by     TEXT NOT NULL CHECK (decided_by IN ('reconciler','person')),
  decided_at     TEXT NOT NULL,
  PRIMARY KEY (portal_id, route_template, param)
) STRICT, WITHOUT ROWID;

CREATE TABLE action_classes (
  id                   TEXT PRIMARY KEY,
  screen_id            TEXT NOT NULL REFERENCES model_screens(id),
  element_key          TEXT NOT NULL CHECK (length(element_key) > 0),
  kind                 TEXT NOT NULL CHECK (kind IN ('click','fill','select','check','submit','navigate','back')),
  is_global            INTEGER NOT NULL DEFAULT 0 CHECK (is_global IN (0,1)),
  status               TEXT NOT NULL CHECK (status IN ('active','not_seen_since','untested','retired')),
  streak_json          TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(streak_json) AND json_type(streak_json) = 'object'),
  status_model_version TEXT NOT NULL REFERENCES model_versions(id),
  UNIQUE (screen_id, element_key, kind)
) STRICT;

CREATE TABLE model_transitions (
  id                       TEXT PRIMARY KEY,
  from_screen_id           TEXT NOT NULL REFERENCES model_screens(id),
  action_class_id          TEXT NOT NULL REFERENCES action_classes(id),
  to_screen_id             TEXT REFERENCES model_screens(id),            -- NULL when no page resulted
  result                   TEXT NOT NULL CHECK (result IN ('ok','validation','business_error','technical_error','timeout','blocked')),
  internal                 INTEGER NOT NULL CHECK (internal IN (0,1)),   -- from = to: shown in the screen, not on the Map
  support                  INTEGER NOT NULL CHECK (support >= 1),
  first_seen_transition_id TEXT NOT NULL REFERENCES transitions(id),
  last_seen_transition_id  TEXT NOT NULL REFERENCES transitions(id),
  status                   TEXT NOT NULL CHECK (status IN ('active','not_seen_since','untested','retired')),
  status_model_version     TEXT NOT NULL REFERENCES model_versions(id)
) STRICT;
CREATE UNIQUE INDEX ux_model_transitions_key ON model_transitions
  (from_screen_id, action_class_id, IFNULL(to_screen_id, ''), result);

CREATE TABLE build_epochs (
  id                   TEXT PRIMARY KEY,
  portal_id            TEXT NOT NULL CHECK (length(portal_id) > 0),
  scope                TEXT NOT NULL CHECK (length(scope) > 0),
  environment          TEXT NOT NULL CHECK (length(environment) > 0),
  build_id             TEXT NOT NULL REFERENCES builds(id),
  first_observation_id TEXT NOT NULL REFERENCES observations(id),
  last_observation_id  TEXT NOT NULL REFERENCES observations(id),
  overlaps_previous    INTEGER NOT NULL DEFAULT 0 CHECK (overlaps_previous IN (0,1)),
  model_version_id     TEXT NOT NULL REFERENCES model_versions(id)
) STRICT;
CREATE INDEX ix_build_epochs_portal ON build_epochs (portal_id, scope, environment);

-- 0031_interpretation (spec 039, design § 8, § 10, § 15): deviations, hypotheses with evidence, tests and events,
-- and `entity_refs`, the typed reference with real foreign keys. `marks` and `open_questions` gained columns above.
-- Rebuilt by 0040 (§ 15, owner answer 13): a column per kind the BA cites (trace processes and steps are
-- v1's `processes` / `process_steps`; `process_id` is a BA process), an evidence store file, and an element
-- key with a state (a screen region) as well as with a model screen (an anchor). Exactly one target.
CREATE TABLE entity_refs (
  id                  TEXT PRIMARY KEY,
  observation_id      TEXT REFERENCES observations(id),
  transition_id       TEXT REFERENCES transitions(id),
  state_id            TEXT REFERENCES states(id),
  screen_id           TEXT REFERENCES model_screens(id),
  action_class_id     TEXT REFERENCES action_classes(id),
  model_transition_id TEXT REFERENCES model_transitions(id),
  process_id          TEXT REFERENCES ba_processes(id),
  hypothesis_id       TEXT REFERENCES hypotheses(id),
  network_call_id     TEXT REFERENCES network_calls(id),
  action_id           TEXT REFERENCES actions(id),
  form_id             TEXT REFERENCES forms(id),
  open_question_id    TEXT REFERENCES open_questions(id),
  decision_id         TEXT REFERENCES decision_log(id),
  review_id           TEXT REFERENCES doc_reviews(id),
  doc_record_id       TEXT REFERENCES doc_records(id),
  trace_process_id    TEXT REFERENCES processes(id),
  trace_step_id       TEXT REFERENCES process_steps(id),
  form_step_id        TEXT REFERENCES form_steps(id),
  evidence_file       TEXT CHECK (evidence_file IS NULL OR length(evidence_file) > 0),
  element_key         TEXT CHECK (element_key IS NULL OR length(element_key) > 0),
  CHECK ((observation_id IS NOT NULL) + (transition_id IS NOT NULL) + (state_id IS NOT NULL)
       + (screen_id IS NOT NULL) + (action_class_id IS NOT NULL)
       + (model_transition_id IS NOT NULL) + (process_id IS NOT NULL)
       + (hypothesis_id IS NOT NULL) + (network_call_id IS NOT NULL)
       + (action_id IS NOT NULL) + (form_id IS NOT NULL) + (open_question_id IS NOT NULL)
       + (decision_id IS NOT NULL) + (review_id IS NOT NULL) + (doc_record_id IS NOT NULL)
       + (trace_process_id IS NOT NULL) + (trace_step_id IS NOT NULL)
       + (form_step_id IS NOT NULL) + (evidence_file IS NOT NULL) = 1),
  CHECK (element_key IS NULL OR screen_id IS NOT NULL OR state_id IS NOT NULL)
) STRICT;

CREATE TABLE deviations (
  id                       TEXT PRIMARY KEY,
  portal_id                TEXT NOT NULL CHECK (length(portal_id) > 0),
  model_version_id         TEXT NOT NULL REFERENCES model_versions(id),
  kind                     TEXT NOT NULL CHECK (kind IN ('new_screen','new_member','new_action',
                             'missing_action','target_mismatch','result_mismatch','rule_mismatch')),
  subject_key              TEXT NOT NULL CHECK (length(subject_key) > 0),   -- dedup key
  screen_id                TEXT REFERENCES model_screens(id),
  state_id                 TEXT REFERENCES states(id),
  action_class_id          TEXT REFERENCES action_classes(id),
  before_json              TEXT CHECK (before_json IS NULL OR json_valid(before_json)),
  after_json               TEXT CHECK (after_json IS NULL OR json_valid(after_json)),
  changed_components       TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(changed_components) AND json_type(changed_components) = 'array'),
  context_diff             TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(context_diff) AND json_type(context_diff) = 'object'),
  status                   TEXT NOT NULL CHECK (status IN ('open','waiting_test','explained')),
  created_at               TEXT NOT NULL,
  UNIQUE (portal_id, kind, subject_key)
) STRICT;
CREATE INDEX ix_deviations_portal_status ON deviations (portal_id, status);

CREATE TABLE deviation_occurrences (
  deviation_id     TEXT NOT NULL REFERENCES deviations(id),
  model_version_id TEXT NOT NULL REFERENCES model_versions(id),
  PRIMARY KEY (deviation_id, model_version_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE hypotheses (
  id               TEXT PRIMARY KEY,
  key              TEXT NOT NULL CHECK (key GLOB 'H-[0-9][0-9][0-9][0-9]*'),     -- cited by people
  portal_id        TEXT NOT NULL CHECK (length(portal_id) > 0),
  kind             TEXT NOT NULL CHECK (kind IN (
                     'same_as','different_from','parameter_role',
                     'structural_drift','backend_drift','decision_drift',
                     'context_variant','ab_test','flaky','nondeterministic','deterministic_error',
                     'removed','replaces','coverage_gap','business_error_template',
                     'decision_point','decision_rule','process_boundary','correlation_id','ambiguous')),
  claim            TEXT NOT NULL CHECK (length(claim) > 0),          -- one sentence a BA can read
  claim_json       TEXT NOT NULL CHECK (json_valid(claim_json)),
  claim_hash       TEXT NOT NULL CHECK (length(claim_hash) = 64),
  origin           TEXT NOT NULL CHECK (origin IN ('rule','agent','person')),
  rule             TEXT CHECK (rule IS NULL OR rule GLOB 'R[1-8]'),
  derived          INTEGER NOT NULL DEFAULT 0 CHECK (derived IN (0,1)),  -- applied without a person
  confidence       TEXT NOT NULL CHECK (confidence IN ('observed','inferred','needs_confirmation')),
  fitness          REAL,
  precision        REAL,
  support          INTEGER,
  counterexamples  INTEGER,
  deviation_id     TEXT REFERENCES deviations(id),
  superseded_by    TEXT REFERENCES hypotheses(id),
  model_version_id TEXT NOT NULL REFERENCES model_versions(id),
  created_at       TEXT NOT NULL,
  CHECK ((origin = 'rule') = (rule IS NOT NULL)),
  CHECK (derived = 0 OR origin = 'rule'),
  UNIQUE (portal_id, key)
) STRICT;
CREATE INDEX ix_hypotheses_portal_kind ON hypotheses (portal_id, kind);
CREATE INDEX ix_hypotheses_claim ON hypotheses (portal_id, kind, claim_hash);

CREATE TABLE hypothesis_evidence (
  hypothesis_id TEXT NOT NULL REFERENCES hypotheses(id),
  ref_id        TEXT NOT NULL REFERENCES entity_refs(id),
  role          TEXT NOT NULL CHECK (role IN ('supports','contradicts','context')),
  PRIMARY KEY (hypothesis_id, ref_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE hypothesis_tests (
  id              TEXT PRIMARY KEY,
  hypothesis_id   TEXT NOT NULL REFERENCES hypotheses(id),
  probe_suite_id  TEXT REFERENCES probe_suites(id),
  mark_id         TEXT REFERENCES marks(id),
  inputs_json     TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(inputs_json) AND json_type(inputs_json) = 'object'),
  refutes_if_json TEXT NOT NULL CHECK (json_valid(refutes_if_json)),
  result_json     TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  verdict         TEXT CHECK (verdict IS NULL OR verdict IN ('pass','fail','inconclusive')),
  run_id          TEXT REFERENCES runs(id),
  created_at      TEXT NOT NULL
) STRICT;
CREATE INDEX ix_hypothesis_tests_hypothesis ON hypothesis_tests (hypothesis_id);

CREATE TABLE hypothesis_events (
  id            TEXT PRIMARY KEY,
  hypothesis_id TEXT NOT NULL REFERENCES hypotheses(id),
  from_status   TEXT CHECK (from_status IS NULL OR from_status IN
                  ('proposed','testing','supported','refuted','confirmed','rejected','superseded')),
  to_status     TEXT NOT NULL CHECK (to_status IN
                  ('proposed','testing','supported','refuted','confirmed','rejected','superseded')),
  actor         TEXT NOT NULL CHECK (length(actor) > 0),    -- 'reconciler', 'ba-agent', 'crawler' or a reviewer
  reason        TEXT NOT NULL CHECK (length(reason) > 0),
  at            TEXT NOT NULL,
  -- 0046 (ALTER TABLE, spec 040): the person's command (one Undo per command) and the event an undo reverts.
  decision_id   TEXT CHECK (decision_id IS NULL OR length(decision_id) > 0),
  undoes        TEXT CHECK (undoes IS NULL OR length(undoes) > 0)
) STRICT;
CREATE INDEX ix_hypothesis_events_hypothesis ON hypothesis_events (hypothesis_id, at);
CREATE INDEX ix_hypothesis_events_decision ON hypothesis_events (decision_id) WHERE decision_id IS NOT NULL;

-- 0033_fingerprint_profiles (spec 039 T111–T115): the profiles a portal was fingerprinted with (per portal,
-- `name@<8 hex of the rules hash>`), and the τ a person accepted per portal and profile (latest in force).
-- The profile columns of observations, state_components and model_versions are listed with each table above.
CREATE TABLE fingerprint_profiles (
  portal_id  TEXT NOT NULL CHECK (length(portal_id) > 0),
  id         TEXT NOT NULL CHECK (id GLOB '?*@[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]'),
  name       TEXT NOT NULL CHECK (length(name) > 0),
  rules_json TEXT NOT NULL CHECK (json_valid(rules_json) AND json_type(rules_json) = 'object'),
  first_seen TEXT NOT NULL,
  PRIMARY KEY (portal_id, id)
) STRICT, WITHOUT ROWID;

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

-- 0036_processes (spec 039 design § 13.4, T070): one process concept. Correlation ids (values seen in a
-- response and reused later in the journey, stored hashed), process instances (a journey through a
-- process from its trigger, with the outcome), the triggers and explorations of a process. The PROC
-- link (doc_records.process_id), ba_processes.start_screen_id / boundary_hypothesis_id and the
-- process_models rename are with their tables above.
CREATE TABLE correlation_ids (
  id                  TEXT PRIMARY KEY,
  journey_id          TEXT NOT NULL REFERENCES journeys(id),
  key_path            TEXT NOT NULL CHECK (length(key_path) > 0),   -- 'response:$.quote.id'
  value_hash          TEXT NOT NULL CHECK (length(value_hash) = 64),
  endpoint_family     TEXT NOT NULL CHECK (length(endpoint_family) > 0),
  first_transition_id TEXT NOT NULL REFERENCES transitions(id),
  last_transition_id  TEXT NOT NULL REFERENCES transitions(id)
) STRICT;
CREATE INDEX ix_correlation_ids_journey ON correlation_ids (journey_id);

-- Rebuilt by 0039 (owner answer 10): a journey enters by a transition or by a deep link (a URL
-- opened on the start screen, `trigger_observation_id`).
CREATE TABLE process_instances (
  id                     TEXT PRIMARY KEY,
  process_id             TEXT NOT NULL REFERENCES ba_processes(id),
  journey_id             TEXT NOT NULL REFERENCES journeys(id),
  trigger_kind           TEXT NOT NULL CHECK (trigger_kind IN ('transition','deep_link')),
  trigger_transition_id  TEXT REFERENCES transitions(id),
  trigger_observation_id TEXT REFERENCES observations(id),
  last_transition_id     TEXT REFERENCES transitions(id),   -- NULL: the deep link was the whole walk
  outcome                TEXT NOT NULL CHECK (outcome IN
                           ('completed','exited','error','abandoned','incomplete')),
  outcome_screen_id      TEXT REFERENCES model_screens(id),
  correlation_id         TEXT REFERENCES correlation_ids(id),
  model_version_id       TEXT NOT NULL REFERENCES model_versions(id),
  -- 0043 (ALTER TABLE, spec 039 T079): the model screen ids walked, start screen first (its trace variant); NULL before 0043.
  screens_json           TEXT CHECK (screens_json IS NULL OR (json_valid(screens_json) AND json_type(screens_json) = 'array')),
  CHECK ((trigger_kind = 'transition') = (trigger_transition_id IS NOT NULL)),
  CHECK ((trigger_kind = 'deep_link') = (trigger_observation_id IS NOT NULL)),
  CHECK (trigger_kind = 'deep_link' OR last_transition_id IS NOT NULL)
) STRICT;
CREATE INDEX ix_process_instances_process ON process_instances (process_id, model_version_id);
CREATE UNIQUE INDEX ux_process_instances_trigger ON process_instances
  (process_id, coalesce(trigger_transition_id, trigger_observation_id), model_version_id);

CREATE TABLE process_triggers (
  process_id          TEXT NOT NULL REFERENCES ba_processes(id),
  model_transition_id TEXT NOT NULL REFERENCES model_transitions(id),
  PRIMARY KEY (process_id, model_transition_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE process_explorations (
  id             TEXT PRIMARY KEY,
  process_id     TEXT NOT NULL REFERENCES ba_processes(id),
  epoch_set      TEXT NOT NULL CHECK (json_valid(epoch_set) AND json_type(epoch_set) = 'array'),
  depth          INTEGER NOT NULL CHECK (depth >= 0),
  random_walks   INTEGER NOT NULL CHECK (random_walks >= 0),
  new_deviations INTEGER NOT NULL CHECK (new_deviations >= 0),
  completed_at   TEXT NOT NULL
) STRICT;
CREATE INDEX ix_process_explorations_process ON process_explorations (process_id, completed_at);

-- 0038_similarity_classifiers (spec 039 FR-050, T090): the similarity classifier per portal and profile, with
-- its held-out F1 against τ; the reconciler clusters with the latest one that beat τ.
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
  trained_at   TEXT NOT NULL,
  -- 0039 (ALTER TABLE, owner answer 14): the person who put it in force; NULL = not accepted.
  accepted_by  TEXT CHECK (accepted_by IS NULL OR length(accepted_by) > 0),
  accepted_at  TEXT
) STRICT;
CREATE INDEX ix_similarity_classifiers_portal ON similarity_classifiers (portal_id, profile, trained_at);

-- 0046_review_decisions (spec 040 T014, designer § 7.1): a person's Reword of a rule; the latest row is in force.
CREATE TABLE hypothesis_wordings (
  id            TEXT PRIMARY KEY,                                   -- UUIDv7
  hypothesis_id TEXT NOT NULL REFERENCES hypotheses(id),
  wording       TEXT NOT NULL CHECK (length(wording) > 0 AND length(wording) <= 2000),
  actor         TEXT NOT NULL CHECK (length(actor) > 0),
  reason        TEXT,
  at            TEXT NOT NULL
) STRICT;
CREATE INDEX ix_hypothesis_wordings_hypothesis ON hypothesis_wordings (hypothesis_id, at);

-- 0049_workbench (spec 043, R-92): the Workbench (generative UI beta) state of a conversation: its views, command
-- proposals with their audit record, and "Right view?" feedback. Hang off chat_conversations (portal export/delete).
CREATE TABLE workbench_conversations (
  conversation_id TEXT PRIMARY KEY REFERENCES chat_conversations(id),
  path            TEXT NOT NULL DEFAULT 'chat' CHECK (path IN ('chat','mapping','troubleshoot','explain')),
  path_source     TEXT NOT NULL DEFAULT 'assistant' CHECK (path_source IN ('assistant','you')),  -- who chose the path
  title           TEXT CHECK (title IS NULL OR length(title) > 0),                               -- renamable; NULL = untitled
  updated_at      TEXT NOT NULL
) STRICT;

CREATE TABLE workbench_views (
  id              TEXT PRIMARY KEY,                                  -- UUIDv7
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id),
  turn            INTEGER NOT NULL CHECK (turn >= 1),
  path            TEXT NOT NULL CHECK (path IN ('chat','mapping','troubleshoot','explain')),
  why             TEXT NOT NULL CHECK (length(why) > 0),             -- why the assistant chose this view
  spec_json       TEXT NOT NULL CHECK (json_valid(spec_json) AND json_type(spec_json) = 'object'),  -- the checked spec
  received_json   TEXT NOT NULL CHECK (json_valid(received_json)),   -- the tool input as received
  dropped_json    TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(dropped_json) AND json_type(dropped_json) = 'array'),
  repaired_json   TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(repaired_json) AND json_type(repaired_json) = 'array'),
  fallback        INTEGER NOT NULL DEFAULT 0 CHECK (fallback IN (0,1)),  -- 1 = the fallback view replaced the spec
  created_at      TEXT NOT NULL,
  UNIQUE (conversation_id, turn)                                     -- at most one view per turn
) STRICT;

CREATE TABLE workbench_commands (
  id              TEXT PRIMARY KEY,                                  -- UUIDv7
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id),
  turn            INTEGER NOT NULL CHECK (turn >= 1),
  -- 0050 (table rebuilt): persona.add, an editable card whose Undo removes the persona (spec 072).
  command         TEXT NOT NULL CHECK (command IN ('scan.start','scan.resume','scan.stop','path.attempt','mark.add','persona.add')),
  args_json       TEXT NOT NULL CHECK (json_valid(args_json) AND json_type(args_json) = 'object'),  -- persona.add: the args as confirmed
  reason          TEXT NOT NULL CHECK (length(reason) > 0),
  source          TEXT NOT NULL CHECK (source IN ('assistant','button')),
  state           TEXT NOT NULL DEFAULT 'proposed'
                  CHECK (state IN ('proposed','running','done','failed','cancelled','expired','undone')),
  token_hash      TEXT NOT NULL CHECK (length(token_hash) = 64),     -- sha256 hex of the one-time confirm token; the token is never stored
  precondition_hash TEXT NOT NULL,                                   -- state the proposal assumed; a change refuses the confirm
  idempotency_key TEXT NOT NULL UNIQUE,
  expires_at      TEXT NOT NULL,
  confirmed_by    TEXT,
  confirmed_at    TEXT,
  result_json     TEXT CHECK (result_json IS NULL OR (json_valid(result_json) AND json_type(result_json) = 'object')),  -- e.g. the started run id
  error_ref       TEXT,                                              -- reference into the chat error log
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  -- nothing runs before Confirm: past proposed/cancelled/expired a person has confirmed
  CHECK (state IN ('proposed','cancelled','expired') OR (confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL)),
  CHECK (state <> 'done' OR result_json IS NOT NULL),
  CHECK (state <> 'failed' OR error_ref IS NOT NULL)
) STRICT;
CREATE INDEX ix_workbench_commands_conversation ON workbench_commands (conversation_id, created_at);

CREATE TABLE workbench_feedback (
  view_id      TEXT NOT NULL REFERENCES workbench_views(id),
  by           TEXT NOT NULL CHECK (length(by) > 0),
  value        TEXT NOT NULL CHECK (value IN ('yes','no')),
  reasons_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(reasons_json) AND json_type(reasons_json) = 'array'),  -- wrong_path, missing_something, too_much, wrong_data, other
  text         TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,                                        -- an answer can be changed
  PRIMARY KEY (view_id, by)
) STRICT, WITHOUT ROWID;
