import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DocKind, EvidenceTargetKind, RelationType } from '@mudpuppy/docs-model';
import { NOT_OBSERVABLE_KINDS, OBSERVABLE_KINDS } from '../src/observed-rule.js';
import { describeRecordKinds, describeRelations } from '../src/record-kinds-text.js';
import { RELATION_RULES, isAllowed } from '../src/relations.js';

/**
 * Spec 019 lessons (F-07, F-12, F-14): the BA's write contract lives in several places — the Zod
 * enums, `RELATION_RULES`, the store's triggers (`relation-triples.test.ts`), the generated tool
 * description and the `ba-practice` reference. Each mismatch cost refused writes or lost links in
 * the evals. These tests make every place agree, so it cannot happen again silently.
 */

const REFERENCE = readFileSync(
  new URL('../../../../../.claude/skills/ba-practice/references/record-kinds.md', import.meta.url),
  'utf8',
);
const relationSection = REFERENCE.slice(
  REFERENCE.indexOf('## Relations'),
  REFERENCE.indexOf('\n## ', REFERENCE.indexOf('## Relations') + 1),
);

/** The intents behind the 23 relations the server refused in the spec 019 evals (F-12). */
const TRIED_IN_EVALS: [DocKind, RelationType, DocKind][] = [
  ['business_rule', 'applies_on', 'screen'],
  ['open_question', 'asks_about', 'business_rule'],
  ['followup', 'follows_up', 'process'],
  ['followup', 'follows_up', 'capability'],
  // the trial after the new types (F-16)
  ['followup', 'follows_up', 'open_question'],
  ['followup', 'follows_up', 'use_case'],
];

describe('relation contract (spec 019 F-12/F-14)', () => {
  it('every relation type has rules, and every rule names known kinds', () => {
    for (const type of RelationType.options) {
      expect(RELATION_RULES[type].length, type).toBeGreaterThan(0);
      for (const r of RELATION_RULES[type]) {
        if (r.from !== 'any') for (const k of r.from) expect(DocKind.options).toContain(k);
        if (r.to !== 'same') for (const k of r.to) expect(DocKind.options).toContain(k);
      }
    }
  });

  it('what the BA meant in the evals can now be said', () => {
    for (const [from, type, to] of TRIED_IN_EVALS)
      expect(isAllowed(from, type, to).ok, `${from} ${type} ${to}`).toBe(true);
  });

  it('the new types stay narrow: no type lets any kind point at any kind', () => {
    for (const type of RelationType.options) {
      const pairs = DocKind.options.flatMap((f) =>
        DocKind.options.map((t) => isAllowed(f, type, t).ok),
      );
      expect(pairs.every(Boolean), `${type} allows every pair`).toBe(false);
    }
  });

  it('the tool description names every relation type and every allowed phrase', () => {
    const text = describeRecordKinds();
    for (const type of RelationType.options) expect(text).toContain(` ${type} `);
    for (const phrase of describeRelations()) expect(text).toContain(phrase);
  });

  it('the ba-practice reference lists every relation type, and only allowed pairs', () => {
    for (const type of RelationType.options) expect(relationSection, type).toContain(` ${type} `);
    // lines of the form: - `a` | `b` type `c` | `d` (the "any kind" lines are covered above)
    let checked = 0;
    for (const line of relationSection.split('\n')) {
      const m = /^- ((?:`\w+`(?: \| )?)+) (\w+) ((?:`\w+`(?: \| )?)+)/.exec(line);
      if (!m) continue;
      checked += 1;
      const kinds = (s: string) => [...s.matchAll(/`(\w+)`/g)].map((x) => x[1] as DocKind);
      for (const from of kinds(m[1]!))
        for (const to of kinds(m[3]!))
          expect(isAllowed(from, m[2] as RelationType, to).ok, line).toBe(true);
    }
    expect(checked).toBeGreaterThanOrEqual(9);
  });
});

describe('evidence kinds are classified (spec 019 F-07)', () => {
  it('every evidence kind is observable or not, never both, never neither', () => {
    const both = OBSERVABLE_KINDS.filter((k) => NOT_OBSERVABLE_KINDS.includes(k));
    expect(both).toEqual([]);
    expect([...OBSERVABLE_KINDS, ...NOT_OBSERVABLE_KINDS].sort()).toEqual(
      [...EvidenceTargetKind.options].sort(),
    );
  });
});
