import type {
  Confidence,
  EdgeStatus,
  RunStatus,
  SafetyClass,
  Stabilization,
} from './schemas/common.js';
import type { DecisionKind } from './schemas/decision-log.js';
import type { FrontierItemStatus } from './schemas/frontier.js';

/** Kysely table types mirroring data/schema/schema.sql. JSON columns are TEXT (stringified JSON). */
export interface RunsTable {
  id: string;
  portal_id: string;
  persona_id: string;
  mode: string;
  environment: string;
  env_version_or_date: string;
  seed_id: string | null;
  viewport: string;
  locale: string;
  browser: string;
  config_snapshot: string;
  status: RunStatus;
  warning: string | null;
  steps_used: number;
  elapsed_ms: number;
  max_depth_reached: number;
  started_at: string;
  ended_at: string | null;
  coverage: string | null;
}

export interface StatesTable {
  id: string;
  fingerprint: string;
  cluster_id: string;
  route_template: string;
  title: string;
  evidence_ref: string;
  confidence: Confidence;
  stabilization: Stabilization;
  first_seen_run: string;
  created_at: string;
}

export interface StateObservationsTable {
  run_id: string;
  state_id: string;
  persona_id: string;
  evidence_ref: string;
  observed_at: string;
}

export interface ActionsTable {
  id: string;
  run_id: string;
  state_id: string;
  role: string;
  accessible_name: string | null;
  action_json: string;
  safety_class: SafetyClass;
  allowed: 0 | 1;
  skip_reason: string | null;
  created_at: string;
}

export interface EdgesTable {
  id: string;
  run_id: string;
  from_state: string;
  to_state: string | null;
  action_json: string;
  safety_class: SafetyClass;
  status: EdgeStatus;
  evidence_ref: string;
  confidence: Confidence;
  error: string | null;
  stabilization: Stabilization;
  created_at: string;
}

export interface FormsTable {
  id: string;
  run_id: string;
  state_id: string;
  fields_json: string;
  evidence_ref: string;
  confidence: Confidence;
  created_at: string;
}

export interface NetworkCallsTable {
  id: string;
  run_id: string;
  edge_id: string | null;
  method: string;
  url_template: string;
  status: number;
  req_schema: string;
  res_schema: string;
  console_errors: string;
  created_at: string;
}

export interface FrontierTable {
  id: string;
  run_id: string;
  state_id: string;
  action_id: string | null;
  action_json: string;
  safety_class: SafetyClass;
  status: FrontierItemStatus;
  priority: number;
  depth: number;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface OpenQuestionsTable {
  id: string;
  run_id: string;
  text: string;
  about_ref: string;
  status: 'open' | 'addressed';
  created_at: string;
}

export interface RuleCandidatesTable {
  id: string;
  run_id: string;
  text: string;
  about_ref: string;
  evidence_ref: string;
  confidence: 'inferred';
  created_at: string;
}

export interface DecisionLogTable {
  id: string;
  run_id: string;
  kind: DecisionKind;
  rule: string | null;
  reason: string;
  subject_ref: string | null;
  detail_json: string | null;
  created_at: string;
}

export interface Database {
  runs: RunsTable;
  states: StatesTable;
  state_observations: StateObservationsTable;
  actions: ActionsTable;
  edges: EdgesTable;
  forms: FormsTable;
  network_calls: NetworkCallsTable;
  frontier: FrontierTable;
  open_questions: OpenQuestionsTable;
  rule_candidates: RuleCandidatesTable;
  decision_log: DecisionLogTable;
}
