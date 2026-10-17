-- 0023_probe_outcomes_and_suites (up): what each form probe did, and the trace suites built from them.
-- Spec 032 data-model.md, plan.md decisions 10 and 11. Indexes: only the named reads (outcomes of a run and
-- of a form step through get_run_evidence; the open suites of a portal for the BA and the dashboard).
-- Evidence (evidence_ref) is NOT NULL and non-empty: a probe outcome without evidence cannot be inserted.

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
  edge_id              TEXT REFERENCES edges(id),                    -- the edge the probe's submit produced
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
