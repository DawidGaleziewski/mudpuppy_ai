/** Run, state, form step, probe and mark table types (Layer A), mirroring data/schema/schema.sql. */
import type { ColumnType } from 'kysely';
import type {
  Confidence,
  MarkKind,
  OutcomeKind,
  ProbeFault,
  ProbeGroup,
  ProbeSuiteStatus,
  RunStatus,
  RunType,
  Stabilization,
  StateKind,
} from '@mudpuppy/core';

import type { OptionalRef } from './db-types-columns.js';

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
  /** 0009: the mudpuppy server instance driving the run, and its process id (F-14). */
  owner_id: string | null;
  owner_pid: number | null;
  /** 0027: the kind of directed run; NULL = a plain run (full map or trace by `mode`). */
  run_type: ColumnType<RunType | null, RunType | null | undefined, RunType | null>;
  /** 0027: the run a directed run continues or retries. */
  parent_run_id: ColumnType<string | null, string | null | undefined, string | null>;
  /** 0027: JSON the run's plan came from (start states, skip targets, depth, variation, target transition, marks used). */
  plan_json: ColumnType<string | null, string | null | undefined, string | null>;
}

export interface StatesTable {
  id: string;
  portal_id: string;
  fingerprint: string;
  cluster_id: string;
  route_template: string;
  title: string;
  evidence_ref: string;
  confidence: Confidence;
  stabilization: Stabilization;
  first_seen_run: string;
  created_at: string;
  /** 0006: `<sha256>.png`, set once when the state is first recorded; NULL if capture failed. */
  screenshot_ref: ColumnType<string | null, string | null | undefined, string | null>;
  /** 0006: Layout JSON ref (element keys and page boxes); NULL if capture failed. */
  layout_ref: ColumnType<string | null, string | null | undefined, string | null>;
  /** 0015: the screen this state is a revision of; NULL only for rows an old crawler wrote. */
  screen_id: ColumnType<string | null, string | null | undefined, string | null>;
  /** 0015: r1, r2, ... by first sighting within the screen. */
  screen_rev: ColumnType<number | null, number | null | undefined, number | null>;
  /** 0022: the form step this state shows; NULL: no controls, or recorded before 0022. */
  form_step_id: ColumnType<string | null, string | null | undefined, string | null>;
  /** 0022: `main` unless the state shows validation errors or was reached by a technical fault. */
  state_kind: ColumnType<StateKind, StateKind | undefined, StateKind>;
}

/** 0022: one step of a form flow on a route template, numbered per (portal, route). */
export interface FormStepsTable {
  id: string;
  portal_id: string;
  route_template: string;
  step_index: number;
  form_name: string | null;
  /** JSON array of sorted `role|name`. */
  controls_json: string;
  label: string;
  first_seen_run: string;
  created_at: string;
}

/** 0023: what one form probe did. JSON columns are stringified JSON; flags are 0/1. */
export interface ProbeOutcomesTable {
  id: string;
  run_id: string;
  from_state_id: string;
  form_step_id: string | null;
  probe_id: string;
  probe_group: ProbeGroup;
  target: string | null;
  inputs_json: string;
  path_json: string;
  fault: ProbeFault | null;
  outcome_kind: OutcomeKind;
  to_state_id: string | null;
  accepted: ColumnType<number, number | undefined, number>;
  possible_new_process: ColumnType<number, number | undefined, number>;
  messages_json: string;
  http_status: number | null;
  reason: string | null;
  evidence_ref: string;
  transition_id: string | null;
  created_at: string;
}

/** 0023: a proposed trace entry built from probe outcomes; the owner approves or dismisses it. */
export interface ProbeSuitesTable {
  id: string;
  portal_id: string;
  run_id: string;
  form_step_id: string | null;
  trace_json: string;
  notes_json: string;
  status: ColumnType<ProbeSuiteStatus, ProbeSuiteStatus | undefined, ProbeSuiteStatus>;
  approved_json: string | null;
  replaced_json: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

/** 0024: a person's instruction on a map target for the next scan; `target_id` has no foreign key. */
export interface MarksTable {
  id: string;
  portal_id: string;
  kind: MarkKind;
  /** 0041 (spec 039 § 15): the target in a typed column, exactly one of the three. */
  form_step_id: OptionalRef;
  state_id: OptionalRef;
  transition_id: OptionalRef;
  created_by: string;
  created_at: string;
  used_by_run_id: string | null;
  used_at: string | null;
  /** 0031 (spec 039 § 14): a person's mark or the planner's; the hypothesis it tests; its priority. */
  origin: ColumnType<'person' | 'planner', 'person' | 'planner' | undefined, 'person' | 'planner'>;
  hypothesis_id: ColumnType<string | null, string | null | undefined, string | null>;
  priority: ColumnType<number | null, number | null | undefined, number | null>;
}

/** 0027: the shortest recorded way back to a state, one per (run, state); `steps_json` is validated by `CheckpointRow` (core). */
export interface CheckpointsTable {
  id: string;
  run_id: string;
  state_id: string;
  start_url: string;
  steps_json: string;
  created_at: string;
  updated_at: string;
}

/** 0015: a screen is (portal_id, route_template, cluster_id); its states are its observed revisions. */
export interface ScreensTable {
  id: string;
  portal_id: string;
  route_template: string;
  cluster_id: string;
  title: string;
  first_seen_run: string;
  created_at: string;
  /** 0026: id of the screen this one was merged into (owner-confirmed "same state"); NULL = stands alone. */
  merged_into: string | null;
}

/** 0006: derived wireframe of a state, rebuilt when `generator_version` is stale. */
export interface StateWireframesTable {
  state_id: string;
  generator_version: string;
  svg_ref: string;
  excalidraw_ref: string;
  created_at: string;
}

/**
 * 0007: encrypted test-user credential. Written only by the vault; never exported or joined.
 * `ciphertext` is AES-256-GCM ciphertext || 16-byte tag; `nonce` is 12 bytes.
 */
export interface CredentialsTable {
  id: string;
  portal_id: string;
  environment: string; // free name per portal, format-checked in the table (spec 030 R-61)
  ref_name: string;
  ciphertext: Buffer | Uint8Array;
  nonce: Buffer | Uint8Array;
  /** First 8 hex chars of sha256(key). */
  key_id: string;
  created_at: string;
  updated_at: string;
}
