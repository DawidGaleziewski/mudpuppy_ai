import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canLaunchBrowser } from '@mudpuppy/crawler';
import { startReferencePortal } from '@mudpuppy/reference-portal';
import { startHarness } from './harness.js';

/**
 * A portal-wide menu change (spec 039 T114, owner answer 3 of 2026-10-20): a scan, then the main
 * menu gains one link on every page, then a second scan. Under the built-in `rows-v2` and under a
 * profile that ignores the menu's names (`no-menu`), the portal model keeps every screen: no
 * screen is new, none retired. Probe runs that only look (headless, no LLM).
 */
const available = await canLaunchBrowser();

const PERSONA =
  'id: guest\nauth: none\nmax_action_class: read\nviewport: { width: 1280, height: 800 }\nlocale: pl-PL\n';

const portalYaml = (origin: string, use: string) => `
id: reference-insurer
base_url: ${origin}/
environment: sandbox
compliance:
  robots_checked_on: 2026-10-02
  terms_reviewed_on: 2026-10-02
  terms_reviewed_by: local test portal, no terms
scope:
  allowed_domains: [127.0.0.1]
  external_link_policy: record
  max_depth: 50
  max_states: 60
  max_actions_per_state: 40
  max_run_time_minutes: 5
  max_steps: 10
urls:
  disallowed: ["/__admin/*"]
rate_limit: { requests_per_second: 20, max_concurrency: 1, user_agent: "MudPuppy-Crawler/0.1 (local reference portal)" }
fingerprint:
  use: ${use}
  profiles:
    no-menu: { extends: rows-v2, ignore_names_in: [navigation] }
`;

const PAGES = ['/', '/ubezpieczenia/samochod', '/kalkulator/pojazd', '/faq'];

async function scanTwice(use: string) {
  let portal = await startReferencePortal({ host: '127.0.0.1', port: 0 });
  const h = await startHarness({
    'portals/reference-insurer/portal.yaml': portalYaml(portal.url.replace(/\/$/, ''), use),
    'personas/reference-insurer/guest.yaml': PERSONA,
  });
  const look = async () => {
    const start = await h.call('start_run', {
      portal_id: 'reference-insurer',
      persona_id: 'guest',
      mode: 'probe',
      replay: { inputs: {} },
    });
    expect(start.isError, JSON.stringify(start.body)).toBeFalsy();
    const runId = start.body.run_id as string;
    for (const p of PAGES) {
      const r = await h.call('navigate', {
        run_id: runId,
        url: new URL(p, portal.url).href,
        rationale: 'look',
      });
      expect(r.isError, JSON.stringify(r.body)).toBeFalsy();
    }
    await h.call('finish_run', { run_id: runId, rationale: 'looked' });
  };
  const screens = () =>
    h.ctx.raw
      .prepare("SELECT key FROM model_screens WHERE status = 'active' ORDER BY key")
      .all()
      .map((r) => (r as { key: string }).key);
  try {
    await look();
    const before = screens();
    await portal.close();
    // The changed menu is served on a fresh port (see model-deployment.e2e.test.ts).
    portal = await startReferencePortal({ host: '127.0.0.1', port: 0, scenarios: ['menu-link'] });
    writeFileSync(
      join(h.ctx.root, 'portals/reference-insurer/portal.yaml'),
      portalYaml(portal.url.replace(/\/$/, ''), use),
    );
    await look();
    const deviations = h.ctx.raw
      .prepare('SELECT kind, count(*) AS n FROM deviations GROUP BY kind ORDER BY kind')
      .all() as { kind: string; n: number }[];
    const profiles = h.ctx.raw
      .prepare('SELECT DISTINCT fingerprint_profile AS p FROM model_versions')
      .all() as { p: string }[];
    const states = h.ctx.raw.prepare('SELECT count(*) AS n FROM states').get() as { n: number };
    return { before, after: screens(), deviations, profiles, states: states.n };
  } finally {
    await h.cleanup();
    await portal.close();
  }
}

describe.skipIf(!available)('a menu change keeps every screen (spec 039 T114)', () => {
  it('under rows-v2', async () => {
    const r = await scanTwice('rows-v2');
    expect(r.before).toHaveLength(PAGES.length);
    expect(r.after).toEqual(r.before);
    expect(r.deviations.find((d) => d.kind === 'new_screen')).toBeUndefined();
    expect(r.profiles.map((p) => p.p.split('@')[0])).toEqual(['rows-v2']);
  }, 120_000);

  it('under a no-menu profile, with no new page version at all', async () => {
    const r = await scanTwice('no-menu');
    expect(r.after).toEqual(r.before);
    expect(r.after).toHaveLength(PAGES.length);
    expect(r.deviations.find((d) => d.kind === 'new_screen')).toBeUndefined();
    expect(r.states).toBe(PAGES.length);
    expect(r.profiles.map((p) => p.p.split('@')[0])).toEqual(['no-menu']);
  }, 120_000);
});
