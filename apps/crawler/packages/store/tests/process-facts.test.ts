import { describe, expect, it } from 'vitest';
import { processModelFacts, reconcilePortalModel, recordExploration } from '../src/index.js';
import { seedProcess } from './seed-process.js';
import { addRule, replayAll, T } from './seed-threshold.js';

// Spec 039 T078: what the model knows of a process, as its export states it.

describe('processModelFacts', () => {
  it('names the ways in, the outcomes, the explored bound and the rules on its screens', async () => {
    const o = seedProcess();
    reconcilePortalModel(o.raw, 'ins', { now: T(500) });
    addRule(o, 18);
    let f = processModelFacts(o.raw, 'ins', 'prc');
    expect(f.modelVersion).toBe(1);
    expect(f.triggers).toEqual([
      { screen: expect.stringMatching(/^SC-\d{4}$/), element: 'link|Oblicz', count: 2 },
    ]);
    expect(f.outcomes).toEqual({ completed: 1, exited: 1 });
    expect(f.variants.map((v) => v.outcome)).toEqual(['exited', 'completed']);
    expect(f.explored).toBeNull();
    expect(f.rules).toEqual([]); // proposed: not exported yet

    replayAll(o); // the boundary tests pass: supported
    recordExploration(o.raw, 'prc', { epochs: [], depth: 2, randomWalks: 3, newDeviations: 0 });
    f = processModelFacts(o.raw, 'ins', 'prc');
    expect(f.explored).toBe('Explored to depth 2 plus 3 random walks; no counterexamples.');
    expect(f.rules.map((r) => [r.key, r.status])).toEqual([['H-0001', 'supported']]);
    expect(f.rules[0]!.dmn).toContain('hitPolicy="UNIQUE"');
    await o.close();
  });
});
