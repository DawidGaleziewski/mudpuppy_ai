import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LabelledPair,
  mergePairs,
  readLabels,
  splitOf,
  writeLabels,
} from '../graders/human/labels.js';
import type { Pair } from '../graders/model/definition.js';

const pair = (n: number): Pair => ({
  id: `T${n}~GL-${n}@1`,
  itemId: `T${n}`,
  item: `Term ${n}`,
  record: {
    key: `GL-${n}`,
    rev: 1,
    kind: 'glossary_term',
    text: `term_verbatim: Term ${n}\nconfidence: observed`,
  },
});
const tmp = () => join(mkdtempSync(join(tmpdir(), 'labels-')), 'glossary-terms.yaml');

describe('mergePairs', () => {
  it('appends new pairs unlabelled with a split, and keeps existing ones untouched', () => {
    const first = mergePairs({ judge: 'glossary-terms', pairs: [] }, [pair(1), pair(2)], 's#p');
    expect(first.added).toBe(2);
    const labelled = {
      ...first.file,
      pairs: first.file.pairs.map((p, i) =>
        i === 0 ? { ...p, label: 'pass' as const, why: 'Same term.', split: 'test' as const } : p,
      ),
    };
    const again = mergePairs(labelled, [pair(1), pair(2), pair(3)], 'other#p');
    expect(again).toMatchObject({ added: 1, kept: 2 });
    expect(again.file.pairs[0]).toMatchObject({
      label: 'pass',
      why: 'Same term.',
      split: 'test',
      source: 's#p',
    });
    expect(again.file.pairs[2]).toMatchObject({
      id: 'T3~GL-3@1',
      label: null,
      why: null,
      source: 'other#p',
    });
  });
});

describe('splitOf', () => {
  it('is stable and roughly half dev, half test', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `T${i}~GL-${i}@1`);
    expect(ids.map(splitOf)).toEqual(ids.map(splitOf));
    const dev = ids.filter((id) => splitOf(id) === 'dev').length;
    expect(dev).toBeGreaterThanOrEqual(12);
    expect(dev).toBeLessThanOrEqual(28);
  });
});

describe('label file', () => {
  it('round-trips through YAML with blank labels and a header comment', () => {
    const path = tmp();
    const { file } = mergePairs({ judge: 'glossary-terms', pairs: [] }, [pair(1)], 's#p');
    writeLabels(path, file);
    const text = readFileSync(path, 'utf8');
    expect(text.startsWith('# Labels for judge glossary-terms')).toBe(true);
    expect(text).toMatch(/label: *\n/);
    expect(readLabels(path, 'glossary-terms')).toEqual(file);
  });

  it('reads a missing file as empty', () => {
    expect(readLabels(tmp(), 'glossary-terms')).toEqual({ judge: 'glossary-terms', pairs: [] });
  });

  it('refuses a labelled pair without why, a duplicate id and another judge', () => {
    const p = { ...mergePairs({ judge: 'j', pairs: [] }, [pair(1)], 's').file.pairs[0]! };
    expect(LabelledPair.safeParse({ ...p, label: 'fail', why: ' ' }).success).toBe(false);
    const path = tmp();
    writeFileSync(path, JSON.stringify({ judge: 'glossary-terms', pairs: [p, p] }));
    expect(() => readLabels(path, 'glossary-terms')).toThrow(/twice/);
    expect(() => readLabels(path, 'rules')).toThrow(/for judge glossary-terms/);
  });
});
