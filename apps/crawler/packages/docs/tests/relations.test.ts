import { describe, expect, it } from 'vitest';
import { DocKind, RelationType } from '@pathfinder/core';
import { RELATION_RULES, isAllowed } from '../src/relations.js';

const ALLOWED: [DocKind, RelationType, DocKind][] = [
  ['capability', 'contains', 'process'],
  ['capability', 'contains', 'screen'],
  ['use_case', 'describes', 'process'],
  ['requirement', 'refines', 'use_case'],
  ['requirement', 'refines', 'capability'],
  ['requirement', 'enforces', 'business_rule'],
  ['data_item', 'appears_on', 'screen'],
  ['glossary_term', 'synonym_of', 'glossary_term'],
  ['assumption', 'answers', 'open_question'],
  ['requirement', 'answers', 'open_question'],
  ['business_rule', 'answers', 'open_question'],
];

describe('relation table', () => {
  it('covers every relation type', () => {
    expect(Object.keys(RELATION_RULES).sort()).toEqual([...RelationType.options].sort());
  });

  it('allows the listed triples', () => {
    for (const [from, type, to] of ALLOWED) expect(isAllowed(from, type, to)).toEqual({ ok: true });
  });

  it('lets any kind use a glossary term', () => {
    for (const kind of DocKind.options)
      expect(isAllowed(kind, 'uses_term', 'glossary_term').ok).toBe(true);
    expect(isAllowed('requirement', 'uses_term', 'screen').ok).toBe(false);
  });

  it('allows depends_on only between two records of the same kind', () => {
    for (const kind of DocKind.options) expect(isAllowed(kind, 'depends_on', kind).ok).toBe(true);
    expect(isAllowed('process', 'depends_on', 'screen').ok).toBe(false);
  });

  it('allows nothing outside the table', () => {
    const allowed = new Set(ALLOWED.map((t) => t.join(' ')));
    for (const type of RelationType.options) {
      if (type === 'uses_term' || type === 'depends_on') continue;
      for (const from of DocKind.options)
        for (const to of DocKind.options)
          expect(isAllowed(from, type, to).ok, `${from} ${type} ${to}`).toBe(
            allowed.has(`${from} ${type} ${to}`),
          );
    }
  });

  it('explains a refusal with RELATION_NOT_ALLOWED details', () => {
    const r = isAllowed('screen', 'contains', 'capability');
    expect(r).toMatchObject({
      ok: false,
      code: 'RELATION_NOT_ALLOWED',
      details: {
        from_kind: 'screen',
        type: 'contains',
        to_kind: 'capability',
        allowed: ['capability contains process|screen'],
      },
    });
  });
});
