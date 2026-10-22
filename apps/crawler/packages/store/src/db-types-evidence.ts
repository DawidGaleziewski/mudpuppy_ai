/** Per-visit evidence table types (Layer A): what each step saw and did, mirroring data/schema/schema.sql. */
import type { ColumnType } from 'kysely';
import type {
  Confidence,
  DecisionKind,
  TransitionStatus,
  FrontierItemStatus,
  PortalDataLogAction,
  RobotsOutcome,
  SafetyClass,
  Stabilization,
} from '@mudpuppy/core';

import type { Nullable } from './db-types-columns.js';

export interface StateObservationsTable {
  run_id: string;
  state_id: string;
  persona_id: string;
  evidence_ref: string;
  observed_at: string;
  composition_json: string | null;
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

/** 0032: v1's `edges`, the design's transitions. */
export interface TransitionsTable {
  id: string;
  run_id: string;
  from_state: string;
  to_state: string | null;
  action_json: string;
  safety_class: SafetyClass;
  status: TransitionStatus;
  evidence_ref: string;
  confidence: Confidence;
  error: string | null;
  stabilization: Stabilization;
  created_at: string;
  /** 0029 (spec 039): journey position, start observation, element key. NULL on v1 rows. */
  journey_id: Nullable;
  seq: ColumnType<number | null, number | null | undefined, number | null>;
  from_observation_id: Nullable;
  element_key: Nullable;
  kind: ColumnType<TransitionKind | null, TransitionKind | null | undefined, TransitionKind | null>;
  result: ColumnType<StepResult | null, StepResult | null | undefined, StepResult | null>;
  driver: ColumnType<'agent' | 'headless', 'agent' | 'headless' | undefined, 'agent' | 'headless'>;
}

/** 0029: what a page visit or a transition came to (spec 039 design § 5.6). */
export type StepResult =
  'ok' | 'validation' | 'business_error' | 'technical_error' | 'timeout' | 'blocked';
export type TransitionKind = 'click' | 'fill' | 'select' | 'check' | 'submit' | 'navigate' | 'back';

/** 0029: one build of one scope of a portal (spec 039 design § 5.2). */
export interface BuildsTable {
  id: string;
  portal_id: string;
  scope: string;
  signature: string;
  source: 'assets' | 'marker' | 'unknown';
  assets_json: string;
  first_seen: string;
}

/** 0029: fingerprint v2 components of a state (design § 5.4). */
export interface StateComponentsTable {
  state_id: string;
  structure_hash: string;
  content_hash: string;
  overlay_hash: string;
  calls_hash: string;
  mounts_hash: string;
  minhash: Buffer;
  element_keys: string;
  /** 0033 (T112): the fingerprint profile (`name@hash`) these were computed with; NULL = rows-v2. */
  profile: Nullable;
}

/** 0033 (spec 039 T111): a fingerprint profile a portal used, its resolved rules. */
export interface FingerprintProfilesTable {
  portal_id: string;
  id: string;
  name: string;
  rules_json: string;
  first_seen: string;
}

export type JourneyStartKind =
  'entry_url' | 'checkpoint' | 'login' | 'backtrack' | 'resume' | 'fresh_session';
export type JourneyEndReason =
  'outcome' | 'backtrack' | 'reset' | 'logout' | 'error' | 'budget' | 'run_end';

/** 0029: one continuous path of a run (design § 5.7). */
export interface JourneysTable {
  id: string;
  run_id: string;
  parent_journey_id: string | null;
  branch_seq: number | null;
  start_kind: JourneyStartKind;
  checkpoint_id: string | null;
  end_reason: JourneyEndReason | null;
  started_at: string;
  ended_at: string | null;
}

/** 0029: a persona attribute, typed input or shown value at a journey position (design § 5.8). */
export interface AttributeWritesTable {
  id: string;
  journey_id: string;
  seq: number;
  name: string;
  source: 'persona' | 'input' | 'shown';
  value_type: 'number' | 'date' | 'enum' | 'bool' | 'text' | 'missing';
  value_num: number | null;
  value_text: string | null;
  element_key: string | null;
  created_at: string;
}

/** 0029: the builds an observation was served by, one per scope. */
export interface ObservationBuildsTable {
  observation_id: string;
  build_id: string;
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
  transition_id: string | null;
  method: string;
  url_template: string;
  status: number;
  req_schema: string;
  res_schema: string;
  console_errors: string;
  created_at: string;
  /** 0012: the verbatim request URL (query kept); NULL before 0012. */
  url: ColumnType<string | null, string | null | undefined, string | null>;
  /** 0027: masked sample bodies (at most 4096 characters), recorded only outside production; NULL otherwise. */
  req_sample: ColumnType<string | null, string | null | undefined, string | null>;
  res_sample: ColumnType<string | null, string | null | undefined, string | null>;
  /** 0029: sha256 of the response shape (spec 039 design § 5.3); NULL for documents and v1 rows. */
  schema_hash: Nullable;
}

/**
 * 0012: one arrival on a page, its verbatim URL and the hops (JSON `NavigationHop[]`) that led there.
 * 0029: journey, order in the run, step result, context, flags. 0032: renamed from `page_visits`.
 */
export interface ObservationsTable {
  id: string;
  run_id: string;
  state_id: string;
  transition_id: string | null;
  via: 'navigate' | 'action' | 'relogin' | 'login';
  url: string;
  hops_json: string;
  created_at: string;
  journey_id: Nullable;
  seq: ColumnType<number | null, number | null | undefined, number | null>;
  result: ColumnType<StepResult | null, StepResult | null | undefined, StepResult | null>;
  context_key: Nullable;
  flags_json: ColumnType<string, string | undefined, string>;
  /** 0033 (T112): the fingerprint profile of the run; NULL = rows-v2, before 0033. */
  fingerprint_profile: Nullable;
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
  /** 0040 (spec 039 § 15): the subject, a state, transition or form ref (was `about_ref`). */
  ref_id: string;
  status: 'open' | 'addressed';
  created_at: string;
  /** 0031 (spec 039): the hypothesis the question is about, when there is one. */
  hypothesis_id: ColumnType<string | null, string | null | undefined, string | null>;
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

export interface RobotsPoliciesTable {
  id: string;
  run_id: string;
  host: string;
  source_url: string;
  final_url: string | null;
  outcome: RobotsOutcome;
  http_status: number | null;
  product_token: string;
  group_used: string | null;
  crawl_delay_s: number | null;
  ignored_lines: number;
  truncated: 0 | 1;
  content_sha256: string | null;
  evidence_ref: string;
  fetched_at: string;
}

export interface PortalDataLogTable {
  id: string;
  portal_id: string;
  environment: string;
  action: PortalDataLogAction;
  operator: string;
  counts_json: string;
  target: string | null;
  created_at: string;
}
