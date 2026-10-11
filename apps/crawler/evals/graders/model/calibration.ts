/**
 * How far a judge agrees with the owner's labels (spec 017 FR-010, research R9, learning/05): each
 * labelled pair judged several times, the majority compared with the label. Two rates, not one
 * accuracy: a judge that passes everything has TPR 1 and TNR 0. Pure.
 */
import type { LabelledPair } from '../human/labels.js';
import type { Verdict, VerdictKind } from './score.js';

export const BAR = 0.9;

export interface Disagreement {
  pair_id: string;
  label: 'pass' | 'fail';
  why: string;
  majority: 'pass' | 'fail';
  /** Every run's verdict and reason, in run order. */
  reasons: string[];
}

export interface Agreement {
  table: { tp: number; fn: number; fp: number; tn: number };
  /** null when there was nothing to measure (no pass labels, or no fail labels). */
  tpr: number | null;
  tnr: number | null;
  flip_rate: number;
  skipped: string[];
  disagreements: Disagreement[];
}

/** `unknown` and `error` count as fail: only a clear pass covers (as in the trial score). */
export function majority(verdicts: readonly VerdictKind[]): 'pass' | 'fail' {
  const passes = verdicts.filter((v) => v === 'pass').length;
  return passes * 2 > verdicts.length ? 'pass' : 'fail';
}

const rate = (hit: number, miss: number): number | null =>
  hit + miss === 0 ? null : Math.round((hit / (hit + miss)) * 1000) / 1000;

/** `runs[i]` holds run i's verdicts; a pair missing from a run counts as an error there. */
export function agreement(
  labelled: readonly LabelledPair[],
  runs: readonly (readonly Verdict[])[],
): Agreement {
  const table = { tp: 0, fn: 0, fp: 0, tn: 0 };
  const disagreements: Disagreement[] = [];
  const skipped: string[] = [];
  let flips = 0;
  let judged = 0;
  for (const p of labelled) {
    if (p.label === null || !p.why) {
      skipped.push(p.id);
      continue;
    }
    const missing: Verdict = { pairId: p.id, verdict: 'error', reason: 'missing' };
    const mine = runs.map((run) => run.find((v) => v.pairId === p.id) ?? missing);
    const kinds = mine.map((v) => v.verdict);
    const said = majority(kinds);
    judged += 1;
    if (new Set(kinds).size > 1) flips += 1;
    if (p.label === 'pass') table[said === 'pass' ? 'tp' : 'fn'] += 1;
    else table[said === 'fail' ? 'tn' : 'fp'] += 1;
    if (said !== p.label)
      disagreements.push({
        pair_id: p.id,
        label: p.label,
        why: p.why,
        majority: said,
        reasons: mine.map((v) => `${v.verdict}: ${v.reason}`),
      });
  }
  return {
    table,
    tpr: rate(table.tp, table.fn),
    tnr: rate(table.tn, table.fp),
    flip_rate: judged === 0 ? 0 : Math.round((flips / judged) * 1000) / 1000,
    skipped,
    disagreements,
  };
}

export const meetsBar = (a: Pick<Agreement, 'tpr' | 'tnr'>): boolean =>
  a.tpr !== null && a.tnr !== null && a.tpr >= BAR && a.tnr >= BAR;
