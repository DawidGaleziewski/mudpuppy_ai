import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { captureInvariants, migrateUp, openDb } from '../src/index.js';
import { seedThreshold } from './seed-threshold.js';

// Spec 039 T023: the M1 capture rules. The threshold seed is written by hand, without builds and
// with each journey's only transition at seq 2, so it breaks two of them.

const MIGRATIONS = join(import.meta.dirname, '../../../../../data/migrations');

describe('captureInvariants', () => {
  it('names the observations without a build and the journeys with a gap', async () => {
    const o = openDb(':memory:');
    migrateUp(o.raw, MIGRATIONS);
    seedThreshold(o);
    const v = captureInvariants(o.raw, 'ins');
    expect(v.observationsWithoutBuild).toHaveLength(22);
    expect(v.journeysWithGaps).toHaveLength(11);
    expect(v.transitionsWithoutJourney).toEqual([]);
    expect(v.fillsWithoutWrite).toEqual([]);
    expect(v.traceStepsWithoutTransition).toEqual([]);
    expect(captureInvariants(o.raw, 'other')).toEqual({
      observationsWithoutBuild: [],
      transitionsWithoutJourney: [],
      journeysWithGaps: [],
      fillsWithoutWrite: [],
      traceStepsWithoutTransition: [],
    });
    await o.close();
  });
});
