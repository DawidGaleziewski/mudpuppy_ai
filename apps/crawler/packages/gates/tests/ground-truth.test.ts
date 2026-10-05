import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { settle, trackNetworkActivity, type NetworkActivity } from '@pathfinder/crawler';
import { loadGroundTruth, type GroundTruth } from '@pathfinder/reference-portal';
import { FIXTURE_PASSWORD, GATE_BASE, PROVING_GROUND, resetEstate } from '../src/index.js';

/**
 * Ground-truth self-check (spec 009 T019, contracts/ground-truth-v2.md): the three proving-ground
 * files describe what the estate really serves. Driven with Playwright directly, not the crawler.
 */
const DOMAINS = ['shop', 'bank', 'insurer'] as const;
type Domain = (typeof DOMAINS)[number];
const LOGINS: Record<Domain, string> = {
  shop: 'klient.sklep',
  bank: 'jan.testowy',
  insurer: 'ewa.polisowa',
};
const SAMPLE: Record<string, string> = {
  ':slug': 'kalosze-bagienne-klasyczne',
  ':nr': '7',
  ':n': '2',
};
/** Query strings some routes need to render (the template keeps only the path). */
const QUERY: Record<string, string> = {
  '/bank/wyciagi': '?miesiac=2026-02',
};
/** Fields that render only after a step (cart items, a chosen city, wizard step 2). */
const STATE_DEPENDENT = new Set([
  'Wybierz paczkomat',
  'Miejsce zdarzenia',
  'Ilość',
  'Sposób dostawy',
]);

const concrete = (route: string, domain: Domain): string => {
  let r = route.replace(/:[a-z]+/g, (m) => SAMPLE[m] ?? m);
  if (r === '/logowanie') r += `?marka=${domain}&next=/`;
  return r + (QUERY[route] ?? '');
};

let browser: Browser;
const contexts = new Map<string, BrowserContext>();

async function contextFor(domain: Domain, actor: string): Promise<BrowserContext> {
  const key = actor === 'guest' ? 'guest' : `${domain}:${actor}`;
  const known = contexts.get(key);
  if (known) return known;
  const ctx = await browser.newContext();
  if (actor !== 'guest') {
    const page = await ctx.newPage();
    await page.goto(`${GATE_BASE}/logowanie?marka=${domain}&next=/`);
    await page.waitForFunction(
      () => (document.querySelector('input[name=csrf]') as HTMLInputElement | null)?.value,
    );
    await page.locator('input[name=login]').fill(LOGINS[domain]);
    await page.locator('input[name=haslo]').fill(FIXTURE_PASSWORD);
    await page.locator('button[type=submit]').click();
    await page.waitForLoadState('load');
    await page.close();
  }
  contexts.set(key, ctx);
  return ctx;
}

const trackers = new WeakMap<Page, NetworkActivity>();

/** A page whose requests are tracked from the start, so {@link allText} can settle like the crawler. */
async function openPage(ctx: BrowserContext): Promise<Page> {
  const page = await ctx.newPage();
  trackers.set(page, trackNetworkActivity(page));
  return page;
}

/** Text of the page and of every frame in it, once CMS texts had time to load. */
async function allText(page: Page): Promise<string> {
  // The crawler's stabilizer, not `networkidle`: the bank's live ticker never idles (F-06).
  await settle(page, trackers.get(page)!, {
    networkIdleMs: 200,
    domQuietMs: 200,
    timeoutMs: 3000,
    pollMs: 25,
  });
  const parts: string[] = [];
  for (const f of page.frames()) parts.push(await f.content().catch(() => ''));
  return parts.join('\n');
}

beforeAll(async () => {
  await resetEstate();
  browser = await chromium.launch();
});
afterAll(async () => {
  for (const c of contexts.values()) await c.close();
  await browser.close();
});

const gts = Object.fromEntries(
  DOMAINS.map((d) => [d, loadGroundTruth(join(PROVING_GROUND, 'ground-truth', `${d}.json`))]),
) as Record<Domain, GroundTruth>;

describe.each(DOMAINS)('ground truth %s ⇔ the estate', (domain) => {
  const gt = gts[domain];
  const deadScreens = new Set(
    (gt.obstacles ?? []).filter((o) => o.id === 'LO-29').flatMap((o) => o.screens),
  );
  const screens = gt.screens.filter((s) => s.reached_by !== 'mutation');

  it.each(screens.map((s) => [s.id, s] as const))(
    'screen %s loads with its title',
    async (_, s) => {
      const page = await openPage(await contextFor(domain, s.actor ?? 'guest'));
      try {
        const res = await page.goto(`${GATE_BASE}${concrete(s.route_template, domain)}`);
        if (!deadScreens.has(s.id)) expect(res?.status() ?? 0).toBeLessThan(400);
        expect(await allText(page)).toContain(s.title);
      } finally {
        await page.close();
      }
    },
  );

  it('every field label (or placeholder) is on its screen', async () => {
    const missing: string[] = [];
    for (const f of gt.forms) {
      const s = gt.screens.find((x) => x.id === f.screen)!;
      if (s.reached_by === 'mutation') continue;
      const page = await openPage(await contextFor(domain, s.actor ?? 'guest'));
      try {
        await page.goto(`${GATE_BASE}${concrete(s.route_template, domain)}`);
        const text = await allText(page);
        for (const field of f.fields)
          if (!STATE_DEPENDENT.has(field.label) && !text.includes(field.label))
            missing.push(`${f.id}/${field.id} "${field.label}" on ${s.route_template}`);
      } finally {
        await page.close();
      }
    }
    expect(missing).toEqual([]);
  });

  it('no guest page shows a rule a guest cannot observe', async () => {
    const hidden = gt.rules.filter((r) => !r.guest_observable && r.claim_markers);
    const guest = await contextFor(domain, 'guest');
    const leaks: string[] = [];
    for (const s of gt.screens.filter((x) => (x.actor ?? 'guest') === 'guest')) {
      if (s.reached_by === 'mutation') continue;
      const page = await openPage(guest);
      try {
        await page.goto(`${GATE_BASE}${concrete(s.route_template, domain)}`);
        const text = await allText(page);
        for (const r of hidden)
          for (const m of r.claim_markers!)
            if (text.includes(m)) leaks.push(`${r.id} "${m}" on ${s.route_template}`);
      } finally {
        await page.close();
      }
    }
    expect(leaks).toEqual([]);
  });

  it('every redirect ends on its target', async () => {
    for (const d of gt.redirects ?? []) {
      const ctx = await contextFor(domain, gt.users?.[0]?.id ?? 'guest');
      const page = await ctx.newPage();
      try {
        await page.goto(`${GATE_BASE}${concrete(d.from, domain)}`);
        const to = concrete(d.to, domain);
        await page.waitForURL((u) => `${u.pathname}${u.search}${u.hash}` === to, {
          timeout: 8000,
        });
      } finally {
        await page.close();
      }
    }
  });
});

it('the catalogue and the ground truth name the same in-scope obstacles', () => {
  const catalogue = readFileSync(
    join(PROVING_GROUND, '..', '..', 'docs', 'legacy-obstacles.md'),
    'utf8',
  );
  for (const gt of Object.values(gts))
    for (const o of gt.obstacles ?? [])
      expect(catalogue, `${gt.portal_id} lists ${o.id}`).toMatch(
        new RegExp(`\\| ${o.id} \\|[^\\n]*\\| in scope \\|`),
      );
});
