-- 0003_ba_documentation (up): Layer B, the BA deliverable (R-13, T007). Purely additive: no existing
-- table is rebuilt, so this file needs no foreign_keys-off table-rebuild dance (see migrate.ts for why
-- that dance exists for 0002-style migrations).
-- Conventions: see data/schema/README.md. Ids: UUIDv7 text. Timestamps: UTC ISO 8601 text, ms, 'Z'.
-- JSON: TEXT with CHECK(json_valid). Enums: CHECK. Zod schemas in @pathfinder/core/schemas are the
-- write contract (Zod wins on any divergence, per data-model.md).

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

-- One row per documented thing (capability, screen, process, ... follow-up); content lives in its
-- revisions. latest_rev/confirmed_rev/title/withdrawn are denormalised by the status engine in the
-- same transaction as the revision/review write (fast listing; checked by docs:audit).
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
-- forward-references doc_reviews, created further below; SQLite does not check a referenced table exists
-- at CREATE TABLE time (only at enforcement, and foreign_keys is off for the duration of a migration).
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
-- personas are not records (data-model.md): steps live in process_steps (0004), the persona in the
-- process record's content.
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
