import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AgentTurn,
  AgentTurnKind,
  AgentTurnRole,
  DecisionKind,
  DecisionLogEntry,
  Edge,
  FrontierStatus,
  PortalDataLog,
  PwTraceMode,
  RobotsPolicy,
  RuleCandidate,
  Run,
  SpanKind,
  SpanStatus,
  State,
  TraceBoot,
  TraceLevel,
  TraceServer,
  TraceSpan,
  minSafetyClass,
  AnalysisSessionStatus,
  Confidence,
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

describe('minSafetyClass', () => {
  it('orders read < mutating < destructive < external-side-effect', () => {
    expect(minSafetyClass('read', 'destructive')).toBe('read');
    expect(minSafetyClass('external-side-effect', 'mutating')).toBe('mutating');
    expect(minSafetyClass('destructive', 'destructive')).toBe('destructive');
  });
});

describe('record schemas', () => {
  const state = {
    id: 'a',
    portal_id: 'p',
    fingerprint: 'a'.repeat(64),
    cluster_id: 'c',
    route_template: '/x',
    title: 't',
    evidence_ref: 'abc.json',
    confidence: 'observed',
    stabilization: 'settled',
    first_seen_run: 'r',
    created_at: ts,
  };
  it('accepts a valid state and rejects empty evidence_ref or bad confidence', () => {
    expect(State.safeParse(state).success).toBe(true);
    expect(State.safeParse({ ...state, evidence_ref: '' }).success).toBe(false);
    expect(State.safeParse({ ...state, confidence: 'sure' }).success).toBe(false);
  });
  it('requires portal_id (FR-026, FR-027)', () => {
    const noPortal: Partial<typeof state> = { ...state };
    delete noPortal.portal_id;
    expect(State.safeParse(noPortal).success).toBe(false);
    expect(State.safeParse({ ...state, portal_id: '' }).success).toBe(false);
  });
  it('allows a nullable edge to_state', () => {
    const edge = {
      id: 'e',
      run_id: 'r',
      from_state: 's',
      to_state: null,
      action_json: {},
      safety_class: 'read',
      status: 'skipped',
      evidence_ref: 'x.json',
      confidence: 'observed',
      error: null,
      stabilization: 'settled',
      created_at: ts,
    };
    expect(Edge.safeParse(edge).success).toBe(true);
  });
  it('fixes rule candidate confidence to inferred', () => {
    const rc = {
      id: 'i',
      run_id: 'r',
      text: 't',
      about_ref: 's',
      evidence_ref: 'x.json',
      created_at: ts,
    };
    expect(RuleCandidate.safeParse({ ...rc, confidence: 'inferred' }).success).toBe(true);
    expect(RuleCandidate.safeParse({ ...rc, confidence: 'observed' }).success).toBe(false);
  });
  it('requires a warning for stopped_warning runs', () => {
    const run = {
      id: 'r',
      portal_id: 'p',
      persona_id: 'g',
      mode: 'map',
      environment: 'production',
      env_version_or_date: 'd',
      seed_id: null,
      viewport: '1366x768',
      locale: 'pl-PL',
      browser: 'chromium',
      config_snapshot: {},
      status: 'stopped_warning',
      warning: null,
      steps_used: 0,
      elapsed_ms: 0,
      max_depth_reached: 0,
      started_at: ts,
      ended_at: null,
      coverage: null,
    };
    expect(Run.safeParse(run).success).toBe(false);
    expect(Run.safeParse({ ...run, warning: '403' }).success).toBe(true);
  });
});

describe('portal-agnostic safety additions (R-11)', () => {
  it('adds robots_disallowed to FrontierStatus', () => {
    expect(FrontierStatus.options).toContain('robots_disallowed');
  });

  it('adds note to DecisionKind and accepts it on a decision log entry', () => {
    expect(DecisionKind.options).toContain('note');
    const entry = {
      id: 'd',
      run_id: 'r',
      kind: 'note',
      rule: 'robots:Disallow: /api/',
      reason: 'page requested a robots-disallowed URL',
      subject_ref: null,
      detail_json: null,
      created_at: ts,
    };
    expect(DecisionLogEntry.safeParse(entry).success).toBe(true);
  });

  it('validates a robots policy row field-for-field with data-model.md', () => {
    const policy = {
      id: 'rp',
      run_id: 'r',
      host: 'www.liveinsurer.example',
      source_url: 'https://www.liveinsurer.example/robots.txt',
      final_url: 'https://www.liveinsurer.example/robots.txt',
      outcome: 'rules',
      http_status: 200,
      product_token: 'PathfinderAI-Crawler',
      group_used: 'PathfinderAI-Crawler',
      crawl_delay_s: 1,
      ignored_lines: 0,
      truncated: 0,
      content_sha256: 'a'.repeat(64),
      evidence_ref: 'a'.repeat(64) + '.txt',
      fetched_at: ts,
    };
    expect(RobotsPolicy.safeParse(policy).success).toBe(true);
    expect(RobotsPolicy.safeParse({ ...policy, outcome: 'maybe' }).success).toBe(false);
    expect(RobotsPolicy.safeParse({ ...policy, truncated: 2 }).success).toBe(false);
    expect(RobotsPolicy.safeParse({ ...policy, evidence_ref: '' }).success).toBe(false);
    const nullable: Partial<typeof policy> = { ...policy };
    for (const k of [
      'final_url',
      'http_status',
      'group_used',
      'crawl_delay_s',
      'content_sha256',
    ] as const)
      delete nullable[k];
    expect(
      RobotsPolicy.safeParse({
        ...nullable,
        final_url: null,
        http_status: null,
        group_used: null,
        crawl_delay_s: null,
        content_sha256: null,
      }).success,
    ).toBe(true);
  });

  it('validates a portal_data_log row field-for-field with data-model.md', () => {
    const row = {
      id: 'pdl',
      portal_id: 'liveinsurer',
      environment: 'production',
      action: 'export',
      operator: 'dawid',
      counts_json: { runs: 3, evidence: 12 },
      target: 'data/exports/liveinsurer-production-20260101',
      created_at: ts,
    };
    expect(PortalDataLog.safeParse(row).success).toBe(true);
    expect(PortalDataLog.safeParse({ ...row, action: 'purge' }).success).toBe(false);
    expect(PortalDataLog.safeParse({ ...row, target: null }).success).toBe(true);
  });
});

describe('trace schemas (R-17)', () => {
  it('Zod enums equal the 0003_trace CHECK lists', () => {
    expect(TraceServer.options).toEqual(checkList('trace_boots', 'server'));
    expect(TraceLevel.options).toEqual(checkList('trace_boots', 'trace_level'));
    expect(PwTraceMode.options).toEqual(checkList('trace_boots', 'pw_trace'));
    expect(SpanKind.options).toEqual(checkList('trace_spans', 'kind'));
    expect(SpanStatus.options).toEqual(checkList('trace_spans', 'status'));
    expect(AgentTurnRole.options).toEqual(checkList('agent_turns', 'role'));
    expect(AgentTurnKind.options).toEqual(checkList('agent_turns', 'kind'));
  });

  const boot = {
    id: 'b',
    started_at: ts,
    ended_at: null,
    environment: 'sandbox',
    server: 'pathfinder',
    pid: 123,
    version: '0.1.0',
    trace_level: 'standard',
    pw_trace: 'non_production',
  };
  it('accepts a valid trace_boots row and rejects a bad server/trace_level', () => {
    expect(TraceBoot.safeParse(boot).success).toBe(true);
    expect(TraceBoot.safeParse({ ...boot, server: 'ba' }).success).toBe(false);
    expect(TraceBoot.safeParse({ ...boot, trace_level: 'debug' }).success).toBe(false);
  });

  const span = {
    id: 's',
    boot_id: 'b',
    seq: 1,
    run_id: 'r',
    parent_id: null,
    kind: 'call',
    name: 'navigate',
    status: 'ok',
    started_at: ts,
    ended_at: ts,
    duration_ms: 42,
    attrs_json: {},
    payload_ref: null,
    summary: 'navigated to /oferty',
    decision_id: null,
    tool_use_id: 'tu_1',
    agent_id: 'ag_1',
    rationale: 'checking the listing page loads',
    pw_trace_path: null,
    between_calls: 0,
  };
  it('accepts a valid trace_spans row and rejects a bad kind/status', () => {
    expect(TraceSpan.safeParse(span).success).toBe(true);
    expect(TraceSpan.safeParse({ ...span, kind: 'span' }).success).toBe(false);
    expect(TraceSpan.safeParse({ ...span, status: 'pending' }).success).toBe(false);
  });
  it('requires duration_ms on a completed call/phase span, not on events or running/unfinished spans', () => {
    expect(TraceSpan.safeParse({ ...span, duration_ms: null }).success).toBe(false);
    expect(
      TraceSpan.safeParse({ ...span, kind: 'event', duration_ms: null, ended_at: null }).success,
    ).toBe(true);
    expect(
      TraceSpan.safeParse({ ...span, status: 'running', duration_ms: null, ended_at: null })
        .success,
    ).toBe(true);
    expect(TraceSpan.safeParse({ ...span, status: 'unfinished', duration_ms: null }).success).toBe(
      true,
    );
  });
  it('rejects a rationale over 300 chars', () => {
    expect(TraceSpan.safeParse({ ...span, rationale: 'x'.repeat(301) }).success).toBe(false);
    expect(TraceSpan.safeParse({ ...span, rationale: 'x'.repeat(300) }).success).toBe(true);
  });

  const turn = {
    id: 'at',
    agent_id: 'ag_1',
    agent_type: 'crawler',
    session_id: 'sess_1',
    message_uuid: 'm1',
    block_index: 0,
    api_message_id: 'msg_1',
    run_id: 'r',
    role: 'assistant',
    kind: 'text',
    tool_use_id: null,
    tool_name: null,
    text: 'looking at the listing page',
    payload_ref: null,
    is_error: null,
    model: 'claude-sonnet-5',
    input_tokens: 10,
    output_tokens: 20,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    matched: 0,
    created_at: ts,
    imported_at: ts,
  };
  it('accepts a valid agent_turns row and rejects a bad role/kind', () => {
    expect(AgentTurn.safeParse(turn).success).toBe(true);
    expect(AgentTurn.safeParse({ ...turn, role: 'system' }).success).toBe(false);
    expect(AgentTurn.safeParse({ ...turn, kind: 'audio' }).success).toBe(false);
  });
});

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
