import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadPersona } from '../src/index.js';
import { tmpTree } from './helpers.js';

const expectError = (fn: () => unknown): ConfigError => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ConfigError);
    return e as ConfigError;
  }
  throw new Error('expected ConfigError');
};
const OK = 'viewport: { width: 1, height: 1 }\nlocale: pl-PL\n';

describe('persona rejections', () => {
  it('fails a circular extends naming the offending file', () => {
    const root = tmpTree({
      'a.yaml': `id: a\nextends: [b.yaml]\n${OK}`,
      'b.yaml': 'extends: [c.yaml]\n',
      'c.yaml': 'extends: [b.yaml]\n',
    });
    const e = expectError(() => loadPersona(join(root, 'a.yaml')));
    expect(e.file).toBe(join(root, 'b.yaml'));
    expect(e.problems[0]).toContain('circular extends');
    expect(e.problems[0]).toContain('c.yaml');
  });

  it('fails a persona that extends itself', () => {
    const root = tmpTree({ 'a.yaml': `id: a\nextends: [a.yaml]\n${OK}` });
    expect(expectError(() => loadPersona(join(root, 'a.yaml'))).problems[0]).toContain('circular');
  });

  it('fails an inline credential naming file and field, without echoing the value', () => {
    const root = tmpTree({
      'p.yaml': `id: p\n${OK}auth:\n  username: ref:MARKETSITE_USER\n  password: hunter2hunter2\n`,
    });
    const e = expectError(() => loadPersona(join(root, 'p.yaml')));
    expect(e.file).toBe(join(root, 'p.yaml'));
    expect(e.message).toContain('auth.password');
    expect(e.message).not.toContain('hunter2');
    expect(e.problems.join()).not.toContain('auth.username');
  });

  it('accepts ref: credentials', () => {
    const root = tmpTree({
      'p.yaml': `id: p\n${OK}auth:\n  username: ref:MARKETSITE_USER\n  password: ref:MARKETSITE_PASS\n`,
    });
    expect(loadPersona(join(root, 'p.yaml')).auth).toEqual({
      username: 'ref:MARKETSITE_USER',
      password: 'ref:MARKETSITE_PASS',
    });
  });

  it('rejects an inline secret in a mixin, naming the mixin file', () => {
    const root = tmpTree({
      'm.yaml': 'auth:\n  token: abcdef0123456789abcdef\n',
      'p.yaml': `id: p\nextends: [m.yaml]\n${OK}`,
    });
    expect(expectError(() => loadPersona(join(root, 'p.yaml'))).file).toBe(join(root, 'm.yaml'));
  });

  it('fails a schema mismatch naming file and problem, and a missing merged field', () => {
    const root = tmpTree({
      'bad.yaml': `id: p\n${OK}max_action_class: superuser\n`,
      'nolocale.yaml': 'id: p\nviewport: { width: 1, height: 1 }\n',
    });
    const e = expectError(() => loadPersona(join(root, 'bad.yaml')));
    expect(e.file).toBe(join(root, 'bad.yaml'));
    expect(e.problems.join()).toContain('max_action_class');
    expect(expectError(() => loadPersona(join(root, 'nolocale.yaml'))).problems.join()).toContain(
      'locale',
    );
  });

  it('fails a missing extends target naming that file', () => {
    const root = tmpTree({ 'p.yaml': `id: p\nextends: [nope.yaml]\n${OK}` });
    expect(expectError(() => loadPersona(join(root, 'p.yaml'))).file).toBe(join(root, 'nope.yaml'));
  });
});
