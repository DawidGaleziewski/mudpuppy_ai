// Spec 011 FR-008: one portal, several environments, each with its own address and limit.

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ConfigError,
  EnvironmentChoiceError,
  loadPortal,
  portalEnvironments,
} from '../src/index.js';
import { PORTAL_YAML, tmpTree } from './helpers.js';

const MULTI = `id: shop
robots: ignore
environments:
  production:
    base_url: https://shop.example.pl/
    max_action_class: external-side-effect
  staging:
    base_url: https://staging.shop.example.pl/
    allowed_domains: [staging.shop.example.pl]
scope:
  allowed_domains: [shop.example.pl]
  allowed_paths: ["/*"]
  max_depth: 6
  max_states: 100
  max_actions_per_state: 40
  max_run_time_minutes: 30
  max_steps: 400
rate_limit:
  requests_per_second: 2
  max_concurrency: 1
  user_agent: "PathfinderAI-Crawler/0.1 (test)"
`;

const file = (yaml: string) => join(tmpTree({ 'portal.yaml': yaml }), 'portal.yaml');
const refusal = (fn: () => unknown): ConfigError => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ConfigError);
    return e as ConfigError;
  }
  throw new Error('expected ConfigError');
};

describe('portal environments', () => {
  it('resolves the chosen environment: address, limit and its own domains', () => {
    const f = file(MULTI);
    const prod = loadPortal(f, 'production');
    expect(prod).toMatchObject({
      environment: 'production',
      base_url: 'https://shop.example.pl/',
      max_action_class: 'external-side-effect',
    });
    expect(prod.scope.allowed_domains).toEqual(['shop.example.pl']);
    const staging = loadPortal(f, 'staging');
    expect(staging.environment).toBe('staging');
    expect(staging.max_action_class).toBeUndefined();
    expect(staging.scope.allowed_domains).toEqual(['staging.shop.example.pl']);
  });

  it('asks for a choice when there are several, names the missing one', () => {
    const f = file(MULTI);
    const choose = refusal(() => loadPortal(f));
    expect(choose).toBeInstanceOf(EnvironmentChoiceError);
    expect((choose as EnvironmentChoiceError).environments).toEqual(['production', 'staging']);
    expect(refusal(() => loadPortal(f, 'sandbox')).problems.join()).toContain(
      'has no environment "sandbox"; it has production, staging',
    );
  });

  it('needs no choice with one environment', () => {
    const one = MULTI.replace(/ {2}staging:\n.*\n.*\n/, '');
    expect(loadPortal(file(one)).environment).toBe('production');
  });

  it('refuses base_url or environment at the top next to environments', () => {
    const both = MULTI.replace('robots: ignore\n', 'robots: ignore\nbase_url: https://x.pl/\n');
    expect(refusal(() => loadPortal(file(both), 'production')).problems.join()).toContain(
      'go inside each environment',
    );
  });

  it('lists environments in order; a legacy file has its one', () => {
    expect(portalEnvironments(file(MULTI))).toEqual([
      {
        environment: 'production',
        base_url: 'https://shop.example.pl/',
        max_action_class: 'external-side-effect',
      },
      { environment: 'staging', base_url: 'https://staging.shop.example.pl/' },
    ]);
    const legacy = file(PORTAL_YAML);
    expect(portalEnvironments(legacy).map((e) => e.environment)).toEqual(['production']);
    expect(loadPortal(legacy, 'production').environment).toBe('production');
    expect(refusal(() => loadPortal(legacy, 'sandbox')).problems.join()).toContain(
      'has no environment "sandbox"',
    );
  });
});
