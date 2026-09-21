import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadPortal } from '../src/index.js';
import { PORTAL_YAML, tmpTree } from './helpers.js';

const load = (yaml: string) => {
  const root = tmpTree({ 'portal.yaml': yaml });
  return { file: join(root, 'portal.yaml'), run: () => loadPortal(join(root, 'portal.yaml')) };
};
const problems = (fn: () => unknown): { file: string; problems: string[] } => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ConfigError);
    return e as ConfigError;
  }
  throw new Error('expected ConfigError');
};

describe('loadPortal', () => {
  it('loads a valid file, with null compliance values allowed', () => {
    const p = load(PORTAL_YAML).run();
    expect(p.environment).toBe('production');
    expect(p.compliance).toEqual({
      robots_checked_on: null,
      terms_reviewed_on: null,
      terms_reviewed_by: null,
    });
    expect(p.max_action_class).toBeUndefined();
    expect(p.denylist).toContain('path:/oferty/wystaw/*');
  });

  it('rejects a missing environment, naming the file and field', () => {
    const t = load(PORTAL_YAML.replace('environment: production\n', ''));
    const e = problems(t.run);
    expect(e.file).toBe(t.file);
    expect(e.problems.join()).toContain('environment');
  });

  it('rejects production without rate_limit', () => {
    const yaml = PORTAL_YAML.replace(/rate_limit:[\s\S]*?user_agent:.*\n/, '');
    expect(problems(load(yaml).run).problems.join()).toContain('rate_limit');
  });

  it('allows staging without rate_limit', () => {
    const yaml = PORTAL_YAML.replace('environment: production', 'environment: staging').replace(
      /rate_limit:[\s\S]*?user_agent:.*\n/,
      '',
    );
    expect(load(yaml).run().environment).toBe('staging');
  });

  it('rejects an unknown denylist entry', () => {
    const yaml = PORTAL_YAML.replace(
      'denylist: [logout,',
      'denylist: [please_dont_click_stuff, logout,',
    );
    expect(problems(load(yaml).run).problems.join()).toContain('denylist.0');
  });

  it('rejects an unknown top-level key and bad compliance dates', () => {
    expect(problems(load(PORTAL_YAML + 'surprise: 1\n').run).problems.join()).toContain('surprise');
    const bad = PORTAL_YAML.replace('robots_checked_on: null', 'robots_checked_on: yesterday');
    expect(problems(load(bad).run).problems.join()).toContain('compliance.robots_checked_on');
  });

  it('reports invalid YAML and missing files by file name', () => {
    expect(problems(load('a: [unclosed').run).problems[0]).toContain('invalid YAML');
    expect(problems(() => loadPortal('/no/such/portal.yaml')).file).toBe('/no/such/portal.yaml');
  });
});
