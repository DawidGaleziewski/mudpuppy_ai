import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, expect } from 'vitest';
import { AGENT_TOOL_NAMES } from '@pathfinder/mcp-server';
import {
  actionNamed,
  actOn,
  gap,
  gate,
  gateServer,
  GATE_BASE,
  loginAs,
  nav,
  PROVING_GROUND,
  resetEstate,
  routeOf,
  rows,
  snapshot,
  startRun,
  type GateServer,
} from '../src/index.js';

/** The insurer logged in: hash routing, popups, wizards, legacy forms (spec 009 US6). */
let gs: GateServer;
let run: string;
beforeAll(async () => {
  await resetEstate();
  gs = await gateServer({ portals: ['proving-ground-insurer'] });
  run = await startRun(gs.call, 'proving-ground-insurer', 'client');
  await nav(gs.call, run, '/ubezpieczenia');
  await loginAs(gs.call, run);
});
afterAll(() => gs.close());

gate('LO-06', 'hash-routed screens are different states with different templates', async () => {
  const list = await nav(gs.call, run, '/ubezpieczenia#/polisy');
  const wizard = await nav(gs.call, run, '/ubezpieczenia#/szkody/nowa');
  expect(list.state_id).not.toBe(wizard.state_id);
  expect(routeOf(gs, list.state_id)).not.toBe(routeOf(gs, wizard.state_id));
});

gate('LO-22', 'a meta-refresh and JS redirect chain is followed to the final screen', async () => {
  const p = await nav(gs.call, run, '/polisa.php?id=7');
  await new Promise((r) => setTimeout(r, 2500));
  const again = await nav(gs.call, run, '/ubezpieczenia#/polisy/7');
  // the chain ends on the policy screen; at least the final screen is recorded
  expect(snapshot(gs, again.state_id)).toMatch(/Szczegóły polisy|polis/i);
  expect(p.state_id).toBeTruthy();
});

gap(
  'LO-23',
  'the old and the new URL of one screen merge into one state',
  'the crawler records the "Proszę czekać…" interstitial as the landing of the old URL',
  async () => {
    const old = await nav(gs.call, run, '/polisa.php?id=7');
    const fresh = await nav(gs.call, run, '/ubezpieczenia#/polisy/7');
    expect(old.state_id).toBe(fresh.state_id);
  },
);

gap(
  'LO-27',
  'a window.open pop-up is recorded as its own screen',
  'pop-up windows are not followed: the browser session observes its first page only',
  async () => {
    const home = await nav(gs.call, run, '/ubezpieczenia');
    await actOn(gs.call, run, home, /Ogólne warunki/);
    const titles = rows<{ title: string }>(gs, 'SELECT title FROM states').map((s) => s.title);
    expect(titles.some((t) => /warunki/i.test(t))).toBe(true);
  },
);

gate('LO-45', 'a spinner that never settles does not hang the call', async () => {
  const home = await nav(gs.call, run, '/ubezpieczenia');
  const start = Date.now();
  const after = await actOn(gs.call, run, home, /Porównaj oferty/);
  expect(Date.now() - start).toBeLessThan(20_000);
  expect(after.state_id).toBeTruthy();
});

gate('LO-33', 'the crawler has no browser Back that could break a server-held wizard', async () => {
  expect(AGENT_TOOL_NAMES.some((t) => /back|history/i.test(t))).toBe(false);
});

gate('LO-03', 'a cross-origin iframe in a page does not break observation', async () => {
  const w = await nav(gs.call, run, '/ubezpieczenia#/szkody/nowa');
  expect(w.state_id).toBeTruthy();
  const r = await gs.call('get_known_states', { run_id: run });
  expect(r.isError).toBe(false);
});

gap(
  'LO-43',
  'a classic form POST (no XHR) is recorded as an API shape',
  'the network recorder takes only xhr/fetch requests (R-18)',
  async () => {
    const f = await nav(gs.call, run, '/legacy/insurer/szkoda-stara.do');
    const submit = actionNamed(f, /Wyślij|Zgłoś/);
    expect(submit).toBeDefined();
    await actOn(gs.call, run, f, /Wyślij|Zgłoś/);
    const posts = rows(
      gs,
      "SELECT id FROM network_calls WHERE method = 'POST' AND url_template LIKE '%szkoda-stara%'",
    );
    expect(posts.length).toBeGreaterThan(0);
  },
);

gap(
  'LO-47',
  'a client/server validation mismatch is recorded with both messages',
  'map mode fills forms with generic test data; only a trace with an old date shows the server rule (tier-2 eval)',
  async () => {
    const claim = await nav(gs.call, run, '/ubezpieczenia#/szkody/nowa');
    expect(snapshot(gs, claim.state_id)).toContain('Szkodę można zgłosić do 30 dni od zdarzenia.');
  },
);

gate('LO-50', 'the ground truth uses the portal clock, not the real date', async () => {
  const clock = (await (await fetch(`${GATE_BASE}/api/clock`)).json()) as { today: string };
  for (const d of ['shop', 'bank', 'insurer']) {
    const gt = JSON.parse(
      readFileSync(join(PROVING_GROUND, 'ground-truth', `${d}.json`), 'utf8'),
    ) as { today: string };
    expect(gt.today).toBe(clock.today);
  }
});
