import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { at } from './render-at';

afterEach(() => {
  vi.unstubAllGlobals();
});

const ok = { shape: 'ok', word: 'Completed' };
const RUN = '01a16518-272d-7000-a376-65b105461ee2';

describe('Access by persona', () => {
  it('shows who reached which screen, with each persona’s attributes', async () => {
    at('/app/portals/shop/screens/access', {
      '/api/portals/shop/access': {
        portal: 'shop',
        personas: [['basic', 'tariff: basic'], ['guest', null]],
        rows: [{ title: 'Konto', route: '/account', open: 'st-1', cells: [{ state: 'st-1', complete: true }, null], differ: 1, total: 4, status: { shape: 'live', word: 'Differs' } }],
        budget_limited: ['guest'],
      },
    });
    const table = await screen.findByRole('table', { name: 'Which persona reached which screen of shop' });
    expect(within(table).getByRole('link', { name: 'Reached' }).getAttribute('href')).toBe('/app/states/st-1');
    expect(within(table).getByText('tariff: basic')).toBeTruthy();
    expect(within(table).getByText('Differs')).toBeTruthy();
    expect(screen.getByText(/guest mapped only in scans that ran out of steps/)).toBeTruthy();
  });
});

describe('Scans by process and Server activity', () => {
  it('groups the scans and keeps the ones in no process', async () => {
    const scan = { id: RUN, persona: 'guest', mode: 'map', status: ok, screens: 2, started_at: '2026-10-22T19:30:57Z' };
    at('/app/portals/shop/scans/by-process', { '/api/portals/shop/scans/by-process': { portal: 'shop', processes: [], unassigned: [scan], proposed: [] } });
    expect(await screen.findByText(/No documented process yet/)).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Scans in no process' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Scans views' })).toBeTruthy();
  });

  it('lists the calls outside a scan', async () => {
    at('/app/portals/shop/scans/activity', {
      '/api/activity': { total: 1, calls: [{ tool: 'start_run', status: ok, summary: 'started', rationale: 'asked', duration_ms: 1500, started_at: '2026-10-22T19:30:57Z' }], next_cursor: null },
    });
    expect(await screen.findByText('start_run')).toBeTruthy();
    expect(screen.getByText('1.5 s')).toBeTruthy();
  });
});

describe('Search', () => {
  it('finds screens, records and scans and searches again from the header', async () => {
    const fetch = at('/app/search?q=kalk&portal=shop', {
      '/api/search?q=kalk&portal=shop': {
        q: 'kalk', portal: 'shop', total: 2,
        screens: [{ state: 'st-1', title: 'Kalkulator', route: '/kalkulator' }],
        records: [{ key: 'SCR-001', title: 'Kalkulator', kind: 'screen', portal: 'shop' }],
        scans: [],
      },
    });
    expect(await screen.findByRole('link', { name: 'SCR-001' })).toBeTruthy();
    const box = screen.getByRole('searchbox', { name: 'Search' });
    expect((box as HTMLInputElement).value).toBe('kalk');
    fireEvent.change(box, { target: { value: 'oferta' } });
    fireEvent.submit(box.closest('form') as HTMLFormElement);
    await vi.waitFor(() => {
      expect(fetch.mock.calls.map((c) => c[0])).toContain('/api/search?q=oferta&portal=shop');
    });
  });
});
