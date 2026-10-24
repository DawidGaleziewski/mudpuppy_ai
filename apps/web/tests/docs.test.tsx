// Docs, part 1 (spec 066) over a stubbed API: the section index, the overview, a section's
// records with filters applied on the button, the traceability matrix and the empty states.
import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { at } from './render-at';

afterEach(() => {
  vi.unstubAllGlobals();
});

const API = '/api/portals/shop/docs';
const status = (shape: string, word: string) => ({ shape, word });
const sections = [
  { id: 'overview', label: 'Overview', count: 3 },
  { id: 'processes', label: 'Processes and use cases', count: 2 },
  { id: 'traceability', label: 'Traceability', count: 1 },
];
const record = (over: Record<string, unknown> = {}) => ({
  key: 'UC-001',
  title: 'Buy a policy',
  kind: 'use case',
  status: status('needs', 'Draft'),
  confidence: status('inferred', 'Inferred'),
  rev: 2,
  summary: 'The buyer pays online.',
  not_observable: status('unobserved', 'Not observed'),
  followup: null,
  blocked_reason: null,
  confirmed_rev: 1,
  evidence: 3,
  scans: 1,
  related: ['CAP-001'],
  href: '/docs/shop/UC-001?list=%2Fdocs%2Fshop%3Fsection%3Dprocesses',
  ...over,
});
const filters = (over: Record<string, unknown> = {}) => ({
  kinds: [
    { value: 'process', label: 'process' },
    { value: 'use_case', label: 'use case' },
  ],
  statuses: [{ value: 'draft', label: 'Draft' }],
  confidences: [{ value: 'inferred', label: 'Inferred' }],
  flags: [{ value: 'not_observable', label: 'not observable' }],
  kind: null,
  status: null,
  confidence: null,
  flag: null,
  ...over,
});
const page = (over: Record<string, unknown> = {}) => ({
  portal: 'shop',
  sections,
  section: sections[0],
  statuses: [{ status: status('needs', 'Draft'), count: 3 }],
  counts: [sections[1]],
  sessions: [{ id: 'sess-2', short: 'sess-2', status: status('ok', 'Completed'), started_at: '2026-10-17T10:00:00Z', summary: 'summary of sess-2', href: '/docs/shop/sessions/sess-2' }],
  records: null,
  diagram: null,
  ...over,
});
const section = (over: Record<string, unknown> = {}) =>
  page({ section: sections[1], counts: [], sessions: [], records: { items: [record()], total: 1, next_cursor: null, filters: filters(), matrix: false }, ...over });

describe('Docs', () => {
  it('shows the overview with the sections, statuses and sessions', async () => {
    at('/app/portals/shop/docs', { [API]: page() });
    expect(await screen.findByText('summary of sess-2')).toBeTruthy();
    const index = screen.getByRole('list', { name: 'Documentation sections' });
    expect(within(index).getByRole('link', { name: 'Processes and use cases' }).getAttribute('href')).toBe('/app/portals/shop/docs?section=processes');
    expect(within(index).getAllByRole('listitem')[0]?.getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('link', { name: 'sess-2' }).getAttribute('href')).toBe('/docs/shop/sessions/sess-2');
    expect(screen.getByRole('link', { name: 'Docs' }).getAttribute('aria-current')).toBe('page');
  });

  it('lists a section’s records with their notes and record links', async () => {
    at('/app/portals/shop/docs?section=processes', { [`${API}?section=processes`]: section() });
    const link = await screen.findByRole('link', { name: 'UC-001' });
    expect(link.getAttribute('href')).toContain('/docs/shop/UC-001?list=');
    expect(screen.getByText('Not observed')).toBeTruthy();
    expect(screen.getByText('confirmed at rev 1')).toBeTruthy();
  });

  it('filters on the button, never on a select change', async () => {
    const fetch = at('/app/portals/shop/docs?section=processes', {
      [`${API}?section=processes`]: section(),
      [`${API}?section=processes&kind=use_case`]: section({ records: { items: [record()], total: 1, next_cursor: null, filters: filters({ kind: 'use_case' }), matrix: false } }),
    });
    fireEvent.change(await screen.findByLabelText('Kind'), { target: { value: 'use_case' } });
    expect(fetch.mock.calls.some((c) => c[0] === `${API}?section=processes&kind=use_case`)).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(await screen.findByRole('button', { name: 'Clear filters' })).toBeTruthy();
  });

  it('shows the traceability matrix with linked records', async () => {
    at('/app/portals/shop/docs?section=traceability', {
      [`${API}?section=traceability`]: page({ section: sections[2], counts: [], sessions: [], records: { items: [record()], total: 1, next_cursor: null, filters: filters({ kinds: [] }), matrix: true } }),
    });
    expect(await screen.findByText('CAP-001')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Linked records' })).toBeTruthy();
  });

  it('says when nothing is documented and when filters match nothing', async () => {
    at('/app/portals/shop/docs', { [API]: page({ statuses: [], sessions: [] }) });
    expect(await screen.findByText(/Nothing documented for shop yet/)).toBeTruthy();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    at('/app/portals/shop/docs?section=processes&status=draft', {
      [`${API}?section=processes&status=draft`]: section({ records: { items: [], total: 0, next_cursor: null, filters: filters({ status: 'draft' }), matrix: false } }),
    });
    expect(await screen.findByText(/match these filters/)).toBeTruthy();
  });

  it('opens the capability map as a list, with the diagram second (designer T-09)', async () => {
    const caps = [{ key: 'CAP-001', title: 'Sprzedaż ubezpieczeń', contains: [{ key: 'PROC-001', title: 'Oblicz składkę' }] }];
    at('/app/portals/shop/docs?section=capabilities', {
      [`${API}?section=capabilities`]: section({ capabilities: caps, diagram: { source: 'flowchart TB\n  a', caption: 'Capability map: capabilities and what they contain' } }),
    });
    const list = await screen.findByRole('table', { name: 'Capability map' });
    expect(within(list).getByRole('link', { name: 'PROC-001' }).getAttribute('href')).toBe('/app/portals/shop/docs/PROC-001');
    expect(screen.getByRole('button', { name: 'List' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Diagram' }));
    expect(screen.queryByRole('table', { name: 'Capability map' })).toBeNull();
    expect(screen.getByText('Capability map: capabilities and what they contain')).toBeTruthy();
  });
});
