import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, expect } from 'vitest';
import {
  actionNamed,
  actOn,
  gap,
  gate,
  gateServer,
  GATE_BASE,
  lastVisit,
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

gate(
  'LO-02',
  'a slow micro-frontend bundle is waited for before the page is observed',
  async () => {
    // A server of its own: the shop portal does not allow `/__test/*`, so this copy of its config
    // does (the real config stays closed), and the delay cookie cannot slow the other cases.
    const slow = await gateServer({
      portals: ['proving-ground-shop'],
      extra: (root) => {
        const file = join(root, 'portals', 'proving-ground-shop', 'portal.yaml');
        writeFileSync(
          file,
          readFileSync(file, 'utf8').replace('  allowed: [', '  allowed: ["/__test/*", '),
        );
      },
    });
    try {
      const own = await startRun(slow.call, 'proving-ground-shop', 'guest');
      await nav(slow.call, own, '/__test/bundle-delay?ms=2500');
      const page = await nav(slow.call, own, '/sklep');
      expect(snapshot(slow, page.state_id)).toContain('Katalog produktów');
      const [obs] = rows<{ composition_json: string }>(
        slow,
        'SELECT composition_json FROM state_observations WHERE run_id = ? AND state_id = ?',
        own,
        page.state_id,
      );
      const mounts = (JSON.parse(obs!.composition_json).mounts ?? []) as {
        filled: boolean;
        waited_ms: number;
      }[];
      expect(mounts.some((m) => m.filled === true && m.waited_ms > 1000)).toBe(true);
    } finally {
      await slow.close();
    }
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

gate('LO-08', 'a missing CMS key is recorded as the portal shows it', async () => {
  // The raw key shows only with items in the cart; adding uses the div "button" of LO-10. A run of
  // its own (own browser, own cart), so LO-51's cart stays as it is.
  const own = await startRun(gs.call, 'proving-ground-shop', 'guest');
  const product = await nav(gs.call, own, '/sklep/produkt/kalosze-bagienne-klasyczne');
  await actOn(gs.call, own, product, 'Dodaj do koszyka');
  const cart = await nav(gs.call, own, '/sklep/koszyk');
  expect(snapshot(gs, cart.state_id)).toContain('checkout.summary.vatNote');
});

gate('LO-09', 'white-label login pages of two brands are two different states', async () => {
  const bank = await nav(gs.call, run, '/logowanie?marka=bank&next=/bank/pulpit');
  const shop = await nav(gs.call, run, '/logowanie?marka=shop&next=/sklep/konto');
  expect(bank.state_id).not.toBe(shop.state_id);
  expect(bank.title).not.toBe(shop.title);
});

gate('LO-10', 'a div "button" without a role is found and can be acted on', async () => {
  // A run of its own (own browser, own cart): adding to the cart must not reach LO-51's cart.
  const own = await startRun(gs.call, 'proving-ground-shop', 'guest');
  const product = await nav(gs.call, own, '/sklep/produkt/kalosze-bagienne-klasyczne');
  const add = actionNamed(product, 'Dodaj do koszyka');
  expect(add).toBeDefined();
  expect(add?.role).toBe('generic');
  expect(Array.isArray(add?.found_by)).toBe(true);
  expect((add?.found_by as unknown[]).length).toBeGreaterThan(0);
  const after = await actOn(gs.call, own, product, 'Dodaj do koszyka');
  expect(after.error).toBeUndefined();
});

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

gate('LO-18', 'a div-based dropdown is operable (its options are issued)', async () => {
  expect(actionNamed(catalogue, /Wszystkie kategorie|Kategoria/)).toBeDefined();
});

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
    // every hop of the chain is recorded with its status and full URL (spec 019, R-38)
    const v = lastVisit(gs, landed.state_id);
    expect(v.hops.map((h) => [h.kind, h.status ?? null])).toEqual([
      ['start', null],
      ['http', 301],
      ['http', 302],
    ]);
    expect(v.hops[0]!.url).toContain('/shop/index.php?cat=2');
    expect(v.hops[1]!.url).toContain('/old/kategoria/2');
    expect(v.url).toContain('/sklep?kategoria=2');
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

gate(
  'LO-34',
  'adding to the cart in the shop app updates the shell cart (one state change)',
  async () => {
    // A run of its own (own browser, own cart): "Koszyk (1)" needs an empty cart to start from.
    const own = await startRun(gs.call, 'proving-ground-shop', 'guest');
    const product = await nav(gs.call, own, '/sklep/produkt/kalosze-bagienne-klasyczne');
    const after = await actOn(gs.call, own, product, 'Dodaj do koszyka');
    expect(snapshot(gs, after.state_id)).toContain('Koszyk (1)');
  },
);

/** The catalogue hero's title per A/B variant (`mfe-shop` Catalog.tsx, CMS `hero.a/b.title`). */
const HERO = { A: 'Wszystko na każdą pogodę', B: 'Jesienne wyprzedaże do -30%' } as const;

gap(
  'LO-35',
  'A/B banner variants of the catalogue fall into one cluster',
  'the two hero variants differ enough that the fingerprint splits them into two clusters',
  async () => {
    // Fresh sessions until both variants were observed with their text (spec 012 F-03: a session
    // draws its variant at random, and an observation before the CMS text arrives tells nothing).
    const clusters = new Map<keyof typeof HERO, string>();
    for (let i = 0; i < 10 && clusters.size < 2; i++) {
      const other = await gateServer({ portals: ['proving-ground-shop'] });
      try {
        const r = await startRun(other.call, 'proving-ground-shop', 'guest');
        const p = await nav(other.call, r, '/sklep');
        const text = snapshot(other, p.state_id as string);
        const seen = (Object.keys(HERO) as (keyof typeof HERO)[]).find((v) =>
          text.includes(HERO[v]),
        );
        if (seen) clusters.set(seen, p.cluster_id as string);
      } finally {
        await other.close();
      }
    }
    expect([...clusters.keys()].sort()).toEqual(['A', 'B']);
    expect(new Set(clusters.values()).size).toBe(1);
  },
  { timeout: 240_000, slow: true },
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

gate('LO-11', 'inputs outside any form (a React checkout) are recorded as a form', async () => {
  // A run of its own (own browser, own cart): the checkout needs an item first.
  const own = await startRun(gs.call, 'proving-ground-shop', 'guest');
  const product = await nav(gs.call, own, '/sklep/produkt/kalosze-bagienne-klasyczne');
  await actOn(gs.call, own, product, 'Dodaj do koszyka');
  const checkout = await nav(gs.call, own, '/sklep/zamowienie');
  const stored = rows<{ fields_json: string }>(
    gs,
    'SELECT fields_json FROM forms WHERE state_id = ?',
    checkout.state_id,
  );
  expect(stored.length).toBeGreaterThan(0);
  const fields = stored.map((f) => f.fields_json).join(' ');
  // labels of the CMS texts (cms/shop/pl.json: checkout.name, .email, .postal)
  expect(fields).toMatch(/Imi|Nazwisko/);
  expect(fields).toMatch(/e-?mail/i);
  expect(fields).toContain('Miasto');
  // the postal input's placeholder "00-000" is only a format: the label next to it names it
  expect(fields).toContain('Kod pocztowy');
});

gate(
  'F-03@026',
  "a catalogue's product and page links wait until unvisited templates are handed out",
  async () => {
    // A run of its own: one product visited, then the catalogue queues every product and page.
    const own = await startRun(gs.call, 'proving-ground-shop', 'guest');
    await nav(gs.call, own, '/sklep/produkt/kalosze-bagienne-klasyczne');
    const cat = await nav(gs.call, own, '/sklep');
    const itemOrPage = /\/sklep\/produkt\/|strona=/;
    const pending = rows<{ target: string | null }>(
      gs,
      `SELECT json_extract(action_json, '$.target_url') AS target FROM frontier
       WHERE run_id = ? AND status = 'pending'`,
      own,
    );
    expect(pending.filter((p) => itemOrPage.test(p.target ?? '')).length).toBeGreaterThan(5);
    const next = (cat.next as { item: { frontier_id: string } | null }).item;
    expect(next).not.toBeNull();
    const [picked] = rows<{ target: string | null }>(
      gs,
      `SELECT json_extract(action_json, '$.target_url') AS target FROM frontier WHERE id = ?`,
      next!.frontier_id,
    );
    expect(picked!.target ?? '').not.toMatch(itemOrPage);
  },
);

gate(
  'F-04@026',
  'after the empty cart was followed, the cart link with an item is still followed, not inferred',
  async () => {
    // A run of its own (own browser, own cart): the empty cart first, then an item added.
    const own = await startRun(gs.call, 'proving-ground-shop', 'guest');
    const cat = await nav(gs.call, own, '/sklep');
    await actOn(gs.call, own, cat, /^Koszyk \(0\)$/);
    const product = await nav(gs.call, own, '/sklep/produkt/kalosze-bagienne-klasyczne');
    const added = await actOn(gs.call, own, product, 'Dodaj do koszyka');
    expect(actionNamed(added, /^Koszyk \(1\)$/)).toBeDefined();
    // As if the crawler had handled everything else: only the filled-cart links stay pending,
    // so the next pick either hands one out (right) or infers it as the empty cart (F-04).
    gs.ctx.raw
      .prepare(
        `UPDATE frontier SET status = 'done' WHERE run_id = ? AND status = 'pending'
           AND json_extract(action_json, '$.accessible_name') IS NOT 'Koszyk (1)'`,
      )
      .run(own);
    const next = await gs.call('get_next_frontier_item', { run_id: own });
    const item = (next.body as { item: { frontier_id: string } | null }).item;
    expect(item).not.toBeNull();
    const [picked] = rows<{ name: string }>(
      gs,
      `SELECT json_extract(action_json, '$.accessible_name') AS name FROM frontier WHERE id = ?`,
      item!.frontier_id,
    );
    expect(picked!.name).toBe('Koszyk (1)');
  },
);

gap(
  'F-11@031',
  'a link on a screen reached by a click is still there when act goes back to it (S07)',
  'act goes back by loading the URL; opened directly, /sklep/konto is the shell login form, so the account screen’s link is gone (reach by navigation: R-66)',
  async () => {
    const own = await startRun(gs.call, 'proving-ground-shop', 'guest');
    const sklep = await nav(gs.call, own, '/sklep');
    const konto = await actOn(gs.call, own, sklep, /^Moje konto$/);
    expect(actionNamed(konto, /^Zaloguj się, aby zobaczyć zamówienia$/)).toBeDefined();
    // Elsewhere first, so `act` has to go back to the account screen and find the link again.
    await nav(gs.call, own, '/sklep');
    const login = await actOn(gs.call, own, konto, /^Zaloguj się, aby zobaczyć zamówienia$/);
    expect(routeOf(gs, login.state_id as string)).toBe('/logowanie');
  },
);

gate(
  'F-08@031',
  'the checkout is filled before "Zamawiam i płacę": only the CAPTCHA, which a human solves, is left',
  async () => {
    // A run of its own, with an item in the cart, so the order can be placed.
    const own = await startRun(gs.call, 'proving-ground-shop', 'guest');
    const product = await nav(gs.call, own, '/sklep/produkt/kalosze-bagienne-klasyczne');
    await actOn(gs.call, own, product, 'Dodaj do koszyka');
    const checkout = await nav(gs.call, own, '/sklep/zamowienie');
    const after = await actOn(gs.call, own, checkout, /^Zamawiam i płacę$/);
    const text = snapshot(gs, after.state_id as string);
    expect(text).toContain('Potwierdź, że nie jesteś robotem');
    // The shop's messages; "Wybierz miasto." with its period (the select's placeholder has none).
    for (const refused of [
      'Podaj imię',
      'Podaj adres e-mail',
      'Kod pocztowy musi',
      'Wybierz miasto.',
    ])
      expect(text).not.toContain(refused);
    expect(text).toContain('option "Warszawa" [selected]');
  },
);
