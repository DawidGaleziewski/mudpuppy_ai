import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, expect } from 'vitest';
import { parse } from 'yaml';
import { AGENT_TOOL_NAMES } from '@pathfinder/mcp-server';
import {
  actionNamed,
  actOn,
  gap,
  gate,
  gateServer,
  GATE_BASE,
  lastVisit,
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

gate(
  'LO-22',
  'a meta-refresh and JS redirect chain is followed and every hop recorded',
  async () => {
    const p = await nav(gs.call, run, '/polisa.php?id=7');
    // the navigate itself waits through the interstitial and lands on the policy screen (spec 019)
    expect(snapshot(gs, p.state_id)).toMatch(/Szczegóły polisy|polis/i);
    const v = lastVisit(gs, p.state_id);
    expect(v.hops.map((h) => h.kind)).toEqual(['start', 'meta_refresh', 'script']);
    expect(v.hops[0]!.url).toContain('/polisa.php?id=7');
    expect(v.hops[1]!.url).toContain('/stare/polisa/7');
    expect(v.url).toContain('/ubezpieczenia#/polisy/7');
  },
);

gate(
  'LO-23',
  'the old and the new URL of one screen merge into one state, both URLs recorded',
  async () => {
    const old = await nav(gs.call, run, '/polisa.php?id=7');
    const fresh = await nav(gs.call, run, '/ubezpieczenia#/polisy/7');
    expect(old.state_id).toBe(fresh.state_id);
    const titles = rows<{ title: string }>(gs, 'SELECT title FROM states').map((s) => s.title);
    expect(titles.some((t) => /Proszę czekać/i.test(t))).toBe(false);
    const entries = rows<{ hops_json: string }>(
      gs,
      'SELECT hops_json FROM page_visits WHERE state_id = ?',
      old.state_id,
    ).map((v) => (JSON.parse(v.hops_json) as { url: string }[])[0]?.url ?? '');
    expect(entries.some((u) => u.includes('/polisa.php?id=7'))).toBe(true);
    expect(entries.some((u) => u.includes('/ubezpieczenia#/polisy/7'))).toBe(true);
  },
);

gap(
  'LO-27',
  'a window.open pop-up is recorded as its own screen',
  'a pop-up with a URL is queued and visited (F-04@020), but this one is written by script into about:blank: no URL, and the session observes only its own page',
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

gate('LO-43', 'a classic form POST (no XHR) is recorded as an API shape', async () => {
  const f = await nav(gs.call, run, '/legacy/insurer/szkoda-stara.do');
  const submit = actionNamed(f, /Wyślij|Zgłoś/);
  expect(submit).toBeDefined();
  await actOn(gs.call, run, f, /Wyślij|Zgłoś/);
  const posts = rows(
    gs,
    "SELECT id FROM network_calls WHERE method = 'POST' AND url_template LIKE '%szkoda-stara%'",
  );
  expect(posts.length).toBeGreaterThan(0);
});

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
    const gt = parse(readFileSync(join(PROVING_GROUND, 'ground-truth', `${d}.yaml`), 'utf8')) as {
      today: string;
    };
    expect(gt.today).toBe(clock.today);
  }
});

gate(
  'LO-11',
  'the legacy claim fields carry the label text of the neighbouring table cell',
  async () => {
    const f = await nav(gs.call, run, '/legacy/insurer/szkoda-stara.do');
    const forms = rows<{ fields_json: string }>(
      gs,
      'SELECT fields_json FROM forms WHERE state_id = ?',
      f.state_id,
    );
    expect(forms.length).toBeGreaterThan(0);
    // the inputs carry name attributes, so the cell text lands in `label`, not in the name
    const fields = forms.flatMap((x) => JSON.parse(x.fields_json) as Record<string, unknown>[]);
    const labelOf = (name: string) => fields.find((x) => x.name === name)?.label;
    expect(labelOf('polisa')).toBe('Nr polisy');
    expect(labelOf('data')).toBe('Data zdarzenia');
    expect(labelOf('opis')).toBe('Opis');
  },
);

gate('LO-18', 'the div date picker "Data rozpoczęcia" can be opened and a day picked', async () => {
  const page = await nav(gs.call, run, '/ubezpieczenia#/polisy/7/dodatki');
  const trigger = (page.actions as Record<string, unknown>[]).find((a) =>
    /Data rozpoczęcia|Wybierz|\d{4}-\d{2}-\d{2}/.test(String(a.accessible_name ?? '')),
  );
  expect(
    trigger,
    `actions: ${(page.actions as Record<string, unknown>[]).map((a) => a.accessible_name).join(' | ')}`,
  ).toBeDefined();
  const opened = await actOn(gs.call, run, page, String(trigger!.accessible_name));
  const day = actionNamed(opened, /^15$/);
  expect(day, 'a day cell of the opened calendar is issued').toBeDefined();
  const picked = await actOn(gs.call, run, opened, /^15$/);
  expect(picked.state_id).not.toBe(opened.state_id);
  expect(snapshot(gs, picked.state_id)).toMatch(/\d{4}-\d{2}-15/);
});
