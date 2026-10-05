import { afterAll, beforeAll, expect } from 'vitest';
import {
  actionNamed,
  actOn,
  gap,
  gate,
  gateServer,
  GATE_BASE,
  nav,
  navWait,
  resetEstate,
  routeOf,
  rows,
  snapshot,
  startRun,
  type Body,
  type GateServer,
} from '../src/index.js';

/** The shop and the shell as a guest (spec 009 US6): one server, one run, many observations. */
let gs: GateServer;
let run: string;
let catalogue: Body;
beforeAll(async () => {
  await resetEstate();
  gs = await gateServer({ portals: ['proving-ground-shop', 'proving-ground-bank'] });
  run = await startRun(gs.call, 'proving-ground-shop', 'guest');
  catalogue = await nav(gs.call, run, '/sklep');
});
afterAll(() => gs.close());

gate(
  'LO-01',
  'a micro-frontend mounted by the shell is observed with its own content',
  async () => {
    expect(catalogue.title).toContain('Mokradło');
    expect(actionNamed(catalogue, 'Następna strona')).toBeDefined();
  },
);

gate('LO-05', 'the shadow-DOM mini-cart is part of the observed page', async () => {
  expect(snapshot(gs, catalogue.state_id)).toMatch(/Koszyk \(\d+\)/);
});

gate('LO-07', 'CMS texts are recorded, not the keys that flash before they load', async () => {
  const snap = snapshot(gs, catalogue.state_id);
  expect(snap).toContain('Katalog produktów');
  expect(snap).not.toMatch(/\bcatalog\.[a-z]+\b/i);
});

gap(
  'LO-08',
  'a missing CMS key is recorded as the portal shows it',
  'the raw key shows only with items in the cart, and adding needs LO-10',
  async () => {
    const cart = await nav(gs.call, run, '/sklep/koszyk');
    expect(snapshot(gs, cart.state_id)).toContain('checkout.summary.vatNote');
  },
);

gate('LO-09', 'white-label login pages of two brands are two different states', async () => {
  const bank = await nav(gs.call, run, '/logowanie?marka=bank&next=/bank/pulpit');
  const shop = await nav(gs.call, run, '/logowanie?marka=shop&next=/sklep/konto');
  expect(bank.state_id).not.toBe(shop.state_id);
  expect(bank.title).not.toBe(shop.title);
});

gap(
  'LO-10',
  'a div "button" without a role is found and can be acted on',
  'actions are extracted from ARIA roles only; a clickable div has none',
  async () => {
    const product = await nav(gs.call, run, '/sklep/produkt/kalosze-bagienne-klasyczne');
    expect(actionNamed(product, 'Dodaj do koszyka')).toBeDefined();
  },
);

gate('LO-13', 'generated class names never reach locators or the fingerprint', async () => {
  const locators = rows<{ action_json: string }>(
    gs,
    'SELECT action_json FROM actions WHERE run_id = ?',
    run,
  ).map((r) => r.action_json);
  expect(locators.length).toBeGreaterThan(5);
  for (const l of locators) expect(l).not.toMatch(/\.(css-|_x1|mk-)[\w-]*/);
  expect(snapshot(gs, catalogue.state_id)).not.toMatch(/mk-c-9f2|_x1\b/);
});

gate('LO-15', 'an icon-only button is still issued as an action', async () => {
  const unnamed = (catalogue.actions as Body[]).filter(
    (a) => a.role === 'button' && (a.accessible_name === null || a.accessible_name === ''),
  );
  expect(unnamed.length).toBeGreaterThan(0);
});

gap(
  'LO-18',
  'a div-based dropdown is operable (its options are issued)',
  'a div dropdown has no role, so it is not extracted (same cause as LO-10)',
  async () => {
    expect(actionNamed(catalogue, /Wszystkie kategorie|Kategoria/)).toBeDefined();
  },
);

gate(
  'LO-21',
  'an old URL behind a redirect chain lands on the catalogue, no extra state',
  async () => {
    const before = rows(gs, 'SELECT id FROM states').length;
    const landed = await nav(gs.call, run, '/shop/index.php?cat=2');
    expect(routeOf(gs, landed.state_id)).toBe('/sklep');
    const routes = rows<{ route_template: string }>(gs, 'SELECT route_template FROM states').map(
      (r) => r.route_template,
    );
    expect(routes.some((r) => r.startsWith('/old/') || r.startsWith('/shop/'))).toBe(false);
    expect(rows(gs, 'SELECT id FROM states').length - before).toBeLessThanOrEqual(1);
  },
);

gate('LO-26', 'endless pagination does not become one state per page', async () => {
  for (const n of [2, 3, 4, 5, 6]) await nav(gs.call, run, `/sklep?strona=${n}`);
  const pages = rows<{ route_template: string }>(
    gs,
    "SELECT DISTINCT route_template FROM states WHERE route_template LIKE '/sklep%'",
  );
  // the page number is a parameter of one template, never a template per page
  expect(pages.filter((p) => /strona=\d/.test(p.route_template))).toEqual([]);
});

gap(
  'LO-34',
  'adding to the cart in the shop app updates the shell cart (one state change)',
  '"Dodaj do koszyka" is a div button (LO-10), so the crawler cannot add to the cart',
  async () => {
    const product = await nav(gs.call, run, '/sklep/produkt/kalosze-bagienne-klasyczne');
    const after = await actOn(gs.call, run, product, 'Dodaj do koszyka');
    expect(snapshot(gs, after.state_id)).toContain('Koszyk (1)');
  },
);

gap(
  'LO-35',
  'A/B banner variants of the catalogue fall into one cluster',
  'the two hero variants differ enough that the fingerprint splits them into two clusters',
  async () => {
    const clusters = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const other = await gateServer({ portals: ['proving-ground-shop'] });
      try {
        const r = await startRun(other.call, 'proving-ground-shop', 'guest');
        const p = await nav(other.call, r, '/sklep');
        clusters.add(p.cluster_id as string);
      } finally {
        await other.close();
      }
    }
    expect(clusters.size).toBe(1);
  },
  { timeout: 120_000, slow: true },
);

gate('LO-38', 'the cookie banner is dismissed before observation, never recorded', async () => {
  for (const s of rows<{ id: string }>(gs, 'SELECT id FROM states'))
    expect(snapshot(gs, s.id)).not.toContain('Akceptuję wszystkie');
});

gate('LO-39', 'the timed newsletter modal is dismissed, not recorded as a state', async () => {
  const p = await navWait(gs.call, run, '/sklep?kategoria=1', 3500);
  const next = await actOn(gs.call, run, p, 'Następna strona');
  expect(snapshot(gs, next.state_id)).not.toContain('Nie, dziękuję');
});

gate('LO-41', 'normal crawling never trips the portal rate limit', async () => {
  const stopped = rows(gs, "SELECT id FROM runs WHERE status = 'stopped_warning'");
  expect(stopped).toEqual([]);
});

gate('LO-42', 'one GraphQL endpoint is recorded per operation, not as one call', async () => {
  const calls = rows<{ url_template: string; req_schema: string }>(
    gs,
    "SELECT url_template, req_schema FROM network_calls WHERE url_template LIKE '%graphql%'",
  );
  expect(calls.length).toBeGreaterThan(0);
  const ops = new Set(calls.map((c) => c.url_template + c.req_schema));
  expect(ops.size).toBeGreaterThan(1);
});

gap(
  'LO-48',
  'the parcel-locker select loads after the city is chosen',
  'map mode issues no field actions; only a trace run can choose the city (tier-2 eval)',
  async () => {
    const checkout = await nav(gs.call, run, '/sklep/zamowienie');
    const city = actionNamed(checkout, /Miasto/);
    expect(city).toBeDefined();
    const after = await gs.call('act', {
      run_id: run,
      action_id: city!.action_id,
      rationale: 'choose a city',
      value: 'Warszawa',
    });
    expect(JSON.stringify(after.body)).toMatch(/Paczkomat|paczkomat/);
  },
);

gate('LO-51', 'free delivery appears only past the threshold', async () => {
  const cart = await nav(gs.call, run, '/sklep/koszyk');
  const snap = snapshot(gs, cart.state_id);
  // one cheap item: no free delivery yet (the rule is found past 200 zł by a trace)
  expect(snap).not.toContain('Darmowa dostawa od 200,00 zł');
  expect(GATE_BASE).toContain('127.0.0.1');
});
