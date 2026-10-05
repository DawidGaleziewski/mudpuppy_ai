import { describe, expect, it } from 'vitest';
import { GroundTruth, loadGroundTruth } from '../src/index.js';

/** Ground truth v2 (spec 009 contracts/ground-truth-v2.md): a superset, v1 files stay valid. */
const base = {
  portal_id: 'proving-ground-bank',
  today: '2026-03-16',
  forms: [],
  rules: [],
  processes: [],
  terms: [],
};
const screen = (over: Record<string, unknown>) => ({
  id: 'S01',
  route_template: '/bank',
  title: 'Bank',
  guest_visible: true,
  reached_by: 'navigation',
  ...over,
});
const user = { id: 'bank-client', persona: 'client', refs: ['PG_BANK_LOGIN', 'PG_BANK_PASSWORD'] };
const messages = (x: unknown): string[] => {
  const r = GroundTruth.safeParse(x);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe('ground truth v2', () => {
  it('keeps the reference portal (v1) valid', () => {
    expect(() => loadGroundTruth()).not.toThrow();
  });

  it('accepts actors, users, obstacles and redirects', () => {
    expect(
      messages({
        ...base,
        screens: [
          screen({ obstacles: ['LO-16'] }),
          screen({
            id: 'S02',
            route_template: '/bank/pulpit',
            guest_visible: false,
            reached_by: 'login',
            actor: 'bank-client',
          }),
        ],
        users: [user],
        obstacles: [{ id: 'LO-16', screens: ['S01'], markers: ['obraz'], expected: 'documented' }],
        redirects: [
          {
            id: 'D01',
            from: '/polisa.php?id=7',
            to: '/ubezpieczenia#/polisy/7',
            kind: 'chain',
            hops: ['meta_refresh', 'js_location'],
          },
        ],
      }),
    ).toEqual([]);
  });

  it.each([
    [
      'unknown actor',
      { screens: [screen({ actor: 'nobody', guest_visible: false })] },
      'unknown actor nobody',
    ],
    [
      'guest_visible mismatch',
      { screens: [screen({ actor: 'bank-client' })], users: [user] },
      'guest_visible must be true exactly when actor is guest',
    ],
    [
      'obstacle not listed',
      { screens: [screen({ obstacles: ['LO-10'] })] },
      'obstacle LO-10 missing from obstacles[]',
    ],
    [
      'obstacle on unknown screen',
      {
        screens: [screen({})],
        obstacles: [{ id: 'LO-10', screens: ['S09'], markers: ['x'], expected: 'documented' }],
      },
      'obstacle LO-10: unknown screen S09',
    ],
    [
      'redirect id clashing with a screen id',
      {
        screens: [screen({})],
        redirects: [{ id: 'S01', from: '/a', to: '/bank', kind: 'http', hops: ['http_301'] }],
      },
      'duplicate id S01',
    ],
  ])('rejects %s', (_, over, message) => {
    expect(messages({ ...base, ...over }).join('\n')).toContain(message);
  });
});
