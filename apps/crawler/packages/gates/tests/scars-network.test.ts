import { afterAll, beforeAll, expect } from 'vitest';
import {
  gate,
  gateServer,
  rows,
  SCAR_BASE,
  scarNav,
  snapshot,
  startRun,
  type GateServer,
} from '../src/index.js';

/**
 * Corporate network scars (spec 030 R-63): a portal that admits only the proxy's egress (SC-13).
 * Without `network.proxy` the run stops on the 403 page; with it the pages are recorded.
 */
let gs: GateServer;

beforeAll(async () => {
  gs = await gateServer({ portals: ['scar-maker', 'scar-maker-proxy'] });
});
afterAll(async () => {
  await gs?.close();
});

const runStatus = (run: string) =>
  rows<{ status: string }>(gs, 'SELECT status FROM runs WHERE id = ?', run)[0]!.status;

gate('SC-13', 'network.proxy reaches a portal that admits only the proxy egress', async () => {
  const direct = await startRun(gs.call, 'scar-maker', 'guest');
  await gs.call('navigate', { run_id: direct, url: `${SCAR_BASE}/sc13/`, rationale: 'gate step' });
  expect(runStatus(direct)).not.toBe('running');

  const proxied = await startRun(gs.call, 'scar-maker-proxy', 'guest');
  const p = await scarNav(gs.call, proxied, '/sc13/');
  expect(snapshot(gs, p.state_id as string)).toContain(
    'Reachable through the corporate proxy only',
  );
  expect(runStatus(proxied)).toBe('running');
});
