// The model map (spec 053) over a stubbed API.
import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { at } from './render-at';

afterEach(() => {
  vi.unstubAllGlobals();
});

const MAP = '/api/portals/shop/map?';
const node = (id: string, key: string, title: string, more: object = {}) => ({
  id,
  key,
  kind: 'screen',
  route: `/${key.toLowerCase()}`,
  title,
  retired: false,
  status: { shape: 'live', word: 'Active' },
  actions: 2,
  inside: { word: '2 actions inside', variant: null },
  count: 0,
  chips: [],
  role: null,
  dim: false,
  near: [],
  x: 0,
  y: 0,
  depth: 0,
  ...more,
});
const map = {
  portal: 'shop',
  has_model: true,
  filter: { view: 'now', layers: ['unseen', 'unchecked'], process: null, open: null },
  views: [
    { value: 'now', label: 'Now' },
    { value: 'since', label: 'Since previous release' },
  ],
  layer_options: [
    { value: 'retired', label: 'Retired links' },
    { value: 'unseen', label: 'Not seen since' },
    { value: 'unchecked', label: 'Not checked' },
  ],
  legend: [
    { value: '', label: 'Active' },
    { value: 'unseen', label: 'Not seen since' },
  ],
  processes: [{ key: 'PRC-001', name: 'Kup polisę' }],
  overlay: null,
  nodes: [
    node('M1', 'SC-0001', 'Strona główna'),
    node('M2', 'SC-0002', 'Kalkulator', { depth: 1, y: 166, near: ['M1'], chips: [{ word: 'New', variant: null }] }),
    { ...node('family:/oferta', '/oferta', '14 screens'), kind: 'family', route: '/oferta', depth: 1 },
  ],
  edges: [{ state: 'unseen', d: 'M75 96 C75 131 75 131 75 166', label: '', label_x: 0, label_y: 0 }],
  width: 530,
  height: 262,
  node_h: 96,
  screens: 2,
  links: 1,
  bundled: 3,
  bundled_drawn: [],
  since: null,
  changed: 0,
  out_links: {
    M1: [{ to_key: 'SC-0002', to_title: 'Kalkulator', status: { shape: 'unobserved', word: 'Not seen lately' }, label: 'link|kalk||', rule: 'age ≥ 18' }],
  },
};
const screenDetail = {
  portal: 'shop',
  screen: {
    key: 'SC-0002',
    title: 'Kalkulator',
    route: '/kalkulator',
    status: { shape: 'live', word: 'Active' },
    needs: 0,
    variants: 1,
    why: [],
    last_seen: '2026-10-23T00:27:06.885Z',
    last_run: 'run-1',
    checked: 1,
    actions: 2,
    release: null,
    parts: [],
    process: null,
  },
  needs: [],
  variants: [
    {
      ordinal: 1,
      state_id: 'st-1',
      title: 'Kalkulator',
      picture: null,
      reason: 'Baseline',
      reason_chip: null,
      explanation: '',
      status: { shape: 'ok', word: 'Observed' },
      first_seen: '2026-10-22T10:00:00Z',
      last_seen: null,
      visits: 1,
      personas: ['guest'],
      releases: [],
    },
  ],
  actions: [
    { element_key: 'button|oblicz||', kind: 'click', status: { shape: 'live', word: 'Active' }, is_global: false, place: 'inside', leads_to: [] },
    {
      element_key: 'link|home||',
      kind: 'click',
      status: { shape: 'todo', word: 'Not checked' },
      is_global: false,
      place: 'out',
      leads_to: [{ key: 'SC-0001', title: 'Strona główna', note: null }],
    },
    { element_key: 'link|menu||', kind: 'click', status: { shape: 'live', word: 'Active' }, is_global: true, place: 'menu', leads_to: [] },
  ],
  history: [],
  labels: [],
};

describe('Screens map', () => {
  it('draws the model as the API laid it out, with the bundle and the legend', async () => {
    at('/app/portals/shop/screens/map', { [MAP]: map });
    const graph = await screen.findByRole('region', { name: 'Map of shop now' });
    expect(within(graph).getByRole('button', { name: /Kalkulator/ }).getAttribute('aria-pressed')).toBe('false');
    expect(within(graph).getByRole('link', { name: /14 screens/ }).getAttribute('href')).toBe('/app/portals/shop/screens/map?open=%2Foferta');
    expect(screen.getByText('2 active screens · 1 link · now')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Bundled links' }).textContent).toContain('3 links');
    expect(screen.getByRole('list', { name: 'Link states' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Map' }).getAttribute('aria-current')).toBe('page');
  });

  it('opens a screen in the inspector with its actions inside and links out', async () => {
    at('/app/portals/shop/screens/map', { [MAP]: map, '/api/portals/shop/screens/SC-0002': screenDetail });
    fireEvent.click(await screen.findByRole('button', { name: /Kalkulator/ }));
    expect(await screen.findByRole('heading', { name: 'Actions inside · 1' })).toBeTruthy();
    expect(screen.getByText('button|oblicz||')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Links out · 1 + menu' })).toBeTruthy();
    expect(screen.getByText('Menu · 1 link')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Kalkulator/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('asks the API for the view, the overlay and the layers picked', async () => {
    const fetch = at('/app/portals/shop/screens/map', {
      [MAP]: map,
      '/api/portals/shop/map?view=since': { ...map, filter: { ...map.filter, view: 'since' }, since: 3, changed: 2 },
      '/api/portals/shop/map?view=since&layers=&layers=unseen': map,
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Since previous release' }));
    expect(await screen.findByText('2 active screens · 1 link · since model version 3 · 2 changes')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Not checked' }));
    await screen.findByRole('region', { name: 'Map of shop now' });
    expect(fetch.mock.calls.map((c) => c[0])).toContain('/api/portals/shop/map?view=since&layers=&layers=unseen');
  });

  it('lists the same screens and links as a table', async () => {
    at('/app/portals/shop/screens/map?show=list', { [MAP]: map });
    const table = await screen.findByRole('table', { name: 'Screens and links of shop' });
    expect(within(table).getByText('if age ≥ 18')).toBeTruthy();
    expect(within(table).getByText('Not seen lately')).toBeTruthy();
    expect(within(table).getByRole('link', { name: 'SC-0002' }).getAttribute('href')).toBe('/app/portals/shop/screens/SC-0002');
  });
});
