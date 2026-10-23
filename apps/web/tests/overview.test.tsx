import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withAsOf } from '../src/app/asOf';
import { currentStore, withStore } from '../src/app/store';
import { at } from './render-at';

afterEach(() => {
  vi.unstubAllGlobals();
});

const RUN = '01a16518-272d-7000-a376-65b105461ee2';
const ok = { shape: 'ok', word: 'Completed' };

describe('All portals (v2-15)', () => {
  it('lists each portal with its release, last scan and what needs you, then Review across portals', async () => {
    at('/app/', {
      '/api/portals': { environment: 'local-dev', portals: [{ id: 'shop', scans: 1, running: 0, last_scan_at: null }], other_environments: [] },
      '/api/portals/overview': {
        rows: [{ portal: 'shop', has_model: true, releases: [{ part: 'Shell', name: '3e1a', since: '2026-10-20' }], last_scan: { id: RUN, started_at: '2026-10-22T19:30:57Z', status: ok, check: false, steps: 40 }, changes: 4, needs: 2, explained: 2, review: 5, processes: 3, explored: 1 }],
        changes: 4,
        review: 5,
        preview: [{ portal: 'shop', group: 'Findings', item: { kind: 'Findings', id: 'dev-1', chip: { word: 'New screen', variant: null }, claim: 'A new screen appeared.', where: null, hint: '', at: '2026-10-22T20:00:00Z', status: null, keys: [] } }],
      },
    });
    const table = await screen.findByRole('table', { name: 'Portals of this environment' });
    expect(within(table).getByText('Shell · 3e1a')).toBeTruthy();
    expect(within(table).getByText('1 / 3')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'A new screen appeared.' }).getAttribute('href')).toBe('/app/portals/shop/review');
  });
});

describe('A scan’s portal hooks', () => {
  it('lists the hooks that ran with their outcomes', async () => {
    at(`/app/scans/${RUN}`, {
      [`/api/scans/${RUN}`]: {
        id: RUN, portal: 'shop', persona: 'guest', status: ok, warning: null, facts: [], tabs: [{ id: 'states', label: 'States', count: 0 }], needs_attention: false,
        hooks: [{ point: 'onPageLoad', fn: 'dismissCookies', runs: 3, outcomes: { ok: 2, skip: 1 }, pages_patched: 2 }],
      },
      [`/api/scans/${RUN}/states`]: { total: 0, rows: [], next_cursor: null, filters: {} },
    });
    const table = await screen.findByRole('table', { name: 'Portal hooks that ran in this scan' });
    expect(within(table).getByText('onPageLoad · dismissCookies')).toBeTruthy();
    expect(within(table).getByText('2 ok · 1 skip')).toBeTruthy();
  });
});

describe('Data store', () => {
  const EVAL = 'eval:pf-eval-shop-AbC123:sandbox';

  it('keeps the chosen store on every app page and API address', () => {
    expect(withStore('/api/portals/shop/scans', EVAL)).toBe(`/api/portals/shop/scans?store=${encodeURIComponent(EVAL)}`);
    expect(withStore('/app/portals/shop?tab=x#a', EVAL)).toBe(`/app/portals/shop?tab=x&store=${encodeURIComponent(EVAL)}#a`);
    expect(withStore('/app/?store=main:test', EVAL)).toBe('/app/?store=main:test');
    expect(withStore('/evidence/x.png', EVAL)).toBe('/evidence/x.png');
    expect(withStore('/api/portals', null)).toBe('/api/portals');
    expect(currentStore(`?store=${EVAL}`)).toBe(EVAL);
    expect(currentStore('?store=../../etc')).toBeNull();
  });

  it('names the eval workspace it reads and offers the other stores, keeping the store on links', async () => {
    const main = { key: 'main:test', label: 'test', kind: 'main', workspace: null };
    const evalStore = { key: EVAL, label: 'eval · shop · 2026-10-22', kind: 'eval', workspace: 'pf-eval-shop-AbC123' };
    at(`/app/?store=${EVAL}`, {
      '/api/stores': { current: evalStore, note: null, stores: [main, evalStore] },
      '/api/portals': { environment: 'sandbox', portals: [], other_environments: [] },
      '/api/portals/overview': { rows: [], changes: 0, review: 0, preview: [] },
    });
    expect(await screen.findByText('pf-eval-shop-AbC123')).toBeTruthy();
    expect(screen.getByText('Data store: eval · shop · 2026-10-22')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'test' }).getAttribute('href')).toBe('/app/?store=main%3Atest');
    expect(screen.getByRole('link', { name: 'Help and glossary' }).getAttribute('href')).toBe(`/app/glossary?store=${encodeURIComponent(EVAL)}`);
  });

  it('says when the store asked for is gone', async () => {
    const main = { key: 'main:test', label: 'test', kind: 'main', workspace: null };
    at('/app/?store=eval:gone:sandbox', {
      '/api/stores': { current: main, note: 'That eval workspace is gone; showing the default store.', stores: [main] },
      '/api/portals': { environment: 'test', portals: [], other_environments: [] },
      '/api/portals/overview': { rows: [], changes: 0, review: 0, preview: [] },
    });
    expect(await screen.findByText('Store gone')).toBeTruthy();
  });
});

describe('As of', () => {
  it('asks a model page’s API as of the chosen version and keeps it on links between model pages', () => {
    expect(withAsOf('/api/portals/shop/screens', '4')).toBe('/api/portals/shop/screens?as_of=4');
    expect(withAsOf('/api/portals/shop/rules?status=x', '4')).toBe('/api/portals/shop/rules?status=x&as_of=4');
    expect(withAsOf('/app/portals/shop/processes/PRC-001#step-2', '4')).toBe('/app/portals/shop/processes/PRC-001?as_of=4#step-2');
    expect(withAsOf('/api/portals/shop/scans', '4')).toBe('/api/portals/shop/scans');
    expect(withAsOf('/api/portals/shop/screens', null)).toBe('/api/portals/shop/screens');
  });

  it('shows the menu of model versions and the banner on a model page as of a past version', async () => {
    at('/app/portals/shop/rules?as_of=1', {
      '/api/portals/shop/model-versions': { versions: [{ seq: 2, built_at: '2026-10-22T00:00:00Z', releases: [], scan: null }, { seq: 1, built_at: '2026-10-20T00:00:00Z', releases: ['3e1a · Shell'], scan: null }] },
    });
    expect(await screen.findByText('As of model version 1')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to now' }).getAttribute('href')).toBe('/app/portals/shop/rules?as_of=now');
    expect(await screen.findByText('As of version 1')).toBeTruthy();
  });
});
