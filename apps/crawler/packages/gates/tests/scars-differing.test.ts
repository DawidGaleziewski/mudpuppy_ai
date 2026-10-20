import { differingStates } from '@pathfinder/mcp-server';
import { afterAll, beforeAll, expect } from 'vitest';
import {
  actOn,
  gate,
  gateServer,
  markForProbing,
  resetScars,
  scarNav,
  startRun,
  type GateServer,
} from '../src/index.js';

/**
 * Differing states (spec 033 US3, SC-005): the same button of SC-20 led to the offer in one scan
 * and to the sold-out page in the next, so the two outcomes are one action group with their scans;
 * SC-19's form steps and the validation states its probes made are explained, so no group.
 */
const PORTAL = 'scar-maker';
let gs: GateServer;

beforeAll(async () => {
  await resetScars();
  gs = await gateServer({ portals: [PORTAL] });
});
afterAll(async () => {
  await gs?.close();
});

const groups = () => differingStates({ raw: gs.ctx.raw } as never, PORTAL);

gate('SC-20', 'one button, two pages in two scans: one differing-states group', async () => {
  for (const scan of [1, 2]) {
    const run = await startRun(gs.call, PORTAL, 'quote-tester');
    const home = await scarNav(gs.call, run, '/sc20/');
    await actOn(gs.call, run, home, 'See the offer', { intent: `scan ${scan}` });
  }
  const offer = groups().find((g) => g.key.endsWith(':button:See the offer'));
  expect(offer?.kind).toBe('action');
  const byRoute = Object.fromEntries(offer!.outcomes.map((o) => [o.route, o]));
  expect(Object.keys(byRoute).sort()).toEqual(['/sc20/offer', '/sc20/sold-out']);
  expect(byRoute['/sc20/offer']!.frequency).toEqual({ seen: 1, of: 2 });
  expect(byRoute['/sc20/sold-out']!.scans).toHaveLength(1);
});

gate('SC-20', 'form steps and probe outcomes make no group (no false groups)', async () => {
  const map = await startRun(gs.call, PORTAL, 'quote-tester');
  const step1 = await scarNav(gs.call, map, '/sc19/apply');
  await actOn(gs.call, map, step1, 'Next', { intent: 'go to step 2' });
  markForProbing(gs, PORTAL, step1.route_template as string);
  const probe = await startRun(gs.call, PORTAL, 'quote-tester', { form_probing: true });
  const page = await scarNav(gs.call, probe, '/sc19/apply');
  await gs.call('probe_form', {
    run_id: probe,
    action_id: (page.actions as { accessible_name: string; action_id: string }[]).find(
      (a) => a.accessible_name === 'Next',
    )!.action_id,
    probes: ['validation'],
    rationale: 'gate: probe outcomes are explained',
  });
  const touching = groups().filter(
    (g) => g.point.route.startsWith('/sc19') || g.outcomes.some((o) => o.route.startsWith('/sc19')),
  );
  expect(touching).toEqual([]);
});
