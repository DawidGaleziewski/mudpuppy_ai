import { describe, expect, it } from 'vitest';
import { stepsInOrder } from '../graders/code/process-trace.js';

const steps = ['/', '/wiki/Pickle', '/wiki/Pickled_cucumber'];

describe('stepsInOrder', () => {
  it('counts every step reached in order, with other pages in between', () => {
    expect(
      stepsInOrder(steps, ['/', '/wiki/Special:Search', '/wiki/Pickle', '/wiki/Pickled_cucumber']),
    ).toEqual({
      matched: 3,
      total: 3,
      pct: 100,
      missing: [],
    });
  });

  it('stops counting where the trace stopped', () => {
    expect(stepsInOrder(steps, ['/'])).toEqual({
      matched: 1,
      total: 3,
      pct: 33.3,
      missing: ['/wiki/Pickle', '/wiki/Pickled_cucumber'],
    });
  });

  it('does not count a step reached out of order', () => {
    const r = stepsInOrder(steps, ['/', '/wiki/Pickled_cucumber', '/wiki/Pickle']);
    expect(r.matched).toBe(2);
    expect(r.missing).toEqual(['/wiki/Pickled_cucumber']);
  });

  it('ignores the query of a recorded route', () => {
    expect(stepsInOrder(['/wiki/Pickle'], ['/wiki/Pickle?redirect=no']).matched).toBe(1);
  });

  it('scores 0, not 100, when the ground truth has no steps', () => {
    expect(stepsInOrder([], ['/']).pct).toBe(0);
  });
});
