import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { DENYLIST_RULE_IDS, loadEffectiveConfig } from '../src/index.js';

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

  it('portals/liveinsurer + guest load without edits (spec 002 SC-005)', () => {
    const e = loadEffectiveConfig(
      root('portals/liveinsurer/portal.yaml'),
      root('personas/liveinsurer/guest.yaml'),
    );
    expect(e.portal.robots_page_requests).toBe('block');
  });

  it('accepts generic ids and the old aliases side by side', () => {
    for (const id of ['purchase', 'contact_or_message', 'reveal_contact', 'submit_request'])
      expect(DENYLIST_RULE_IDS).toContain(id);
    for (const id of ['bidding', 'buy_now', 'message_or_contact_seller', 'reveal_seller_contact'])
      expect(DENYLIST_RULE_IDS).toContain(id);
  });
});
