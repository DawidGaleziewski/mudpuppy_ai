// What changed and Before / after (spec 064) over a stubbed API, and the components they add:
// Releases (lanes, scans, range) and Shot (the changed region, Not here, Overlay).
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Releases, Shot } from '../src/design-system';
import { at } from './render-at';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const API = '/api/portals/shop/changes';
const needs = { shape: 'needs', word: 'Needs you' };
const change = (over: Record<string, unknown> = {}) => ({
  id: 'd2',
  kind: 'new_action',
  word: { word: 'New action', variant: null },
  finding: 'Dalej appeared without a release.',
  explanation: { word: 'Unexplained', variant: 'dashed' },
  explanation_text: 'No rule explained it yet.',
  reason: null,
  status: needs,
  hypothesis_key: 'H-0007',
  model_seq: 2,
  at: '2026-10-17T10:15:00Z',
  element_key: 'button|dalej||',
  ...over,
});
const list = (over: Record<string, unknown> = {}) => ({
  portal: 'shop',
  has_model: true,
  counts: { all: 2, needs: 1, explained: 1, waiting: 0 },
  show: 'all',
  kind: null,
  process: null,
  kinds: [{ value: 'new_action', label: 'New action' }],
  processes: [{ value: 'PRC-001', label: 'Oblicz składkę · 2' }],
  range: { how: 'release', from_seq: 1, to_seq: 2, from_date: '', from_scan: '', froms: [{ value: '', label: 'Since the previous release' }, { value: '0', label: 'The first scan' }], tos: [{ value: '2', label: 'Now · Model version 2' }], scans: [{ value: '01a1340c-0000-7000-8000-000000000001', label: '2026-10-17 10:00:00Z' }] },
  releases: { lanes: [{ name: 'Shell', scope: 'shell', spans: [{ name: '3e1a', left: 0, width: 100, start: 'a', end: 'b', current: true, rollout: false, unknown: false, href: '/app/portals/shop/changes?from_date=a' }] }], scans: [], axis: [], start: 'a', end: 'b', range_left: 0, range_width: 100, range_label: 'this range · 2 changes' },
  shown: 2,
  groups: [{ key: 'PRC-001', name: 'Oblicz składkę', count: 2, needs: 1, screens: [{ key: 'SC-0001', title: 'Start', route: '/', count: 2, needs: 1, changes: [change(), change({ id: 'd1', status: { shape: 'inferred', word: 'Explained' }, explanation: { word: 'Release', variant: null } })] }] }],
  legend: [{ chip: { word: 'Release', variant: null }, text: 'The page changed when its portal part’s release changed.', count: 1 }],
  statuses: [needs],
  ...over,
});
const side = (label: string, has: boolean) => ({ label, note: `${label} note`, state_id: `st-${label}`, title: 'Start', route: '/', shot: `/evidence/${label}.png`, wire: null, status: { shape: 'ok', word: 'Observed' }, scan: '01a1340c-0000-7000-8000-000000000001', at: '2026-10-17T10:15:00Z', has_change: has });
const one = (over: Record<string, unknown> = {}) => ({
  portal: 'shop',
  change: change(),
  screen_key: 'SC-0001',
  screen_title: 'Start',
  screen_route: '/',
  process: { value: 'PRC-001', label: 'Oblicz składkę' },
  before: side('Before', false),
  after: side('After', true),
  region: { left: 10, top: 10, width: 20, height: 5 },
  differs: [{ label: 'Release · Shell', before: '1d77', after: '3e1a', differs: true }],
  explained: false,
  hypothesis_status: { shape: 'needs', word: 'Needs confirmation' },
  rule: 'R5',
  reason: null,
  tests: [],
  decidable: true,
  rule_link: false,
  neighbours: { position: 1, total: 2, prev: null, next: 'd3' },
  back: '/app/portals/shop/changes?process=PRC-001',
  ...over,
});

describe('What changed', () => {
  it('groups changes by process and screen and links each Before / after', async () => {
    at('/app/portals/shop/changes', { [API]: list() });
    const group = await screen.findByRole('region', { name: /^Oblicz składkę/ });
    expect(within(group).getByRole('link', { name: 'SC-0001' }).getAttribute('href')).toBe('/app/portals/shop/screens/SC-0001');
    expect(within(group).getAllByRole('link', { name: 'Before / after' })[0]?.getAttribute('href')).toBe('/app/portals/shop/changes/d2');
    expect(screen.getByRole('heading', { level: 1, name: 'What changed' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Changes from release 3e1a of Shell' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Needs you/ }).getAttribute('href')).toBe('/app/portals/shop/changes?show=needs');
    expect(screen.getByRole('link', { name: 'Changes' }).getAttribute('aria-current')).toBe('page');
  });

  it('filters on the button, never on a select change', async () => {
    const fetch = at('/app/portals/shop/changes', { [API]: list(), [`${API}?kind=new_action`]: list({ kind: 'new_action' }) });
    await screen.findByRole('region', { name: /^Oblicz składkę/ });
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'new_action' } });
    expect(fetch.mock.calls.some((c) => c[0] === `${API}?kind=new_action`)).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(await screen.findByRole('link', { name: 'Clear filters' })).toBeTruthy();
  });

  it('says how to build the model when there is none, and when nothing needs you', async () => {
    at('/app/portals/shop/changes', { [API]: list({ has_model: false, range: null, releases: null, groups: [] }) });
    expect(await screen.findByText(/has no portal model yet/)).toBeTruthy();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    at('/app/portals/shop/changes?show=needs', { [`${API}?show=needs`]: list({ show: 'needs', groups: [], shown: 0 }) });
    expect(await screen.findByText(/Nothing needs you/)).toBeTruthy();
  });
});

describe('Before / after', () => {
  it('shows both sides with the change marked and what differs', async () => {
    at('/app/portals/shop/changes/d2', { [`${API}/d2`]: one() });
    expect(await screen.findByText('Changed')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Before / after' })).toBeTruthy();
    expect(screen.getByText('Not here')).toBeTruthy();
    expect(screen.getByRole('cell', { name: '3e1a' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Overlay' }).getAttribute('href')).toBe('/app/portals/shop/changes/d2?mode=overlay');
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Oblicz składkę' }).getAttribute('href')).toBe('/app/portals/shop/changes?process=PRC-001');
    const where = screen.getByRole('region', { name: 'Where it shows' });
    expect(within(where).getByRole('link', { name: 'Oblicz składkę' }).getAttribute('href')).toBe('/app/portals/shop/processes/PRC-001');
  });

  it('draws the after over the before in Overlay, with no mark', async () => {
    at('/app/portals/shop/changes/d2?mode=overlay', { [`${API}/d2`]: one() });
    expect(await screen.findByAltText('After, half transparent')).toBeTruthy();
    expect(screen.queryByText('Changed')).toBeNull();
  });

  it('decides the hypothesis through Review after asking, and offers Undo', async () => {
    const fetch = at('/app/portals/shop/changes/d2', {
      [`${API}/d2`]: one(),
      ['POST /api/portals/shop/review/decide']: { ok: true, message: 'Confirmed: H-0007.', href: null, undo: 'dec-1' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Confirm H-0007?' })).getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Confirmed: H-0007.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    const call = fetch.mock.calls.find((c) => c[0] === '/api/portals/shop/review/decide') as unknown as [string, { body: string }];
    expect(JSON.parse(call[1].body)).toMatchObject({ keys: ['H-0007'], action: 'confirm' });
  });

  it('J goes to the next change that needs you; not while typing', async () => {
    const fetch = at('/app/portals/shop/changes/d2', { [`${API}/d2`]: one(), [`${API}/d3`]: one({ change: change({ id: 'd3', finding: 'Another change' }) }) });
    const reason = await screen.findByLabelText('Reason');
    fireEvent.keyDown(reason, { key: 'j' });
    expect(fetch.mock.calls.some((c) => c[0] === `${API}/d3`)).toBe(false);
    fireEvent.keyDown(document.body, { key: 'j' });
    expect(await screen.findByRole('heading', { name: 'Another change' })).toBeTruthy();
  });

  it('says when the change does not exist', async () => {
    at('/app/portals/shop/changes/nope', {});
    expect(await screen.findByText(/does not exist/)).toBeTruthy();
  });
});

describe('Releases and Shot', () => {
  it('names every scan and release for a screen reader and draws the range', () => {
    const { container } = render(
      <Releases
        lanes={[{ name: 'Shell', scope: 'shell', spans: [{ name: '1d77', left: 0, width: 50, start: 'a', end: 'b', rollout: true }] }]}
        scans={[{ id: '01a1340c-0000-7000-8000-000000000001', left: 60, at: 'c', status: 'completed', check: true, href: '#' }]}
        axis={[{ left: 0, label: '4 Oct' }]}
        start="a"
        end="c"
        range={{ left: 60, width: 40, label: 'this range · 3 changes' }}
      />,
    );
    expect(screen.getByText(/Shell: 1d77 \(rollout\) a to b\./)).toBeTruthy();
    expect(screen.getByRole('link', { name: /^Check run 01a1340c/ }).textContent).toBe('01a1340c-0000');
    expect(container.querySelector('.sy-releases__span--rollout')).toBeTruthy();
    expect(screen.getByText('this range · 3 changes')).toBeTruthy();
  });

  it('marks the region where it is and where it is not', () => {
    render(<Shot src="/a.png" alt="Before" region={{ left: 10, top: 10, width: 20, height: 5 }} mark="gone" />);
    const mark = screen.getByText('Not here').closest('mark');
    expect(mark?.getAttribute('style')).toContain('left: 10%');
  });
});
