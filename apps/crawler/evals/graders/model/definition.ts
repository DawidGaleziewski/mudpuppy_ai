/**
 * What a judge is (spec 017, contracts/judge-definition.md): one narrow yes/no question about one
 * (ground-truth item, record) pair, plus the code that picks those pairs. The owner writes one
 * `JudgeDefinition` per judge; the runner, results and calibration never change for a new one.
 */
import { createHash } from 'node:crypto';
import type { EvalRecord, GroundTruth } from '@mudpuppy/docs';

/** A labelled example shown to the judge; taken from the owner's `dev` labels, never `test`. */
export interface JudgeExample {
  item: string;
  record: string;
  verdict: 'pass' | 'fail';
  reason: string;
}

/** One question to the judge: a ground-truth item and one candidate record. */
export interface Pair {
  /** `<item id>~<record key>@<rev>`: stable, so re-drawing labels never duplicates a pair. */
  id: string;
  itemId: string;
  /** The ground-truth text the judge reads. */
  item: string;
  record: { key: string; rev: number; kind: string; text: string };
}

export interface SelectContext {
  groundTruth: GroundTruth;
  records: readonly EvalRecord[];
}

export interface JudgeDefinition {
  /** kebab-case; names the label file and the reports folder. */
  id: string;
  /** The ground-truth category it judges (`terms`, `rules`, ...). */
  category: keyof GroundTruth;
  question: string;
  pass: string;
  /** Includes "not clearly stated": the defence against a lenient judge (FR-004). */
  fail: string;
  examples: readonly JudgeExample[];
  model: string;
  /** Pure and deterministic: what the judge sees, in a stable order. */
  selectPairs: (ctx: SelectContext) => Pair[];
}

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const MAX_EXAMPLES = 5;

/** Checks a definition once, where it is declared, so a broken judge fails at import. */
export function defineJudge(
  def: Omit<JudgeDefinition, 'model'> & { model?: string },
): JudgeDefinition {
  if (!ID.test(def.id)) throw new Error(`judge id "${def.id}" is not kebab-case`);
  if (def.examples.length > MAX_EXAMPLES)
    throw new Error(`judge ${def.id} has ${def.examples.length} examples, at most ${MAX_EXAMPLES}`);
  for (const [name, text] of [
    ['question', def.question],
    ['pass', def.pass],
    ['fail', def.fail],
  ] as const)
    if (text.trim() === '') throw new Error(`judge ${def.id} has an empty ${name}`);
  return { ...def, model: def.model ?? 'sonnet' };
}

/**
 * The wording version: changes whenever what the model is told changes, so a reworded judge is
 * uncalibrated until it has a new `test` report (FR-011). `selectPairs` is code, not wording.
 */
export function judgeVersion(def: JudgeDefinition): string {
  const wording = JSON.stringify([def.question, def.pass, def.fail, def.examples, def.model]);
  return createHash('sha256').update(wording).digest('hex').slice(0, 12);
}

export const pairId = (itemId: string, key: string, rev: number): string =>
  `${itemId}~${key}@${rev}`;
