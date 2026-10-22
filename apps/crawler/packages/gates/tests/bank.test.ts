import { afterAll, beforeAll, expect } from 'vitest';
import { parameterInventory } from '@mudpuppy/docs';
import {
  actionNamed,
  actOn,
  gate,
  gateServer,
  lastVisit,
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

gate('LO-11', 'inputs with only a placeholder get a field name from it', async () => {
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
});

gate('LO-10', 'the div button "Wykonaj" on the transfer form is issued with found_by', async () => {
  const p = await nav(gs.call, run, '/bank/przelew');
  const submit = actionNamed(p, 'Wykonaj');
  expect(submit).toBeDefined();
  expect(Array.isArray(submit?.found_by)).toBe(true);
  expect((submit?.found_by as unknown[]).length).toBeGreaterThan(0);
});

gate('LO-16', 'text baked into an image is never guessed into the record', async () => {
  const p = await nav(gs.call, run, '/bank');
  // the banner shows EUR/PLN rates only in pixels; the snapshot must not invent them
  expect(snapshot(gs, p.state_id)).not.toMatch(/4[,.]\d{2,4}\s*(zł|PLN)/);
});

gate('LO-40', 'the chat widget is not explored as part of the portal', async () => {
  const p = await nav(gs.call, run, '/bank');
  expect(actionNamed(p, /czat|konsultant/i)).toBeUndefined();
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

gate(
  'LO-24',
  'a session id in the URL is recorded on the visit, never part of a route template',
  async () => {
    const s = await legacySid();
    const p = await nav(gs.call, run, `/legacy/bank/historia.do;jsessionid=${s}`);
    expect(routeOf(gs, p.state_id)).not.toContain(s);
    expect(lastVisit(gs, p.state_id).url).toContain(`;jsessionid=${s}`);
  },
);

/** The state's stored actions that live in a frame, with their stored frame path. */
const frameActions = (stateId: string) =>
  rows<{ id: string; role: string; safety_class: string; frame: string; href: string | null }>(
    gs,
    "SELECT id, role, safety_class, json_extract(action_json, '$.frame') AS frame, json_extract(action_json, '$.href') AS href FROM actions WHERE state_id = ? AND json_extract(action_json, '$.frame') IS NOT NULL",
    stateId,
  );

gate(
  'LO-52',
  'every parameter of the statement URLs, and each value, is in the parameter inventory',
  async () => {
    const s = await legacySid();
    const base = `/legacy/bank/wyciag.do;jsessionid=${s}?konto=4521`;
    await nav(gs.call, run, `${base}&typ=M&okres=2026-03&tryb=podglad`);
    await nav(gs.call, run, `${base}&typ=R&okres=2026&tryb=druk`);
    await nav(gs.call, run, `${base}&typ=M&okres=2026&tryb=podglad`); // the error combination
    const visits = rows<{
      id: string;
      transition_id: string | null;
      via: string;
      url: string;
      hops_json: string;
    }>(
      gs,
      `SELECT v.id, v.transition_id, v.via, v.url, v.hops_json FROM observations v
       JOIN states s ON s.id = v.state_id
       WHERE v.run_id = ? AND s.route_template = '/legacy/bank/wyciag.do'`,
      run,
    );
    // preview, print and error are different screens of one route: pooled for the check
    const [inv] = parameterInventory(
      visits.map((v) => ({
        id: v.id,
        state_id: 'wyciag',
        transition_id: v.transition_id,
        via: v.via as 'navigate',
        url: v.url,
        hops: JSON.parse(v.hops_json) as never,
      })),
    );
    const values = Object.fromEntries(inv!.params.map((p) => [`${p.in}:${p.name}`, p.values]));
    expect(values).toEqual({
      'path:jsessionid': [s],
      'query:konto': ['4521'],
      'query:typ': ['M', 'R'],
      'query:okres': ['2026-03', '2026'],
      'query:tryb': ['podglad', 'druk'],
    });
  },
);

gate('LO-53', 'a front end mounted late inside a frame is waited for and read', async () => {
  const p = await nav(gs.call, run, `/legacy/bank/kursy.do;jsessionid=${await legacySid()}`);
  expect(snapshot(gs, p.state_id)).toContain('Kurs EUR');
});

gate('LO-02', 'the legacy app inside the wrapper iframe is observed', async () => {
  const p = await nav(gs.call, run, '/bank/historia');
  expect(snapshot(gs, p.state_id)).toContain('Lista operacji');
  expect(frameActions(p.state_id).length).toBeGreaterThan(0);
});

gate('LO-04', 'a frameset is observed as one screen with its frames', async () => {
  const p = await nav(gs.call, run, `/legacy/bank/historia.do;jsessionid=${await legacySid()}`);
  expect(snapshot(gs, p.state_id)).toContain('Historia operacji');
  // javascript: postback links are refused by the scope rule, so pick a link with a real target
  const inFrame = frameActions(p.state_id).filter(
    (a) => a.role === 'link' && a.safety_class === 'read' && (a.href ?? '').startsWith('/'),
  );
  expect(inFrame.length).toBeGreaterThan(0);
  const r = await gs.call('act', {
    run_id: run,
    action_id: inFrame[0]!.id,
    rationale: 'gate step: act on a frame link',
    include_actions: true,
  });
  expect(r.isError, JSON.stringify(r.body).slice(0, 400)).toBe(false);
});

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
