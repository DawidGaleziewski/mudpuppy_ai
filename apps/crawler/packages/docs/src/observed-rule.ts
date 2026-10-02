import type { Confidence, EvidenceTargetKind } from '@pathfinder/core';

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
}

/** Layer A kinds that can show behaviour. Notes, questions, decisions, records and reviews never can. */
export const OBSERVABLE_KINDS: readonly EvidenceTargetKind[] = [
  'state',
  'edge',
  'form',
  'action',
  'network_call',
  'process_step',
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
