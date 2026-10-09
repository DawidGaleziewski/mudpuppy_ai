import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect } from 'vitest';
import { unzip } from '@pathfinder/core';
import {
  everythingStored,
  traceFiles,
  gate,
  gateServer,
  GATE_SESSION_TIMEOUT_S,
  nav,
  resetEstate,
  startRun,
  type GateServer,
} from '../src/index.js';
import { FIXTURE_PASSWORD } from '../src/paths.js';

/** Logged-in crawling and bot checks (spec 009 R-26): LO-30, LO-31, LO-32, LO-37. */
let gs: GateServer;
beforeEach(async () => {
  await resetEstate();
  gs = await gateServer();
});
afterEach(() => gs.close());

const decisions = (rule: string) =>
  gs.ctx.raw.prepare('SELECT reason, detail_json FROM decision_log WHERE rule = ?').all(rule) as {
    reason: string;
    detail_json: string | null;
  }[];

gate(
  'LO-30',
  'logs in from the vault; the password reaches no store, file or tool result',
  async () => {
    const run = await startRun(gs.call, 'proving-ground-bank', 'client');
    await nav(gs.call, run, '/bank');
    const login = await gs.call('login', { run_id: run, rationale: 'log in as the client' });
    expect(login.isError).toBe(false);
    expect(login.body.outcome).toBe('logged_in');
    expect(JSON.stringify(login.body)).not.toContain(FIXTURE_PASSWORD);
    const pulpit = await nav(gs.call, run, '/bank/pulpit');
    expect(pulpit.title).toContain('Pulpit');
    await nav(gs.call, run, '/bank/przelew');
    expect(decisions('login')[0]!.reason).toBe('logged in with vault credentials');
    // FR-019a: the trace is recorded, split around the login, and readable
    expect(decisions('pw_trace:login_masked')).toHaveLength(1);
    const traces = traceFiles(gs);
    expect(traces.some((f) => f.endsWith('-login.before-login.zip'))).toBe(true);
    expect(traces.some((f) => f.endsWith('-login.zip'))).toBe(true);
    const inTraces = traces
      .flatMap((f) => [...unzip(readFileSync(f)).values()])
      .map((b) => b.toString('latin1'))
      .join('');
    expect(inTraces).toContain('Pulpit');
    // SC-003: the password is nowhere, trace contents included (the vault's own table holds
    // ciphertext only)
    expect(everythingStored(gs)).not.toContain(FIXTURE_PASSWORD);
  },
);

gate(
  'LO-30',
  'a persona whose refs are not in the vault is refused before any browser opens',
  async () => {
    await gs.ctx.db.deleteFrom('credentials').where('ref_name', '=', 'PG_BANK_PASSWORD').execute();
    const r = await gs.call('start_run', {
      portal_id: 'proving-ground-bank',
      persona_id: 'client',
    });
    expect(r.isError).toBe(true);
    expect(r.body.error.code).toBe('CONFIG_INVALID');
    expect(r.body.error.message).toContain('PG_BANK_PASSWORD');
    expect(gs.ctx.raw.prepare('SELECT count(*) AS n FROM runs').get()).toEqual({ n: 0 });
  },
);

gate('LO-30', 'a guest cannot log in', async () => {
  const run = await startRun(gs.call, 'proving-ground-bank', 'guest');
  await nav(gs.call, run, '/bank');
  const r = await gs.call('login', { run_id: run, rationale: 'try' });
  expect(r.isError).toBe(true);
  expect(r.body.error.code).toBe('LOGIN_NOT_CONFIGURED');
});

gate('LO-31', 'a rejected login is tried once per run (lockout guard)', async () => {
  await gs.ctx.db
    .updateTable('credentials')
    .set({ updated_at: 'x' })
    .where('ref_name', '=', 'PG_BANK_PASSWORD')
    .execute();
  // store a wrong password through the vault itself
  const { createVaultStore, loadKey } = await import('@pathfinder/vault');
  await createVaultStore(gs.ctx.db, loadKey({ path: gs.ctx.vaultKeyPath! })).set(
    'proving-ground-bank',
    'sandbox',
    'PG_BANK_PASSWORD',
    'wrong-password-not-real',
  );
  const run = await startRun(gs.call, 'proving-ground-bank', 'client');
  await nav(gs.call, run, '/bank');
  const first = await gs.call('login', { run_id: run, rationale: 'log in' });
  expect(first.body.outcome).toBe('failed');
  expect(first.body.reason).toBe('rejected');
  const second = await gs.call('login', { run_id: run, rationale: 'try again' });
  expect(second.body.error.code).toBe('LOGIN_BLOCKED');
  // the rejected form kept the typed values: they are cleared before the trace goes on (FR-019a)
  await nav(gs.call, run, '/bank/kursy');
  expect(traceFiles(gs).length).toBeGreaterThan(0);
  expect(everythingStored(gs)).not.toContain('wrong-password-not-real');
  // the estate saw exactly one failure for the user (no lockout after a run)
  const fresh = await gateServer();
  try {
    const ok = await startRun(fresh.call, 'proving-ground-bank', 'client');
    await nav(fresh.call, ok, '/bank');
    expect((await fresh.call('login', { run_id: ok, rationale: 'log in' })).body.outcome).toBe(
      'logged_in',
    );
  } finally {
    await fresh.close();
  }
});

gate(
  'LO-32',
  'an expired session is re-logged in once and the call returns the target page',
  async () => {
    const run = await startRun(gs.call, 'proving-ground-bank', 'client');
    await nav(gs.call, run, '/bank');
    expect((await gs.call('login', { run_id: run, rationale: 'log in' })).body.outcome).toBe(
      'logged_in',
    );
    await new Promise((r) => setTimeout(r, (GATE_SESSION_TIMEOUT_S + 1) * 1000));
    const page = await nav(gs.call, run, '/bank/wyciagi?miesiac=2026-02');
    expect(page.relogged_in).toBe(true);
    expect(page.title).toContain('Wyciągi');
    const relogins = decisions('relogin');
    expect(relogins).toHaveLength(1);
    expect(relogins[0]!.reason).toContain('logged in again');
    // the server's own login pages (explicit and re-login) are never recorded states of the run
    const routes = (
      gs.ctx.raw.prepare('SELECT route_template FROM states').all() as { route_template: string }[]
    ).map((s) => s.route_template);
    expect(routes.filter((r) => r.startsWith('/logowanie'))).toEqual([]);
  },
  { timeout: 90_000, slow: true },
);

gate('LO-37', 'a CAPTCHA off production is handed to a human and the crawl goes on', async () => {
  const run = await startRun(gs.call, 'proving-ground-shop', 'guest');
  await nav(gs.call, run, '/sklep');
  const checkout = await nav(gs.call, run, '/sklep/zamowienie');
  expect(checkout.state_id).toBeTruthy();
  const q = gs.ctx.raw
    .prepare("SELECT text FROM open_questions WHERE text LIKE 'Human needed: CAPTCHA%'")
    .all() as { text: string }[];
  expect(q).toHaveLength(1);
  expect(q[0]!.text).toContain('/sklep/zamowienie');
  expect(decisions('handoff:captcha')).toHaveLength(1);
  // spec 015 FR-004: the widget frame is recorded by URL, not read, and yields no action
  const comp = JSON.parse(
    (
      gs.ctx.raw
        .prepare('SELECT composition_json FROM state_observations WHERE state_id = ?')
        .get(checkout.state_id) as { composition_json: string }
    ).composition_json,
  ) as { frames: { path: string; url: string; origin: string; observed: boolean }[] };
  // The widget request is blocked by the request gate, so its frame ends on a browser error page
  // (url chrome-error://...) whose origin falls back to the portal's: it counts as "observed"
  // (finding, see the report). The invariant that holds: no action lives in a frame that is not a
  // portal document.
  const widget = comp.frames.filter((f) => !f.observed || !/^https?:/.test(f.url));
  expect(comp.frames.length, JSON.stringify(comp)).toBeGreaterThan(0);
  const framed = gs.ctx.raw
    .prepare(
      "SELECT json_extract(action_json, '$.frame') AS frame FROM actions WHERE state_id = ? AND json_extract(action_json, '$.frame') IS NOT NULL",
    )
    .all(checkout.state_id) as { frame: string }[];
  for (const a of framed)
    expect(widget.some((w) => a.frame === w.path || a.frame.startsWith(`${w.path}/`))).toBe(false);
  // the run is still running: the next page works
  const next = await nav(gs.call, run, '/sklep/koszyk');
  expect(next.state_id).toBeTruthy();
  const run_ = gs.ctx.raw.prepare('SELECT status FROM runs WHERE id = ?').get(run) as {
    status: string;
  };
  expect(run_.status).toBe('running');
});
