import { expect, it } from 'vitest';
import {
  citingRoute,
  ofKind,
  recordText,
  screenRoute,
  toPair,
} from '../graders/model/selectors.js';
import { GT, record, RECORDS } from './fixtures/judge/records.js';

it('ofKind and citingRoute pick records', () => {
  expect(ofKind(RECORDS, 'business_rule').map((r) => r.key)).toEqual(['BR-001']);
  const rule = RECORDS[4]!;
  expect(citingRoute(rule, '/kalkulator/kierowca')).toBe(true);
  expect(citingRoute(rule, '/')).toBe(false);
});

it('screenRoute finds a ground-truth screen route', () => {
  expect(screenRoute(GT, 'S09')).toBe('/kalkulator/kierowca');
  expect(screenRoute(GT, 'S99')).toBeUndefined();
});

it('recordText lists content without kind, skips empties, adds the confidence', () => {
  const r = record('GL-9', 'glossary_term', {
    term_verbatim: 'Autocasco',
    synonyms_verbatim: ['AC', 'Auto casco'],
    empty: '',
    none: [],
    table: { a: 1 },
  });
  expect(recordText({ ...r, not_observable: true })).toBe(
    [
      'term_verbatim: Autocasco',
      'synonyms_verbatim: AC, Auto casco',
      'table: {"a":1}',
      'confidence: observed',
      'not_observable: true',
    ].join('\n'),
  );
});

it('toPair builds the stable id and the record text', () => {
  const pair = toPair('T02', 'Autocasco (AC)', RECORDS[1]!);
  expect(pair).toMatchObject({
    id: 'T02~GL-002@1',
    itemId: 'T02',
    item: 'Autocasco (AC)',
    record: { key: 'GL-002', rev: 1, kind: 'glossary_term' },
  });
  expect(pair.record.text).toContain('term_verbatim: Autocasco');
});
