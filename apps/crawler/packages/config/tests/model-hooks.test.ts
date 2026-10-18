import { describe, expect, it } from 'vitest';
import { ModelHooks } from '../src/index.js';

describe('portal model hooks (spec 039 design § 5.10)', () => {
  it('defaults every hook when `model:` is absent', () => {
    expect(ModelHooks.parse({})).toEqual({
      experiment_flags: [],
      business_errors: [],
      global_nav_share: 0.6,
      replay_budget: 20,
    });
  });

  it('accepts a header or meta build marker, cookie or storage flags, business errors', () => {
    const hooks = ModelHooks.parse({
      build_marker: { header: 'x-app-version' },
      experiment_flags: [{ cookie: 'ab_variant' }, { storage: 'exp.hero' }],
      business_errors: [{ text: 'Nie możemy zaproponować ubezpieczenia' }],
    });
    expect(hooks.build_marker).toEqual({ header: 'x-app-version' });
    expect(hooks.experiment_flags).toHaveLength(2);
  });

  it('refuses an empty marker, a version endpoint (the crawler sends no requests) and unknown keys', () => {
    expect(ModelHooks.safeParse({ build_marker: {} }).success).toBe(false);
    expect(ModelHooks.safeParse({ build_marker: { endpoint: '/api/version' } }).success).toBe(
      false,
    );
    expect(ModelHooks.safeParse({ replay: 3 }).success).toBe(false);
  });
});
