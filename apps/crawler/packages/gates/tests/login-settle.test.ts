import { afterAll, beforeAll, expect } from 'vitest';
import {
  gate,
  gateServer,
  nav,
  resetEstate,
  rows,
  startRun,
  type GateServer,
} from '../src/index.js';

/**
 * Spec 030 F-08 / spec 031 T006: a login change once typed into the bank's login shell before it
 * had settled, and every later logged-in page then waited out the mount wait of its real
 * micro-frontends (~5 s more per page; LO-30 went over its budget). The signal: after login the
 * only mount that times out is the cookie banner's, which stays empty on purpose once consent is
 * given (spec 031 F-03), and it is given up after the quiet limit, not the 10 s mount limit (the
 * shared wait, spec 031 US1). Page times are printed.
 */
const BANK = 'proving-ground-bank';
const PAGES = ['/bank/pulpit', '/bank/przelew', '/bank/kursy'];
/** The cookie banner's mount: empty after consent, so waiting for it is never useful. */
const EMPTY_BY_DESIGN = '[data-mfe="cookies"]';
/**
 * Per page: the bank's pages took ~11 s while the empty mount was waited out (spec 030 F-08); with
 * the 3 s quiet limit about 4 s, so 8 s leaves room for a loaded machine and catches the 10 s wait.
 */
const PAGE_CAP_MS = 8_000;
/** The empty mount's wait: the quiet limit (3 s) plus polling, well under the 10 s mount limit. */
const EMPTY_WAIT_CAP_MS = 6_000;

let gs: GateServer;
beforeAll(async () => {
  await resetEstate();
  gs = await gateServer();
});
afterAll(() => gs.close());

gate(
  'F-08@030',
  'after login only the empty-by-design cookie mount waits out the mount wait',
  async () => {
    const run = await startRun(gs.call, BANK, 'client');
    await nav(gs.call, run, '/bank');
    const login = await gs.call('login', { run_id: run, rationale: 'log in as the client' });
    expect(login.body.outcome).toBe('logged_in');
    const spentMs: number[] = [];
    for (const path of PAGES) {
      const t = Date.now();
      await nav(gs.call, run, path);
      spentMs.push(Date.now() - t);
    }
    console.log(
      `F-08@030 page times after login: ${PAGES.map((p, i) => `${p} ${String(spentMs[i])} ms`).join(', ')}`,
    );
    const timeouts = rows<{ attrs_json: string }>(
      gs,
      "SELECT attrs_json FROM trace_spans WHERE kind = 'event' AND name = 'mfe_mount_timeout'",
    );
    const events = timeouts.map(
      (t) => JSON.parse(t.attrs_json) as { selector: string; waited_ms: number },
    );
    expect(events.filter((e) => e.selector !== EMPTY_BY_DESIGN)).toEqual([]);
    expect(events.filter((e) => e.waited_ms >= EMPTY_WAIT_CAP_MS)).toEqual([]);
    expect(Math.max(...spentMs)).toBeLessThan(PAGE_CAP_MS);
  },
  { timeout: 180_000 },
);
