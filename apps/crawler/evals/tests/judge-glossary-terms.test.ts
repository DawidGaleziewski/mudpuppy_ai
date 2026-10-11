import { expect, it } from 'vitest';
import { glossaryTerms } from '../graders/model/judges/glossary-terms.js';
import { judgeById, JUDGES } from '../graders/model/judges/index.js';
import { GT, RECORDS } from './fixtures/judge/records.js';

const ids = () => glossaryTerms.selectPairs({ groundTruth: GT, records: RECORDS }).map((p) => p.id);

it('selects variants the exact matcher misses, and only related records', () => {
  expect(ids()).toEqual([
    // OC: the exact term (GL-001); NNW (GL-003) shares nothing and is left out.
    'T01~GL-001@1',
    // Autocasco (AC): "Autocasco" and the synonym "AC" (GL-002); "OWU AC" shares the word AC.
    'T02~GL-002@1',
    'T02~GL-004@1',
    // OWU: shares the word OWU with "OWU AC".
    'T03~GL-004@1',
  ]);
});

it('matches whole words, not letters inside a word ("OC" is not in "Autocasco")', () => {
  expect(ids().filter((id) => id.startsWith('T01'))).toEqual(['T01~GL-001@1']);
});

it("shows the judge the portal's meaning of the term, when the ground truth has one", () => {
  const items = glossaryTerms.selectPairs({ groundTruth: GT, records: RECORDS });
  expect(items.find((p) => p.itemId === 'T01')?.item).toBe(
    'term: OC\nmeaning on the portal: Obowiązkowe ubezpieczenie OC posiadaczy pojazdów.',
  );
  expect(items.find((p) => p.itemId === 'T03')?.item).toBe('term: OWU');
});

it('is deterministic whatever the record order', () => {
  const reversed = glossaryTerms.selectPairs({ groundTruth: GT, records: [...RECORDS].reverse() });
  expect(reversed.map((p) => p.id)).toEqual(ids());
});

it('is listed in JUDGES and found by id', () => {
  expect(JUDGES).toContain(glossaryTerms);
  expect(judgeById('glossary-terms')).toBe(glossaryTerms);
  expect(judgeById('nope')).toBeUndefined();
});
