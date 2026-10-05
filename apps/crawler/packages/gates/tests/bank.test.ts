import { afterAll, beforeAll, expect } from 'vitest';
import {
  actionNamed,
  actOn,
  gap,
  gate,
  gateServer,
  loginAs,
  nav,
  resetEstate,
  routeOf,
  rows,
  snapshot,
  startRun,
  type Body,
  type GateServer,
} from '../src/index.js';

/** The bank logged in, with its legacy app (spec 009 US6). */
let gs: GateServer;
let run: string;
let sid = '';
beforeAll(async () => {
  await resetEstate();
  gs = await gateServer({ portals: ['proving-ground-bank'] });
  run = await startRun(gs.call, 'proving-ground-bank', 'client');
  await nav(gs.call, run, '/bank');
  await loginAs(gs.call, run);
});
afterAll(() => gs.close());

/**
 * A `;jsessionid=` value for legacy URLs. The browser's cookie decides the session (it wins over
 * the URL), so any id in the path works; what matters is how the crawler templates the URL.
 */
async function legacySid(): Promise<string> {
  sid ||= '0123456789abcdef0123456789abcdef';
  return sid;
}

gap(
  'LO-11',
  'inputs with only a placeholder get a field name from it',
  'form fields are recorded only with a name or id attribute; controlled inputs with a placeholder only are dropped',
  async () => {
    const p = await nav(gs.call, run, '/bank/przelew');
    const fields = rows<{ fields_json: string }>(
      gs,
      'SELECT fields_json FROM forms WHERE state_id = ?',
      p.state_id,
    )
      .map((f) => f.fields_json)
      .join(' ');
    expect(fields).toContain('Numer rachunku');
    expect(fields).toContain('Kwota');
  },
);

gate('LO-16', 'text baked into an image is never guessed into the record', async () => {
  const p = await nav(gs.call, run, '/bank');
  // the banner shows EUR/PLN rates only in pixels; the snapshot must not invent them
  expect(snapshot(gs, p.state_id)).not.toMatch(/4[,.]\d{2,4}\s*(zł|PLN)/);
});

gate('LO-40', 'the chat widget is not explored as part of the portal', async () => {
  const p = await nav(gs.call, run, '/bank');
  expect(actionNamed(p as Body, /czat|konsultant/i)).toBeUndefined();
});

gate('LO-44', 'a live ticker does not make every observation a new state', async () => {
  const a = await nav(gs.call, run, '/bank/pulpit');
  await new Promise((r) => setTimeout(r, 2500));
  const b = await nav(gs.call, run, '/bank/pulpit');
  expect(b.state_id).toBe(a.state_id);
});

gate('LO-28', 'a PDF download is an action, not a page the crawler walks into', async () => {
  const p = await nav(gs.call, run, '/bank/wyciagi?miesiac=2026-02');
  const pdf = actionNamed(p, /Pobierz PDF/);
  expect(pdf).toBeDefined();
  const routes = rows<{ route_template: string }>(gs, 'SELECT route_template FROM states').map(
    (r) => r.route_template,
  );
  expect(routes.some((r) => r.endsWith('.pdf'))).toBe(false);
});

gate('LO-49', 'trace inputs give a checksum-valid IBAN for the transfer form', async () => {
  const t = await startRun(gs.call, 'proving-ground-bank', 'client', {
    mode: 'trace',
    process: { name: 'Przelew krajowy', goal: 'Send a domestic transfer' },
  });
  await gs.call('navigate', {
    run_id: t,
    url: 'http://127.0.0.1:4200/bank',
    rationale: 'start',
    intent: 'Open the bank',
  });
  await gs.call('login', { run_id: t, rationale: 'log in' });
  const form = await gs.call('navigate', {
    run_id: t,
    url: 'http://127.0.0.1:4200/bank/przelew',
    rationale: 'open the form',
    intent: 'Open the transfer form',
  });
  const iban = (form.body.actions as Body[]).find((a) => a.accessible_name === 'Numer rachunku')
    ?.suggested_value as string | undefined;
  expect(iban).toBeDefined();
  const digits = `${iban!.slice(4)}2521${iban!.slice(2, 4)}`; // PL = 25 21
  let mod = 0;
  for (const ch of digits) mod = (mod * 10 + Number(ch)) % 97;
  expect(mod).toBe(1);
});

gap(
  'LO-24',
  'a session id in the URL never becomes part of a route template',
  'route templates keep path parameters, so ";jsessionid=<id>" stays in the template',
  async () => {
    const s = await legacySid();
    const p = await nav(gs.call, run, `/legacy/bank/historia.do;jsessionid=${s}`);
    expect(routeOf(gs, p.state_id)).not.toContain(s);
  },
);

gap(
  'LO-02',
  'the legacy app inside the wrapper iframe is observed',
  'the ARIA snapshot covers the top document only; iframe content is not observed',
  async () => {
    const p = await nav(gs.call, run, '/bank/historia');
    expect(snapshot(gs, p.state_id)).toContain('Lista operacji');
  },
);

gap(
  'LO-04',
  'a frameset is observed as one screen with its frames',
  'frames are separate documents; the observer reads the top document only',
  async () => {
    const p = await nav(gs.call, run, `/legacy/bank/historia.do;jsessionid=${await legacySid()}`);
    expect(snapshot(gs, p.state_id)).toContain('Historia operacji');
  },
);

gate('LO-12', 'a layout-table page yields its links and controls', async () => {
  const p = await nav(gs.call, run, `/legacy/bank/lista.do;jsessionid=${await legacySid()}`);
  expect((p.actions as Body[]).length).toBeGreaterThan(0);
});

gate('LO-14', 'duplicate ids never end up in a locator', async () => {
  await nav(gs.call, run, `/legacy/bank/lista.do;jsessionid=${await legacySid()}`);
  for (const r of rows<{ action_json: string }>(gs, 'SELECT action_json FROM actions'))
    expect(r.action_json).not.toContain('#row');
});

gate('LO-17', 'javascript: links are issued as actions, not followed as URLs', async () => {
  const p = await nav(gs.call, run, `/legacy/bank/menu.do;jsessionid=${await legacySid()}`);
  const link = actionNamed(p, /Lista operacji/);
  expect(link).toBeDefined();
  const pending = rows<{ url: string | null }>(
    gs,
    "SELECT json_extract(action_json, '$.url') AS url FROM frontier WHERE run_id = ?",
    run,
  );
  expect(pending.some((r) => (r.url ?? '').startsWith('javascript:'))).toBe(false);
});

gate('LO-25', 'a postback link is classified as navigation, not a data change', async () => {
  const p = await nav(gs.call, run, `/legacy/bank/menu.do;jsessionid=${await legacySid()}`);
  const link = actionNamed(p, /Lista operacji/);
  expect(link?.safety_class).toBe('read');
});

gate('LO-19', 'invalid HTML is observed without errors', async () => {
  const p = await nav(gs.call, run, `/legacy/bank/lista.do;jsessionid=${await legacySid()}`);
  expect(p.state_id).toBeTruthy();
});

gate('LO-20', 'a windows-1250 page is recorded with correct Polish letters', async () => {
  const p = await nav(gs.call, run, `/legacy/bank/szczegoly.do;jsessionid=${await legacySid()}`);
  expect(snapshot(gs, p.state_id)).toContain('zażółć gęślą jaźń');
});

gate('LO-29', 'dead links and 500 pages are recorded and the run goes on', async () => {
  const dead = await nav(gs.call, run, `/legacy/bank/archiwum.do;jsessionid=${await legacySid()}`);
  expect(snapshot(gs, dead.state_id)).toContain('Strona nie istnieje');
  const err = await nav(gs.call, run, `/legacy/bank/raport.do;jsessionid=${await legacySid()}`);
  expect(snapshot(gs, err.state_id)).toContain('Wystąpił błąd aplikacji');
  const after = await nav(gs.call, run, '/bank/pulpit');
  expect(after.state_id).toBeTruthy();
  void actOn;
});

gate('F-10@009', 'a frameset page is recorded as a state, not an internal error', async () => {
  const p = await nav(gs.call, run, `/legacy/bank/historia.do;jsessionid=${await legacySid()}`);
  expect(p.state_id).toBeTruthy();
});
