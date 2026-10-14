import { describe, expect, it } from 'vitest';
import { evaluate, type EvalRecord, type GroundTruth } from '../src/index.js';

/** `processes_map` (spec 025 FR-005): processes known from map evidence, beside `processes`. */
const gt: GroundTruth = {
  portal_id: 'sample-portal',
  screens: [],
  forms: [],
  rules: [],
  processes: [
    { id: 'P01', first_route: '/a', last_observable_route: '/c', ends_with: 'result' },
    { id: 'P02', first_route: '/a', last_observable_route: '/d', ends_with: 'mutation' },
    { id: 'P03', first_route: '/x', last_observable_route: '/x', ends_with: 'login_wall' },
  ],
  terms: [],
};

const proc = (
  key: string,
  extent: string,
  evidence: EvalRecord['evidence'],
  over: Partial<EvalRecord> = {},
): EvalRecord => ({
  key,
  kind: 'process',
  rev: 1,
  confidence: 'observed',
  not_observable: false,
  content: { kind: 'process', title: key, observed_extent: extent },
  evidence,
  ...over,
});
const edge = (id: string, from: string, to: string) => ({
  target_kind: 'edge' as const,
  target_id: id,
  routes: [from, to],
});
const run = (records: EvalRecord[], groundTruth = gt) =>
  evaluate({ portal_id: 'sample-portal', as_of: '2026-10-14T00:00:00.000Z', groundTruth, records });

describe('processes_map (spec 025 FR-005)', () => {
  it('a map-only process whose edges cover the first and last routes matches; processes stays 0', () => {
    const r = run([
      proc('PROC-001', 'map_only', [edge('e1', '/a', '/b'), edge('e2', '/b', '/c')]),
      proc('PROC-002', 'map_only', [edge('e3', '/a', '/b')]),
    ]);
    expect(r.scores.processes.matched).toBe(0);
    // P01 covered by its edges; P02 lacks its last route; P03's route is never cited.
    expect(r.scores.processes_map).toMatchObject({
      matched: 1,
      total: 3,
      missing: ['P02', 'P03'],
      matches: { P01: ['PROC-001'] },
    });
  });

  it('whatever processes matches counts too (a trace, or a flag at a login wall)', () => {
    const r = run([
      proc('PROC-001', 'full', [
        { target_kind: 'process', target_id: 'p1', routes: ['/a', '/b', '/c'] },
      ]),
      proc('PROC-003', 'map_only', [{ target_kind: 'state', target_id: 's', routes: ['/x'] }], {
        confidence: 'needs_confirmation',
        not_observable: true,
      }),
    ]);
    expect(r.scores.processes.matched).toBe(2);
    expect(r.scores.processes_map).toMatchObject({ matched: 2, missing: ['P02'] });
  });

  it('is not scored for a ground truth without processes', () => {
    expect(run([], { ...gt, processes: [] }).scores.processes_map).toBeUndefined();
  });
});
