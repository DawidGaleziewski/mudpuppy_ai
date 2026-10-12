import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_THRESHOLDS,
  GroundTruth,
  evaluate,
  evaluationMarkdown,
  loadEvalInput,
  reportJson,
  type EvalRecord,
} from '../src/evaluate.js';
import {
  makeFixtureStore,
  seedDocRecords,
  type FixtureStore,
  type SeededDocs,
} from '../src/testing/index.js';

/**
 * T077: the matching rules of research §16 and contracts/ground-truth.md on a small hand-built
 * ground truth. Records are given as the evaluator sees them (latest counted revision, evidence
 * resolved to route templates), so these tests need no store.
 */
const gt = GroundTruth.parse({
  portal_id: 'sample-portal',
  today: '2026-01-15',
  screens: [
    ...Array.from({ length: 10 }, (_, i) => ({
      id: `S${String(i + 1).padStart(2, '0')}`,
      route_template: `/page-${i + 1}`,
      title: `Page ${i + 1}`,
      guest_visible: true,
      reached_by: 'navigation',
    })),
    {
      id: 'S11',
      route_template: '/account',
      title: 'Account',
      guest_visible: false,
      reached_by: 'login',
    },
  ],
  forms: [
    {
      id: 'F01',
      screen: 'S02',
      label: 'Dane',
      method: 'get',
      fields: [
        {
          id: 'F01.1',
          label: 'Rok produkcji',
          type: 'number',
          constraints: { required: true, min: 1990, max: 2026 },
        },
        {
          id: 'F01.2',
          label: 'Kod pocztowy',
          type: 'text',
          constraints: { required: true, pattern: '[0-9]{2}-[0-9]{3}' },
        },
        {
          id: 'F01.3',
          label: 'Marka',
          type: 'select',
          constraints: { allowed_values: ['A', 'B'], max_length: 10 },
        },
      ],
    },
    {
      id: 'F02',
      screen: 'S11',
      label: 'Konto',
      method: 'post',
      fields: [{ id: 'F02.1', label: 'Hasło', type: 'password', constraints: { required: true } }],
    },
  ],
  rules: [
    {
      id: 'R01',
      statement: 'Year range',
      type: 'range',
      anchor: { screen: 'S02', label: 'Rok produkcji' },
      guest_observable: true,
      claim_markers: ['1990'],
    },
    {
      id: 'R02',
      statement: 'Postcode format',
      type: 'format',
      anchor: { screen: 'S02', label: 'Kod pocztowy' },
      guest_observable: true,
    },
    {
      id: 'R03',
      statement: 'Renew window',
      type: 'eligibility',
      anchor: { screen: 'S03', label: 'Przedłuż' },
      guest_observable: false,
      claim_markers: ['30 days', '30 dni'],
    },
  ],
  processes: [
    {
      id: 'P01',
      name: 'Calculate',
      steps: ['/page-2', '/page-4'],
      first_route: '/page-2',
      last_observable_route: '/page-4',
      ends_with: 'result',
    },
    {
      id: 'P02',
      name: 'Buy',
      steps: ['/page-2', '/page-5'],
      first_route: '/page-2',
      last_observable_route: '/page-5',
      ends_with: 'mutation',
    },
    {
      id: 'P03',
      name: 'Renew',
      steps: ['/account'],
      first_route: '/account',
      last_observable_route: '/account',
      ends_with: 'login_wall',
    },
  ],
  terms: [
    { id: 'T01', term: 'Autocasco', lang: 'pl' },
    { id: 'T02', term: 'Składka', lang: 'pl' },
  ],
});

let n = 0;
function rec(
  kind: EvalRecord['kind'],
  content: Record<string, unknown>,
  over: Partial<EvalRecord> = {},
): EvalRecord {
  n += 1;
  return {
    key: `${kind.toUpperCase().slice(0, 3)}-${String(n).padStart(3, '0')}`,
    kind,
    rev: 1,
    confidence: 'observed',
    not_observable: false,
    content: { kind, ...content },
    evidence: [{ target_kind: 'state', target_id: `st-${n}`, routes: ['/page-1'] }],
    ...over,
  };
}
const on = (...routes: string[]) => [{ target_kind: 'state' as const, target_id: 'st-x', routes }];

/** Nine of ten guest screens, all fields with their constraints, both observable rules, P01–P03, one term. */
function records(): EvalRecord[] {
  n = 0;
  return [
    ...Array.from({ length: 9 }, (_, i) =>
      rec('screen', { title: `Page ${i + 1}`, route_templates: [`/page-${i + 1}`] }),
    ),
    rec('data_item', {
      name_verbatim: '  rok   PRODUKCJI ',
      constraints: { required: true, format: 'year between 1990 and 2026' },
    }),
    rec('data_item', {
      name_verbatim: 'Kod pocztowy',
      constraints: { required: true, pattern_observed: '[0-9]{2}-[0-9]{3}' },
    }),
    rec('data_item', {
      name_verbatim: 'Marka',
      constraints: { allowed_values: ['— choose —', 'A', 'B'], max_length: 11 },
    }),
    rec(
      'business_rule',
      { statement: 'The field "Rok produkcji" accepts 1990 to the current year.' },
      { evidence: on('/page-2') },
    ),
    rec(
      'requirement',
      {
        statement: 'Postcode',
        acceptance_criteria: [{ given: [], when: [], then: ['"Kod pocztowy" shows NN-NNN'] }],
      },
      { evidence: on('/page-2') },
    ),
    rec(
      'process',
      { title: 'Calculate', observed_extent: 'full' },
      {
        evidence: [
          { target_kind: 'process', target_id: 'p1', routes: ['/page-2', '/page-3', '/page-4'] },
        ],
      },
    ),
    rec(
      'process',
      { title: 'Buy', observed_extent: 'until_boundary' },
      { evidence: on('/page-2') },
    ),
    rec(
      'process',
      { title: 'Renew', observed_extent: 'map_only' },
      {
        confidence: 'needs_confirmation',
        not_observable: true,
        evidence: on('/account'),
      },
    ),
    rec('glossary_term', { term_verbatim: 'autocasco' }),
  ];
}

describe('evaluate (research §16, contracts/ground-truth.md)', () => {
  const base = { portal_id: 'sample-portal', as_of: '2026-01-15T10:00:00.000Z', groundTruth: gt };

  it('9 of 10 guest screens → 90% with the missing id; non-guest screens are not counted', () => {
    const r = evaluate({ ...base, records: records() });
    expect(r.scores.screens).toMatchObject({ matched: 9, total: 10, pct: 90, missing: ['S10'] });
  });

  it('a route template written with its query still names the screen (spec 019 F-09)', () => {
    const withQuery = records().map((r) =>
      r.kind === 'screen' && r.key === 'SCR-001'
        ? { ...r, content: { ...r.content, route_templates: ['/page-1?produkt={code}&n=2'] } }
        : r,
    );
    const r = evaluate({ ...base, records: withQuery });
    expect(r.scores.screens).toMatchObject({ matched: 9, total: 10 });
  });

  it('fields match by normalised verbatim label, guest forms only', () => {
    const r = evaluate({ ...base, records: records() });
    expect(r.scores.fields).toMatchObject({ matched: 3, total: 3, missing: [] });
  });

  it('constraints: kind and value; min/max from the format text; allowed values as a superset', () => {
    const r = evaluate({ ...base, records: records() });
    // F01.3.max_length is 10 in the ground truth and 11 in the record.
    // Items: F01.1 required/min/max, F01.2 required/pattern, F01.3 allowed_values/max_length.
    expect(r.scores.constraints).toMatchObject({
      total: 7,
      matched: 6,
      missing: ['F01.3.max_length'],
    });
  });

  it('rules: anchor screen cited and anchor label quoted; non-observable rules not in the denominator', () => {
    const r = evaluate({ ...base, records: records() });
    expect(r.scores.rules).toMatchObject({ matched: 2, total: 2, missing: [] });
    const elsewhere = records().map((x) =>
      x.kind === 'business_rule' ? { ...x, evidence: on('/page-9') } : x,
    );
    expect(evaluate({ ...base, records: elsewhere }).scores.rules.missing).toEqual(['R01']);
  });

  it('processes: traced routes, or flagged at a boundary / not observable where the truth ends so', () => {
    const r = evaluate({ ...base, records: records() });
    expect(r.scores.processes).toMatchObject({ matched: 3, total: 3, missing: [] });
    // A result-ending process cannot be satisfied by a boundary flag.
    const noTrace = records().map((x) =>
      x.content.title === 'Calculate'
        ? {
            ...x,
            content: { ...x.content, observed_extent: 'until_boundary' },
            evidence: on('/page-2'),
          }
        : x,
    );
    expect(evaluate({ ...base, records: noTrace }).scores.processes.missing).toEqual(['P01']);
  });

  it('terms by normalised verbatim term', () => {
    const r = evaluate({ ...base, records: records() });
    expect(r.scores.terms).toMatchObject({ matched: 1, total: 2, pct: 50, missing: ['T02'] });
  });

  it('a not-guest-observable rule documented as observed is an over-claim (SC-009)', () => {
    const claim = rec(
      'business_rule',
      { statement: 'Renewal: "Przedłuż" within 30 days.' },
      { evidence: on('/page-3') },
    );
    const r = evaluate({ ...base, records: [...records(), claim] });
    expect(r.overclaims).toEqual([{ ground_truth: 'R03', record: claim.key, rev: 1 }]);
    const honest = { ...claim, confidence: 'needs_confirmation' as const, not_observable: true };
    expect(evaluate({ ...base, records: [...records(), honest] }).overclaims).toEqual([]);
  });

  it('claim markers: quoting the anchor label of a hidden rule without stating it is no over-claim', () => {
    const page = rec(
      'requirement',
      { statement: 'A guest opening "Przedłuż" sees a login prompt.' },
      { evidence: on('/page-3') },
    );
    expect(evaluate({ ...base, records: [...records(), page] }).overclaims).toEqual([]);
  });

  it('claim markers: an observable rule needs its marker, a number only as a whole token', () => {
    const swap = (statement: string) =>
      records().map((x) =>
        x.kind === 'business_rule' ? { ...x, content: { ...x.content, statement } } : x,
      );
    const missing = (statement: string) =>
      evaluate({ ...base, records: swap(statement) }).scores.rules.missing;
    expect(missing('"Rok produkcji" is required.')).toEqual(['R01']);
    expect(missing('"Rok produkcji" accepts values from 19900.')).toEqual(['R01']);
    expect(missing('"Rok produkcji" accepts 1990–2026.')).toEqual([]);
  });

  it('a login-wall process claimed as fully observed is an over-claim', () => {
    const full = records().map((x) =>
      x.content.title === 'Renew'
        ? {
            ...x,
            confidence: 'observed' as const,
            not_observable: false,
            content: { ...x.content, observed_extent: 'full' },
            evidence: [{ target_kind: 'process' as const, target_id: 'p3', routes: ['/account'] }],
          }
        : x,
    );
    expect(evaluate({ ...base, records: full }).overclaims).toEqual([
      expect.objectContaining({ ground_truth: 'P03' }),
    ]);
  });

  it('thresholds decide passed/failed; defaults are the SC-008 targets and 0 over-claims', () => {
    expect(DEFAULT_THRESHOLDS).toEqual({
      screens: 90,
      fields: 90,
      constraints: 80,
      rules: 70,
      processes: 100,
      terms: 80,
      overclaims: 0,
    });
    const r = evaluate({ ...base, records: records() });
    expect(r.passed).toBe(false);
    expect(r.failed).toEqual(['terms']);
    const lenient = evaluate({
      ...base,
      records: records(),
      thresholds: { ...DEFAULT_THRESHOLDS, terms: 50 },
    });
    expect(lenient).toMatchObject({ passed: true, failed: [] });
  });

  it('the report is byte-identical on re-run and its Markdown names every miss', () => {
    const a = reportJson(evaluate({ ...base, records: records() }));
    const b = reportJson(evaluate({ ...base, records: records().reverse() }));
    expect(a).toBe(b);
    expect(a.endsWith('\n')).toBe(true);
    const md = evaluationMarkdown(evaluate({ ...base, records: records() }), gt);
    for (const id of ['S10', 'F01.3.max_length', 'T02']) expect(md).toContain(id);
    expect(md).toContain('/page-10');
  });

  it('the evaluator source knows no portal by name (FR-062)', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../src/evaluate.ts', import.meta.url)),
      'utf8',
    );
    for (const name of [
      'reference-insurer',
      'reference-portal',
      'liveinsurer',
      'Towarzystwo',
      'kalkulator',
    ])
      expect(source).not.toContain(name);
  });
});

describe('loadEvalInput (store → evaluator input)', () => {
  let fx: FixtureStore;
  let seeded: SeededDocs;
  beforeAll(async () => {
    fx = await makeFixtureStore({ portalId: 'reference-insurer', deterministicIds: true });
    seeded = seedDocRecords(fx);
  });
  afterAll(() => fx.close());

  it('counts only the latest non-rejected revision of non-withdrawn records', () => {
    const input = loadEvalInput(fx.raw, fx.portalId);
    const keys = input.records.map((r) => r.key);
    expect(keys).not.toContain('SCR-004'); // rejected, nothing else
    expect(keys).not.toContain('DI-004'); // withdrawn
    expect(input.records.find((r) => r.key === 'SCR-002')).toMatchObject({ rev: 2 });
    expect(input.as_of).toBe('2026-01-15T10:37:00.000Z');
  });

  it('resolves evidence to route templates, a process to the routes its steps visited', () => {
    const input = loadEvalInput(fx.raw, fx.portalId);
    const proc = input.records.find((r) => r.key === 'PROC-001')!;
    const viaProcess = proc.evidence.find((e) => e.target_kind === 'process')!;
    expect(viaProcess.routes).toEqual(['/kalkulator/pojazd', '/ubezpieczenia/samochod']);
    const req = input.records.find((r) => r.key === 'REQ-002')!;
    expect(req.evidence.find((e) => e.target_id === seeded.goneFormId)!.routes).toEqual([]);
    expect(input.records.find((r) => r.key === 'DI-001')!.evidence[0]!.routes).toEqual([
      '/kalkulator/pojazd',
    ]);
  });
});
