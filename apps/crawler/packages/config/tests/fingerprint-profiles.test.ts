import { describe, expect, it } from 'vitest';
import { ROWS_V2_PROFILE } from '@pathfinder/fingerprint';
import { FingerprintConfig, portalFingerprintProfile } from '../src/index.js';

describe('fingerprint profiles in portal.yaml (spec 039 T111)', () => {
  it('defaults to the built-in rows-v2', () => {
    const fingerprint = FingerprintConfig.parse({});
    expect(fingerprint).toEqual({ use: 'rows-v2', profiles: {} });
    expect(portalFingerprintProfile({ fingerprint })).toEqual(ROWS_V2_PROFILE);
  });

  it('uses a portal profile that extends the built-in', () => {
    const fingerprint = FingerprintConfig.parse({
      use: 'no-menu',
      profiles: { 'no-menu': { extends: 'rows-v2', ignore_names_in: ['navigation'] } },
    });
    const p = portalFingerprintProfile({ fingerprint });
    expect(p.name).toBe('no-menu');
    expect(p.rules.ignore_names_in).toEqual(['navigation']);
  });

  it('refuses an unknown profile, a cycle, an unknown key and a threshold out of range', () => {
    const issue = (v: unknown) => FingerprintConfig.safeParse(v).error?.issues[0];
    expect(issue({ use: 'nope' })).toMatchObject({ path: ['use'] });
    expect(issue({ profiles: { a: { extends: 'b' }, b: { extends: 'a' } } })?.message).toMatch(
      /cycle/,
    );
    expect(FingerprintConfig.safeParse({ profiles: { a: { rows: [] } } }).success).toBe(false);
    expect(
      FingerprintConfig.safeParse({ profiles: { a: { cluster_threshold: 1.5 } } }).success,
    ).toBe(false);
  });
});
