import { describe, expect, it } from 'vitest';
import type { PersonaConfig, PortalConfig } from '@pathfinder/config';
import { EnvGuardError, assertRunAllowed, looksLikeProduction } from '../src/index.js';

const scope = {
  allowed_domains: ['marketsite.example'],
  allowed_paths: ['/*'],
  external_link_policy: 'record' as const,
  max_depth: 6,
  max_states: 500,
  max_actions_per_state: 20,
  max_run_time_minutes: 60,
  max_steps: 2000,
};
const portal = (over: Partial<PortalConfig> = {}): PortalConfig => ({
  id: 'p',
  base_url: 'https://marketsite.example/',
  environment: 'production',
  compliance: { robots_checked_on: null, terms_reviewed_on: null, terms_reviewed_by: null },
  scope,
  denylist: [],
  obstacles: [],
  item_route_templates: [],
  block_signatures: [],
  robots_page_requests: 'block',
  robots: 'respect',
  action_rules: [],
  pii_scrub: false,
  rate_limit: { requests_per_second: 1, max_concurrency: 1, user_agent: 'x' },
  ...over,
});
const persona = (max: PersonaConfig['max_action_class'] = 'read'): PersonaConfig => ({
  id: 'g',
  extends: [],
  auth: 'none',
  max_action_class: max,
  scope_restrictions: {},
  budgets: {},
  consent: {},
  viewport: { width: 1, height: 1 },
  locale: 'pl-PL',
  trace_inputs: {},
});

describe('assertRunAllowed', () => {
  it('refuses a production URL when the config does not declare environment: production', () => {
    for (const environment of ['staging', 'sandbox'] as const) {
      expect(() => assertRunAllowed(portal({ environment }), persona())).toThrow(EnvGuardError);
    }
  });

  it('carries a machine code and a readable reason', () => {
    try {
      assertRunAllowed(portal({ environment: 'sandbox' }), persona());
      expect.unreachable();
    } catch (e) {
      expect((e as EnvGuardError).code).toBe('ENV_GUARD_REFUSED');
      expect((e as EnvGuardError).message).toContain('environment: production');
    }
  });

  it('allows staging/sandbox on non-production-looking addresses', () => {
    const scoped = { ...scope, allowed_domains: ['staging.marketsite.example'] };
    expect(
      assertRunAllowed(
        portal({
          environment: 'staging',
          base_url: 'https://staging.marketsite.example/',
          scope: scoped,
        }),
        persona(),
      ).effectiveMaxActionClass,
    ).toBe('read');
    const local = { ...scope, allowed_domains: ['localhost'] };
    expect(() =>
      assertRunAllowed(
        portal({ environment: 'sandbox', base_url: 'http://localhost:8080/', scope: local }),
        persona(),
      ),
    ).not.toThrow();
  });

  it('caps a persona above read to read on production (default portal ceiling)', () => {
    expect(
      assertRunAllowed(portal(), persona('external-side-effect')).effectiveMaxActionClass,
    ).toBe('read');
  });

  it('staging/sandbox permits above-read only when the portal declares it', () => {
    const local = { ...scope, allowed_domains: ['localhost'] };
    const base = {
      environment: 'sandbox' as const,
      base_url: 'http://localhost:8080/',
      scope: local,
    };
    expect(assertRunAllowed(portal(base), persona('destructive')).effectiveMaxActionClass).toBe(
      'read',
    );
    expect(
      assertRunAllowed(portal({ ...base, max_action_class: 'mutating' }), persona('destructive'))
        .effectiveMaxActionClass,
    ).toBe('mutating');
    expect(
      assertRunAllowed(portal({ ...base, max_action_class: 'destructive' }), persona('mutating'))
        .effectiveMaxActionClass,
    ).toBe('mutating');
  });

  it('is synchronous and needs no browser', () => {
    const r = assertRunAllowed(portal(), persona());
    expect(r).not.toBeInstanceOf(Promise);
  });
});

describe('looksLikeProduction', () => {
  it.each([
    ['https://marketsite.example/', true],
    ['https://www.example-shop.com/', true],
    ['http://localhost:3000/', false],
    ['http://127.0.0.1:8080/', false],
    ['https://staging.example.com/', false],
    ['https://shop.sandbox.example.com/', false],
    ['https://mock-portal.test/', false],
    ['not a url', true],
  ])('%s -> %s', (url, expected) => expect(looksLikeProduction(url)).toBe(expected));
});
