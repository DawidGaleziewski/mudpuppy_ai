import { describe, expect, it } from 'vitest';
import { processTraceVariants, reconcilePortalModel } from '../src/index.js';
import { seedProcess } from './seed-process.js';
import { T } from './seed-threshold.js';

// Spec 039 T073 (design § 13.1): instances of a documented process, written on reconcile.

describe('process instances (T073)', () => {
  it('writes one instance per trigger with its outcome, and reads the trace variants', async () => {
    const o = seedProcess();
    const done = reconcilePortalModel(o.raw, 'ins', { now: T(500) });
    expect(done.instances).toBe(11);
    const rows = o.raw
      .prepare(
        `SELECT i.journey_id, i.trigger_kind, i.trigger_transition_id, i.trigger_observation_id,
           i.outcome FROM process_instances i
         WHERE i.model_version_id = ? ORDER BY i.journey_id`,
      )
      .all(done.modelVersion) as Record<string, string>[];
    const byClick = rows.filter((r) => r.trigger_kind === 'transition');
    expect(byClick.map((r) => [r.journey_id, r.trigger_transition_id, r.outcome])).toEqual([
      ['j3', 'in-j3', 'exited'], // a minor: the refusal page is not part of the process
      ['j6', 'in-j6', 'completed'],
    ]);
    // Owner answer 10: the other nine journeys opened the calculator by URL (deep links).
    const deep = rows.filter((r) => r.trigger_kind === 'deep_link');
    expect(deep).toHaveLength(9);
    expect(deep[0]).toMatchObject({ journey_id: 'j0', trigger_observation_id: 'vf0' });
    const variants = processTraceVariants(o.raw, 'ins', 'PRC-001');
    expect(variants.map((v) => [v.outcome, v.count, v.screens.length])).toEqual([
      ['completed', 6, 2],
      ['exited', 5, 1],
    ]);
    expect(variants[0]!.screens.every((k) => /^SC-\d{4}$/.test(k))).toBe(true);
    await o.close();
  });
});
