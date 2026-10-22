/** Run trace table types (spec 005), mirroring data/schema/schema.sql. */
import type {
  AgentTurnKind,
  AgentTurnRole,
  PwTraceMode,
  SpanKind,
  SpanStatus,
  TraceLevel,
  TraceServer,
} from '@mudpuppy/trace';

export interface TraceBootsTable {
  id: string;
  started_at: string;
  ended_at: string | null;
  environment: string;
  server: TraceServer;
  pid: number;
  version: string;
  trace_level: TraceLevel;
  pw_trace: PwTraceMode;
}

export interface TraceSpansTable {
  id: string;
  boot_id: string;
  seq: number;
  run_id: string | null;
  parent_id: string | null;
  kind: SpanKind;
  name: string;
  status: SpanStatus;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  attrs_json: string;
  payload_ref: string | null;
  summary: string;
  decision_id: string | null;
  tool_use_id: string | null;
  agent_id: string | null;
  rationale: string | null;
  pw_trace_path: string | null;
  between_calls: 0 | 1;
}

export interface AgentTurnsTable {
  id: string;
  agent_id: string;
  agent_type: string;
  session_id: string | null;
  message_uuid: string;
  block_index: number;
  api_message_id: string | null;
  run_id: string | null;
  role: AgentTurnRole;
  kind: AgentTurnKind;
  tool_use_id: string | null;
  tool_name: string | null;
  text: string | null;
  payload_ref: string | null;
  is_error: 0 | 1 | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_creation_tokens: number | null;
  matched: 0 | 1;
  created_at: string;
  imported_at: string;
}
