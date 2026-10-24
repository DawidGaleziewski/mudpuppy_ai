// The Screens pages (spec 052) over a stubbed API.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { at } from './render-at';

afterEach(() => {
  vi.unstubAllGlobals();
});

const LIST = '/api/portals/shop/screens?status=&q=&process=&part=&why=&sort=';
const row = {
  key: 'SC-0001',
  title: 'Kalkulator OC/AC',
  route: '/kalkulator',
  status: { shape: 'live', word: 'Active' },
  needs: 2,
  variants: 2,
  why: [
    { word: 'Release', variant: null },
    { word: 'Unknown', variant: 'dashed' },
  ],
  last_seen: '2026-10-23T00:27:06.885Z',
  last_run: 'run-1',
  checked: 3,
  actions: 4,
  release: '5696',
  parts: ['Shell'],
  process: { key: 'PROC-001', name: 'Buy a policy' },
};
const list = {
  portal: 'shop',
  has_model: true,
  counts: { active: 1, retired: 1 },
  parts: ['Shell'],
  whys: ['Release', 'Unknown'],
  sorts: [
    { value: 'needs', label: 'Needs you first' },
    { value: 'key', label: 'Key' },
  ],
  screens: [row],
};

describe('Screens list', () => {
  it('lists the model screens with their status, why, checked meter and process', async () => {
    at('/app/portals/shop/screens', { [LIST]: list });
    expect(await screen.findByText('Kalkulator OC/AC')).toBeTruthy();
    // the screen opens with the list it came from, for its Prev / Next (R-103 (4))
    expect(screen.getByRole('link', { name: 'SC-0001' }).getAttribute('href')).toBe('/app/portals/shop/screens/SC-0001?list=');
    expect(screen.getByText('Needs you · 2')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Actions checked on Kalkulator OC/AC' })).toBeTruthy();
    expect(screen.getByText('Buy a policy')).toBeTruthy();
    expect(within(screen.getByRole('table')).getByText('Unknown').className).toContain('sy-chip--dashed');
    expect(screen.getByText('1 active · 0 merged · 1 retired')).toBeTruthy();
  });

  it('shows a picture per row that browses the list in the dialog (designer T-03, T-04)', async () => {
    const pictured = { ...row, picture: { shot: '/evidence/a.png', wire: null } };
    const second = { ...row, key: 'SC-0002', title: 'Kontakt', picture: { shot: '/evidence/b.png', wire: null } };
    const bare = { ...row, key: 'SC-0003', title: 'Login', picture: null };
    at('/app/portals/shop/screens', { [LIST]: { ...list, screens: [pictured, second, bare] } });
    const table = await screen.findByRole('table');
    // no picture: the hatched box and why, never an empty box
    expect(within(table).getByText('No picture: not recorded yet')).toBeTruthy();
    fireEvent.click(within(table).getByRole('button', { name: 'Kalkulator OC/AC, enlarge' }));
    const dialog = await screen.findByRole('dialog', { name: 'Kalkulator OC/AC' });
    expect(within(dialog).getByText('1 of 3')).toBeTruthy();
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(await screen.findByRole('dialog', { name: 'Kontakt' })).toBeTruthy();
    expect(within(screen.getByRole('dialog')).getByRole('img').getAttribute('src')).toBe('/evidence/b.png');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'j' });
    expect(within(await screen.findByRole('dialog', { name: 'Login' })).getByText('Nothing recorded for this screen')).toBeTruthy();
    // the dialog never edits the screen: no tick on a list that isn't sorted
    expect(within(screen.getByRole('dialog')).queryByRole('checkbox')).toBeNull();
  });

  it('asks the API again with the status picked', async () => {
    const fetch = at('/app/portals/shop/screens', {
      [LIST]: list,
      '/api/portals/shop/screens?status=retired&q=&process=&part=&why=&sort=': { ...list, screens: [] },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Retired 1' }));
    expect(await screen.findByText('No screen matches. Clear the filter, or pick another status.')).toBeTruthy();
    expect(fetch.mock.calls.map((c) => c[0])).toContain(
      '/api/portals/shop/screens?status=retired&q=&process=&part=&why=&sort=',
    );
  });

  it('says so when the portal has no model yet', async () => {
    at('/app/portals/shop/screens', { [LIST]: { ...list, has_model: false, counts: {}, screens: [] } });
    expect(await screen.findByText('No model yet: the first scan builds it. Start one from the chat.')).toBeTruthy();
  });
});

const detail = {
  portal: 'shop',
  screen: row,
  needs: [
    {
      kind: 'changes',
      id: 'dev-1',
      chip: { word: 'Leads elsewhere', variant: null },
      claim: 'The link leads to different screens depending on data.',
      where: null,
      hint: '',
      at: '2026-10-23T00:27:17.148Z',
      status: null,
      keys: ['H-0003'],
    },
  ],
  variants: [
    {
      ordinal: 1,
      state_id: 'st-1',
      title: 'Kalkulator OC/AC',
      picture: null,
      reason: 'Baseline',
      reason_chip: null,
      explanation: 'The first way the screen was seen.',
      status: { shape: 'ok', word: 'Observed' },
      first_seen: '2026-10-23T00:07:00Z',
      last_seen: '2026-10-23T00:27:06Z',
      visits: 8,
      personas: ['guest'],
      releases: ['5696'],
    },
  ],
  actions: [
    {
      element_key: 'link|kontakt|',
      kind: 'click',
      status: { shape: 'live', word: 'Active' },
      is_global: true,
      leads_to: [
        { key: 'SC-0008', title: 'Kontakt', note: null },
        { key: null, title: null, note: 'no change' },
      ],
    },
  ],
  history: [
    {
      id: 'dev-1',
      chip: { word: 'Leads elsewhere', variant: null },
      status: { shape: 'needs', word: 'Needs you' },
      finding: 'The link leads to different screens depending on data.',
      model_seq: 2,
      created_at: '2026-10-23T00:27:17.148Z',
    },
  ],
  labels: [],
};

describe('Screen', () => {
  it('shows what needs you, then the variants; the tabs open the actions and the history', async () => {
    at('/app/portals/shop/screens/SC-0001', { '/api/portals/shop/screens/SC-0001': detail });
    expect(await screen.findByRole('region', { name: /Needs you on this screen/ })).toBeTruthy();
    expect(screen.getByText('H-0003')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'r1' })).toBeTruthy();
    expect(screen.getByText('No picture was recorded.')).toBeTruthy();
    expect(screen.getByText(/^One variant so far\./)).toBeTruthy(); // a lone variant, not a stretched card
    expect(screen.getByRole('region', { name: 'r1' }).className).toBe('sy-variant');
    fireEvent.click(screen.getByRole('tab', { name: 'Actions 1' }));
    await waitFor(() => expect(screen.getByRole('link', { name: 'SC-0008' })).toBeTruthy());
    expect(screen.getByText('on every page')).toBeTruthy();
    expect(screen.getByText('no change')).toBeTruthy(); // the API's word, shown as it came
    fireEvent.click(screen.getByRole('tab', { name: 'History 1' }));
    expect(await screen.findByRole('list', { name: 'Changes on this screen' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /^Compare with/ })).toBeNull(); // one variant: nothing to compare
  });

  it('steps to the neighbours of the list it was opened from, with J / K (R-103 (4))', async () => {
    const sorted = '/api/portals/shop/screens?status=&q=&process=&part=&why=&sort=route';
    const three = { ...list, screens: [{ ...row, key: 'SC-0000' }, row, { ...row, key: 'SC-0002' }] };
    at('/app/portals/shop/screens/SC-0001?list=sort%3Droute', {
      '/api/portals/shop/screens/SC-0001': detail,
      [sorted]: three,
      '/api/portals/shop/screens/SC-0002': { ...detail, screen: { ...detail.screen, key: 'SC-0002' } },
    });
    expect(await screen.findByText('2 of 3')).toBeTruthy();
    // designer T-02: the pager names the neighbour and keeps its place at the ends
    const pager = screen.getByRole('navigation', { name: 'Screens in this list' });
    expect(within(pager).getByRole('link', { name: `Previous: ${row.title}` }).getAttribute('href')).toBe('/app/portals/shop/screens/SC-0000?list=sort%3Droute');
    fireEvent.keyDown(document, { key: 'j' });
    expect(await screen.findByText('3 of 3')).toBeTruthy();
    const last = within(screen.getByRole('navigation', { name: 'Screens in this list' })).getByRole('link', { name: 'Next →' });
    expect(last.getAttribute('aria-disabled')).toBe('true');
    expect(last.hasAttribute('href')).toBe(false);
  });

  it('has no Prev / Next when opened from elsewhere', async () => {
    at('/app/portals/shop/screens/SC-0001', { '/api/portals/shop/screens/SC-0001': detail });
    expect(await screen.findByRole('region', { name: /Needs you on this screen/ })).toBeTruthy();
    expect(screen.queryByText(/of \d+$/)).toBeNull();
  });

  it('compares a persona variant with the first one side by side (designer Q10)', async () => {
    const premium = { ...detail.variants[0]!, ordinal: 2, state_id: 'st-2', reason: 'Persona premium', personas: ['klient-premium'] };
    at('/app/portals/shop/screens/SC-0001', { '/api/portals/shop/screens/SC-0001': { ...detail, variants: [...detail.variants, premium] } });
    const r2 = await screen.findByRole('region', { name: 'r2' });
    const compare = within(r2).getByRole('link', { name: 'Compare with r1' });
    expect(compare.getAttribute('href')).toBe('/app/portals/shop/same-screen?screen=SC-0001&a=st-1&b=st-2');
    expect(within(screen.getByRole('region', { name: 'r1' })).queryByRole('link', { name: /^Compare with/ })).toBeNull();
  });

  it('shows the API reason for an unknown screen', async () => {
    at('/app/portals/shop/screens/NOPE', { '/api/portals/shop/screens/NOPE': { detail: 'There is no screen NOPE in shop.' } }, 404);
    expect((await screen.findByRole('alert')).textContent).toContain('There is no screen NOPE in shop.');
  });
});
