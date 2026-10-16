import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  declaredEnvironments,
  environmentsOf,
  EVAL_ENVIRONMENT,
  requireEnvironment,
} from '../src/environments.js';
import type { ConfigError } from '../src/errors.js';

/** A root with portal files: `{ id: yaml }`. */
function root(portals: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'pf-envs-'));
  for (const [id, yaml] of Object.entries(portals)) {
    mkdirSync(join(dir, 'portals', id), { recursive: true });
    writeFileSync(join(dir, 'portals', id, 'portal.yaml'), yaml);
  }
  return dir;
}

const r = root({
  a: 'id: a\nenvironments:\n  dev: { base_url: "http://dev.a.test/" }\n  acceptance: { base_url: "http://acc.a.test/" }\n',
  b: 'id: b\nenvironment: live\nbase_url: http://b.test/\n',
  broken: 'id: [',
});

describe('declared environments (spec 030 R-61, D-1)', () => {
  it('collects the names every portal declares, free names included', () => {
    expect(declaredEnvironments(r)).toEqual(['acceptance', 'dev', 'live']);
  });

  it('has no default: an unset environment is refused, naming the declared ones', () => {
    expect(() => requireEnvironment(r, undefined)).toThrow(
      /no environment chosen and there is no default; set PATHFINDER_ENV to one of: acceptance, dev, live/,
    );
  });

  it('refuses an undeclared name (a typo would open a stray store)', () => {
    expect(() => requireEnvironment(r, 'acceptence')).toThrow(/not declared by any portal/);
  });

  it('accepts a declared name and an eval environment, with no special name', () => {
    expect(requireEnvironment(r, 'live')).toBe('live');
    expect(requireEnvironment(r, 'eval-bank')).toBe('eval-bank');
    expect(() => requireEnvironment(r, 'production')).toThrow(/not declared/);
  });
});

// Spec 031 T010: the surviving mutants of the guard (Stryker on `config`, findings F-05).
describe('the environment guard, edges', () => {
  it('admits only whole eval names: anchored at both ends, any number of parts', () => {
    expect(EVAL_ENVIRONMENT.test('eval')).toBe(true);
    expect(EVAL_ENVIRONMENT.test('eval-bank-2')).toBe(true);
    expect(EVAL_ENVIRONMENT.test('my-eval')).toBe(false);
    expect(EVAL_ENVIRONMENT.test('evaluation')).toBe(false);
    expect(EVAL_ENVIRONMENT.test('eval-Bank')).toBe(false);
  });

  it('reads names from `environments:` keys, else the legacy `environment`, else none', () => {
    expect(environmentsOf({ environments: { dev: {}, live: {} }, environment: 'x' })).toEqual([
      'dev',
      'live',
    ]);
    expect(environmentsOf({ environment: 'live' })).toEqual(['live']);
    expect(environmentsOf({ environment: 3 })).toEqual([]);
    expect(environmentsOf({ environments: ['dev'] })).toEqual([]);
    expect(environmentsOf(null)).toEqual([]);
    expect(environmentsOf(['dev'])).toEqual([]);
    expect(environmentsOf('dev')).toEqual([]);
  });

  it('skips files and folders without a portal file, and a root with no portals folder', () => {
    const dir = root({ a: 'id: a\nenvironment: dev\n' });
    mkdirSync(join(dir, 'portals', 'empty'));
    writeFileSync(join(dir, 'portals', 'stray.yaml'), 'environment: stray\n');
    expect(declaredEnvironments(dir)).toEqual(['dev']);
    expect(declaredEnvironments(mkdtempSync(join(tmpdir(), 'pf-envs-none-')))).toEqual([]);
  });

  it('a blank name is "unset"; with nothing declared the message says how to declare one', () => {
    const none = mkdtempSync(join(tmpdir(), 'pf-envs-none-'));
    expect(() => requireEnvironment(r, '   ')).toThrow(/no environment chosen/);
    expect(() => requireEnvironment(none, undefined)).toThrow(
      /one of: none: declare one in a portal file$/,
    );
    expect(() => requireEnvironment(none, 'dev')).toThrow(
      'environment "dev" is not declared by any portal (declared: none: declare one in a portal file); a typo would open a separate, empty store',
    );
    expect(() => requireEnvironment(r, 'dev2')).toThrow('(declared: acceptance, dev, live)');
  });

  it.each([undefined, 'typo'])('names the environment variable in the error (%s)', (name) => {
    try {
      requireEnvironment(r, name);
      expect.unreachable();
    } catch (e) {
      expect((e as ConfigError).file).toBe('PATHFINDER_ENV');
    }
  });
});
