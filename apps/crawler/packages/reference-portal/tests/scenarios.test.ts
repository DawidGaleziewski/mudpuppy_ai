import { describe, expect, it } from 'vitest';
import {
  BASE_BUILD,
  BUILT_SCENARIOS,
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
