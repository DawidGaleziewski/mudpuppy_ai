import { describe, expect, it } from 'vitest';
import { processTraceVariants, reconcilePortalModel } from '../src/index.js';
import { seedProcess } from './seed-process.js';
import { T } from './seed-threshold.js';

// Spec 039 T073 (design § 13.1): instances of a documented process, written on reconcile.

describe('process instances (T073)', () => {
  it('writes one instance per trigger with its outcome, and reads the trace variants', async () => {
    const o = seedProcess();
    const done = reconcilePortalModel(o.raw, 'ins', { now: T(500) });
    expect(done.instances).toBe(2);
    const rows = o.raw
      .prepare(
        `SELECT i.journey_id, i.trigger_transition_id, i.outcome, s.key AS screen
         FROM process_instances i LEFT JOIN model_screens s ON s.id = i.outcome_screen_id
         WHERE i.model_version_id = ? ORDER BY i.journey_id`,
      )
      .all(done.modelVersion) as Record<string, string>[];
    expect(rows.map((r) => [r.journey_id, r.trigger_transition_id, r.outcome])).toEqual([
      ['j3', 'in-j3', 'exited'], // a minor: the refusal page is not part of the process
      ['j6', 'in-j6', 'completed'],
    ]);
    const variants = processTraceVariants(o.raw, 'ins', 'PRC-001');
    // Equal counts: ordered by the screen sequence (code-unit order), the shorter first.
    expect(variants.map((v) => [v.outcome, v.count, v.screens.length])).toEqual([
      ['exited', 1, 1],
      ['completed', 1, 2],
    ]);
    expect(variants[1]!.screens.every((k) => /^SC-\d{4}$/.test(k))).toBe(true);
    await o.close();
  });
});
