import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Confidence } from '@pathfinder/core';
import {
  AnalysisSessionStatus,
  DOC_CONTENT_BY_KIND,
  DocContent,
  DocKind,
  EvidenceTargetKind,
  FollowupStatus,
  KEY_PREFIX,
  RelationType,
  ReviewAction,
  RevisionChange,
  RevisionStatus,
  Process,
  ProcessOutcome,
  ProcessStatus,
  ProcessStep,
  ProcessStepKind,
} from '../src/index.js';

const ts = '2026-01-01T00:00:00.000Z';

const MIGRATION_0003 = readFileSync(
  fileURLToPath(new URL('../../../../../data/migrations/0003_trace.up.sql', import.meta.url)),
  'utf-8',
);

const SCHEMA_SQL = readFileSync(
  fileURLToPath(new URL('../../../../../data/schema/schema.sql', import.meta.url)),
  'utf-8',
);

/** Extracts one `CREATE TABLE <name> (...) STRICT` body from a SQL file (the trace migration by default). */
function tableBody(table: string, sql = MIGRATION_0003): string {
  const re = new RegExp(`CREATE TABLE ${table} \\(([\\s\\S]+?)\\) STRICT`);
  const match = sql.match(re);
  if (!match) throw new Error(`table ${table} not found`);
  return match[1]!;
}

/** Extracts the string list of a `CHECK (<column> IN (...))` clause for one column within a table body. */
function checkList(table: string, column: string, sql = MIGRATION_0003): string[] {
  const re = new RegExp(`\\b${column}\\s+TEXT[^\\n]*CHECK \\(${column} IN \\(([^)]+)\\)\\)`);
  const match = tableBody(table, sql).match(re);
  if (!match) throw new Error(`no CHECK IN clause for ${table}.${column}`);
  return match[1]!.split(',').map((v) => v.trim().replace(/^'|'$/g, ''));
}

describe('Layer B schemas (R-13)', () => {
  it('Zod enums equal the CHECK lists in schema.sql', () => {
    const list = (table: string, column: string) => checkList(table, column, SCHEMA_SQL);
    expect(AnalysisSessionStatus.options).toEqual(list('analysis_sessions', 'status'));
    expect(DocKind.options).toEqual(list('doc_records', 'kind'));
    expect(RevisionChange.options).toEqual(list('doc_revisions', 'change'));
    expect(Confidence.options).toEqual(list('doc_revisions', 'confidence'));
    expect(RevisionStatus.options).toEqual(list('doc_revisions', 'status'));
    expect(EvidenceTargetKind.options).toEqual(list('doc_evidence_links', 'target_kind'));
    expect(RelationType.options).toEqual(list('doc_relations', 'type'));
    expect(ReviewAction.options).toEqual(list('doc_reviews', 'action'));
    expect(FollowupStatus.options).toEqual(list('followup_tasks', 'status'));
  });

  it('has one key prefix and one content schema per kind', () => {
    expect(Object.keys(KEY_PREFIX).sort()).toEqual([...DocKind.options].sort());
    expect(Object.keys(DOC_CONTENT_BY_KIND).sort()).toEqual([...DocKind.options].sort());
    expect(new Set(Object.values(KEY_PREFIX)).size).toBe(DocKind.options.length);
  });

  /** One valid sample per kind, then at least two ways to break it. */
  const samples: Record<DocKind, { valid: Record<string, unknown>; invalid: unknown[] }> = {
    capability: {
      valid: { title: 'Car insurance quoting', description: 'Guests can price an OC/AC policy.' },
      invalid: [{ title: 'x' }, { title: '', description: 'd' }],
    },
    screen: {
      valid: {
        title: 'Vehicle details step',
        purpose: 'Collects the vehicle data for a quote.',
        route_templates: ['/kalkulator/pojazd'],
        elements: [{ role: 'button', label_verbatim: 'Dalej' }],
        entry_points: ['Link "Oblicz składkę" on the car insurance page'],
      },
      invalid: [
        { title: 't', purpose: 'p', route_templates: [], elements: [], entry_points: [] },
        {
          title: 't',
          purpose: 'p',
          route_templates: ['/x'],
          elements: [{ role: 'button' }],
          entry_points: [],
        },
      ],
    },
    process: {
      valid: {
        title: 'Calculate an OC/AC premium',
        goal: 'Get a premium',
        persona: 'guest',
        trigger: 'Guest opens the calculator',
        outcome: 'A premium breakdown is shown',
        observed_extent: 'map_only',
      },
      invalid: [
        {
          title: 't',
          goal: 'g',
          persona: 'p',
          trigger: 't',
          outcome: 'o',
          observed_extent: 'half',
        },
        { title: 't', goal: 'g', persona: 'p', trigger: 't', observed_extent: 'full' },
      ],
    },
    use_case: {
      valid: {
        title: 'Guest calculates a car premium',
        primary_actor: 'Guest',
        preconditions: [],
        trigger: 'Guest selects "Oblicz składkę"',
        main_flow: [{ n: 1, actor_or_system: 'Guest', text: 'Fills "Dane pojazdu".' }],
        alternate_flows: [[{ n: 1, actor_or_system: 'System', text: 'Shows a hint.' }]],
        exception_flows: [],
        postconditions: ['A premium is shown'],
      },
      invalid: [
        {
          title: 't',
          primary_actor: 'a',
          preconditions: [],
          trigger: 't',
          main_flow: [],
          alternate_flows: [],
          exception_flows: [],
          postconditions: [],
        },
        {
          title: 't',
          primary_actor: 'a',
          preconditions: [],
          trigger: 't',
          main_flow: [{ n: 0, actor_or_system: 'Guest', text: 'x' }],
          alternate_flows: [],
          exception_flows: [],
          postconditions: [],
        },
      ],
    },
    requirement: {
      valid: {
        title: 'Reject invalid postcode',
        statement: 'The system shall reject a "Kod pocztowy" not in the format NN-NNN.',
        rationale: 'Postcodes drive the regional factor.',
        rationale_confidence: 'needs_confirmation',
        acceptance_criteria: [
          {
            given: ['the contact form'],
            when: ['"Kod pocztowy" is 123'],
            then: ['an error shows'],
          },
        ],
        priority: 'unset',
      },
      invalid: [
        { title: 't', statement: 's', acceptance_criteria: [], priority: 'high' },
        {
          title: 't',
          statement: 's',
          acceptance_criteria: [{ given: ['g'], when: ['w'] }],
          priority: 'must',
        },
        { title: 't', acceptance_criteria: [], priority: 'must' },
      ],
    },
    nfr: {
      valid: {
        title: 'Pages served in Polish',
        category: 'localisation',
        statement: 'The system shall serve every guest page in Polish.',
        measured: { value: '12', unit: 'pages', how: 'lang attribute of the recorded states' },
      },
      invalid: [
        { title: 't', category: 'speed', statement: 's' },
        { title: 't', category: 'security', statement: 's', measured: { value: '1' } },
      ],
    },
    business_rule: {
      valid: {
        title: 'Driver age limits',
        statement: 'The "Data urodzenia" field accepts ages from 18 to 75.',
        rule_type: 'constraint',
        decision_table: { conditions: ['age'], actions: ['accepted'], rows: [['17', 'no']] },
      },
      invalid: [
        { title: 't', statement: 's', rule_type: 'validation' },
        { title: 't', statement: 's', rule_type: 'constraint', decision_table: { rows: [] } },
      ],
    },
    glossary_term: {
      valid: {
        title: 'Bezszkodowa jazda',
        term_verbatim: 'Bezszkodowa jazda',
        lang: 'pl',
        definition: 'Years driven without a claim.',
        synonyms_verbatim: [],
      },
      invalid: [
        { title: 't', term_verbatim: 'x', lang: 'p', definition: 'd', synonyms_verbatim: [] },
        { title: 't', lang: 'pl', definition: 'd', synonyms_verbatim: [] },
      ],
    },
    data_item: {
      valid: {
        title: 'Kod pocztowy',
        name_verbatim: 'Kod pocztowy',
        lang: 'pl',
        name_en: 'Postal code',
        data_type: 'text',
        constraints: { required: true, format: 'NN-NNN', max_length: 6 },
        seen_in: [{ kind: 'form', target_id: 'f1' }],
      },
      invalid: [
        {
          title: 't',
          name_verbatim: 'x',
          lang: 'pl',
          name_en: 'x',
          data_type: 'text',
          constraints: { max_length: -1 },
          seen_in: [],
        },
        {
          title: 't',
          name_verbatim: 'x',
          lang: 'pl',
          name_en: 'x',
          data_type: 'text',
          constraints: {},
          seen_in: [{ kind: 'state', target_id: 's1' }],
        },
      ],
    },
    assumption: {
      valid: {
        title: 'Premium shown is final',
        statement: 'The premium on the result page is the price charged.',
        impact_if_wrong: 'The purchase flow needs a re-pricing step.',
      },
      invalid: [
        { title: 't', statement: 's' },
        { title: 't', statement: '', impact_if_wrong: 'i' },
      ],
    },
    open_question: {
      valid: {
        title: 'Why 18?',
        question: 'Why is 18 the lower age limit?',
        why_it_matters: 'It decides whether the limit is configurable.',
        answer_needed_from: 'sme',
      },
      invalid: [
        { title: 't', question: 'q', why_it_matters: 'w', answer_needed_from: 'ba' },
        { title: 't', why_it_matters: 'w', answer_needed_from: 'sme' },
      ],
    },
    followup: {
      valid: {
        title: 'Trace the calculator',
        question: 'What steps follow "Dalej"?',
        suggested_mode: 'trace',
        target: { process_name: 'Oblicz składkę OC/AC', goal: 'Reach the premium result' },
        persona: 'guest',
        reason: 'Unblocks the use case for quoting.',
      },
      invalid: [
        {
          title: 't',
          question: 'q',
          suggested_mode: 'replay',
          target: { url: '/x' },
          persona: 'guest',
          reason: 'r',
        },
        { title: 't', question: 'q', suggested_mode: 'map', target: { url: '/x' }, reason: 'r' },
        {
          title: 't',
          question: 'q',
          suggested_mode: 'trace',
          target: { process_name: 'p' },
          persona: 'guest',
          reason: 'r',
        },
      ],
    },
  };

  for (const kind of DocKind.options) {
    it(`${kind}: accepts a valid sample and rejects the invalid ones`, () => {
      const { valid, invalid } = samples[kind];
      expect(invalid.length).toBeGreaterThanOrEqual(2);
      expect(DocContent.safeParse({ kind, ...valid }).success).toBe(true);
      expect(DOC_CONTENT_BY_KIND[kind].safeParse({ kind, ...valid }).success).toBe(true);
      for (const bad of invalid)
        expect(DocContent.safeParse({ kind, ...(bad as object) }).success).toBe(false);
    });
  }

  it('keeps a follow-up target intact, in either form', () => {
    const base = { ...samples.followup.valid, kind: 'followup' };
    for (const target of [
      { process_name: 'Oblicz składkę OC/AC', goal: 'Reach the premium result' },
      { url: '/kalkulator/pojazd' },
    ])
      expect(DocContent.parse({ ...base, target })).toMatchObject({ target });
  });

  it('rejects content whose kind is not a doc kind', () => {
    expect(DocContent.safeParse({ kind: 'epic', title: 't' }).success).toBe(false);
  });
});

describe('process schemas (R-14)', () => {
  it('Zod enums equal the CHECK lists in schema.sql', () => {
    const list = (table: string, column: string) => checkList(table, column, SCHEMA_SQL);
    expect(ProcessStatus.options).toEqual(list('processes', 'status'));
    expect(ProcessOutcome.options).toEqual(list('processes', 'outcome'));
    expect(ProcessStepKind.options).toEqual(list('process_steps', 'kind'));
    expect(Confidence.options).toEqual(list('process_steps', 'confidence'));
  });

  const process = {
    id: 'p1',
    run_id: 'r1',
    portal_id: 'shop',
    persona_id: 'guest',
    name: 'Oblicz składkę OC/AC',
    goal: 'Reach the premium result',
    followup_record_id: null,
    status: 'recorded',
    outcome: null,
    boundary_action_id: null,
    observed_result: null,
    not_observable: null,
    created_at: ts,
    ended_at: null,
  };
  it('accepts a running process; boundary_reached needs boundary_action_id and not_observable', () => {
    expect(Process.safeParse(process).success).toBe(true);
    expect(Process.safeParse({ ...process, outcome: 'goal_reached' }).success).toBe(true);
    expect(Process.safeParse({ ...process, outcome: 'won' }).success).toBe(false);
    expect(Process.safeParse({ ...process, status: 'weird' }).success).toBe(false);
    const boundary = { ...process, outcome: 'boundary_reached' };
    expect(Process.safeParse(boundary).success).toBe(false);
    expect(Process.safeParse({ ...boundary, boundary_action_id: 'a1' }).success).toBe(false);
    expect(Process.safeParse({ ...boundary, not_observable: 'Payment' }).success).toBe(false);
    expect(
      Process.safeParse({ ...boundary, boundary_action_id: 'a1', not_observable: 'Payment' })
        .success,
    ).toBe(true);
  });

  const step = {
    id: 's1',
    process_id: 'p1',
    ord: 1,
    intent: 'Open the calculator',
    kind: 'navigate',
    action_id: null,
    edge_id: null,
    value: null,
    state_before: null,
    state_after: 'st2',
    outcomes_json: ['Route changed to /kalkulator'],
    evidence_ref: 'abc.json',
    confidence: 'observed',
    created_at: ts,
  };
  it('accepts a valid step and rejects bad kind, ord, outcomes, evidence_ref or confidence', () => {
    expect(ProcessStep.safeParse(step).success).toBe(true);
    expect(ProcessStep.safeParse({ ...step, kind: 'hover' }).success).toBe(false);
    expect(ProcessStep.safeParse({ ...step, ord: 0 }).success).toBe(false);
    expect(ProcessStep.safeParse({ ...step, outcomes_json: 'x' }).success).toBe(false);
    expect(ProcessStep.safeParse({ ...step, evidence_ref: '' }).success).toBe(false);
    expect(ProcessStep.safeParse({ ...step, confidence: 'sure' }).success).toBe(false);
    expect(ProcessStep.safeParse({ ...step, intent: '' }).success).toBe(false);
  });
});
