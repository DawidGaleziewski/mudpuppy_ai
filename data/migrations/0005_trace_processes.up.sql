-- 0005_trace_processes (up): trace-mode process records (R-14, T037). Purely additive: no existing
-- table is rebuilt. Written by the crawler server only (the agent supplies intent/goal text, the
-- server derives everything else). Conventions: see data/schema/README.md. Zod schemas in
-- @pathfinder/core/schemas (process.ts, process-step.ts) are the write contract.

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
  edge_id        TEXT REFERENCES edges(id),     -- network calls reach the step via network_calls.edge_id
  value          TEXT,                          -- scrubbed synthetic input for fill/select; NULL otherwise
  state_before   TEXT REFERENCES states(id),
  state_after    TEXT REFERENCES states(id),    -- NULL if nothing changed/settled
  outcomes_json  TEXT NOT NULL CHECK (json_valid(outcomes_json) AND json_type(outcomes_json) = 'array'),
  evidence_ref   TEXT NOT NULL CHECK (length(evidence_ref) > 0),  -- ARIA snapshot after the step
  confidence     TEXT NOT NULL CHECK (confidence IN ('observed','inferred','needs_confirmation')),
  created_at     TEXT NOT NULL,
  UNIQUE (process_id, ord)
) STRICT;
