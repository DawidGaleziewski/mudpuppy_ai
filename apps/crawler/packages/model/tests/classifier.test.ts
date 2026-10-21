import { describe, expect, it } from 'vitest';
import {
  classifierSimilarity,
  clusterPartition,
  pairFeatures,
  PAIR_FEATURES,
  type PairComponents,
} from '../src/index.js';

// Spec 039 FR-050 (T090): the similarity classifier over fingerprint components.

const comp = (minhash: number[], structure: string, keys: string[]): PairComponents => ({
  minhash,
  structureHash: structure,
  elementKeys: keys,
  hashes: { content: 'c', overlay: 'o', calls: 'a', mounts: 'm' },
});

describe('pairFeatures', () => {
  it('compares every component, in PAIR_FEATURES order', () => {
    const a = comp([1, 2, 3, 4], 's1', ['k1', 'k2']);
    const b = comp([1, 2, 9, 9], 's1', ['k2', 'k3']);
    expect(PAIR_FEATURES).toEqual([
      'minhash',
      'structure',
      'content',
      'overlay',
      'calls',
      'mounts',
      'elements',
    ]);
    expect(pairFeatures(a, b)).toEqual([0.5, 1, 1, 1, 1, 1, 1 / 3]);
    expect(pairFeatures(a, { ...b, hashes: undefined })[2]).toBe(0);
  });
});

describe('classifierSimilarity and clustering', () => {
  // Same structure means one screen, whatever MinHash says.
  const byStructure = { weights: [0, 10, 0, 0, 0, 0, 0], intercept: -5 };
  const states = [
    {
      id: 'a',
      fingerprint: 'fa',
      routeKey: '/q',
      minhash: [1, 1, 1, 1],
      components: comp([1, 1, 1, 1], 's1', []),
    },
    {
      id: 'b',
      fingerprint: 'fb',
      routeKey: '/q',
      minhash: [2, 2, 2, 2],
      components: comp([2, 2, 2, 2], 's1', []),
    },
    {
      id: 'c',
      fingerprint: 'fc',
      routeKey: '/q',
      minhash: [1, 1, 1, 1],
      components: comp([1, 1, 1, 1], 's2', []),
    },
  ];
  const none = { mustLink: [], cannotLink: [] };

  it('scores a pair as the probability of one screen', () => {
    expect(
      classifierSimilarity(byStructure, states[0]!.components, states[1]!.components),
    ).toBeCloseTo(0.9933, 3);
    expect(
      classifierSimilarity(byStructure, states[0]!.components, states[2]!.components),
    ).toBeCloseTo(0.0067, 3);
  });

  it('clusters by the classifier instead of τ when one is given', () => {
    // τ on MinHash: a and c are copies, b apart.
    expect(clusterPartition(states, none, 0.9).clusters).toEqual([['a', 'c'], ['b']]);
    // The classifier: a and b share the structure.
    expect(clusterPartition(states, none, 0.9, byStructure).clusters).toEqual([['a', 'b'], ['c']]);
  });
});
