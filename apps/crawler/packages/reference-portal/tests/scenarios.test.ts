import { describe, expect, it } from 'vitest';
import {
  BASE_BUILD,
  BUILT_SCENARIOS,
  FAILING_MODEL,
  SCENARIOS,
  parseScenarios,
  startReferencePortal,
} from '../src/index.js';
import { HOST } from './helpers.js';

describe('scenario switchboard (spec 039 T005)', () => {
  it('lists the 14 scenarios of design § 19.1, each with what it injects and expects', () => {
    expect(Object.keys(SCENARIOS)).toHaveLength(14);
    for (const s of Object.values(SCENARIOS)) {
      expect(s.injects.length).toBeGreaterThan(0);
      expect(s.expects.length).toBeGreaterThan(0);
      expect(s.milestone).toMatch(/^M[2-4]$/);
    }
  });

  it('switches nothing on by default', () => {
    expect(parseScenarios(undefined)).toEqual([]);
    expect(parseScenarios(' , ')).toEqual([]);
  });

  it('refuses unknown ids and scenarios not built yet', () => {
    expect(() => parseScenarios('earthquake')).toThrow(/unknown scenario "earthquake"/);
    expect(BUILT_SCENARIOS.has('ab-test')).toBe(false);
    expect(() => parseScenarios('ab-test')).toThrow(/not built yet \(lands in M3\)/);
    expect(parseScenarios('deployment')).toEqual(['deployment']);
  });

  it('every page names its release by a hashed bundle; deployment ships another and a new field', async () => {
    const base = await startReferencePortal({ host: HOST, port: 0 });
    const deployed = await startReferencePortal({ host: HOST, port: 0, scenarios: ['deployment'] });
    try {
      const page = async (p: typeof base) => (await fetch(`${p.url}/kalkulator/pojazd`)).text();
      const before = await page(base);
      const after = await page(deployed);
      expect(before).toContain(`<script src="/static/app.${BASE_BUILD}.js"></script>`);
      expect(after).not.toContain(BASE_BUILD);
      expect(before).not.toContain('Liczba drzwi');
      expect(after).toContain('<label for="drzwi">Liczba drzwi</label>');
      expect((await fetch(`${base.url}/static/app.${BASE_BUILD}.js`)).status).toBe(200);
      expect(await (await fetch(`${deployed.url}/`)).text()).not.toContain('Liczba drzwi');
    } finally {
      await base.close();
      await deployed.close();
    }
  });

  it('removed-link drops a home link with a release; renamed-button renames in place', async () => {
    const removed = await startReferencePortal({
      host: HOST,
      port: 0,
      scenarios: ['removed-link'],
    });
    const renamed = await startReferencePortal({
      host: HOST,
      port: 0,
      scenarios: ['renamed-button'],
    });
    try {
      const home = await (await fetch(`${removed.url}/`)).text();
      expect(home).not.toContain('href="/moje-polisy/przedluz"');
      expect(home).not.toContain(BASE_BUILD);
      const vehicle = await (await fetch(`${renamed.url}/kalkulator/pojazd`)).text();
      expect(vehicle).toContain('Przejdź dalej');
      expect(vehicle).toContain(BASE_BUILD);
    } finally {
      await removed.close();
      await renamed.close();
    }
  });

  it('moved-link moves the home shortcut into the menu of every page, same release', async () => {
    const portal = await startReferencePortal({ host: HOST, port: 0, scenarios: ['moved-link'] });
    try {
      const home = await (await fetch(`${portal.url}/`)).text();
      const shortcuts = home.slice(home.indexOf('id="szybko"'));
      expect(shortcuts).not.toContain('href="/moje-polisy/przedluz"');
      const faq = await (await fetch(`${portal.url}/faq`)).text();
      expect(faq).toContain('<li><a href="/moje-polisy/przedluz">Przedłuż polisę</a></li>');
      expect(home).toContain(BASE_BUILD);
    } finally {
      await portal.close();
    }
  });

  it('repeated-rows and numbered-sections serve their pages only while switched on', async () => {
    const base = await startReferencePortal({ host: HOST, port: 0 });
    const on = await startReferencePortal({
      host: HOST,
      port: 0,
      scenarios: ['repeated-rows', 'numbered-sections'],
    });
    try {
      expect((await fetch(`${base.url}/kierowcy`)).status).toBe(404);
      expect((await fetch(`${base.url}/sekcja/1`)).status).toBe(404);
      const three = await (await fetch(`${on.url}/kierowcy?n=3`)).text();
      expect(three.match(/<li><h3>Kierowca/g)).toHaveLength(3);
      expect(three).toContain('href="/kierowcy?n=4"');
      const s4 = await (await fetch(`${on.url}/sekcja/4`)).text();
      expect(s4).toContain('<label for="f3">Przebieg</label>');
      expect((await fetch(`${on.url}/sekcja/7`)).status).toBe(404);
    } finally {
      await base.close();
      await on.close();
    }
  });

  it('rule-drift raises the driver age to 21 in the date field, with a release', async () => {
    const portal = await startReferencePortal({ host: HOST, port: 0, scenarios: ['rule-drift'] });
    try {
      const page = await (
        await fetch(
          `${portal.url}/kalkulator/kierowca?marka=toyota&model=Corolla&rok_produkcji=2018&pojemnosc=1600&kod_pocztowy=00-001`,
        )
      ).text();
      expect(page).toContain('max="2005-01-15"');
      expect(page).toContain('od 21 do');
      expect(page).not.toContain(BASE_BUILD);
    } finally {
      await portal.close();
    }
  });

  it('deterministic-error answers 500 for one model name every time, and only for it', async () => {
    const portal = await startReferencePortal({
      host: HOST,
      port: 0,
      scenarios: ['deterministic-error'],
    });
    try {
      const vehicle = (model: string) =>
        `${portal.url}/kalkulator/pojazd?krok=1&marka=toyota&model=${encodeURIComponent(model)}` +
        '&rok_produkcji=2018&pojemnosc=1600&kod_pocztowy=00-001';
      for (let i = 0; i < 3; i++) {
        const res = await fetch(vehicle(FAILING_MODEL), { redirect: 'manual' });
        expect(res.status).toBe(500);
        expect(await res.text()).toContain('Wystąpił błąd techniczny');
      }
      expect((await fetch(vehicle('Corolla'), { redirect: 'manual' })).status).toBe(303);
      expect((await fetch(`${portal.url}/kalkulator/pojazd`)).status).toBe(200);
    } finally {
      await portal.close();
    }
  });

  it('reports its scenarios on the admin path, which robots.txt disallows', async () => {
    const portal = await startReferencePortal({ host: HOST, port: 0 });
    try {
      const res = await fetch(`${portal.url}/__admin/scenarios`);
      expect(await res.json()).toEqual({ scenarios: [] });
      const robots = await (await fetch(`${portal.url}/robots.txt`)).text();
      expect(robots).toContain('Disallow: /__admin/');
    } finally {
      await portal.close();
    }
  });
});
