// The recorded map (One scan's path) and the Recorded pages (spec 054) over a stubbed API; a
// mark asks first, then posts and says what happened.
import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { RECORDED, recorded, recordedNode, recordedPages } from './fixtures-scan-views';
import { at } from './render-at';

beforeAll(() => {
  // jsdom has no modal dialogs: open and close by the attribute, as a browser shows them.
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

const NODE = '/api/portals/shop/map/recorded/sc-form';

describe('Recorded map', () => {
  it('draws every recorded screen with its deck, chips and marks', async () => {
    at('/app/portals/shop/screens/map?view=path', { [RECORDED]: recorded });
    const graph = await screen.findByRole('region', { name: 'Map of shop as every scan recorded it, from the start page' });
    const form = within(graph).getByRole('button', { name: /Wniosek/ });
    expect(form.className).toContain('sy-node--deck');
    expect(within(form).getByText('Probe')).toBeTruthy();
    expect(within(form).getByText('+2 queued')).toBeTruthy();
    expect(within(graph).getByRole('link', { name: /14 pages/ }).getAttribute('href')).toBe('?open=%2Foferta&view=path');
    expect(screen.getByText(/16 screens · 3 transitions · 2 queued · 1 mark for the next scan/)).toBeTruthy();
    // whole scan ids (D-9)
    expect(screen.getByRole('option', { name: /01a0da64-3bf1-7000-8000-000000000001 · guest/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: "One scan's path" }).getAttribute('aria-pressed')).toBe('true');
  });

  it('asks the API for the scan and the layers picked', async () => {
    const one = '/api/portals/shop/map/recorded?scan=01a0da64-3bf1-7000-8000-000000000001';
    const fetch = at('/app/portals/shop/screens/map?view=path', { [RECORDED]: recorded, [one]: recorded });
    fireEvent.change(await screen.findByRole('combobox', { name: 'Scans' }), {
      target: { value: '01a0da64-3bf1-7000-8000-000000000001' },
    });
    await screen.findByRole('region', { name: /Map of shop/ });
    expect(fetch.mock.calls.map((c) => c[0])).toContain(one);
  });

  it('inspects a screen and marks it for the next scan after a confirm', async () => {
    const fetch = at('/app/portals/shop/screens/map?view=path', {
      [RECORDED]: recorded,
      [NODE]: recordedNode,
      '/api/states/st-f1/marks': { ok: true, message: 'Marked Start here.', href: null },
    });
    fireEvent.click(await screen.findByRole('button', { name: /Wniosek/ }));
    expect(await screen.findByRole('heading', { name: 'Moves out · 1' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '01a0da64-3bf1-7000-8000-000000000002' }).getAttribute('href')).toBe(
      '/app/scans/01a0da64-3bf1-7000-8000-000000000002',
    );
    expect(screen.getByRole('button', { name: '✓ Skip' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Start here' }));
    const dialog = screen.getByRole('dialog', { name: 'Mark Start here?' });
    expect(fetch.mock.calls.some((c) => c[0] === '/api/states/st-f1/marks')).toBe(false); // nothing before the confirm
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark Start here' }));
    expect(await screen.findByText('Marked Start here.')).toBeTruthy();
    const post = fetch.mock.calls.find((c) => c[0] === '/api/states/st-f1/marks') as unknown as [string, { body: string }];
    expect(JSON.parse(post[1].body)).toEqual({ kind: 'start', action: 'mark' });
  });

  it('shows a refusal as a failure, and Cancel sends nothing', async () => {
    const fetch = at('/app/portals/shop/screens/map?view=path&node=sc-form', {
      [RECORDED]: recorded,
      [NODE]: recordedNode,
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Remove the mark' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove the mark' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove the mark' }));
    // the stub answers 404 for an address it does not know: the page says the dashboard's message
    expect((await screen.findByRole('alert')).textContent).toContain('This address does not exist.');
    expect(fetch.mock.calls.filter((c) => c[0] === '/api/states/st-f1/probe-mark')).toHaveLength(1);
  });

  it('is the map of a portal without a model', async () => {
    at('/app/portals/shop/screens/map', {
      '/api/portals/shop/map?': { has_model: false, portal: 'shop' },
      [RECORDED]: { ...recorded, has_model: false, views: [] },
    });
    expect(await screen.findByText(/No model yet/)).toBeTruthy();
    expect(await screen.findByRole('region', { name: /Map of shop as every scan recorded it/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: "One scan's path" })).toBeNull();
  });
});

describe('Recorded pages', () => {
  it('lists the recorded pages with their probes and pages', async () => {
    at('/app/portals/shop/screens/recorded', { '/api/portals/shop/screens/recorded': recordedPages });
    const table = await screen.findByRole('table', { name: 'Recorded pages of shop' });
    expect(within(table).getByRole('link', { name: 'Wniosek' }).getAttribute('href')).toBe('/states/st-f1');
    expect(within(table).getByText('Probe')).toBeTruthy();
    expect(within(table).getByRole('button', { name: 'Picture of Strona główna' })).toBeTruthy();
    expect(screen.getByText('30 recorded pages · 1 form step: 1 marked for probing, 0 not probed')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Next' }).getAttribute('href')).toBe('?page=2');
    expect(screen.getByRole('link', { name: 'Recorded pages' }).getAttribute('aria-current')).toBe('page');
  });

  it('filters by title or route', async () => {
    const fetch = at('/app/portals/shop/screens/recorded', {
      '/api/portals/shop/screens/recorded': recordedPages,
      '/api/portals/shop/screens/recorded?q=form': { ...recordedPages, q: 'form', rows: [], total: 0 },
    });
    fireEvent.change(await screen.findByRole('searchbox', { name: 'Title or route contains' }), { target: { value: 'form' } });
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(await screen.findByText(/No page matches “form”/)).toBeTruthy();
    expect(fetch.mock.calls.map((c) => c[0])).toContain('/api/portals/shop/screens/recorded?q=form');
  });
});
