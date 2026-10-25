import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEffectiveConfig, loadPersona } from '../src/index.js';
import { PORTAL_YAML, tmpTree } from './helpers.js';

const root = (p: string) => fileURLToPath(new URL(`../../../../../${p}`, import.meta.url));

// The real anonymous-base mixin, under a guest and a guest-mobile persona as a portal writes them.
const dir = () =>
  tmpTree({
    'portal.yaml': PORTAL_YAML,
    'personas/_mixins/anonymous-base.yaml': readFileSync(
      root('personas/_mixins/anonymous-base.yaml'),
      'utf8',
    ),
    'personas/live/guest.yaml': 'id: guest\nextends: ["../_mixins/anonymous-base.yaml"]\n',
    'personas/live/guest-mobile.yaml':
      'id: guest-mobile\nextends: ["guest.yaml"]\nviewport: { width: 390, height: 844 }\n',
  });

describe('persona files over the real mixin', () => {
  it('guest resolves through the anonymous-base mixin to exactly the original explicit values', () => {
    // The pre-refactor guest.yaml, written out in full (T046): the mixin must not change the result.
    expect(loadPersona(join(dir(), 'personas/live/guest.yaml'))).toEqual({
      id: 'guest',
      extends: ['../_mixins/anonymous-base.yaml'],
      auth: 'none',
      max_action_class: 'read',
      scope_restrictions: {},
      budgets: {},
      consent: { decline_location: true, decline_marketing: true, decline_personalization: true },
      viewport: { width: 1366, height: 768 },
      locale: 'pl-PL',
      test_data: {},
      attributes: {},
    });
  });

  it('guest-mobile differs from guest only in id and viewport (SC-008)', () => {
    const d = dir();
    const {
      id: gid,
      extends: gext,
      viewport: gv,
      ...guest
    } = loadPersona(join(d, 'personas/live/guest.yaml'));
    const {
      id: mid,
      extends: mext,
      viewport: mv,
      ...mobile
    } = loadPersona(join(d, 'personas/live/guest-mobile.yaml'));
    expect(mobile).toEqual(guest);
    expect([gid, mid]).toEqual(['guest', 'guest-mobile']);
    expect(gext).not.toEqual(mext);
    expect(gv).toEqual({ width: 1366, height: 768 });
    expect(mv).toEqual({ width: 390, height: 844 });
  });

  it('both personas keep the read-only ceiling against a production portal', () => {
    const d = dir();
    for (const name of ['guest', 'guest-mobile']) {
      const persona = join(d, `personas/live/${name}.yaml`);
      expect(loadEffectiveConfig(join(d, 'portal.yaml'), persona).effectiveMaxActionClass).toBe(
        'read',
      );
    }
  });
});
