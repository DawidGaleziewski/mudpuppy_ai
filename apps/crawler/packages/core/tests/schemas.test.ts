import { describe, expect, it } from 'vitest';
import {
  DecisionKind,
  DecisionLogEntry,
  Edge,
  FrontierStatus,
  PortalDataLog,
  RobotsPolicy,
  RuleCandidate,
  Run,
  RunMode,
  State,
  minSafetyClass,
} from '../src/index.js';

// Trace, documentation and chat schema cases moved with their schemas (spec 012 move-map.md).

const ts = '2026-01-01T00:00:00.000Z';

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
    screen_id: null,
    screen_rev: null,
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
      owner_id: null,
      owner_pid: null,
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

describe('run mode (R-14)', () => {
  it('accepts trace as a run mode', () => {
    expect(RunMode.options).toEqual(['map', 'trace']);
  });
});
