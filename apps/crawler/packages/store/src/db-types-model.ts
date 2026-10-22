/** Portal model (Layer M, spec 039) table types, mirroring data/schema/schema.sql. */
import type { ColumnType } from 'kysely';
import type { Confidence } from '@mudpuppy/core';

import type { Nullable, OptionalRef } from './db-types-columns.js';
import type { StepResult, TransitionKind } from './db-types-evidence.js';

/** 0038 (spec 039 FR-050, T090): a similarity classifier trained for a portal and profile. */
export interface SimilarityClassifiersTable {
  id: string;
  portal_id: string;
  profile: string;
  features: string;
  weights: string;
  intercept: number;
  labels: number;
  held_out: number;
  f1: number;
  tau: number;
  tau_f1: number;
  better: 0 | 1;
  trained_at: string;
  /** 0039 (owner answer 14): who put it in force; null until a person accepts it. */
  accepted_by: string | null;
  accepted_at: string | null;
}

/** 0033 (spec 039 T115): a τ a person accepted for a portal and profile; the latest is in force. */
export interface TauAcceptancesTable {
  id: string;
  portal_id: string;
  profile: string;
  tau: number;
  labels: number;
  f1: number | null;
  accepted_by: string;
  accepted_at: string;
}

export type CoverageStatus = 'active' | 'not_seen_since' | 'untested' | 'retired';

/** 0030 (spec 039 design § 6): one reconcile of one portal. */
export interface ModelVersionsTable {
  id: string;
  portal_id: string;
  seq: number;
  built_at: string;
  algorithm: string;
  threshold: number;
  observation_watermark: string | null;
  decision_watermark: string | null;
  stats_json: string;
  /** 0033 (T112): the fingerprint profile the version was clustered under. */
  fingerprint_profile: Nullable;
}

/** 0030: a screen of the portal model with a stable id and key (F-14@039). */
export interface ModelScreensTable {
  id: string;
  key: string;
  portal_id: string;
  route_key: string;
  title: string;
  status: 'active' | 'merged' | 'retired';
  first_model_version: string;
  created_at: string;
}

export interface ScreenMembersTable {
  screen_id: string;
  state_id: string;
  ordinal: number;
  assigned_by: 'clustering' | 'constraint';
  from_model_version: string;
  to_model_version: string | null;
}

export interface ScreenLineageTable {
  id: string;
  model_version_id: string;
  kind: 'split' | 'merge' | 'retire' | 'revive';
  from_screen_id: string;
  to_screen_id: string | null;
  members_moved: number;
}

export interface StatePairLabelsTable {
  portal_id: string;
  state_a: string;
  state_b: string;
  label: 'clone' | 'near_duplicate' | 'distinct';
  nd_kind: 'cosmetic' | 'dynamic_data' | 'duplication' | null;
  labelled_by: string;
  labelled_at: string;
  reason: string | null;
}

/** 0045: one row per "Same screen?" answer, append-only; state_pair_labels keeps the current one. */
export interface StatePairLabelHistoryTable {
  id: string;
  portal_id: string;
  state_a: string;
  state_b: string;
  label: 'clone' | 'near_duplicate' | 'distinct';
  nd_kind: 'cosmetic' | 'dynamic_data' | 'duplication' | null;
  labelled_by: string;
  labelled_at: string;
  reason: string | null;
}

export interface ParameterRolesTable {
  portal_id: string;
  route_template: string;
  param: string;
  role: 'identity' | 'data' | 'ignored';
  decided_by: 'reconciler' | 'person';
  decided_at: string;
}

export interface ActionClassesTable {
  id: string;
  screen_id: string;
  element_key: string;
  kind: TransitionKind;
  is_global: 0 | 1;
  status: CoverageStatus;
  streak_json: string;
  status_model_version: string;
}

export interface ModelTransitionsTable {
  id: string;
  from_screen_id: string;
  action_class_id: string;
  to_screen_id: string | null;
  result: StepResult;
  internal: 0 | 1;
  support: number;
  first_seen_transition_id: string;
  last_seen_transition_id: string;
  status: CoverageStatus;
  status_model_version: string;
}

/** 0031 (spec 039 design § 15): a typed reference with real foreign keys, exactly one target. */
export interface EntityRefsTable {
  id: string;
  observation_id: string | null;
  transition_id: string | null;
  state_id: string | null;
  screen_id: string | null;
  action_class_id: string | null;
  model_transition_id: string | null;
  process_id: string | null;
  hypothesis_id: string | null;
  network_call_id: string | null;
  /** 0040 (spec 039 § 15): the kinds the BA cites; trace processes and steps are v1's tables. */
  action_id: OptionalRef;
  form_id: OptionalRef;
  open_question_id: OptionalRef;
  decision_id: OptionalRef;
  review_id: OptionalRef;
  doc_record_id: OptionalRef;
  trace_process_id: OptionalRef;
  trace_step_id: OptionalRef;
  form_step_id: OptionalRef;
  /** 0040: an evidence store file (content-addressed; no row). */
  evidence_file: OptionalRef;
  /** With a model screen (an anchor) or, since 0040, a state (a screen region). */
  element_key: string | null;
}

export type DeviationKind =
  | 'new_screen'
  | 'new_member'
  | 'new_action'
  | 'missing_action'
  | 'target_mismatch'
  | 'result_mismatch'
  | 'rule_mismatch';

/** 0031 (design § 8.1): a place a new model version did not fit the previous one. */
export interface DeviationsTable {
  id: string;
  portal_id: string;
  model_version_id: string;
  kind: DeviationKind;
  subject_key: string;
  screen_id: string | null;
  state_id: string | null;
  action_class_id: string | null;
  before_json: string | null;
  after_json: string | null;
  changed_components: ColumnType<string, string | undefined, string>;
  context_diff: ColumnType<string, string | undefined, string>;
  status: 'open' | 'waiting_test' | 'explained';
  created_at: string;
}

export interface DeviationOccurrencesTable {
  deviation_id: string;
  model_version_id: string;
}

export type HypothesisStatus =
  'proposed' | 'testing' | 'supported' | 'refuted' | 'confirmed' | 'rejected' | 'superseded';

/** 0031 (design § 10): a testable claim; its status is derived from its events. */
export interface HypothesesTable {
  id: string;
  key: string;
  portal_id: string;
  kind: string;
  claim: string;
  claim_json: string;
  claim_hash: string;
  origin: 'rule' | 'agent' | 'person';
  rule: string | null;
  derived: ColumnType<0 | 1, 0 | 1 | undefined, 0 | 1>;
  confidence: Confidence;
  fitness: number | null;
  precision: number | null;
  support: number | null;
  counterexamples: number | null;
  deviation_id: string | null;
  superseded_by: string | null;
  model_version_id: string;
  created_at: string;
}

export interface HypothesisEvidenceTable {
  hypothesis_id: string;
  ref_id: string;
  role: 'supports' | 'contradicts' | 'context';
}

export interface HypothesisTestsTable {
  id: string;
  hypothesis_id: string;
  probe_suite_id: string | null;
  mark_id: string | null;
  inputs_json: ColumnType<string, string | undefined, string>;
  refutes_if_json: string;
  result_json: string | null;
  verdict: 'pass' | 'fail' | 'inconclusive' | null;
  run_id: string | null;
  created_at: string;
}

export interface HypothesisEventsTable {
  id: string;
  hypothesis_id: string;
  from_status: HypothesisStatus | null;
  to_status: HypothesisStatus;
  actor: string;
  reason: string;
  at: string;
  /** 0046: the one command a person's decision came in (a bulk decision is one command); null for machine events. */
  decision_id: string | null;
  /** 0046: the event this one reverts (Undo appends, never deletes). */
  undoes: string | null;
}

/** 0046: a person's Reword of a rule; append-only, the latest row is the wording in force. */
export interface HypothesisWordingsTable {
  id: string;
  hypothesis_id: string;
  wording: string;
  actor: string;
  reason: string | null;
  at: string;
}

export interface BuildEpochsTable {
  id: string;
  portal_id: string;
  scope: string;
  environment: string;
  build_id: string;
  first_observation_id: string;
  last_observation_id: string;
  overlaps_previous: 0 | 1;
  model_version_id: string;
}

/** 0036 (spec 039 design § 13.4): a value reused within a journey, stored hashed. */
export interface CorrelationIdsTable {
  id: string;
  journey_id: string;
  key_path: string;
  value_hash: string;
  endpoint_family: string;
  first_transition_id: string;
  last_transition_id: string;
}

/**
 * 0036: one journey through a process from its trigger, with the outcome. 0039: the trigger is a
 * transition or a deep link (an observation of a URL opened on the start screen).
 */
export interface ProcessInstancesTable {
  id: string;
  process_id: string;
  journey_id: string;
  trigger_kind: 'transition' | 'deep_link';
  trigger_transition_id: string | null;
  trigger_observation_id: string | null;
  last_transition_id: string | null;
  outcome: 'completed' | 'exited' | 'error' | 'abandoned' | 'incomplete';
  outcome_screen_id: string | null;
  correlation_id: string | null;
  model_version_id: string;
  /** 0043: JSON array of the model screen ids walked, start screen first; null before 0043. */
  screens_json: string | null;
}

/** 0036: the model transitions that start a process. */
export interface ProcessTriggersTable {
  process_id: string;
  model_transition_id: string;
}

/** 0036: one completed exploration of a process (the stopping rule, design § 14.2). */
export interface ProcessExplorationsTable {
  id: string;
  process_id: string;
  epoch_set: string;
  depth: number;
  random_walks: number;
  new_deviations: number;
  completed_at: string;
}
