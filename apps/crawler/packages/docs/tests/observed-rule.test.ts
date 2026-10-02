import { describe, expect, it } from 'vitest';
import type { Confidence, EvidenceTargetKind } from '@pathfinder/core';
import { checkObserved, type ResolvedTarget } from '../src/observed-rule.js';

const target = (
  target_kind: EvidenceTargetKind,
  confidence: Confidence | null,
): ResolvedTarget => ({
  target_kind,
  target_id: `${target_kind}-1`,
  run_id: target_kind === 'doc_record' || target_kind === 'review' ? null : 'run-1',
  portal_id: 'p',
  confidence,
});

describe('observed rule (research §5)', () => {
  it('accepts one observed state, edge, form, action, network call or process step', () => {
    for (const kind of ['state', 'edge', 'form', 'action', 'network_call', 'process_step'] as const)
      expect(checkObserved([target(kind, 'observed')]).ok, kind).toBe(true);
  });

  it('refuses a Layer A target that is not itself observed', () => {
    for (const kind of ['state', 'edge', 'form'] as const) {
      expect(checkObserved([target(kind, 'inferred')]).ok).toBe(false);
      expect(checkObserved([target(kind, 'needs_confirmation')]).ok).toBe(false);
    }
  });

  it('never accepts rule candidates, questions, decisions, records or reviews', () => {
    for (const kind of [
      'rule_candidate',
      'open_question',
      'decision',
      'doc_record',
      'review',
      'process',
    ] as const) {
      expect(checkObserved([target(kind, 'observed')]).ok, kind).toBe(false);
      expect(checkObserved([target(kind, null)]).ok, kind).toBe(false);
    }
  });

  it('needs only one qualifying target among several', () => {
    const r = checkObserved([
      target('rule_candidate', 'inferred'),
      target('review', null),
      target('form', 'observed'),
    ]);
    expect(r.ok).toBe(true);
    expect(r.checked.map((c) => c.qualifies)).toEqual([false, false, true]);
  });

  it('refuses an empty list and reports what it checked', () => {
    expect(checkObserved([])).toEqual({ ok: false, checked: [] });
    expect(checkObserved([target('rule_candidate', 'inferred')])).toEqual({
      ok: false,
      checked: [
        {
          target_kind: 'rule_candidate',
          target_id: 'rule_candidate-1',
          confidence: 'inferred',
          qualifies: false,
        },
      ],
    });
  });
});
