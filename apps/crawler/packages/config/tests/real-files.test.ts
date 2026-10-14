import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { DENYLIST_RULE_IDS, loadEffectiveConfig } from '../src/index.js';

const root = (p: string) => fileURLToPath(new URL(`../../../../../${p}`, import.meta.url));

describe('repository config files', () => {
  it('portals/marketsite + guest load and resolve to its explicit read ceiling', () => {
    const e = loadEffectiveConfig(
      root('portals/marketsite/portal.yaml'),
      root('personas/marketsite/guest.yaml'),
    );
    expect(e.portal.environment).toBe('production');
    expect(e.effectiveMaxActionClass).toBe('read');
    expect(e.portal.urls.disallowed).toContain('/oferty/wystaw/*');
  });

  it('portals/liveinsurer + guest load without edits (spec 002 SC-005)', () => {
    const e = loadEffectiveConfig(
      root('portals/liveinsurer/portal.yaml'),
      root('personas/liveinsurer/guest.yaml'),
    );
    expect(e.portal.robots_page_requests).toBe('block');
  });

  it('portals/reference-insurer (sandbox) and -readonly (production) + guest load', () => {
    const guest = root('personas/reference-insurer/guest.yaml');
    const sandbox = loadEffectiveConfig(root('portals/reference-insurer/portal.yaml'), guest);
    expect(sandbox.portal.environment).toBe('sandbox');
    // Our own local server: traces may submit there.
    expect(sandbox.effectiveMaxActionClass).toBe('external-side-effect');
    expect(sandbox.portal.urls.disallowed).toContain('/__admin/*');
    const readonly = loadEffectiveConfig(
      root('portals/reference-insurer-readonly/portal.yaml'),
      guest,
    );
    expect(readonly.portal.environment).toBe('production');
    expect(readonly.portal.base_url).toBe(sandbox.portal.base_url);
    // The twin's explicit read limit (spec 021) caps even the sandbox persona, and its own persona is read too.
    expect(readonly.effectiveMaxActionClass).toBe('read');
    expect(
      loadEffectiveConfig(
        root('portals/reference-insurer-readonly/portal.yaml'),
        root('personas/reference-insurer-readonly/guest.yaml'),
      ).effectiveMaxActionClass,
    ).toBe('read');
  });

  it('accepts generic ids and the old aliases side by side', () => {
    for (const id of ['purchase', 'contact_or_message', 'reveal_contact', 'submit_request'])
      expect(DENYLIST_RULE_IDS).toContain(id);
    for (const id of ['bidding', 'buy_now', 'message_or_contact_seller', 'reveal_seller_contact'])
      expect(DENYLIST_RULE_IDS).toContain(id);
  });
});
