import { describe, expect, it } from 'vitest';
import { Edge, RuleCandidate, Run, State, minSafetyClass } from '../src/index.js';

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
