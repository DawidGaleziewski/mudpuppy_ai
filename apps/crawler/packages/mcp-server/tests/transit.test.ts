import { describe, expect, it } from 'vitest';
import type { NavigationHop } from '@pathfinder/core';
import type { RunScope } from '@pathfinder/safety';
import type { RunState } from '../src/runtime/run-state.js';
import {
  inTransit,
  loginScope,
  markTransitHops,
  noteHost,
  openZone,
} from '../src/runtime/transit.js';

const stateWith = (loggingIn: boolean): RunState =>
  ({
    loggingIn,
    transit: openZone(),
    effective: { portal: { base_url: 'https://shop.example.test/' } },
  }) as unknown as RunState;

describe('transit zone', () => {
  it('learns only other hosts of http(s) navigations while a login runs', () => {
    const rs = stateWith(true);
    noteHost(rs, 'https://shop.example.test/login');
    noteHost(rs, 'https://sso.example.test/auth?x=1');
    noteHost(rs, 'about:blank');
    expect([...rs.transit!.hosts]).toEqual(['sso.example.test']);
    expect(inTransit(rs, 'https://sso.example.test/other')).toBe(true);
    expect(inTransit(rs, 'https://shop.example.test/')).toBe(false);
    rs.loggingIn = false;
    expect(inTransit(rs, 'https://sso.example.test/other')).toBe(false);
  });

  it('widens the scope to any domain but keeps the disallowed lists', () => {
    const scope = {
      external_link_policy: 'block',
      url_lists: [{ where: 'portal', lists: { allowed: ['/a'], disallowed: ['/b'] } }],
    } as unknown as RunScope;
    const out = loginScope(scope);
    expect(out.external_link_policy).toBe('follow');
    expect(out.url_lists).toEqual([{ where: 'portal', lists: { disallowed: ['/b'] } }]);
  });

  it('marks hops on transit hosts and adds kept pages that had no hop', () => {
    const zone = openZone();
    zone.hosts.add('sso.example.test');
    zone.pages.push(
      { url: 'https://sso.example.test/auth', title: 'Sign in', evidence_ref: 'ev1' },
      {
        url: 'https://sso.example.test/mfa',
        title: 'Code',
        evidence_ref: 'ev2',
        screenshot_ref: 's2',
      },
    );
    const hops: NavigationHop[] = [
      { url: 'https://shop.example.test/login', kind: 'http' },
      { url: 'https://sso.example.test/auth#top', kind: 'http' },
    ];
    expect(markTransitHops(hops, zone)).toEqual([
      { url: 'https://shop.example.test/login', kind: 'http' },
      {
        url: 'https://sso.example.test/auth#top',
        kind: 'http',
        transit: true,
        title: 'Sign in',
        evidence_ref: 'ev1',
      },
      {
        url: 'https://sso.example.test/mfa',
        kind: 'same_document',
        transit: true,
        title: 'Code',
        evidence_ref: 'ev2',
        screenshot_ref: 's2',
      },
    ]);
  });
});
