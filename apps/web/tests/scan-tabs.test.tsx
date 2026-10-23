// A scan's sections (spec 055) over a stubbed API: the tab nav, each section's table, filters and
// the cursor pager asked of the API, the empty states.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Code, Disclosure } from '../src/design-system';
import { SCAN, scanHead } from './fixtures-scan-views';
import { at } from './render-at';

afterEach(() => {
  vi.unstubAllGlobals();
});

const API = `/api/scans/${SCAN}`;
const head = {
  ...scanHead,
  tabs: [
    { id: 'graph', label: 'Graph', count: 2 },
    { id: 'states', label: 'States', count: 1 },
    { id: 'actions', label: 'Actions', count: 30 },
    { id: 'trace', label: 'Trace', count: 4 },
  ],
};
const ok = { shape: 'ok', word: 'Observed' };
const action = (n: number) => ({
  id: `act-${String(n)}`,
  name: `Link ${String(n)}`,
  role: 'link',
  safety: 'read',
  decision: { shape: 'ok', word: 'Allowed' },
  skip_reason: null,
  locator: `role=link[name="Link ${String(n)}"]`,
  href: `/p/${String(n)}`,
});
const actions = {
  counts: [{ value: 'read', status: { shape: null, word: 'read' }, also: { shape: 'ok', word: 'Allowed' }, count: 30 }],
  safety_options: [
    { value: 'read', label: 'read' },
    { value: 'mutating', label: 'mutating' },
  ],
  allowed_options: [
    { value: '1', label: 'Allowed' },
    { value: '0', label: 'Skipped' },
  ],
  filter: { safety_class: null, allowed: null },
  items: [action(1), action(2)],
  total: 30,
  next_cursor: 'act-2',
};

describe('Scan sections', () => {
  it('links each section: React for the moved ones, the htmx page for Trace', async () => {
    at(`/app/scans/${SCAN}/states`, {
      [API]: head,
      [`${API}/states`]: [
        {
          state: 'st-1',
          title: 'Strona główna',
          route: '/',
          picture: null,
          confidence: ok,
          stabilization: 'settled',
          cluster: 'cl-1',
          evidence: { ref: 'shots/1.png', href: '/evidence/shots/1.png' },
          observed_at: '2026-10-22T01:00:00.000Z',
        },
      ],
    });
    const table = await screen.findByRole('table', { name: 'Screens observed in this scan' });
    expect(within(table).getByRole('link', { name: 'Strona główna' }).getAttribute('href')).toBe('/states/st-1');
    expect(within(table).getByRole('link', { name: 'shots/1.png' }).getAttribute('href')).toBe('/evidence/shots/1.png');
    const nav = screen.getByRole('navigation', { name: 'Scan sections' });
    expect(within(nav).getByRole('link', { name: /States/ }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('link', { name: /Actions/ }).getAttribute('href')).toBe(`/app/scans/${SCAN}/actions`);
    expect(within(nav).getByRole('link', { name: /Trace/ }).getAttribute('href')).toBe(`/runs/${SCAN}?tab=trace`);
  });

  it('filters the actions and pages on by cursor', async () => {
    const fetch = at(`/app/scans/${SCAN}/actions`, {
      [API]: head,
      [`${API}/actions`]: actions,
      [`${API}/actions?allowed=0`]: { ...actions, filter: { safety_class: null, allowed: '0' }, items: [], total: 0, next_cursor: null },
      [`${API}/actions?cursor=act-2&page=2`]: { ...actions, items: [action(3)], next_cursor: null },
    });
    expect(await screen.findByRole('heading', { name: 'Actions extracted · 30' })).toBeTruthy();
    expect(screen.getByText('role=link[name="Link 1"]')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Link 3')).toBeTruthy();
    expect(screen.getByText('Page 2 · 30 in all')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Decision' }), { target: { value: '0' } });
    expect(await screen.findByText('No actions match these filters.')).toBeTruthy();
    expect(fetch.mock.calls.map((c) => c[0])).toContain(`${API}/actions?allowed=0`);
  });

  it('shows the decision groups and an entry with its detail', async () => {
    at(`/app/scans/${SCAN}/decisions`, {
      [API]: head,
      [`${API}/decisions`]: {
        groups: [{ kind: { shape: 'skipped', word: 'Skipped' }, rule: 'robots:Disallow', count: 6, example: 'disallowed by robots.txt' }],
        kind_options: [{ value: 'skip', label: 'Skipped' }],
        rule_options: [{ value: 'robots:Disallow', label: 'robots:Disallow' }],
        filter: { kind: null, rule: null },
        items: [
          {
            id: 'd-1',
            kind: { shape: 'skipped', word: 'Skipped' },
            rule: 'robots:Disallow',
            reason: 'disallowed by robots.txt',
            detail: '{\n  "path": "/x"\n}',
            subject: 'fr-1',
            at: '2026-10-22T01:00:00.000Z',
          },
        ],
        total: 1,
        next_cursor: null,
      },
    });
    const groups = await screen.findByRole('table', { name: 'Decisions by rule' });
    expect(within(groups).getByText('6')).toBeTruthy();
    expect(screen.getByText('Detail').closest('details')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });

  it('says so when no documentation cites the scan', async () => {
    at(`/app/scans/${SCAN}/docs`, { [API]: head, [`${API}/docs`]: { items: [], total: 0, next_cursor: null } });
    expect(await screen.findByText(/No documentation cites this scan/)).toBeTruthy();
  });

  it("links a record's cites to the section that lists them, htmx for Process", async () => {
    const doc = {
      key: 'PROC-001',
      portal: 'shop',
      title: 'Kup polisę',
      kind: 'process',
      rev: 2,
      status: { shape: 'draft', word: 'Draft' },
      confidence: ok,
      cites: [
        { kind: 'form', id: 'form-1', tab: 'forms', note: null },
        { kind: 'process', id: 'pr-1', tab: 'process', note: 'goal' },
      ],
    };
    at(`/app/scans/${SCAN}/docs`, { [API]: head, [`${API}/docs`]: { items: [doc], total: 1, next_cursor: null } });
    expect((await screen.findByRole('link', { name: 'form form-1' })).getAttribute('href')).toBe(`/app/scans/${SCAN}/forms`);
    expect(screen.getByRole('link', { name: 'process pr-1' }).getAttribute('href')).toBe(`/runs/${SCAN}?tab=process`);
  });

  it('opens on the graph for an unknown section', async () => {
    at(`/app/scans/${SCAN}/nope`, { [API]: head });
    const nav = await screen.findByRole('navigation', { name: 'Scan sections' });
    expect(within(nav).getByRole('link', { name: /Graph/ }).getAttribute('aria-current')).toBe('page');
  });
});

describe('Disclosure', () => {
  it('keeps its body behind its summary until opened', () => {
    render(
      <Disclosure summary="Response">
        <Code>{'{ "a": 1 }'}</Code>
      </Disclosure>,
    );
    const details = screen.getByText('Response').closest('details');
    expect(details?.open).toBe(false);
    expect(screen.getByText('{ "a": 1 }').tagName.toLowerCase()).toBe('pre');
  });
});
