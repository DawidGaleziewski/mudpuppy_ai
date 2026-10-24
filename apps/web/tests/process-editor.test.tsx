// The to-be editor (spec 059) over a stubbed API: a step operation autosaves the person's draft at
// once (D-1), Save and Discard ask first, someone saving first shows the conflict with Rebase.
import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { at } from './render-at';

afterEach(() => {
  vi.unstubAllGlobals();
});

const API = '/api/portals/shop/processes/PRC-001';
const BASE = '/api/portals/shop/processes/pr-1/models/B';
const st = (shape: string, word: string) => ({ shape, word });
const raw = (id: string, title: string, route: string) => ({
  id,
  title,
  route,
  state_id: `st-${id}`,
  screen_id: null,
  observed: true,
  from: [id],
  annotations: [],
});
const shown = (id: string, n: number, title: string, route: string) => ({
  id,
  n,
  title,
  route,
  state: `st-${id}`,
  observed: true,
  built_from: [`${title} ${route}`],
  annotations: [],
  shot: null,
  wire: null,
  scans: 0,
  records: [],
  documented: false,
  amendments: 0,
  reanchor: 0,
});
const B = { label: 'B', kind: 'to-be', rev: 2, draft: st('draft', 'Draft open') };
const page = {
  portal: 'shop',
  id: 'pr-1',
  key: 'PRC-001',
  name: 'Kup polisę',
  persona: 'guest',
  rev: 4,
  stage: st('draft', 'To-be in design'),
  stage_value: 'to_be_design',
  live: [],
  screens: 2,
  record_key: null,
  archived_at: null,
  models: [{ label: 'A', kind: 'as-is', rev: 1, draft: null }, B],
  model: B,
  to_be_first: 'B',
  steps: [shown('s1', 1, 'Home', '/'), shown('s2', 2, 'Car', '/car')],
  selected: null,
  as_is: null,
  facts: null,
  editor: {
    editable: true,
    author: 'Anna',
    draft: { base_rev: 2, updated_at: '2026-10-23T09:00:00.000Z', pending: 1, conflict: false },
    steps: [raw('s1', 'Home', '/'), raw('s2', 'Car', '/car')],
    changes: { s2: st('draft', 'Changed') },
    removed: ['Driver · /driver'],
    as_is: ['1 · Home /', '2 · Car /car', '3 · Driver /driver'],
  },
};

/** The body of the draft's autosave, once it is sent. */
const draftBody = async <T,>(fetch: ReturnType<typeof at>): Promise<T> => {
  const post = await vi.waitFor(() => {
    const found = fetch.mock.calls.find((c) => c[0] === `${BASE}/draft`);
    if (!found) throw new Error('no autosave yet');
    return found as unknown as [string, { body: string }];
  });
  return JSON.parse(post[1].body) as T;
};

type Steps = { steps: { id: string; title: string; route: string | null; observed: boolean }[] };

describe('To-be editor', () => {
  it('adds a designed step at the end, trimmed, and empties the form', async () => {
    const fetch = at(`/app/portals/shop/processes/PRC-001`, {
      [API]: page,
      [`${BASE}/draft`]: { ok: true, message: 'Draft saved.', href: null },
    });
    const form = await screen.findByRole('form', { name: 'Add a step at the end' });
    const title = within(form).getByRole('textbox', { name: 'New step' });
    fireEvent.change(title, { target: { value: '  Summary ' } });
    fireEvent.change(within(form).getByRole('textbox', { name: 'Route' }), { target: { value: ' /summary ' } });
    fireEvent.click(within(form).getByRole('button', { name: '+ Add step' }));
    const body = await draftBody<Steps>(fetch);
    expect(body.steps.at(-1)).toMatchObject({ title: 'Summary', route: '/summary', observed: false });
    await vi.waitFor(() => expect((title as HTMLInputElement).value).toBe(''));
  });

  it('changes the selected step: an empty title is not taken', async () => {
    const fetch = at(`/app/portals/shop/processes/PRC-001?model=B&step=s2`, {
      [`${API}?model=B&step=s2`]: { ...page, selected: page.steps[1] },
      [`${BASE}/draft`]: { ok: true, message: 'Draft saved.', href: null },
    });
    const form = await screen.findByRole('form', { name: 'Change this step' });
    const title = within(form).getByRole('textbox', { name: 'Title' });
    fireEvent.change(title, { target: { value: '  ' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Change step' }));
    expect(await within(form).findByText('A title first.')).toBeTruthy();
    fireEvent.change(title, { target: { value: 'Car details' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Change step' }));
    const body = await draftBody<Steps>(fetch);
    expect(body.steps[1]).toMatchObject({ id: 's2', title: 'Car details', route: '/car', observed: false });
  });

  it('autosaves the draft after a step operation, without asking', async () => {
    const fetch = at(`/app/portals/shop/processes/PRC-001`, {
      [API]: page,
      [`${BASE}/draft`]: { ok: true, message: 'Draft saved; only you see it until you save.', href: null },
    });
    expect(await screen.findByText('Driver · /driver')).toBeTruthy();
    expect(screen.getByText('Changed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Move step 1 down' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await screen.findByRole('list', { name: 'Steps in B' });
    const body = await draftBody<{ base_rev: number; steps: { id: string }[] }>(fetch);
    expect(body.base_rev).toBe(2);
    expect(body.steps.map((s) => s.id)).toEqual(['s2', 's1']);
  });

  it('asks before saving the draft as the next revision', async () => {
    const fetch = at(`/app/portals/shop/processes/PRC-001`, {
      [API]: page,
      [`${BASE}/save`]: { ok: true, message: 'Saved as a new revision.', href: null },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Save as B r3' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Save as B r3?' })).getByRole('button', { name: 'Save as B r3' }));
    expect(await screen.findByText('Saved as a new revision.')).toBeTruthy();
    const post = fetch.mock.calls.find((c) => c[0] === `${BASE}/save`) as unknown as [string, { body: string }];
    expect(JSON.parse(post[1].body)).toEqual({ base_rev: 2 });
  });

  it('adds an annotation to the selected step, signed by the person', async () => {
    const fetch = at(`/app/portals/shop/processes/PRC-001?model=B&step=s2`, {
      [`${API}?model=B&step=s2`]: { ...page, selected: page.steps[1] },
      [`${BASE}/draft`]: { ok: true, message: 'Draft saved.', href: null },
    });
    fireEvent.change(await screen.findByRole('textbox', { name: 'New annotation' }), { target: { value: 'One form instead' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add annotation' }));
    const body = await draftBody<{ steps: { id: string; annotations: { text: string; author: string }[] }[] }>(fetch);
    expect(body.steps[1]!.annotations[0]).toMatchObject({ text: 'One form instead', author: 'Anna' });
  });

  it('shows that someone saved first, with Rebase', async () => {
    at(`/app/portals/shop/processes/PRC-001`, {
      [API]: { ...page, editor: { ...page.editor, draft: { ...page.editor.draft, base_rev: 1, conflict: true } } },
    });
    expect(await screen.findByText('Someone saved first')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rebase your draft onto r2' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Compare your draft with r2' }).getAttribute('href')).toBe('/app/portals/shop/processes/PRC-001/compare?left=B&right=B');
  });
});
