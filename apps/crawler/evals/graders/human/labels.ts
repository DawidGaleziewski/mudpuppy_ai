/**
 * A judge's label file (spec 017 data-model, research R8): the owner's pass/fail and one-sentence
 * reason per (item, record) pair: the human grader that calibrates a model-based one. YAML, since
 * people edit it by hand (as G-34 for ground truth). One file per judge, committed, next to this
 * module as the create-eval skill keeps human labels: `graders/human/labels/<judge-id>.yaml`.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { z } from 'zod';
import type { Pair } from '../model/definition.js';

export const LabelledPair = z
  .object({
    id: z.string().min(1),
    split: z.enum(['dev', 'test']),
    /** `<store path>#<portal>`, or `hand-made` for a pair the owner wrote. */
    source: z.string().min(1),
    item: z.string().min(1),
    record: z.object({ key: z.string().min(1), rev: z.number().int(), text: z.string().min(1) }),
    label: z.enum(['pass', 'fail']).nullable(),
    why: z.string().nullable(),
  })
  .refine((p) => p.label === null || (p.why ?? '').trim() !== '', {
    message: 'a labelled pair needs a one-sentence why',
  });
export type LabelledPair = z.infer<typeof LabelledPair>;

export const LabelFile = z.object({
  judge: z.string().min(1),
  pairs: z.array(LabelledPair),
});
export type LabelFile = z.infer<typeof LabelFile>;

/** dev or test, fixed per pair by its id: stable across re-draws, and cannot be tuned by hand by accident. */
export function splitOf(id: string): 'dev' | 'test' {
  return createHash('sha256').update(id).digest()[0]! % 2 === 0 ? 'dev' : 'test';
}

export function readLabels(path: string, judge: string): LabelFile {
  if (!existsSync(path)) return { judge, pairs: [] };
  const file = LabelFile.parse(parse(readFileSync(path, 'utf8')));
  if (file.judge !== judge) throw new Error(`${path} is for judge ${file.judge}, not ${judge}`);
  const ids = file.pairs.map((p) => p.id);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) throw new Error(`${path}: pair ${dup} appears twice`);
  return file;
}

const HEADER = (judge: string) =>
  [
    `# Labels for judge ${judge} (spec 017). For each pair, set label to pass or fail and write one`,
    '# sentence in why. Add pairs real output lacks with source: hand-made (any unique id).',
    '# Never label from the judge: these labels are what the judge is measured against.',
  ].join('\n');

export function writeLabels(path: string, file: LabelFile): void {
  const body = stringify(LabelFile.parse(file), { lineWidth: 0, nullStr: '' });
  writeFileSync(path, `${HEADER(file.judge)}\n${body}`);
}

/** Appends pairs not in the file yet; existing entries (and the owner's labels) stay as they are. */
export function mergePairs(
  file: LabelFile,
  pairs: readonly Pair[],
  source: string,
): { file: LabelFile; added: number; kept: number } {
  const known = new Set(file.pairs.map((p) => p.id));
  const fresh = pairs.filter((p) => !known.has(p.id));
  const added: LabelledPair[] = fresh.map((p) => ({
    id: p.id,
    split: splitOf(p.id),
    source,
    item: p.item,
    record: { key: p.record.key, rev: p.record.rev, text: p.record.text },
    label: null,
    why: null,
  }));
  return {
    file: { ...file, pairs: [...file.pairs, ...added] },
    added: added.length,
    kept: pairs.length - fresh.length,
  };
}

/** `apps/crawler/evals/graders/human/labels/<judge>.yaml`. */
export const labelPath = (judge: string) => join(import.meta.dirname, 'labels', `${judge}.yaml`);
