import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { loadEffectiveConfig, loadPersona } from '../src/index.js';

const root = (p: string) => fileURLToPath(new URL(`../../../../../${p}`, import.meta.url));
const persona = (name: string) => root(`personas/marketsite/${name}.yaml`);
const portal = root('portals/marketsite/portal.yaml');

describe('real persona files', () => {
  it('guest resolves through the anonymous-base mixin to exactly the original explicit values', () => {
    // The pre-refactor guest.yaml, written out in full (T046): the mixin must not change the result.
    expect(loadPersona(persona('guest'))).toEqual({
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
    const { id: gid, extends: gext, viewport: gv, ...guest } = loadPersona(persona('guest'));
    const {
      id: mid,
      extends: mext,
      viewport: mv,
      ...mobile
    } = loadPersona(persona('guest-mobile'));
    expect(mobile).toEqual(guest);
    expect([gid, mid]).toEqual(['guest', 'guest-mobile']);
    expect(gext).not.toEqual(mext);
    expect(gv).toEqual({ width: 1366, height: 768 });
    expect(mv).toEqual({ width: 390, height: 844 });
  });

  it('both personas keep the read-only ceiling against the real portal', () => {
    for (const name of ['guest', 'guest-mobile']) {
      expect(loadEffectiveConfig(portal, persona(name)).effectiveMaxActionClass).toBe('read');
    }
  });
});
