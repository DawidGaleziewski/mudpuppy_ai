import { describe, expect, it } from 'vitest';
import { computeComponents, computeFingerprint } from '../src/fingerprint.js';
import { makeProfile, resolveProfile, ROWS_V2, ROWS_V2_PROFILE } from '../src/profile.js';

/** A page with a main menu of the given links and a fixed form. */
const page = (links: readonly string[]) =>
  [
    '- navigation "Menu":',
    ...links.map((l) => `  - link "${l}"`),
    '- main:',
    '  - heading "Kalkulator OC" [level=1]',
    '  - textbox "Marka"',
    '  - button "Dalej"',
  ].join('\n');

describe('a profile that ignores the menu (spec 039 T111, T114)', () => {
  const noMenu = resolveProfile('no-menu', { 'no-menu': { ignore_names_in: ['navigation'] } });
  const before = { routeTemplate: '/kalkulator', ariaSnapshot: page(['Start', 'Oferta']) };
  const after = { routeTemplate: '/kalkulator', ariaSnapshot: page(['Start', 'Oferta', 'Blog']) };

  it('rows-v2 sees a menu link more as another page version; no-menu sees the same page', () => {
    expect(computeFingerprint(before).level1).not.toBe(computeFingerprint(after).level1);
    expect(computeFingerprint(before, noMenu).level1).toBe(
      computeFingerprint(after, noMenu).level1,
    );
    expect(computeComponents(before, noMenu).structureHash).toBe(
      computeComponents(after, noMenu).structureHash,
    );
  });

  it('still tells the form apart: a renamed field is another page under both', () => {
    const renamed = { ...before, ariaSnapshot: before.ariaSnapshot.replace('Marka', 'Model') };
    expect(computeFingerprint(before, noMenu).level1).not.toBe(
      computeFingerprint(renamed, noMenu).level1,
    );
  });
});

describe('fingerprint profiles (spec 039 T111)', () => {
  it('names a profile by its rules: the same rules in another order hash alike', () => {
    const shuffled = { ...ROWS_V2, row_roles: [...ROWS_V2.row_roles].reverse() };
    expect(makeProfile('rows-v2', shuffled).id).toBe(ROWS_V2_PROFILE.id);
    expect(ROWS_V2_PROFILE.id).toMatch(/^rows-v2@[0-9a-f]{8}$/);
    expect(makeProfile('rows-v2', { ...ROWS_V2, cluster_threshold: 0.8 }).id).not.toBe(
      ROWS_V2_PROFILE.id,
    );
  });

  it('resolves the built-in, a portal profile extending it, and a chain', () => {
    expect(resolveProfile('rows-v2')).toEqual(ROWS_V2_PROFILE);
    const specs = {
      'no-menu': { ignore_names_in: ['navigation'] },
      looser: { extends: 'no-menu', cluster_threshold: 0.85 },
    };
    const looser = resolveProfile('looser', specs);
    expect(looser.rules.ignore_names_in).toEqual(['navigation']);
    expect(looser.rules.cluster_threshold).toBe(0.85);
    expect(looser.rules.row_roles).toEqual(ROWS_V2.row_roles);
    expect(looser.id.startsWith('looser@')).toBe(true);
  });

  it('refuses an unknown name and a cycle', () => {
    expect(() => resolveProfile('nope')).toThrow(/unknown fingerprint profile "nope"/);
    expect(() => resolveProfile('a', { a: { extends: 'b' }, b: { extends: 'a' } })).toThrow(
      /cycle: a → b → a/,
    );
  });
});
