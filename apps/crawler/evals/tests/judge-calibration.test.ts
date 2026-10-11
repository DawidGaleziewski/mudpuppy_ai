import { describe, expect, it } from 'vitest';
import type { LabelledPair } from '../graders/human/labels.js';
import { agreement, majority, meetsBar } from '../graders/model/calibration.js';
import type { Verdict, VerdictKind } from '../graders/model/score.js';

const labelled = (
  id: string,
  label: 'pass' | 'fail' | null,
  why: string | null = 'because',
): LabelledPair => ({
  id,
  split: 'dev',
  source: 'hand-made',
  item: id,
  record: { key: id, rev: 1, text: id },
  label,
  why: label === null ? null : why,
});
const runOf = (verdicts: Record<string, VerdictKind>): Verdict[] =>
  Object.entries(verdicts).map(([pairId, verdict]) => ({ pairId, verdict, reason: `r-${pairId}` }));

describe('majority', () => {
  it('needs more than half pass; unknown and error are fail', () => {
    expect(majority(['pass', 'pass', 'fail'])).toBe('pass');
    expect(majority(['pass', 'unknown', 'error'])).toBe('fail');
    expect(majority(['pass', 'pass', 'unknown'])).toBe('pass');
  });
});

describe('agreement', () => {
  const pairs = [
    labelled('a', 'pass'),
    labelled('b', 'pass'),
    labelled('c', 'fail'),
    labelled('d', 'fail'),
  ];

  it('a judge that passes everything has TPR 1 and TNR 0', () => {
    const all = runOf({ a: 'pass', b: 'pass', c: 'pass', d: 'pass' });
    const a = agreement(pairs, [all, all, all]);
    expect(a).toMatchObject({
      table: { tp: 2, fn: 0, fp: 2, tn: 0 },
      tpr: 1,
      tnr: 0,
      flip_rate: 0,
    });
    expect(a.disagreements.map((d) => d.pair_id)).toEqual(['c', 'd']);
    expect(meetsBar(a)).toBe(false);
  });

  it('counts flips and keeps every run reason of a disagreement', () => {
    const a = agreement(pairs, [
      runOf({ a: 'pass', b: 'fail', c: 'fail', d: 'fail' }),
      runOf({ a: 'pass', b: 'pass', c: 'fail', d: 'fail' }),
      runOf({ a: 'pass', b: 'fail', c: 'fail', d: 'unknown' }),
    ]);
    expect(a).toMatchObject({ table: { tp: 1, fn: 1, fp: 0, tn: 2 }, tpr: 0.5, tnr: 1 });
    expect(a.flip_rate).toBe(0.5);
    expect(a.disagreements).toEqual([
      {
        pair_id: 'b',
        label: 'pass',
        why: 'because',
        majority: 'fail',
        reasons: ['fail: r-b', 'pass: r-b', 'fail: r-b'],
      },
    ]);
  });

  it('skips unlabelled pairs, treats a missing verdict as error, and gives null rates on empty sides', () => {
    const a = agreement(
      [labelled('a', 'pass'), labelled('z', null)],
      [runOf({}), runOf({ a: 'pass' }), runOf({ a: 'pass' })],
    );
    expect(a).toMatchObject({ skipped: ['z'], tpr: 1, tnr: null, flip_rate: 1 });
    expect(meetsBar(a)).toBe(false);
  });

  it('meets the bar at 0.9 on both sides', () => {
    expect(meetsBar({ tpr: 0.9, tnr: 0.95 })).toBe(true);
    expect(meetsBar({ tpr: 0.89, tnr: 1 })).toBe(false);
  });
});
