import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join, resolve } from 'node:path';
import { migrateUp, openDb, type OpenedDb } from '@pathfinder/store';
import {
  ScopeRefusal,
  listProcessCandidates,
  requestDocumentation,
  setProcessScope,
} from '../src/scope.js';

const repo = resolve(import.meta.dirname, '../../..');
const P = 'reference-insurer';
const CONV = '0199a000-0000-7000-8000-000000000001';
const T = '2026-10-05T20:00:00.000Z';
let opened: OpenedDb;

function seed(raw: OpenedDb['raw']): void {
  raw
    .prepare(
      `INSERT INTO chat_conversations (id, portal_id, goal, created_at, updated_at) VALUES (?, ?, 'g', ?, ?)`,
    )
    .run(CONV, P, T, T);
  const run = raw.prepare(
    `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport, locale, browser, config_snapshot, status, started_at)
     VALUES (?, ?, 'guest', ?, 'sandbox', '2026-10-05', '1366x768', 'pl-PL', 'chromium', '{}', 'completed', ?)`,
  );
  run.run('run-map', P, 'map', T);
  run.run('run-trace', P, 'trace', T);
  const state = raw.prepare(
    `INSERT INTO states (id, portal_id, fingerprint, cluster_id, route_template, title, evidence_ref, confidence, stabilization, first_seen_run, created_at)
     VALUES (?, ?, ?, 'c', ?, ?, 'ev', 'observed', 'settled', 'run-map', ?)`,
  );
  state.run('s-home', P, 'fp1', '/', 'Strona główna', T);
  state.run(
    's-car',
    P,
    'fp2',
    '/ubezpieczenie-samochodu',
    'Ubezpieczenie samochodu — kalkulator',
    T,
  );
  state.run('s-quote', P, 'fp3', '/ubezpieczenie-samochodu/oferta', 'Oferta OC/AC', T);
  state.run('s-house', P, 'fp4', '/dom', 'Ubezpieczenie domu', T);
  raw
    .prepare(
      `INSERT INTO processes (id, run_id, portal_id, persona_id, name, goal, status, outcome, created_at)
       VALUES ('proc-1', 'run-trace', ?, 'guest', 'Car insurance quote', 'get a car quote', 'recorded', 'goal_reached', ?)`,
    )
    .run(P, T);
  const step = raw.prepare(
    `INSERT INTO process_steps (id, process_id, ord, intent, kind, state_before, state_after, outcomes_json, evidence_ref, confidence, created_at)
     VALUES (?, 'proc-1', ?, 'x', 'click', ?, ?, '[]', 'ev', 'observed', ?)`,
  );
  step.run('ps1', 1, 's-home', 's-car', T);
  step.run('ps2', 2, 's-car', 's-quote', T);
}

beforeEach(() => {
  opened = openDb(':memory:');
  migrateUp(opened.raw, join(repo, 'data', 'migrations'));
  seed(opened.raw);
});
afterEach(async () => {
  await opened.close();
});

describe('listProcessCandidates', () => {
  it('ranks the traced process first with its start, end and states', () => {
    const { candidates, hint } = listProcessCandidates(opened.raw, P, 'car insurance quote');
    expect(hint).toBeNull();
    expect(candidates[0]).toMatchObject({
      source: 'traced_process',
      name: 'Car insurance quote',
      startStateId: 's-home',
      endStateId: 's-quote',
    });
    expect(candidates[0]?.states.map((s) => s.id)).toEqual(['s-home', 's-car', 's-quote']);
  });

  it('matches screens by title in the portal language', () => {
    const { candidates } = listProcessCandidates(opened.raw, P, 'ubezpieczenie domu');
    const screens = candidates.find((c) => c.source === 'matching_states');
    expect(screens?.states.map((s) => s.id)).toContain('s-house');
  });

  it('says so instead of inventing when nothing matches', () => {
    const { candidates, hint } = listProcessCandidates(opened.raw, P, 'mortgage refinancing');
    expect(candidates).toEqual([]);
    expect(hint).toContain('offer a trace');
  });

  it('asks for a scan first on an unmapped portal', () => {
    expect(listProcessCandidates(opened.raw, 'other', 'car').hint).toContain('scan it first');
  });
});

describe('setProcessScope and requestDocumentation', () => {
  it('stores the confirmed scope, marks narrow done and hands a scoped job to the ba agent', () => {
    const scope = setProcessScope(opened.raw, repo, CONV, {
      portal: P,
      process_name: 'Car insurance quote',
      persona: 'guest',
      start_state_id: 's-home',
      end_state_id: 's-quote',
      selected_state_ids: ['s-car'],
      comments: { 's-car': 'the calculator page' },
    });
    expect(scope.selected_state_ids).toEqual(['s-home', 's-car', 's-quote']);
    const narrow = opened.raw
      .prepare(`SELECT status FROM workflow_steps WHERE conversation_id = ? AND step = 'narrow'`)
      .get(CONV);
    expect(narrow).toEqual({ status: 'done' });

    const job = requestDocumentation(opened.raw, CONV, P, scope.id);
    expect(job.handoff.agent).toBe('ba');
    expect(job.handoff.prompt).toContain('States in scope: s-home, s-car, s-quote');
    expect(job.handoff.prompt).toContain('- s-car: the calculator page');
    const doc = opened.raw
      .prepare(`SELECT status FROM workflow_steps WHERE conversation_id = ? AND step = 'document'`)
      .get(CONV);
    expect(doc).toEqual({ status: 'pending' });
  });

  it('a saved scope is a BA process; saving the same name again re-cuts its as-is as r2 (spec 022 T035)', () => {
    const base = {
      portal: P,
      process_name: 'Car insurance quote',
      persona: 'guest',
      start_state_id: 's-home',
      end_state_id: 's-quote',
    };
    setProcessScope(opened.raw, repo, CONV, { ...base, selected_state_ids: ['s-car'] });
    const steps = (rev: number) =>
      (
        JSON.parse(
          (
            opened.raw
              .prepare(
                `SELECT r.steps FROM process_model_revisions r JOIN process_models v ON v.id = r.model_id
                 JOIN ba_processes p ON p.id = v.process_id WHERE p.name = ? AND v.label = 'A' AND r.rev = ?`,
              )
              .get(base.process_name, rev) as { steps: string }
          ).steps,
        ) as { state_id: string }[]
      ).map((s) => s.state_id);
    expect(opened.raw.prepare('SELECT key, source, stage FROM ba_processes').all()).toEqual([
      { key: 'PRC-001', source: 'scope', stage: 'scoped' },
    ]);
    expect(steps(1)).toEqual(['s-home', 's-car', 's-quote']);
    setProcessScope(opened.raw, repo, CONV, { ...base, selected_state_ids: [] });
    expect(steps(2)).toEqual(['s-home', 's-quote']);
    expect(steps(1)).toEqual(['s-home', 's-car', 's-quote']);
    expect(opened.raw.prepare('SELECT count(*) AS n FROM ba_processes').get()).toEqual({ n: 1 });
  });

  it('refuses unknown states, foreign-portal states, comments off the selection and missing personas', () => {
    let error: unknown;
    try {
      setProcessScope(opened.raw, repo, CONV, {
        portal: P,
        process_name: 'x',
        persona: 'nobody',
        start_state_id: 's-home',
        end_state_id: 'ghost',
        comments: { 's-house': 'not selected' },
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ScopeRefusal);
    expect((error as ScopeRefusal).details).toEqual([
      'persona nobody',
      'state ghost of reference-insurer',
      'comment on state s-house, which is not selected',
    ]);
  });

  it('refuses documentation for an unknown scope', () => {
    expect(() => requestDocumentation(opened.raw, CONV, P, 'nope')).toThrow(ScopeRefusal);
  });
});
