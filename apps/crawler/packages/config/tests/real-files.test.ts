import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { loadEffectiveConfig } from '../src/index.js';

const root = (p: string) => fileURLToPath(new URL(`../../../../../${p}`, import.meta.url));

describe('repository config files', () => {
  it('portals/marketsite + guest load and resolve to the read ceiling', () => {
    const e = loadEffectiveConfig(
      root('portals/marketsite/portal.yaml'),
      root('personas/marketsite/guest.yaml'),
    );
    expect(e.portal.environment).toBe('production');
    expect(e.effectiveMaxActionClass).toBe('read');
    expect(e.portal.denylist).toContain('path:/oferty/wystaw/*');
  });
});
