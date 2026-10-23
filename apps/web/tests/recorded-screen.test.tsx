import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { at } from './render-at';

afterEach(() => {
  vi.unstubAllGlobals();
});

// Designer Q10: a recording opens in the dialog over its Screen page; its amendments, inputs and
// URLs live on the Screen page.

const ok = { shape: 'ok', word: 'Observed' };
const head = {
  id: 'st-1', portal: 'shop', title: 'Kalkulator OC/AC', route: '/kalkulator', cluster: 'cluster-1', confidence: ok,
  stabilization: 'settled', first_seen_run: '01a16518-272d-7000-a376-65b105461ee2', created_at: '2026-10-22T19:30:57Z',
  shot: '/evidence/shot.png', wire: '/evidence/wire.svg', excalidraw: '/evidence/wire.excalidraw', snapshot: '/evidence/snap.yaml',
};
const amendment = {
  id: 'amd-1', key: 'AMD-001', rev: 2, status: { shape: 'live', word: 'Active' }, state: 'active', text: 'Rename to Save', author: 'Anna',
  created_at: '2026-10-22T20:00:00Z', attachment: null, element: 'button "Zapłać"', other_state: null,
  history: [
    { rev: 1, change: 'create', text: 'Rename', author: 'Anna', created_at: '2026-10-21T10:00:00Z' },
    { rev: 2, change: 'edit', text: 'Rename to Save', author: 'Anna', created_at: '2026-10-22T20:00:00Z' },
  ],
  pin: { n: 1, key: 'button "Zapłać"', note: 'AMD-001', left: 10, top: 20, width: 5, height: 2 },
};
const urls = [
  { url: 'https://shop.test/kalkulator', visits: 2, via: ['click'], hops: [] },
  { url: 'https://shop.test/kalkulator?src=menu', visits: 1, via: ['navigate'], hops: [] },
];
const step = {
  step: 1, label: 'Dane kierowcy', route: '/kalkulator', groups: [['validation', 1], ['branch', 0], ['technical', 0]], mark: null,
  states: [{ state: 'st-1', title: 'Kalkulator OC/AC', kind: { shape: 'ok', word: 'Main' } }],
  outcomes: [{ probe: 'empty', fault: null, target: 'Data urodzenia', status: { shape: 'ok', word: 'Refused' }, accepted: false, possible_new_process: false, to_state: null, messages: [{ field: 'Data urodzenia', text: 'Pole wymagane', native: false }], reason: null }],
};
const stateView = (place: unknown) => ({
  page: {
    head, elements: [{ key: 'button "Zapłać"', left: 10, top: 20, width: 5, height: 2 }], element_count: 3, urls, urls_more: 0, params: [],
    revisions: [], processes: [], form_step: step, citing: [{ key: 'BR-021', title: 'Age limit', portal: 'shop', regions: [] }],
  },
  amendments: { items: [amendment], elements: [['button "Zapłać"', 'button "Zapłać"']] },
  access: null,
  can_mark: true,
  place,
});
const detail = {
  portal: 'shop',
  screen: { key: 'SC-0001', title: 'Kalkulator OC/AC', route: '/kalkulator', status: { shape: 'live', word: 'Active' }, needs: 0, variants: 1, why: [], last_seen: null, last_run: null, checked: 0, actions: 0, release: null, parts: [], process: null },
  needs: [],
  variants: [{ ordinal: 1, state_id: 'st-1', title: 'Kalkulator OC/AC', picture: { shot: '/evidence/shot.png', wire: null, scans: 1 }, reason: 'Baseline', reason_chip: null, explanation: 'The first way the screen was seen.', status: ok, first_seen: null, last_seen: null, visits: 2, personas: ['guest'], releases: [] }],
  actions: [],
  history: [],
  labels: [],
};
const recordings = { state: 'st-1', amendments: { items: [amendment], elements: [['button "Zapłać"', 'button "Zapłać"']] }, inputs: [step], urls, urls_more: 0, params: [], can_mark: true };
const place = { portal: 'shop', key: 'SC-0001', ordinal: 1 };
const api = {
  '/api/states/st-1': stateView(place),
  '/api/portals/shop/screens/SC-0001': detail,
  '/api/portals/shop/screens/SC-0001/recordings': recordings,
};

describe('Recordings on the Screen page', () => {
  it('opens an old recording address on its Screen page, the dialog showing the assistant mark and the pins', async () => {
    at('/app/states/st-1?hl=button%20%22Zap%C5%82a%C4%87%22', api);
    // jsdom does not open a modal <dialog>, so it is found by its class, not by its role
    await screen.findByText('Kalkulator OC/AC · variant r1 · recording');
    const dialog = document.querySelector<HTMLElement>('dialog.sy-dialog--recording') as HTMLElement;
    expect(screen.getByRole('heading', { level: 1, name: /Kalkulator OC\/AC/ })).toBeTruthy();
    expect(within(dialog).getByText('Marked by assistant')).toBeTruthy();
    expect(within(dialog).getAllByText('AMD-001').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('BR-021').closest('a')?.getAttribute('href')).toBe('/app/portals/shop/docs/BR-021');
    fireEvent.click(within(dialog).getByLabelText('Elements (1)'));
    expect(within(dialog).getByText('1')).toBeTruthy();
  });

  it('sends a recording no screen holds to its scan', async () => {
    const fetch = at('/app/states/st-1', { ...api, '/api/states/st-1': stateView(null) });
    await vi.waitFor(() => {
      expect(fetch.mock.calls.map((c) => c[0])).toContain('/api/scans/01a16518-272d-7000-a376-65b105461ee2');
    });
  });

  it('gives the Screen page its Amendments and Inputs tabs and the URLs it was reached at', async () => {
    at('/app/portals/shop/screens/SC-0001?tab=amendments', api);
    expect((await screen.findAllByText('Rename to Save')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Add amendment' })).toBeTruthy();
    expect(screen.getAllByText('https://shop.test/kalkulator').length).toBeGreaterThan(0);
    expect(screen.getByText('+ 1 more URL')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Inputs/ }));
    expect(await screen.findByText('Pole wymagane', { exact: false })).toBeTruthy();
  });

  it('shows who sees what on the recording, two personas side by side as the address asks', async () => {
    const side = (persona: string, attributes: string | null) => ({ persona, state: `st-${persona}`, shot: null, attributes });
    const access = {
      reached: [
        { persona: 'basic', state: 'st-basic', attributes: 'tariff: basic', complete: true },
        { persona: 'premium', state: 'st-premium', attributes: 'tariff: premium', complete: true },
        { persona: 'guest', state: 'st-guest', attributes: null, complete: false },
      ],
      not_reached: ['admin'],
      reach_explained_by: [],
      elements_total: 4,
      elements: [{ key: 'button "Export"', seen_by: ['premium'], not_seen_by: ['basic'], explained_by: [] }],
      personas: ['basic', 'premium', 'guest'],
      side_by_side: { left: side('basic', 'tariff: basic'), right: side('premium', 'tariff: premium'), only_left: [], only_right: ['button "Export"'], text_differs: [], same: 3 },
    };
    at('/app/states/st-1?left=basic&right=premium', {
      ...api,
      '/api/states/st-1?left=basic&right=premium': { ...stateView(place), access },
    });
    const summary = await screen.findByText('Access · 1 differ');
    const dialog = summary.closest('dialog') as HTMLElement;
    expect(within(dialog).getByText('Reached by basic, premium, guest (trace only)')).toBeTruthy();
    expect(within(dialog).getByText('Never reached by admin')).toBeTruthy();
    expect(within(dialog).getByText('Only premium: button "Export"')).toBeTruthy();
    const other = within(dialog).getByText('Compare basic with guest').closest('a')?.getAttribute('href') ?? '';
    expect(other).toContain('left=basic');
    expect(other).toContain('right=guest');
  });

  it('says when the recording does not exist', async () => {
    at('/app/states/nope', { '/api/states/nope': { detail: 'There is no recorded screen nope in this store.' } }, 404);
    expect((await screen.findByRole('alert')).textContent).toContain('There is no recorded screen nope');
  });
});
