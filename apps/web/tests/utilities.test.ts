// Spec 076 T030: the token utility classes are generated from tokens.css and nothing else, so a
// rebrand is a change of token values. The committed file must match what the generator writes.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tokenNames, utilitiesCss } from '../scripts/gen-utilities.mjs';

const ds = join(import.meta.dirname, '..', 'src', 'design-system');
const tokens = readFileSync(join(ds, 'assets', 'css', 'tokens.css'), 'utf8');

describe('utilities.css', () => {
  it('is what the generator writes from tokens.css (run pnpm ds:utilities)', () => {
    expect(readFileSync(join(ds, 'styles', 'utilities.css'), 'utf8')).toBe(utilitiesCss(tokens));
  });

  it('uses only tokens: every value is 0, a keyword or a var() of a token that exists', () => {
    const names = tokenNames(tokens);
    const css = utilitiesCss(tokens);
    for (const [, token] of css.matchAll(/var\((--sy-[a-z0-9-]+)\)/g)) expect(names.has(token!)).toBe(true);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|\d+px/i);
  });

  it('a token that goes missing stops the generator', () => {
    expect(() => utilitiesCss(tokens.replace('--sy-fail:', '--sy-gone:'))).toThrow('tokens.css has no --sy-fail');
  });
});
