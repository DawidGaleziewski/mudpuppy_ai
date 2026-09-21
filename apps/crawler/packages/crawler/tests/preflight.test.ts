import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const playwrightTouched = vi.fn();
vi.mock('playwright', () => {
  playwrightTouched();
  return { chromium: { launch: playwrightTouched } };
});

import { preflight } from '../src/preflight.js';

const PORTAL = (
  over: { env?: string; compliance?: string; ua?: string; base?: string; domain?: string } = {},
) => `
id: shop
base_url: ${over.base ?? 'https://shop.pl/'}
environment: ${over.env ?? 'production'}
compliance:
${over.compliance ?? '  robots_checked_on: 2026-09-20\n  terms_reviewed_on: 2026-09-21\n  terms_reviewed_by: dawid'}
scope:
  allowed_domains: [${over.domain ?? 'shop.pl'}]
  allowed_paths: ["/*"]
  max_depth: 6
  max_states: 500
  max_actions_per_state: 20
  max_run_time_minutes: 60
  max_steps: 2000
denylist: [logout]
rate_limit:
  requests_per_second: 1
  max_concurrency: 1
  user_agent: "${over.ua ?? 'PathfinderAI-Crawler/0.1 (+ops@corp.pl)'}"
`;
const PERSONA = `id: guest\nauth: none\nmax_action_class: read\nviewport: { width: 1366, height: 768 }\nlocale: pl-PL\n`;

const dirs: string[] = [];
function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'pf-preflight-'));
  dirs.push(root);
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return root;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  vi.restoreAllMocks();
  playwrightTouched.mockClear();
});

const ok = () =>
  repo({ 'portals/shop/portal.yaml': PORTAL(), 'personas/shop/guest.yaml': PERSONA });

describe('preflight', () => {
  it('passes a complete production config and returns the effective config and narrowed scope', () => {
    const r = preflight('shop', 'guest', { root: ok() });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.effective.effectiveMaxActionClass).toBe('read');
      expect(r.scope.max_steps).toBe(2000);
    }
  });

  it('finds a persona nested under a process folder', () => {
    const root = repo({
      'portals/shop/portal.yaml': PORTAL(),
      'personas/shop/checkout/guest.yaml': PERSONA,
    });
    expect(preflight('shop', 'guest', { root }).ok).toBe(true);
  });

  const refused = (root: string, code: string, needle: string) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const t0 = performance.now();
    const r = preflight('shop', 'guest', { root });
    const ms = performance.now() - t0;
    expect(r).toMatchObject({ ok: false, code });
    expect(r.ok === false && r.message).toContain(needle);
    expect(ms).toBeLessThan(5000);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(playwrightTouched).not.toHaveBeenCalled();
  };

  it('refuses a production address whose config does not declare production', () => {
    refused(
      repo({
        'portals/shop/portal.yaml': PORTAL({ env: 'sandbox' }),
        'personas/shop/guest.yaml': PERSONA,
      }),
      'ENV_GUARD_REFUSED',
      'environment: production',
    );
  });

  it('refuses production while any compliance value is null', () => {
    const compliance =
      '  robots_checked_on: null\n  terms_reviewed_on: 2026-09-21\n  terms_reviewed_by: dawid';
    refused(
      repo({
        'portals/shop/portal.yaml': PORTAL({ compliance }),
        'personas/shop/guest.yaml': PERSONA,
      }),
      'ENV_GUARD_REFUSED',
      'robots_checked_on',
    );
  });

  it('refuses production with a placeholder User-Agent', () => {
    refused(
      repo({
        'portals/shop/portal.yaml': PORTAL({
          ua: 'PathfinderAI-Crawler/0.1 (+contact@example.com)',
        }),
        'personas/shop/guest.yaml': PERSONA,
      }),
      'ENV_GUARD_REFUSED',
      'placeholder',
    );
  });

  it('refuses an invalid config with CONFIG_INVALID naming the file', () => {
    refused(
      repo({ 'portals/shop/portal.yaml': 'id: shop\n', 'personas/shop/guest.yaml': PERSONA }),
      'CONFIG_INVALID',
      'portal.yaml',
    );
  });

  it('refuses a missing persona and unsafe ids', () => {
    const root = repo({ 'portals/shop/portal.yaml': PORTAL() });
    expect(preflight('shop', 'ghost', { root })).toMatchObject({
      ok: false,
      code: 'CONFIG_INVALID',
    });
    expect(preflight('../shop', 'guest', { root })).toMatchObject({
      ok: false,
      code: 'CONFIG_INVALID',
    });
    expect(preflight('shop', '../../etc', { root })).toMatchObject({
      ok: false,
      code: 'CONFIG_INVALID',
    });
  });

  it('allows a sandbox portal on a local address without compliance data', () => {
    const root = repo({
      'portals/shop/portal.yaml': PORTAL({
        env: 'sandbox',
        base: 'http://localhost:8080/',
        domain: 'localhost',
        compliance:
          '  robots_checked_on: null\n  terms_reviewed_on: null\n  terms_reviewed_by: null',
      }),
      'personas/shop/guest.yaml': PERSONA,
    });
    expect(preflight('shop', 'guest', { root }).ok).toBe(true);
  });
});
