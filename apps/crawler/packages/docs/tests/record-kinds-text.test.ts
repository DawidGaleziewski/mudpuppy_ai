import { describe, expect, it } from 'vitest';
import { DOC_CONTENT_BY_KIND, DocKind } from '@mudpuppy/docs-model';
import {
  describeRecordKind,
  describeRecordKinds,
  describeRelations,
} from '../src/record-kinds-text.js';

describe('describeRecordKinds (spec 019 US4, spec 015 F-20)', () => {
  it('names every kind, generated from the schemas', () => {
    const text = describeRecordKinds();
    for (const kind of DocKind.options) expect(text).toContain(`\n${kind}: `);
  });

  it('shows the shapes the BA got wrong in the bank eval', () => {
    expect(describeRecordKind('screen')).toBe(
      'screen: title, summary?, purpose, route_templates[string], elements[{role, label_verbatim}], entry_points[string]',
    );
    expect(describeRecordKind('use_case')).toContain(
      'main_flow[{n:number, actor_or_system, text}]',
    );
    expect(describeRecordKind('data_item')).toContain('seen_in[{kind:');
    expect(describeRecordKind('business_rule')).toContain(
      'rule_type:constraint|computation|inference|action_enabler',
    );
  });

  it('every required field of every kind appears in its line', () => {
    for (const kind of DocKind.options) {
      const line = describeRecordKind(kind);
      const shape = DOC_CONTENT_BY_KIND[kind].shape as Record<string, { isOptional(): boolean }>;
      for (const [name, s] of Object.entries(shape))
        if (name !== 'kind' && !s.isOptional())
          expect(line).toMatch(new RegExp(`\\b${name}\\b(?!\\?)`));
    }
  });

  it('lists the relations a kind may assert, and only those', () => {
    expect(describeRelations('capability')).toEqual([
      'capability contains process|screen',
      'capability uses_term glossary_term',
      'capability depends_on capability',
    ]);
    expect(describeRelations('data_item')).toContain('data_item appears_on screen');
    expect(describeRelations().length).toBeGreaterThan(8);
  });
});
