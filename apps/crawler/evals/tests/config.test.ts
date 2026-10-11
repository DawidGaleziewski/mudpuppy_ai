import { describe, expect, it } from 'vitest';
import { parseConfig, USAGE } from '../config.js';

const parse = (...argv: string[]) => parseConfig(argv, '/repo');

describe('parseConfig', () => {
  it('fills the defaults', () => {
    const r = parse('reference-insurer');
    expect(r).toEqual({
      ok: true,
      config: {
        root: '/repo',
        portal: 'reference-insurer',
        persona: 'guest',
        budgetUsd: '5',
        env: 'sandbox',
        model: undefined,
        sessionTimeoutS: undefined,
        crawlerOnly: false,
        promote: false,
        forcePromote: false,
        dryRun: false,
        inPlace: false,
        judges: true,
        resultsDir: '/repo/data/evals/reference-insurer',
      },
    });
  });

  it('reads every flag', () => {
    const r = parse(
      'proving-ground-bank',
      '--persona',
      'client',
      '--budget-usd',
      '2',
      '--env',
      'test',
      '--model',
      'sonnet',
      '--session-timeout',
      '20',
      '--crawler-only',
      '--promote',
      '--force-promote',
      '--dry-run',
      '--in-place',
      '--no-judges',
    );
    expect(r.ok && r.config).toMatchObject({
      judges: false,
      persona: 'client',
      budgetUsd: '2',
      env: 'test',
      model: 'sonnet',
      sessionTimeoutS: 20,
      crawlerOnly: true,
      promote: true,
      forcePromote: true,
      dryRun: true,
      inPlace: true,
    });
  });

  it.each([[], ['Bad!'], ['../etc']])('rejects a missing or malformed portal %j', (...argv) => {
    expect(parse(...argv)).toEqual({ ok: false, error: USAGE });
  });

  it.each([['--promte'], ['--persona'], ['--persona', '--dry-run']])(
    'rejects a typo or a flag without its value: %j',
    (...flags) => {
      const r = parse('reference-insurer', ...flags);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.error).toContain(USAGE);
    },
  );

  it.each(['0', '-3', '1.5', 'x'])('rejects session timeout %s', (t) => {
    expect(parse('proving-ground-bank', `--session-timeout=${t}`)).toEqual({
      ok: false,
      error: '--session-timeout takes a whole number of seconds',
    });
  });
});
