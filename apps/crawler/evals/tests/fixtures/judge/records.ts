/** Small documentation records and a ground truth for the judge selector tests. */
import type { EvalRecord, GroundTruth } from '@pathfinder/docs';

export function record(
  key: string,
  kind: string,
  content: Record<string, unknown>,
  routes: string[] = [],
): EvalRecord {
  return {
    key,
    kind: kind as EvalRecord['kind'],
    rev: 1,
    confidence: 'observed',
    not_observable: false,
    content: { kind, ...content },
    evidence: [{ target_kind: 'state', target_id: `s-${key}`, routes }],
  };
}

export const GT: GroundTruth = {
  portal_id: 'test-portal',
  screens: [{ id: 'S09', route_template: '/kalkulator/kierowca', guest_visible: true }],
  forms: [],
  rules: [
    {
      id: 'R01',
      statement: 'The driver must be between 18 and 75 years old.',
      anchor: { screen: 'S09', label: 'Data urodzenia' },
      guest_observable: true,
    },
  ],
  processes: [],
  terms: [
    { id: 'T01', term: 'OC', meaning: 'Obowiązkowe ubezpieczenie OC posiadaczy pojazdów.' },
    { id: 'T02', term: 'Autocasco (AC)' },
    { id: 'T03', term: 'OWU' },
  ],
};

export const RECORDS: EvalRecord[] = [
  record('GL-003', 'glossary_term', { term_verbatim: 'NNW', synonyms_verbatim: [] }),
  record('GL-002', 'glossary_term', {
    term_verbatim: 'Autocasco',
    definition: 'Voluntary vehicle insurance.',
    synonyms_verbatim: ['AC'],
  }),
  record('GL-001', 'glossary_term', { term_verbatim: 'OC', synonyms_verbatim: ['Tylko OC'] }),
  record('GL-004', 'glossary_term', { term_verbatim: 'OWU AC' }),
  record('BR-001', 'business_rule', { statement: 'Driver age 18–75.' }, ['/kalkulator/kierowca']),
];
