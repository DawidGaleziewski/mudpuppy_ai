// One process (spec 058) over a stubbed API: the head, the model switch, the facts and paths, A as
// documentation with its records, a step selected, and A's edits and the sign-off behind a confirm.
import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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
});

const API = '/api/portals/shop/processes/PRC-001';
const st = (shape: string, word: string) => ({ shape, word });
const step = (id: string, n: number, title: string, route: string, more: object = {}) => ({
  id,
  n,
  title,
  route,
  state: `st-${id}`,
  observed: true,
  built_from: [],
  annotations: [],
  shot: null,
  wire: null,
  scans: 2,
  records: [],
  documented: false,
  amendments: 0,
  reanchor: 0,
  ...more,
});
const page = {
  portal: 'shop',
  id: 'pr-1',
  key: 'PRC-001',
  name: 'Kup polisę',
  persona: 'guest',
  rev: 2,
  stage: st('todo', 'Scoped'),
  stage_value: 'scoped',
  live: [],
  screens: 2,
  record_key: 'PROC-001',
  archived_at: null,
  models: [{ label: 'A', kind: 'as-is', rev: 3, draft: null }],
  model: { label: 'A', kind: 'as-is', rev: 3, draft: null },
  to_be_first: null,
  steps: [
    step('s1', 1, 'Kalkulator', '/kalkulator', {
      documented: true,
      records: [{ kind: 'requirement', label: 'Requirements', records: [{ key: 'REQ-001', title: 'Calculate', status: st('draft', 'Draft') }] }],
    }),
    step('s2', 2, 'Wynik', '/wynik'),
  ],
  selected: null,
  as_is: {
    questions: 1,
    unconfirmed: 2,
    reanchor: 0,
    sign_off: null,
    sign_off_action: 'Mark as-is documented',
    stages: [
      { value: 'scoped', label: 'Scoped' },
      { value: 'as_is_documented', label: 'As-is documented' },
    ],
    addable: [{ value: 'st-faq', label: '/faq · FAQ' }],
  },
  facts: {
    model_seq: 7,
    triggers: [{ text: 'Strona główna → link "Kalkulator"', screen_key: 'SC-0001', count: 3 }],
    outcomes: ['3 goal reached'],
    explored: st('needs', 'Partial'),
    explored_text: 'to depth 2 plus 5 random walks, 2026-10-22T01:00:00Z: 1 new changes',
    checked: '4 / 6 actions on its screens',
    rules: [{ key: 'BR-001', claim: 'Age at least 18', status: st('ok', 'Holds') }],
    paths: [{ name: 'A', screens: [['SC-0001', 'Kalkulator'], ['SC-0002', 'Wynik']], outcome: 'goal reached', count: 3 }],
  },
};

const confirmIn = (name: string, button: string) => {
  fireEvent.click(within(screen.getByRole('dialog', { name })).getByRole('button', { name: button }));
};

describe('Process', () => {
  it('shows the head, the facts, the paths and A as documentation', async () => {
    at('/app/portals/shop/processes/PRC-001', { [API]: page });
    expect(await screen.findByRole('heading', { level: 1, name: 'Kup polisę' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'PROC-001' }).getAttribute('href')).toBe('/docs/shop/PROC-001');
    expect(screen.getByRole('link', { name: 'History' }).getAttribute('href')).toBe('/app/portals/shop/processes/PRC-001/history');
    expect(screen.getByText('Strona główna → link "Kalkulator"')).toBeTruthy();
    expect(within(screen.getByRole('table', { name: /Paths through the process/ })).getByRole('link', { name: 'Wynik' })).toBeTruthy();
    expect(screen.getByText(/Still open on these screens: 1 open question · 2 records to confirm/)).toBeTruthy();
    const steps = screen.getByRole('list', { name: 'Steps in A' });
    expect(within(steps).getByRole('link', { name: 'REQ-001' }).getAttribute('href')).toBe('/docs/shop/REQ-001');
    expect(within(steps).getByText('Nothing documented on this screen yet.')).toBeTruthy();
  });

  it('moves a step of A down as a signed revision, after a confirm', async () => {
    const fetch = at('/app/portals/shop/processes/PRC-001', {
      [API]: page,
      '/api/portals/shop/processes/pr-1/models/A/edit': { ok: true, message: 'A changed: a new signed revision.', href: null },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Move step 1 down' }));
    confirmIn('Move Kalkulator down?', 'Change A');
    expect(await screen.findByText('A changed: a new signed revision.')).toBeTruthy();
    const post = fetch.mock.calls.find((c) => c[0] === '/api/portals/shop/processes/pr-1/models/A/edit') as unknown as [string, { body: string }];
    expect(JSON.parse(post[1].body)).toEqual({ base_rev: 3, state_ids: ['st-s2', 'st-s1'] });
  });

  it('signs A off and selects a step through the address', async () => {
    const fetch = at('/app/portals/shop/processes/PRC-001', {
      [API]: page,
      [`${API}?model=A&step=s2`]: { ...page, selected: page.steps[1] },
      '/api/portals/shop/processes/pr-1/stage': { ok: true, message: 'Stage set; it shows in History.', href: null },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Mark as-is documented' }));
    confirmIn('Mark as-is documented?', 'Mark as-is documented');
    expect(await screen.findByText('Stage set; it shows in History.')).toBeTruthy();
    const post = fetch.mock.calls.find((c) => c[0] === '/api/portals/shop/processes/pr-1/stage') as unknown as [string, { body: string }];
    expect(JSON.parse(post[1].body)).toEqual({ stage: 'as_is_documented', base_rev: 2 });
    fireEvent.click(within(screen.getByRole('list', { name: 'Steps in A' })).getAllByRole('button', { name: 'Select' })[1]!);
    expect(await screen.findByText('Step 2 of A')).toBeTruthy();
  });

  it('says so for an unknown process', async () => {
    at('/app/portals/shop/processes/PRC-404', {});
    expect(await screen.findByText('Could not load the process')).toBeTruthy();
  });
});
