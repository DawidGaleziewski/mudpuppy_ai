import { describe, expect, it } from 'vitest';
import {
  acceptClassifier,
  activeClassifier,
  activeProfile,
  classifierTrainingSet,
  reconcilePortalModel,
  recordClassifier,
} from '../src/index.js';
import { T, withRule } from './seed-threshold.js';

// Spec 039 FR-050 (T090): training sets from the pair labels, and the classifier in force.

const trained = (better: boolean) => ({
  ok: true,
  names: ['minhash', 'structure', 'content', 'overlay', 'calls', 'mounts', 'elements'],
  weights: [1, 2, 0, 0, 0, 0, 0.5],
  intercept: -1.5,
  labels: 40,
  held_out: 8,
  f1: better ? 0.95 : 0.7,
  tau_f1: 0.8,
  better,
});

describe('similarity classifier (T090)', () => {
  it('builds the labelled pairs with their features, and uses a classifier only once it beat τ', async () => {
    const o = withRule(18);
    const r = o.raw;
    const PROFILE = activeProfile(r, 'ins');
    const label = (a: string, b: string, l: string) =>
      r
        .prepare(
          `INSERT INTO state_pair_labels (portal_id, state_a, state_b, label, labelled_by, labelled_at)
           VALUES ('ins', ?, ?, ?, 'Anna', ?)`,
        )
        .run(a, b, l, T(700));
    label('exit', 'price', 'distinct');
    label('form', 'price', 'distinct');
    const set = classifierTrainingSet(r, 'ins', PROFILE);
    expect(set.pairs.map((p) => [p.id, p.same, p.features.length])).toEqual([
      ['exit|price', false, 7],
      ['form|price', false, 7],
    ]);
    expect(set.similarity_index).toBe(0);

    expect(activeClassifier(r, 'ins', PROFILE)).toBeUndefined();
    recordClassifier(r, 'ins', {
      profile: PROFILE,
      trained: trained(true),
      tau: set.tau,
      now: T(800),
    });
    // Owner answer 14: a classifier that beat τ still waits for a person.
    expect(activeClassifier(r, 'ins', PROFILE)).toBeUndefined();
    expect(acceptClassifier(r, 'ins', { by: 'Anna', now: T(805) })).toMatchObject({
      f1: 0.95,
      tauF1: 0.8,
    });
    expect(activeClassifier(r, 'ins', PROFILE)).toEqual({
      weights: [1, 2, 0, 0, 0, 0, 0.5],
      intercept: -1.5,
    });
    // The acceptance moves the decision watermark: the next reconcile writes a version with it.
    expect(reconcilePortalModel(r, 'ins', { now: T(810) }).modelVersion).not.toBeNull();
    // A newer training that does not beat τ cannot be accepted; the accepted one stays.
    recordClassifier(r, 'ins', {
      profile: PROFILE,
      trained: trained(false),
      tau: set.tau,
      now: T(900),
    });
    expect(() => acceptClassifier(r, 'ins', { by: 'Anna' })).toThrow(/does not beat τ/);
    expect(activeClassifier(r, 'ins', PROFILE)?.intercept).toBe(-1.5);
    expect(() =>
      recordClassifier(r, 'ins', {
        profile: PROFILE,
        trained: { ...trained(true), names: ['minhash'] },
        tau: set.tau,
      }),
    ).toThrow(/not this version's/);
    await o.close();
  });
});
