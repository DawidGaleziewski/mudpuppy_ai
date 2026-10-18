/**
 * Hypothesis lifecycle (spec 039 design § 10.2) and who may confirm what (§ 10.3). A hypothesis's
 * status is derived from its events by this code, never set directly (constitution Principle VI).
 * Pure.
 */
import { createHash } from 'node:crypto';
import { canonicalJson } from '../capture/schema-hash.js';
import type { HypothesisKind } from './rules.js';

export const HYPOTHESIS_STATUSES = [
  'proposed',
  'testing',
  'supported',
  'refuted',
  'confirmed',
  'rejected',
  'superseded',
] as const;
export type HypothesisStatus = (typeof HYPOTHESIS_STATUSES)[number];

/** Moves the lifecycle allows (design § 10.2). Refuted and rejected are final; confirmed can be superseded. */
const NEXT: Record<HypothesisStatus, readonly HypothesisStatus[]> = {
  proposed: ['testing', 'supported', 'confirmed', 'rejected', 'superseded'],
  testing: ['supported', 'refuted', 'rejected', 'superseded'],
  supported: ['confirmed', 'rejected', 'refuted', 'superseded'],
  confirmed: ['superseded', 'rejected'],
  refuted: [],
  rejected: [],
  superseded: [],
};

export interface HypothesisEvent {
  to: HypothesisStatus;
  actor: string;
  /** Required: so owner reasons are kept (design § 10.1, R-78 (1)). */
  reason: string;
  at: string;
}

export class LifecycleError extends Error {}

/** The status after `events` (in order), refusing a move the lifecycle does not allow. */
export function statusOf(events: readonly HypothesisEvent[]): HypothesisStatus {
  const first = events[0];
  if (!first) throw new LifecycleError('a hypothesis has at least one event');
  if (first.to !== 'proposed' && first.to !== 'confirmed' && first.to !== 'testing')
    throw new LifecycleError(`a hypothesis starts proposed, testing or confirmed, not ${first.to}`);
  let status: HypothesisStatus = first.to;
  for (const e of events) {
    if (!e.reason.trim()) throw new LifecycleError('every hypothesis event needs a reason');
    if (e === first) continue;
    if (!NEXT[status].includes(e.to))
      throw new LifecycleError(`${status} → ${e.to} is not a lifecycle move`);
    status = e.to;
  }
  return status;
}

/** Kinds the reconciler confirms itself, as derived facts (design § 10.3, constitution 6.0.0). */
export const DERIVED_KINDS: ReadonlySet<HypothesisKind | 'coverage_gap' | 'parameter_role'> =
  new Set([
    'structural_drift',
    'flaky',
    'context_variant',
    'replaces',
    'decision_drift',
    'coverage_gap',
    'parameter_role',
  ]);

/** Kinds an agent may propose without a test (design § 10.2): a person's label or decision settles them. */
export const NO_TEST_KINDS: ReadonlySet<string> = new Set([
  'same_as',
  'different_from',
  'process_boundary',
]);

/**
 * Whether `actor` may move a hypothesis of `kind` to confirmed: the reconciler only for derived
 * kinds (and `removed` after a build change, which the rule marks derived), people for everything.
 */
export function mayConfirm(
  kind: string,
  actor: 'reconciler' | 'agent' | 'person',
  derivedByRule = false,
): boolean {
  if (actor === 'person') return true;
  if (actor === 'reconciler')
    return derivedByRule && (DERIVED_KINDS.has(kind as never) || kind === 'removed');
  return false; // agents propose; they never confirm
}

/** sha256 of the canonical claim: equal claims hash alike, so a refuted claim is refused again. */
export function claimHash(kind: string, claim: unknown): string {
  return createHash('sha256')
    .update(`${kind}\n${canonicalJson(claim)}`)
    .digest('hex');
}
