import { describe, expect, it } from 'vitest';
import { MODEL_DEFAULTS } from '../src/index.js';

describe('model defaults (spec 039 design § 6–14)', () => {
  it('start τ at 0.9 and calibrate after 30 labels of each side', () => {
    expect(MODEL_DEFAULTS.tau).toBe(0.9);
    expect(MODEL_DEFAULTS.labelsToCalibrate).toBe(30);
  });

  it('keep the τ sweep inside the similarity range', () => {
    const { from, to, step } = MODEL_DEFAULTS.tauSweep;
    expect(from).toBeGreaterThan(0);
    expect(to).toBeLessThan(1);
    expect(Math.round((to - from) / step)).toBe(49);
  });

  it('band LSH signatures into the 128-value MinHash', () => {
    const { bands, rows } = MODEL_DEFAULTS.lsh;
    expect(bands * rows).toBe(128);
  });
});
