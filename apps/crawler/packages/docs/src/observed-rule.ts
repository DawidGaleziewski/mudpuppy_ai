import type { Confidence } from '@pathfinder/core';
import type { EvidenceTargetKind } from '@pathfinder/docs-model';

/** One evidence link after resolution against the store (see `resolveTargets`). */
export interface ResolvedTarget {
  target_kind: EvidenceTargetKind;
  /** Canonical row id (a `doc_record` cited by key is resolved to its id). */
  target_id: string;
  /** The run the evidence came from; null for `doc_record` and `review`. */
  run_id: string | null;
  portal_id: string;
  /** The target's own confidence; null where the kind carries none (questions, decisions, records, reviews). */
  confidence: Confidence | null;
  /** `screen_region` only: the cited element key (spec 008). */
  region?: string;
}

/** Layer A kinds that can show behaviour. Notes, questions, decisions, records and reviews never can. */
export const OBSERVABLE_KINDS: readonly EvidenceTargetKind[] = [
  'state',
  'screen_region',
  'edge',
  'form',
  'action',
  'network_call',
  'process_step',
  // spec 019: the browser was at that URL; refused in the first bank eval (findings F-07)
  'page_visit',
];

/**
 * Kinds that never show behaviour. Every `EvidenceTargetKind` is in exactly one of the two lists
 * (tested), so a new kind cannot fall through unclassified as `page_visit` did (spec 019 F-07).
 */
export const NOT_OBSERVABLE_KINDS: readonly EvidenceTargetKind[] = [
  'rule_candidate',
  'open_question',
  'decision',
  'process',
  'doc_record',
  'review',
];

export function qualifiesAsObserved(target: ResolvedTarget): boolean {
  return OBSERVABLE_KINDS.includes(target.target_kind) && target.confidence === 'observed';
}

export interface ObservedCheck {
  ok: boolean;
  /** Every target looked at and whether it qualified (the `INVALID_CONFIDENCE` details). */
  checked: {
    target_kind: EvidenceTargetKind;
    target_id: string;
    confidence: Confidence | null;
    qualifies: boolean;
  }[];
}

/** `observed` needs at least one cited Layer A item that was itself observed (research §5). */
export function checkObserved(targets: readonly ResolvedTarget[]): ObservedCheck {
  const checked = targets.map((t) => ({
    target_kind: t.target_kind,
    target_id: t.target_id,
    confidence: t.confidence,
    qualifies: qualifiesAsObserved(t),
  }));
  return { ok: checked.some((c) => c.qualifies), checked };
}
