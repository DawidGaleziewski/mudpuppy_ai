import { describe, expect, it } from 'vitest';
import { calibrateTau, labellingQueue, type LabelledPair } from '../src/index.js';

const labels = (sims: number[], same: boolean): LabelledPair[] =>
  sims.map((similarity) => ({ similarity, same }));

describe('τ calibration (spec 039 design § 6.1, T037)', () => {
  it('waits until both sides have enough labels', () => {
    const c = calibrateTau([...labels([0.95, 0.97], true), ...labels([0.5], false)], {
      labelsToCalibrate: 3,
    });
    expect(c).toEqual({ tau: null, f1: null, same: 2, distinct: 1, needed: 3 });
  });

  it('picks the threshold that separates the labels, the higher one on a tie', () => {
    const same = labels([0.97, 0.95, 0.93, 0.92], true);
    const distinct = labels([0.86, 0.84, 0.7, 0.6], false);
    const c = calibrateTau([...same, ...distinct], { labelsToCalibrate: 4 });
    // Every τ in (0.86, 0.92] separates them perfectly: the highest, 0.92, merges least.
    expect(c.tau).toBe(0.92);
    expect(c.f1).toBe(1);
  });

  it('with overlapping labels takes the best F1 for "same screen"', () => {
    const same = labels([0.95, 0.94, 0.8], true);
    const distinct = labels([0.85, 0.6, 0.5], false);
    const c = calibrateTau([...same, ...distinct], { labelsToCalibrate: 3 });
    // τ 0.86–0.95 keeps two of three same pairs (F1 0.8); τ ≤ 0.8 keeps all three with one false merge (0.857).
    expect(c.tau).toBe(0.8);
    expect(c.f1).toBeCloseTo(0.857, 3);
  });

  it('queues the unlabelled pairs nearest τ first, within the window', () => {
    const q = labellingQueue(
      [
        { a: 'a', b: 'b', similarity: 0.99 },
        { a: 'a', b: 'c', similarity: 0.91 },
        { a: 'b', b: 'c', similarity: 0.88 },
        { a: 'c', b: 'd', similarity: 0.7 },
      ],
      0.9,
    );
    expect(q.map((p) => `${p.a}${p.b}`)).toEqual(['ac', 'bc']);
  });
});
