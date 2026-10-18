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

// Spec 036 FR-004 (F-13@034, F-02@036): unread answers do not hold the settle, and a 204 is an
// answer, not a failed request.
gate(
  'SC-21',
  'a page with an unread ping and a 204 beacon settles; both calls recorded, no error',
  async () => {
    const run = await startRun(gs.call, 'scar-maker', 'guest');
    const t = performance.now();
    const p = await scarNav(gs.call, run, '/sc21/');
    expect(performance.now() - t).toBeLessThan(8000);
    const [state] = rows<{ stabilization: string }>(
      gs,
      'SELECT stabilization FROM states WHERE id = ?',
      p.state_id as string,
    );
    expect(state!.stabilization).toBe('settled');
    const calls = rows<{ url_template: string; status: number; console_errors: string }>(
      gs,
      'SELECT url_template, status, console_errors FROM network_calls WHERE run_id = ?',
      run,
    );
    const status = (path: string) => calls.find((c) => c.url_template.includes(path))?.status;
    expect(status('/sc21/ping')).toBe(200);
    expect(status('/sc21/beacon')).toBe(204);
    expect(calls.flatMap((c) => JSON.parse(c.console_errors) as string[]).join('\n')).not.toMatch(
      /beacon failed/,
    );
  },
);
