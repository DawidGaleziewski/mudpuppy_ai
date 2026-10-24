// The Processes list (spec 057) over a stubbed API: the processes, the suggestions with their
// writes behind a confirm, the archived view, and a new process from ticked screens in order.
import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { at, confirmIn } from './render-at';


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
  targets: [{ id: 'pr-1', key: 'PRC-001', name: 'Kup polisę', persona: 'guest', steps: 4, states: ['st-home', 'st-kontakt'] }],
};


describe('Processes', () => {
  it('lists the processes with their models, live marks and their pages', async () => {
    at('/app/portals/shop/processes', { [API]: list });
    const table = await screen.findByRole('table', { name: "The BA's processes of shop" });
    expect(within(table).getByRole('link', { name: 'Kup polisę' }).getAttribute('href')).toBe('/app/portals/shop/processes/PRC-001');
    expect(within(table).getByRole('link', { name: 'B r2' }).getAttribute('href')).toBe('/app/portals/shop/processes/PRC-001?model=B');
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
    await confirmIn('Accept Help pages?', 'Accept');
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
    await confirmIn('Merge Help pages with Quote again?', 'Merge');
    expect(await screen.findByText('Merged.')).toBeTruthy();
    const post = fetch.mock.calls.find((c) => c[0] === '/api/portals/shop/suggestions/sg-1/merge') as unknown as [string, { body: string }];
    expect(JSON.parse(post[1].body)).toEqual({ with: 'sg-2' });
  });

});

describe('Processes, sorting and merging (spec 078)', () => {
  it('makes a new process from the screens ticked in the sorting grid, in the order set (designer T-05)', async () => {
    const fetch = at('/app/portals/shop/processes/loose', {
      [API]: list,
      'POST /api/portals/shop/processes': { ok: true, message: 'Made Help.', href: '/processes/PRC-002?model=A' },
    });
    const grid = await screen.findByRole('list', { name: 'Screens in no process' });
    fireEvent.click(within(grid).getByRole('checkbox', { name: 'FAQ' }));
    fireEvent.click(within(grid).getByRole('checkbox', { name: 'Kontakt' }));
    // the selection bar while anything is ticked; the step numbers follow the tick order
    expect(within(screen.getByRole('region', { name: 'Selection' })).getByText('2 ticked')).toBeTruthy();
    const form = screen.getByRole('form', { name: 'New process from these' });
    fireEvent.change(within(form).getByRole('textbox', { name: 'New process name' }), { target: { value: 'Help' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Move Kontakt up' }));
    fireEvent.click(within(form).getByRole('button', { name: 'Create process' }));
    await confirmIn('Make Help?', 'Create process');
    expect(await screen.findByText('Made Help.')).toBeTruthy();
    const post = fetch.mock.calls.find((c) => c[0] === API && c[1]?.method === 'POST') as unknown as [string, { body: string }];
    expect(JSON.parse(post[1].body)).toEqual({ name: 'Help', persona: 'guest', state_ids: ['st-kontakt', 'st-faq'] });
  });

  it('adds a loose screen to a process as a scope change, never offering one it is already in, with Undo', async () => {
    const add = `${API}/pr-1/scope`;
    const fetch = at('/app/portals/shop/processes/loose', {
      [API]: list,
      [`POST ${add}`]: { ok: true, message: 'FAQ added to Kup polisę · its as-is follows what scans saw', undo: 'st-faq', href: '/app/portals/shop/processes/PRC-001' },
      [`POST ${API}/pr-1/scope/remove`]: { ok: true, message: 'Undone: the screens left the process’s scope.' },
    });
    const grid = await screen.findByRole('list', { name: 'Screens in no process' });
    const cards = within(grid).getAllByRole('listitem');
    // Kontakt is in PRC-001 already: shown, disabled
    fireEvent.click(within(cards[1]!).getByRole('button', { name: 'Add to process ▾' }));
    expect(within(screen.getByRole('menu', { name: 'Add to process' })).getByRole('menuitem', { name: /Kup polisę/ }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    fireEvent.click(within(cards[0]!).getByRole('button', { name: 'Add to process ▾' }));
    fireEvent.click(within(screen.getByRole('menu', { name: 'Add to process' })).getByRole('menuitem', { name: /Kup polisę/ }));
    await confirmIn('Add FAQ to Kup polisę?', 'Add to process');
    expect(await screen.findByText(/FAQ added to Kup polisę/)).toBeTruthy();
    const post = fetch.mock.calls.find((c) => c[0] === add) as unknown as [string, { body: string }];
    expect(JSON.parse(post[1].body)).toEqual({ state_ids: ['st-faq'] });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await confirmIn('Take FAQ out of Kup polisę again?', 'Undo');
    expect(await screen.findByText(/Undone/)).toBeTruthy();
  });

});

describe('Processes, merging (spec 078)', () => {
  it('merges two ticked processes of one persona after the server’s plan, with Undo (designer T-06)', async () => {
    const second = { ...list.rows[0]!, id: 'pr-2', key: 'PRC-002', name: 'Test process' };
    const targets = [list.targets[0]!, { id: 'pr-2', key: 'PRC-002', name: 'Test process', persona: 'guest', steps: 2, states: ['st-home', 'st-car'] }];
    const plan = {
      keep: { key: 'PRC-001', name: 'Kup polisę', persona: 'guest', steps: 4, models: ['A r1'] },
      absorb: { key: 'PRC-002', name: 'Test process', persona: 'guest', steps: 2, models: ['A r1', 'B r1'] },
      name: 'Kup polisę',
      scope: { states: ['st-home', 'st-kontakt', 'st-car'], from_absorbed: ['st-car'], off_path: [] },
      starts: ['st-home'],
      ends: ['st-kontakt', 'st-car'],
      as_is_rev: 2,
      moves: [{ model_id: 'm-b', from_label: 'B', to_label: 'B' }],
    };
    // the dry run and the merge share the address: the plan for the one, the answer for the other
    const fetch = at('/app/portals/shop/processes', {
      [API]: { ...list, rows: [list.rows[0], second], total: 2, targets },
      [`POST ${API}/merge`]: { ok: true, plan, message: 'Merged into PRC-001 Kup polisę: Undo for 10 s, or Split back later in History.', undo: 'mg-1' },
      'POST /api/portals/shop/merges/mg-1/undo': { ok: true, message: 'Split back: PRC-002 is its own process again.' },
    });
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Tick Kup polisę' }));
    const bar = screen.getByRole('region', { name: 'Selection' });
    expect(within(bar).getByRole('button', { name: 'Merge 2 processes…' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tick Test process' }));
    fireEvent.click(within(bar).getByRole('button', { name: 'Merge 2 processes…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Merge 2 processes' });
    expect(await within(dialog).findByText(/Test process's B moves over as B, marked "branched from another as-is"/)).toBeTruthy();
    expect(within(dialog).getByRole('combobox', { name: 'End' })).toBeTruthy(); // the two ends differ: pick one
    fireEvent.click(within(dialog).getByRole('button', { name: 'Merge into Kup polisę' }));
    expect(await screen.findByText(/Merged into PRC-001/)).toBeTruthy();
    const posts = fetch.mock.calls.filter((c) => c[0] === `${API}/merge`).map((c) => JSON.parse((c[1] as { body: string }).body) as Record<string, unknown>);
    expect(posts[0]).toMatchObject({ keep: 'pr-1', absorb: 'pr-2', dry_run: true });
    expect(posts.at(-1)).toEqual({ keep: 'pr-1', absorb: 'pr-2' });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await confirmIn('Undo the merge?', 'Undo');
    expect(await screen.findByText(/Split back: PRC-002/)).toBeTruthy();
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
