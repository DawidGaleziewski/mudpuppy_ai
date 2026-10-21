import { join } from 'node:path';
import { loadTraces } from '@pathfinder/config';
import { driveTrace, suggestTraceGrouping } from '@pathfinder/mcp-server';
import { afterAll, beforeAll, expect } from 'vitest';
import {
  gate,
  gateServer,
  REPO,
  resetScars,
  rows,
  SCAR_BASE,
  type GateServer,
} from '../src/index.js';

/**
 * The trace driver (spec 030 R-64) on scar-maker's `traces.yaml`: the three-step application is
 * driven to its success page (happy path) and stopped by a validator (too young), one trace run per
 * variant, the stub skipped; the field could not make the scanner finish a form process.
 */
let gs: GateServer;

beforeAll(async () => {
  await resetScars();
  gs = await gateServer({ portals: ['scar-maker'] });
});
afterAll(async () => {
  await gs?.close();
});

gate('SC-18', 'the trace driver walks every variant of a traces.yaml process', async () => {
  const traces = loadTraces(join(REPO, 'portals', 'scar-maker', 'traces.yaml'));
  const run = { portal: 'scar-maker', persona: 'applicant', baseUrl: `${SCAR_BASE}/` };
  const apply = await driveTrace(
    gs.call,
    run,
    traces.find((t) => t.id === 'apply')!,
  );
  expect(apply.map((r) => [r.variant, r.outcome])).toEqual([
    ['happy-path', 'goal_reached'],
    ['too-young', 'goal_reached'],
  ]);
  const happy = apply[0]!;
  const last = rows<{ url: string }>(
    gs,
    `SELECT pv.url FROM observations pv WHERE pv.run_id = ? ORDER BY pv.created_at DESC, pv.rowid DESC LIMIT 1`,
    happy.runId,
  )[0];
  expect(last?.url).toContain('/sc18/success');
  expect(
    rows(gs, 'SELECT id FROM processes WHERE run_id IN (?, ?)', apply[0]!.runId, apply[1]!.runId),
  ).toHaveLength(2);
  // Spec 031 US5: both variants proposed as one process from the happy path's screens, once.
  const spec = traces.find((t) => t.id === 'apply')!;
  const g = suggestTraceGrouping(
    gs.ctx,
    { portal: 'scar-maker', persona: 'applicant', trace: spec },
    apply,
  );
  expect('suggested' in g && g.suggested.steps.length).toBeGreaterThanOrEqual(2);
  expect('suggested' in g && g.suggested.why).toContain('too-young');
  expect(
    suggestTraceGrouping(
      gs.ctx,
      { portal: 'scar-maker', persona: 'applicant', trace: spec },
      apply,
    ),
  ).toMatchObject({
    skipped: expect.stringContaining('already open') as unknown,
  });
  expect(
    await driveTrace(
      gs.call,
      run,
      traces.find((t) => t.id === 'change-address')!,
    ),
  ).toEqual([]);
});
