import { describe, expect, it } from 'vitest';
import { comparePartitions } from '../src/index.js';

describe('comparePartitions (spec 039 T113)', () => {
  it('names the screens one profile merges and the other splits', () => {
    const a = [['s1'], ['s2'], ['s3', 's4'], ['s5']];
    const b = [['s5'], ['s1', 's2'], ['s3'], ['s4']];
    expect(comparePartitions(a, b)).toEqual({
      merged: [[['s1'], ['s2']]],
      split: [[['s3'], ['s4']]],
      same: 1,
    });
  });

  it('is empty for the same clustering in another order', () => {
    const a = [['b', 'a'], ['c']];
    expect(comparePartitions(a, [['c'], ['a', 'b']])).toEqual({ merged: [], split: [], same: 2 });
  });
});
