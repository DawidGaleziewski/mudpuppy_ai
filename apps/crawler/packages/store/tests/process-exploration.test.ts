import { describe, expect, it } from 'vitest';
import {
  explorationPlan,
  reconcilePortalModel,
  recordExploration,
  unexploredProcesses,
} from '../src/index.js';
import { seedProcess } from './seed-process.js';
import { SUBMIT, T } from './seed-threshold.js';

// Spec 039 T075 (design § 14.2): a pass of the stopping rule over a process, and priority 6.

describe('process exploration (T075)', () => {
  it('plans the random walks from a recorded way in, then counts the process explored', async () => {
    const o = seedProcess();
    reconcilePortalModel(o.raw, 'ins', { now: T(500) });
    const plan = explorationPlan(o.raw, 'ins', 'PRC-001', { walks: 3, walkLength: 4, seed: 1 })!;
    // The guests pressed "Oblicz składkę" already (depth 1); the price page has no actions (depth 2).
    expect(plan.gaps).toEqual({ depth1: [], depth2: [] });
    expect(plan.unreachable).toEqual([]);
    expect(plan.replays).toHaveLength(3);
    expect(plan.replays[0]).toMatchObject({
      kind: 'walk',
      persona: 'guest',
      environment: 'sandbox',
      startUrl: 'https://ins.test/kalkulator/kierowca',
      steps: [SUBMIT],
    });

    expect(unexploredProcesses(o.raw, 'ins')).toEqual(['PRC-001']);
    const epochs: string[] = [];
    recordExploration(o.raw, plan.processId, {
      epochs,
      depth: 2,
      randomWalks: 3,
      newDeviations: 1,
    });
    expect(unexploredProcesses(o.raw, 'ins')).toEqual(['PRC-001']); // a counterexample: not yet
    recordExploration(o.raw, plan.processId, {
      epochs,
      depth: 2,
      randomWalks: 3,
      newDeviations: 0,
    });
    expect(unexploredProcesses(o.raw, 'ins')).toEqual([]);
    expect(explorationPlan(o.raw, 'ins', 'PRC-404')).toBeNull();
    await o.close();
  });

  it('lists a class nobody pressed yet as a depth 1 gap', async () => {
    const o = seedProcess();
    reconcilePortalModel(o.raw, 'ins', { now: T(500) });
    // An agent persona reached the calculator form once and pressed nothing.
    const r = o.raw;
    r.prepare(
      `INSERT INTO runs (id, portal_id, persona_id, mode, environment, env_version_or_date, viewport, locale,
         browser, config_snapshot, status, started_at) VALUES ('run2', 'ins', 'agent', 'map', 'sandbox',
         '2026-10-19', '1280x800', 'pl-PL', 'chromium', '{}', 'completed', ?)`,
    ).run(T(600));
    r.prepare(
      "INSERT INTO journeys (id, run_id, start_kind, started_at) VALUES ('ja', 'run2', 'entry_url', ?)",
    ).run(T(600));
    r.prepare(
      `INSERT INTO observations (id, run_id, state_id, transition_id, via, url, hops_json, created_at,
         journey_id, seq, result, context_key, flags_json) VALUES ('va1', 'run2', 'form', NULL, 'navigate',
         'https://ins.test/kalkulator/kierowca', '[]', ?, 'ja', 1, 'ok', ?, '{}')`,
    ).run(T(600), 'x'.repeat(64));
    const plan = explorationPlan(o.raw, 'ins', 'PRC-001', { walks: 0 })!;
    expect(plan.gaps.depth1).toHaveLength(1);
    expect(plan.gaps.depth1[0]!.startsWith('agent\u0000')).toBe(true);
    expect(plan.replays).toEqual([
      expect.objectContaining({ kind: 'depth1', persona: 'agent', steps: [SUBMIT] }),
    ]);
    await o.close();
  });
});
