import { ConfigError, FixSpec } from '@mudpuppy/config';
import { describe, expect, it } from 'vitest';
import { FIXES, loadFixes } from '../src/index.js';

const spec = (raw: unknown) => FixSpec.parse(raw);

describe('loadFixes (spec 030 FR-031)', () => {
  it('turns each fix into hooks named fix:<id>, at its points, with match and timeout', () => {
    const loaded = loadFixes('portal.yaml', [
      spec({ use: 'seed-cookie', with: { cookies: [{ name: 'flag', value: '1' }] } }),
      spec({ use: 'wait-for-mount', match: '/service/*', with: { selector: '#mfe form' } }),
    ]);
    expect(loaded.map((h) => [h.spec.point, h.spec.fn])).toEqual([
      ['onRunStart', 'fix:seed-cookie'],
      ['onBeforePageLoad', 'fix:seed-cookie'],
      ['onPageLoad', 'fix:wait-for-mount'],
      ['onBeforeClickAction', 'fix:wait-for-mount'],
    ]);
    const mount = loaded[2]!;
    expect(mount.matches('http://x.test/service/claim')).toBe(true);
    expect(mount.matches('http://x.test/home')).toBe(false);
    expect(loaded[0]!.matches('http://x.test/anything')).toBe(true);
    expect(mount.spec.timeout_ms).toBe(10_000);
  });

  it('refuses an unknown fix and bad parameters, naming the field', () => {
    const run = () =>
      loadFixes('portal.yaml', [
        spec({ use: 'no-such-fix' }),
        spec({ use: 'seed-cookie', with: { cookies: [] } }),
      ]);
    expect(run).toThrow(ConfigError);
    try {
      run();
    } catch (e) {
      const problems = (e as ConfigError).problems.join('\n');
      expect(problems).toContain('unknown fix "no-such-fix"');
      expect(problems).toContain('fixes[1] (seed-cookie).with.cookies');
    }
  });

  it('every plugin names a scar or field id and parses its defaults', () => {
    for (const plugin of FIXES.values()) {
      expect(plugin.scars.length, plugin.id).toBeGreaterThan(0);
      expect(plugin.summary.length, plugin.id).toBeGreaterThan(10);
    }
    expect(FIXES.get('expand-collapsed')!.params.parse({})).toMatchObject({ max: 60 });
  });
});

describe('seed-cookie', () => {
  it('adds only the missing cookies, on the base URL by default', async () => {
    const [hook] = loadFixes('p', [
      spec({
        use: 'seed-cookie',
        with: {
          cookies: [
            { name: 'a', value: '1' },
            { name: 'b', value: '2' },
          ],
        },
      }),
    ]);
    const added: unknown[] = [];
    await hook!.fn({
      config: { base_url: 'http://portal.test/' },
      cookies: {
        get: () => Promise.resolve([{ name: 'a', value: '1' }]),
        add: (c: unknown[]) => {
          added.push(...c);
          return Promise.resolve();
        },
      },
      log: () => {},
    } as never);
    expect(added).toEqual([{ name: 'b', value: '2', url: 'http://portal.test/' }]);
  });
});
