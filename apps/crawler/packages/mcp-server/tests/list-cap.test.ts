import { describe, expect, it } from 'vitest';
import { capReason } from '../src/services/list-cap.js';

/** Spec 080 FR-009 (F-17@015): the stopping rule for item lists and pagination. */
const page = (n: number, state = 'catalogue') => ({
  url: `https://shop.test/sklep?strona=${String(n)}`,
  state_id: state,
  route_template: '/sklep',
});
const opts = { cap: 5, identityTemplates: new Set<string>() };

describe('capReason', () => {
  it('caps a sixth catalogue page once five showed the same screen', () => {
    const visited = [1, 2, 3, 4, 5].map((n) => page(n));
    expect(capReason('https://shop.test/sklep?strona=6', visited, opts)).toMatch(/^list_cap: 5 /);
  });

  it('does not cap below the cap, a revisit, or a template whose pages differ', () => {
    const four = [1, 2, 3, 4].map((n) => page(n));
    expect(capReason('https://shop.test/sklep?strona=6', four, opts)).toBeNull();
    const five = [1, 2, 3, 4, 5].map((n) => page(n));
    expect(capReason('https://shop.test/sklep?strona=3', five, opts)).toBeNull();
    const differ = [...four, page(5, 'empty-catalogue')];
    expect(capReason('https://shop.test/sklep?strona=6', differ, opts)).toBeNull();
  });

  it('never caps a template whose parameter the model holds as identity', () => {
    const visited = [1, 2, 3, 4, 5].map((n) => page(n));
    expect(
      capReason('https://shop.test/sklep?strona=6', visited, {
        cap: 5,
        identityTemplates: new Set(['/sklep']),
      }),
    ).toBeNull();
  });

  it('leaves links to another template alone', () => {
    const visited = [1, 2, 3, 4, 5].map((n) => page(n));
    expect(capReason('https://shop.test/koszyk', visited, opts)).toBeNull();
  });
});
