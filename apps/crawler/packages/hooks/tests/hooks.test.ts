import { join } from 'node:path';
import { HookSpec, PortalConfig, type HookPoint } from '@mudpuppy/config';
import { describe, expect, it } from 'vitest';
import {
  createHookRunner,
  loadHooks,
  type HookBrowser,
  type HookCookie,
  type HookRun,
} from '../src/index.js';

const FILE = join(import.meta.dirname, 'fixtures', 'hooks.ts');

const spec = (point: HookPoint, fn: string, extra: Record<string, unknown> = {}) =>
  HookSpec.parse({ point, fn, ...extra });

const config = PortalConfig.parse({
  id: 'demo',
  base_url: 'https://demo.example/',
  environment: 'sandbox',
  scope: {
    allowed_domains: ['demo.example'],
    max_depth: 3,
    max_states: 10,
    max_actions_per_state: 10,
    max_run_time_minutes: 5,
    max_steps: 20,
  },
});

function fakeBrowser() {
  const cookies: HookCookie[] = [];
  const evaluated: unknown[][] = [];
  const browser: HookBrowser = {
    getCookies: () => Promise.resolve([...cookies]),
    addCookies: (c) => {
      cookies.push(...c);
      return Promise.resolve();
    },
    clearCookies: () => {
      cookies.length = 0;
      return Promise.resolve();
    },
    route: () => Promise.resolve(),
    addInitScript: () => Promise.resolve(),
    evaluate: (fn, ...args) => {
      evaluated.push(args);
      return Promise.resolve(fn(...args));
    },
  };
  return { browser, cookies, evaluated };
}

async function runner(specs: HookSpec[]) {
  const fake = fakeBrowser();
  const runs: HookRun[] = [];
  const r = createHookRunner({
    hooks: await loadHooks(FILE, specs),
    browser: fake.browser,
    base: {
      persona: { id: 'guest', attributes: {} },
      environment: 'sandbox',
      run: { id: 'run-1', mode: 'map' },
      config,
    },
    onRun: (run) => runs.push(run),
  });
  return { r, runs, ...fake };
}

describe('loadHooks (spec 023 FR-002, edge cases)', () => {
  it('loads nothing when the portal maps no hook, even without a file', async () => {
    expect(await loadHooks('/nowhere/hooks.ts', [])).toEqual([]);
  });

  it('refuses a missing file, an unexported name and a non-function export', async () => {
    await expect(loadHooks('/nowhere/hooks.ts', [spec('onRunStart', 'x')])).rejects.toThrow(
      /does not exist/,
    );
    await expect(
      loadHooks(FILE, [spec('onRunStart', 'missing'), spec('onRunStart', 'notAFunction')]),
    ).rejects.toThrow(/"missing".*does not export.*"notAFunction"/);
  });

  it('refuses an unusable match pattern in the config', () => {
    expect(() => spec('onPageLoad', 'patchCalculator', { match: '/(bad/' })).toThrow(/regex/);
  });
});

describe('the hook runner (spec 023 FR-003..FR-006)', () => {
  it('runs onRunStart with cookies and records what it did and logged', async () => {
    const { r, runs, cookies } = await runner([spec('onRunStart', 'acceptConsent')]);
    const out = await r.run('onRunStart', '');
    expect(cookies).toEqual([{ name: 'consent', value: '1', url: 'https://demo.example/' }]);
    expect(out.patched).toBe(true);
    expect(runs).toMatchObject([
      {
        point: 'onRunStart',
        fn: 'acceptConsent',
        outcome: 'ok',
        did: ['cookies.add 1'],
        log: ['consent cookie set'],
      },
    ]);
  });

  it('runs a page hook only on matching URLs and passes in-page arguments', async () => {
    const { r, evaluated } = await runner([
      spec('onPageLoad', 'patchCalculator', { match: '/kalkulator/*' }),
    ]);
    expect((await r.run('onPageLoad', 'https://demo.example/faq')).runs).toEqual([]);
    const out = await r.run('onPageLoad', 'https://demo.example/kalkulator/oc');
    expect(out.runs[0]).toMatchObject({ outcome: 'ok', did: ['inPage'] });
    expect(evaluated).toEqual([['calc']]);
  });

  it('onBeforePageLoad: a rewrite is seen by later hooks; the first skip wins', async () => {
    const { r } = await runner([
      spec('onBeforePageLoad', 'toEnglish'),
      spec('onBeforePageLoad', 'skipPrint'),
    ]);
    expect(await r.run('onBeforePageLoad', 'https://demo.example/polisa/1')).toMatchObject({
      url: 'https://demo.example/polisa/1?lang=en',
      skip: null,
    });
    const { r: r2 } = await runner([
      spec('onBeforePageLoad', 'skipPrint'),
      spec('onBeforePageLoad', 'toEnglish'),
    ]);
    const out = await r2.run('onBeforePageLoad', 'https://demo.example/polisa/1/druk');
    expect(out.skip).toEqual({ fn: 'skipPrint', reason: 'print view opens a dialog' });
    expect(out.runs).toHaveLength(1);
  });

  it('onBeforeClickAction may ask to wait for a selector', async () => {
    const { r } = await runner([spec('onBeforeClickAction', 'waitForPrice')]);
    const out = await r.run('onBeforeClickAction', 'https://demo.example/', {
      role: 'button',
      name: 'Oblicz',
      locators: [],
    });
    expect(out.waitFor).toBe('#price');
  });

  it('a throw, a timeout or a wrong return is a recorded failure, never a crash', async () => {
    const { r, runs } = await runner([
      spec('onPageLoad', 'throws'),
      spec('onPageLoad', 'hangs', { timeout_ms: 100 }),
      spec('onPageLoad', 'answersWrong'),
    ]);
    const out = await r.run('onPageLoad', 'https://demo.example/');
    expect(out.runs.map((x) => [x.fn, x.outcome])).toEqual([
      ['throws', 'failed'],
      ['hangs', 'timeout'],
      ['answersWrong', 'failed'],
    ]);
    expect(runs[0]!.detail).toBe('boom');
    expect(runs[2]!.detail).toMatch(/onPageLoad does not take/);
  });
});
