// The Processes list (spec 057) over a stubbed API: the processes, the suggestions with their
// writes behind a confirm, the archived view, and a new process from ticked screens in order.
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

const API = '/api/portals/shop/processes';
const status = (shape: string, word: string) => ({ shape, word });
const list = {
  portal: 'shop',
  archived: false,
  archived_count: 1,
  page: 1,
  pages: 1,
  total: 1,
  stages: [status('inferred', 'Suggested'), status('todo', 'Scoped'), status('ok', 'As-is documented')],
  rows: [
    {
      id: 'pr-1',
      key: 'PRC-001',
      name: 'Kup polisę',
      persona: 'guest',
      rev: 3,
      stage: status('draft', 'To-be in design'),
      start_route: '/',
      end_route: '/zakup',
      models: [
        { label: 'A', kind: 'as-is', rev: 1, draft: null },
        { label: 'B', kind: 'to-be', rev: 2, draft: status('draft', 'Draft open') },
      ],
      live: [{ environment: 'sandbox', status: status('live', 'Live'), what: 'A r1' }],
      screens: 4,
      amendments: 1,
      last_by: 'Anna',
      last_at: '2026-10-22T01:00:00.000Z',
    },
  ],
  suggestions: [
    { id: 'sg-1', name: 'Help pages', persona: 'guest', routes: ['/faq', '/kontakt'], why: 'menu link "FAQ"' },
    { id: 'sg-2', name: 'Quote again', persona: 'guest', routes: ['/oferta'], why: 'button "Oblicz"' },
  ],
  suggested: status('inferred', 'Inferred · not saved'),
  loose: [
    { state: 'st-faq', title: 'FAQ', route: '/faq', shot: null, wire: null, scans: 1 },
    { state: 'st-kontakt', title: 'Kontakt', route: '/kontakt', shot: null, wire: null, scans: 2 },
  ],
  default_persona: 'guest',
};

const confirmIn = (name: string, button: string) => {
  const dialog = screen.getByRole('dialog', { name });
  fireEvent.click(within(dialog).getByRole('button', { name: button }));
};

describe('Processes', () => {
  it('lists the processes with their models, live marks and the htmx process page', async () => {
    at('/app/portals/shop/processes', { [API]: list });
    const table = await screen.findByRole('table', { name: "The BA's processes of shop" });
    expect(within(table).getByRole('link', { name: 'Kup polisę' }).getAttribute('href')).toBe('/processes/PRC-001');
    expect(within(table).getByRole('link', { name: 'B r2' }).getAttribute('href')).toBe('/processes/PRC-001?model=B');
    expect(within(table).getByText('Draft open')).toBeTruthy();
    expect(within(table).getAllByText('A r1')).toHaveLength(2); // the model's tag and what is live
    expect(screen.getByText('Inferred · not saved')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Processes' }).getAttribute('aria-current')).toBe('page');
  });

  it('accepts a suggestion after a confirm and links the new process', async () => {
    const fetch = at('/app/portals/shop/processes', {
      [API]: list,
      '/api/portals/shop/suggestions/sg-1/accept': { ok: true, message: 'Accepted: it is a process now.', href: '/processes/PRC-002?model=A' },
    });
    const card = (await screen.findByRole('heading', { name: 'Help pages' })).closest('section');
    if (!card) throw new Error('no suggestion plate');
    fireEvent.click(within(card).getByRole('button', { name: 'Accept' }));
    confirmIn('Accept Help pages?', 'Accept');
    expect(await screen.findByText('Accepted: it is a process now.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open the process' }).getAttribute('href')).toBe('/processes/PRC-002?model=A');
    expect(fetch.mock.calls.filter((c) => c[0] === '/api/portals/shop/suggestions/sg-1/accept')).toHaveLength(1);
  });

  it('splits and merges a suggestion with the step and the other suggestion picked', async () => {
    const fetch = at('/app/portals/shop/processes', {
      [API]: list,
      '/api/portals/shop/suggestions/sg-1/merge': { ok: true, message: 'Merged.', href: null },
    });
    const card = (await screen.findByRole('heading', { name: 'Help pages' })).closest('section');
    if (!card) throw new Error('no suggestion plate');
    expect(within(card).getByRole('option', { name: 'step 2 · /kontakt' })).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: 'Merge' }));
    confirmIn('Merge Help pages with Quote again?', 'Merge');
    expect(await screen.findByText('Merged.')).toBeTruthy();
    const post = fetch.mock.calls.find((c) => c[0] === '/api/portals/shop/suggestions/sg-1/merge') as unknown as [string, { body: string }];
    expect(JSON.parse(post[1].body)).toEqual({ with: 'sg-2' });
  });

  it('makes a new process from the screens ticked, in the order set', async () => {
    const fetch = at('/app/portals/shop/processes', {
      [API]: list,
      'POST /api/portals/shop/processes': { ok: true, message: 'Made Help.', href: '/processes/PRC-002?model=A' },
    });
    const form = await screen.findByRole('form', { name: 'New process from screens' });
    fireEvent.change(within(form).getByRole('textbox', { name: 'New process name' }), { target: { value: 'Help' } });
    fireEvent.click(within(form).getByRole('checkbox', { name: /\/faq/ }));
    fireEvent.click(within(form).getByRole('checkbox', { name: /\/kontakt/ }));
    fireEvent.click(within(form).getByRole('button', { name: 'Move Kontakt up' }));
    fireEvent.click(within(form).getByRole('button', { name: 'New process from these' }));
    confirmIn('Make Help?', 'Make the process');
    expect(await screen.findByText('Made Help.')).toBeTruthy();
    const post = fetch.mock.calls.find((c) => c[0] === API && c[1]?.method === 'POST') as unknown as [string, { body: string }];
    expect(JSON.parse(post[1].body)).toEqual({ name: 'Help', persona: 'guest', state_ids: ['st-kontakt', 'st-faq'] });
  });

  it('shows the archived processes with Restore', async () => {
    const fetch = at('/app/portals/shop/processes', {
      [API]: list,
      [`${API}?archived=true`]: { ...list, archived: true, suggestions: [], loose: [] },
    });
    fireEvent.click(await screen.findByRole('button', { name: /Archived/ }));
    expect(await screen.findByRole('button', { name: 'Restore Kup polisę' })).toBeTruthy();
    expect(fetch.mock.calls.map((c) => c[0])).toContain(`${API}?archived=true`);
  });
});
