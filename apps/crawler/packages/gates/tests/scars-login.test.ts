import { afterAll, beforeAll, expect } from 'vitest';
import {
  gate,
  gateServer,
  lastVisit,
  resetScars,
  SCAR_BASE,
  startRun,
  type GateServer,
} from '../src/index.js';

/**
 * Login scars (spec 030 R-62): framework-bound inputs (SC-14), a form that renders late (SC-15) and
 * a slow multi-hop login across two hosts (SC-16). Each has its own portal file (one login block
 * per portal) on the same scar-maker; the fixture user is in the gate vault.
 */
let gs: GateServer;

beforeAll(async () => {
  await resetScars();
  gs = await gateServer({ portals: ['scar-maker-bound', 'scar-maker-slow', 'scar-maker-sso'] });
});
afterAll(async () => {
  await gs?.close();
});

async function login(portal: string) {
  const run = await startRun(gs.call, portal, 'tester');
  const r = await gs.call('login', { run_id: run, rationale: 'gate step' });
  return { run, r };
}

gate('SC-14', 'a framework-bound login form accepts the filled values', async () => {
  const { r } = await login('scar-maker-bound');
  expect(r.body).toMatchObject({ outcome: 'logged_in' });
});

gate(
  'SC-15',
  'a login form that renders after ~300 chunk scripts is waited for',
  async () => {
    const { r } = await login('scar-maker-slow');
    expect(r.body).toMatchObject({ outcome: 'logged_in' });
  },
  { timeout: 120_000 },
);

gate(
  'SC-16',
  'a slow multi-hop login through a second host lands logged in',
  async () => {
    const { r } = await login('scar-maker-sso');
    expect(r.body).toMatchObject({ outcome: 'logged_in' });
    expect(lastVisit(gs, r.body.state_id as string).url).toBe(`${SCAR_BASE}/sc16/dashboard`);
  },
  { timeout: 120_000 },
);
