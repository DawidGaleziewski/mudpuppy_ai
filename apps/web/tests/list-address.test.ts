import { describe, expect, it } from 'vitest';
import { asLeft, rememberAddress } from '../src/app/listAddress';

// R-103 (7): a crumb up to a list opens it as it was left (its filter and order kept).
describe('Back to the list as it was left', () => {
  it('gives a crumb the query its page last had, without the store or As of', () => {
    rememberAddress('/app/portals/shop/screens', '?status=merged&sort=route&store=main:local-dev&as_of=3');
    expect(asLeft('/app/portals/shop/screens')).toBe('/app/portals/shop/screens?status=merged&sort=route');
  });

  it('keeps an address that has its own query, and forgets a list shown plain again', () => {
    rememberAddress('/app/portals/shop/rules', '?status=needs');
    expect(asLeft('/app/portals/shop/rules?status=ok')).toBe('/app/portals/shop/rules?status=ok');
    rememberAddress('/app/portals/shop/rules', '');
    expect(asLeft('/app/portals/shop/rules')).toBe('/app/portals/shop/rules');
  });
});
