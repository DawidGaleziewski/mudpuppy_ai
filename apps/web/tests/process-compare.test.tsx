// A process's Compare and History (spec 060) over a stubbed API: the diff and the change spec saved
// after a confirm with lists split per line; History's live marks and a restore.
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
const head = {
  portal: 'shop',
  id: 'pr-1',
  key: 'PRC-001',
  name: 'Kup polisę',
  models: [
    { value: 'A', label: 'A r1' },
    { value: 'B', label: 'B r2' },
  ],
};
const compare = {
  head,
  left: 'A',
  right: 'B',
  left_label: 'A r1',
  right_label: 'B r3',
  draft: true,
  counts: [
    [st('ok', 'Unchanged'), 1],
    [st('draft', 'Merged'), 1],
  ],
  rows: [
    { change: st('ok', 'Unchanged'), left: [{ title: 'Home', route: '/' }], right: { title: 'Home', route: '/' }, notes: [], merged: null },
    {
      change: st('draft', 'Merged'),
      left: [
        { title: 'Car', route: '/car' },
        { title: 'Driver', route: '/driver' },
      ],
      right: { title: 'One form', route: '/quote' },
      notes: ['Ask once — Anna'],
      merged: '2 steps into 1',
    },
  ],
  saved: null,
  spec_head: null,
  sections: [
    { key: 'scope', title: 'Scope', is_list: false, text: 'Kup polisę · persona guest' },
    { key: 'delta', title: 'Delta', is_list: true, text: 'Car and Driver merge' },
  ],
  left_rev: 1,
  right_rev: 2,
};
const history = {
  head,
  revision_count: 3,
  marked_in: ['sandbox'],
  live: [
    { environment: 'sandbox', live: 'A r1', status: st('live', 'Live'), how: 'Anna · 2026-10-22T01:00:00.000Z', reason: null },
    { environment: 'staging', live: null, status: st('todo', 'Not marked'), how: null, reason: null },
  ],
  models: [
    {
      label: 'B',
      kind: 'to-be',
      rev: 2,
      revisions: [
        { label: 'B', rev: 2, change: 'save', author: 'Bob', at: '2026-10-22T02:00:00.000Z', note: null, live: null, latest: true, origin: null, restorable: false },
        { label: 'B', rev: 1, change: 'branch', author: 'Anna', at: '2026-10-22T01:30:00.000Z', note: null, live: null, latest: false, origin: 'from A r1', restorable: true },
      ],
    },
  ],
  process: [{ rev: 1, change: 'create', name: 'Kup polisę', stage: st('draft', 'To-be in design'), author: 'Anna', at: '2026-10-22T01:00:00.000Z' }],
  specs: [],
  conflicts: [],
};

const confirmIn = (name: string, button: string) => {
  fireEvent.click(within(screen.getByRole('dialog', { name })).getByRole('button', { name: button }));
};

describe('Compare', () => {
  it('shows the diff and saves the change spec with lists one item per line', async () => {
    const fetch = at('/app/portals/shop/processes/PRC-001/compare?left=A&right=B', {
      [`${API}/compare?left=A&right=B`]: compare,
      '/api/portals/shop/processes/pr-1/change-spec': { ok: true, message: 'Change spec saved as a new revision.', href: null },
    });
    const table = await screen.findByRole('table', { name: /Steps of A r1 against B r3/ });
    expect(within(table).getByText('2 steps into 1')).toBeTruthy();
    expect(within(table).getByText('Ask once — Anna')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Delta (one per line)' }), { target: { value: 'Car and Driver merge\n\nOffer is new' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save spec as r1' }));
    confirmIn('Save the change spec as r1?', 'Save spec as r1');
    expect(await screen.findByText('Change spec saved as a new revision.')).toBeTruthy();
    const post = fetch.mock.calls.find((c) => c[0] === '/api/portals/shop/processes/pr-1/change-spec') as unknown as [string, { body: string }];
    expect(JSON.parse(post[1].body)).toEqual({
      left: { label: 'A', rev: 1 },
      right: { label: 'B', rev: 2 },
      sections: { scope: 'Kup polisę · persona guest', delta: ['Car and Driver merge', 'Offer is new'] },
    });
    expect(screen.getByRole('link', { name: 'Export spec' }).getAttribute('href')).toBe('/api/portals/shop/processes/PRC-001/spec.md?left=A&right=B');
  });
});

describe('History', () => {
  it('marks a model live and restores an older revision after a confirm', async () => {
    const fetch = at('/app/portals/shop/processes/PRC-001/history', {
      [`${API}/history`]: history,
      '/api/portals/shop/processes/pr-1/live': { ok: true, message: 'Marked live in staging.', href: null },
      '/api/portals/shop/processes/pr-1/models/B/restore': { ok: true, message: 'Restored as a new revision; nothing was deleted.', href: null },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Mark live in staging' }));
    confirmIn('Mark B live in staging?', 'Mark live in staging');
    expect(await screen.findByText('Marked live in staging.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Restore as r3' }));
    confirmIn('Restore B r1 as B r3?', 'Restore as r3');
    expect(await screen.findByText('Restored as a new revision; nothing was deleted.')).toBeTruthy();
    const restore = fetch.mock.calls.find((c) => c[0] === '/api/portals/shop/processes/pr-1/models/B/restore') as unknown as [string, { body: string }];
    expect(JSON.parse(restore[1].body)).toEqual({ rev: 1, base_rev: 2 });
    expect(screen.getByText(/3 revisions · live in sandbox/)).toBeTruthy();
  });
});
