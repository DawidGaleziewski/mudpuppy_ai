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
  gs = await gateServer({
    portals: ['scar-maker-bound', 'scar-maker-slow', 'scar-maker-sso', 'scar-maker-sso-url'],
  });
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

/** A hop as the landing visit stores it, with the transit marks of spec 037. */
interface Hop {
  url: string;
  kind: string;
  transit?: true;
  title?: string;
  evidence_ref?: string;
  screenshot_ref?: string;
}

gate(
  'SC-16',
  'a focused run logs in through the provider its focus fences out, and keeps the provider pages as transit',
  async () => {
    // Only the dashboard and messages on the portal host: the login page, the provider's host and
    // the callback are all outside the focus (field SQ-5: "scan from a point starts over").
    const run = await startRun(gs.call, 'scar-maker-sso', 'tester', {
      focus: {
        start_url: `${SCAR_BASE}/sc16/dashboard`,
        only_domains: ['127.0.0.1'],
        only_paths: ['/sc16/dashboard*', '/sc16/messages*'],
      },
    });
    const r = await gs.call('login', { run_id: run, rationale: 'gate step' });
    expect(r.body).toMatchObject({ outcome: 'logged_in', transit_hosts: ['127.0.0.2'] });
    const visit = lastVisit(gs, r.body.state_id as string);
    expect(visit.url).toBe(`${SCAR_BASE}/sc16/dashboard`);
    const hops = visit.hops as Hop[];
    const kept = hops.filter((h) => h.transit && h.evidence_ref);
    expect(kept.map((h) => new URL(h.url).pathname)).toEqual(
      expect.arrayContaining(['/sc16/idp/authorize', '/sc16/idp/check']),
    );
    for (const h of kept) expect(h.title?.length).toBeGreaterThan(0);
    // Transit pages are not screens: no state was recorded on the provider's host.
    const onIdp = gs.ctx.raw
      .prepare(
        `SELECT count(*) AS n FROM observations WHERE run_id = ? AND url LIKE '%/sc16/idp/%'`,
      )
      .get(run) as { n: number };
    expect(onIdp.n).toBe(0);
    // Outside the login the focus holds again.
    const after = await gs.call('navigate', {
      run_id: run,
      url: `${SCAR_BASE}/sc16/`,
      rationale: 'gate: outside the focus',
    });
    expect(after.isError).toBe(true);
  },
  { timeout: 120_000 },
);

gate(
  'SC-16',
  'a URL-only success sign waits until the browser has left the provider',
  async () => {
    const { r } = await login('scar-maker-sso-url');
    expect(r.body).toMatchObject({ outcome: 'logged_in' });
    expect(lastVisit(gs, r.body.state_id as string).url).toBe(`${SCAR_BASE}/sc16/dashboard`);
  },
  { timeout: 120_000 },
);
