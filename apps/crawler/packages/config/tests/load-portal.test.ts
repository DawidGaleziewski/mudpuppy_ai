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

  it('defaults robots_page_requests to block and accepts allow_and_record (FR-009)', () => {
    expect(load(PORTAL_YAML).run().robots_page_requests).toBe('block');
    const allow = load(PORTAL_YAML + 'robots_page_requests: allow_and_record\n').run();
    expect(allow.robots_page_requests).toBe('allow_and_record');
  });

  it('rejects any other robots_page_requests value, naming the file and field', () => {
    const t = load(PORTAL_YAML + 'robots_page_requests: ignore\n');
    const e = problems(t.run);
    expect(e.file).toBe(t.file);
    expect(e.problems.join()).toContain('robots_page_requests');
  });

  it('accepts url: denylist entries (FR-010)', () => {
    const yaml = PORTAL_YAML.replace(
      'denylist: [logout,',
      'denylist: ["url:*itm_campaign=*", logout,',
    );
    expect(load(yaml).run().denylist).toContain('url:*itm_campaign=*');
  });

  it('rejects an empty url: glob and a mistyped prefix with the contract message', () => {
    for (const bad of ['"url:"', '"urls:*x*"']) {
      const yaml = PORTAL_YAML.replace('denylist: [logout,', `denylist: [${bad}, logout,`);
      const msg = problems(load(yaml).run).problems.join();
      expect(msg).toContain('denylist.0');
      expect(msg).toContain('must be a rule id, "path:<glob>" or "url:<glob>"');
    }
  });

  describe('action_rules (spec 002 FR-015 to FR-017, SC-006)', () => {
    const withRules = (rules: string, denylist = 'denylist: [logout,') =>
      PORTAL_YAML.replace('denylist: [logout,', denylist) + `action_rules:\n${rules}`;

    it('loads new rules and extensions of built-in rules; the denylist may list a portal rule id', () => {
      const p = load(
        withRules(
          '  - { id: renew_policy, class: external-side-effect, keywords: ["przedłuż polisę"], paths: ["/przedluzenie/*"] }\n  - { id: purchase, keywords: ["jetzt kaufen"] }\n',
          'denylist: [renew_policy, logout,',
        ),
      ).run();
      expect(p.action_rules.map((r) => r.id)).toEqual(['renew_policy', 'purchase']);
      expect(p.denylist).toContain('renew_policy');
    });

    it.each([
      ['class read', '  - { id: my_rule, class: read, keywords: [x] }\n', 'action_rules.0', 'read'],
      [
        'a lowered built-in class',
        '  - { id: purchase, class: mutating, keywords: [x] }\n',
        'action_rules.0',
        'class "mutating" is lower than built-in "purchase" (external-side-effect)',
      ],
      [
        'an alias id',
        '  - { id: buy_now, keywords: [x] }\n',
        'action_rules.0.id',
        '"buy_now" is an alias of "purchase"; extend "purchase" instead',
      ],
      ['a new id without class', '  - { id: my_rule, keywords: [x] }\n', 'action_rules.0', 'class'],
      [
        'no keywords and no paths',
        '  - { id: my_rule, class: mutating }\n',
        'action_rules.0',
        'needs keywords or paths',
      ],
      [
        'a duplicate id',
        '  - { id: my_rule, class: mutating, keywords: [x] }\n  - { id: my_rule, class: mutating, keywords: [y] }\n',
        'action_rules.1.id',
        'duplicate',
      ],
      [
        'a non-slug id',
        '  - { id: "My Rule", class: mutating, keywords: [x] }\n',
        'action_rules.0.id',
        'slug',
      ],
      [
        'an empty keyword',
        '  - { id: my_rule, class: mutating, keywords: [""] }\n',
        'action_rules.0.keywords',
        '',
      ],
      [
        'an unknown field',
        '  - { id: my_rule, class: mutating, keywords: [x], regex: "a.*" }\n',
        'action_rules.0',
        'regex',
      ],
    ])('rejects %s, naming the file and the rule', (_name, rules, where, text) => {
      const t = load(withRules(rules));
      const e = problems(t.run);
      expect(e.file).toBe(t.file);
      const msg = e.problems.join('\n');
      expect(msg).toContain(where);
      expect(msg).toContain(text);
    });

    it('rejects a denylist id that is neither built-in nor declared in action_rules', () => {
      const e = problems(
        load(PORTAL_YAML.replace('denylist: [logout,', 'denylist: [renew_policy, logout,')).run,
      );
      expect(e.problems.join()).toContain('denylist.0');
    });
  });
});
