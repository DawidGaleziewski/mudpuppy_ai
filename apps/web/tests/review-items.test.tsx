// Review part 2 (spec 063) over a stubbed API: a difference, an amendment to re-anchor, a proposal
// and a probe suite in the side column with their writes behind a confirm, and the single keys.
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
  localStorage.clear();
});

const API = '/api/portals/shop/review';
const status = (shape: string, word: string) => ({ shape, word });
const row = (over: Record<string, unknown>) => ({ tags: [], chip: null, status: null, meta: null, hint: null, route: null, at: null, keys: [], ...over });
const detail = (r: Record<string, unknown>, own: Record<string, unknown>) => ({ row: r, has_detail: true, text:null, link: null, also: [], rev: null, revs: null, cited: [], ...own });
const page = (kind: string, r: Record<string, unknown>, own: Record<string, unknown>) => ({
  portal: 'shop',
  decides: true,
  tab: 'needs',
  total: 1,
  explained_count: 0,
  decided_count: 0,
  same_screen_pairs: 0,
  kinds: [{ value: kind, label: kind }],
  counts: { [kind]: 1 },
  show: kind,
  groups: [{ kind, label: kind, count: 1, rows: [r], empty: '', alike: [], page: 1, pages: 1, decides: false }],
  empty_kinds: [],
  filters: null,
  reasons: {},
  selected: detail(r, own),
  neighbours: { index: 1, total: 1, label: kind, prev: null, next: null },
  explained: [],
  decided: [],
});
const lastBody = (fetch: ReturnType<typeof at>, path: string) => {
  const call = fetch.mock.calls.find((c) => c[0] === path) as unknown as [string, { body: string }];
  return JSON.parse(call[1].body) as Record<string, unknown>;
};
const confirmIn = (name: string, button: string) => {
  fireEvent.click(within(screen.getByRole('dialog', { name })).getByRole('button', { name: button }));
};

describe('Review part 2', () => {
  it('names who sees a difference and links them side by side', async () => {
    const r = row({ kind: 'differences', id: 'sc|menu', title: 'Account', route: '/account' });
    const difference = {
      element: 'menu',
      sides: [
        { label: 'Seen by', personas: [{ value: 'b2b', label: 'no attributes' }] },
        { label: 'Not seen by', personas: [{ value: 'basic', label: 'tariff: basic' }] },
      ],
      compare: { value: '/states/st-2?side=access&left=b2b&right=basic', label: 'Compare b2b and basic side by side' },
      advice: 'Explain it with a business rule.',
    };
    at('/app/portals/shop/review?show=differences', { [`${API}?show=differences`]: page('differences', r, { difference }) });
    const side = await screen.findByRole('region', { name: 'Account' });
    expect(within(side).getByText('tariff: basic')).toBeTruthy();
    expect(within(side).getByRole('link', { name: 'Compare b2b and basic side by side' }).getAttribute('href')).toBe('/states/st-2?side=access&left=b2b&right=basic');
  });

  it('re-anchors an amendment on a screen after asking', async () => {
    const r = row({ kind: 'reanchor', id: 'AMD-003', tags: ['AMD-003 r1'], title: 'Check the tax' });
    const reanchor = { amendment: 'amd-3', key: 'AMD-003', rev: 1, text: 'Check the tax', author: 'Anna', at: '2026-10-14T08:00:00Z', attachment: null, why: 'The element it was anchored to is gone from the newer recording.', why_detail: null, was_on: { value: '/states/st-1', label: '/kalkulator' }, element: 'btn', changed_by_scan: '01a110d5-2028-7000-8f3e-5c1a9b27d460', state_id: 'st-1', element_key: 'btn', states: [{ value: 'st-1', label: 'Kalkulator · /kalkulator' }] };
    const fetch = at('/app/portals/shop/review?show=reanchor', {
      [`${API}?show=reanchor`]: page('reanchor', r, { reanchor }),
      [`POST ${API}/amendments/amd-3/reanchor`]: { ok: true, message: 'AMD-003 re-anchored as r2.', href: null },
    });
    const side = await screen.findByRole('region', { name: 'Check the tax' });
    expect(within(side).getByText(/is gone from the newer recording/)).toBeTruthy();
    expect(within(side).getByRole('link', { name: '01a110d5-2028' })).toBeTruthy();
    fireEvent.change(within(side).getByRole('textbox', { name: 'Element key (optional)' }), { target: { value: '' } });
    fireEvent.click(within(side).getByRole('button', { name: 'Re-anchor here' }));
    confirmIn('Re-anchor AMD-003?', 'Re-anchor here');
    expect(await screen.findByText('AMD-003 re-anchored as r2.')).toBeTruthy();
    expect(lastBody(fetch, `${API}/amendments/amd-3/reanchor`)).toEqual({ state_id: 'st-1', element: '', text: '' });
  });

  it('shows a proposal before → after and applies it; a stale one keeps Discard only', async () => {
    const r = row({ kind: 'proposals', id: 'p-1', tags: ['AMD-001'], title: 'Clearer wording' });
    const proposal = { id: 'p-1', key: 'AMD-001', is_new: false, base_rev: 1, next_rev: 2, status: status('needs', 'Open'), stale: false, head_rev: 1, target: null, text: { before: 'old words', after: 'new words' }, screen: null };
    const fetch = at('/app/portals/shop/review?show=proposals', {
      [`${API}?show=proposals`]: page('proposals', r, { proposal }),
      [`POST ${API}/proposals/p-1/apply`]: { ok: true, message: 'Applied as r2.', href: null },
    });
    const side = await screen.findByRole('region', { name: 'Clearer wording' });
    expect(within(side).getByText('old words').className).toBe('sy-diff--removed');
    expect(within(side).getByText('new words').className).toBe('sy-drawn-text');
    fireEvent.click(within(side).getByRole('button', { name: 'Apply as r2' }));
    confirmIn('Apply as r2?', 'Apply');
    expect(await screen.findByText('Applied as r2.')).toBeTruthy();
    expect(fetch.mock.calls.some((c) => c[0] === `${API}/proposals/p-1/apply`)).toBe(true);
  });

  it('a stale proposal cannot be applied', async () => {
    const r = row({ kind: 'proposals', id: 'p-2', title: 'Old idea' });
    const proposal = { id: 'p-2', key: 'AMD-002', is_new: false, base_rev: 1, next_rev: 3, status: status('stale', 'Stale'), stale: true, head_rev: 2, target: null, text: null, screen: null };
    at('/app/portals/shop/review?show=proposals', { [`${API}?show=proposals`]: page('proposals', r, { proposal }) });
    const side = await screen.findByRole('region', { name: 'Old idea' });
    expect(within(side).getByRole('button', { name: 'Apply as r3' }).hasAttribute('disabled')).toBe(true);
    expect(within(side).getByText(/is at r2 now/)).toBeTruthy();
  });

});

describe('Review suites', () => {
  it('edits a suite (drops a variant, changes what one expects, adds a step) and approves it', async () => {
    const r = row({ kind: 'suites', id: 'suite-1', title: 'Get a quote' });
    const suite = {
      id: 'suite-1', trace_id: 'quote', run_id: 'run-1', goal: 'Reach the summary', start_url: '/apply', step_label: 'Your contract',
      variants: [
        { id: 'happy-path', expect: 'proceed', probe: 'happy-path', fault: null, why: '', steps: [{ kind: 'click', name: 'Next', value: '' }] },
        { id: 'quote-500', expect: 'technical_error', probe: 'http-500', fault: 'http_500', why: 'the quote service fails', steps: [] },
      ],
      expects: [{ value: 'proceed', label: 'Moves on' }, { value: 'branch', label: 'Leads elsewhere' }, { value: 'technical_error', label: 'Shows a technical error' }],
      kinds: [{ value: 'fill', label: 'Type' }, { value: 'click', label: 'Press' }],
      traces_file: 'portals/shop/traces.yaml',
      run_command: 'pnpm --dir apps/crawler portal:trace shop quote <persona>',
    }; // prettier-ignore
    const fetch = at('/app/portals/shop/review?show=suites', {
      [`${API}?show=suites`]: page('suites', r, { suite }),
      [`POST ${API}/suites/suite-1`]: { ok: true, message: 'Suite approved: written into traces.yaml.', href: null },
    });
    const side = await screen.findByRole('region', { name: 'Get a quote' });
    expect(side.className).toContain('sy-plate--drawn');
    const kept = within(side).getAllByRole('checkbox', { name: 'Run every time' });
    fireEvent.click(kept[1] as HTMLElement);
    fireEvent.change(within(side).getAllByRole('combobox', { name: 'Expected' })[0] as HTMLElement, { target: { value: 'branch' } });
    fireEvent.click(within(side).getAllByRole('button', { name: 'Add a step' })[0] as HTMLElement);
    fireEvent.change(within(side).getByRole('textbox', { name: 'Field or control of step 2' }), { target: { value: 'Promo code' } });
    fireEvent.change(within(side).getByRole('textbox', { name: 'Value of step 2' }), { target: { value: 'WELCOME' } });
    fireEvent.click(within(side).getByRole('button', { name: 'Approve the suite' }));
    confirmIn('Approve the suite?', 'Approve');
    expect(await screen.findByText('Suite approved: written into traces.yaml.')).toBeTruthy();
    const body = lastBody(fetch, `${API}/suites/suite-1`);
    expect(body.action).toBe('approve');
    expect(body.variants).toEqual([
      { id: 'happy-path', keep: true, expect: 'branch', steps: [{ kind: 'click', name: 'Next', value: '' }, { kind: 'fill', name: 'Promo code', value: 'WELCOME' }] },
      { id: 'quote-500', keep: false, expect: 'technical_error', steps: [] },
    ]);
  });
});

describe('Review keys', () => {
  const rule = row({ kind: 'rules', id: 'H-0002', title: 'Driver age', keys: ['H-0002'] });
  const keysPage = { ...page('rules', rule, {}), groups: [{ kind: 'rules', label: 'Rules', count: 2, rows: [rule], empty: '', alike: [], page: 1, pages: 1, decides: true }], neighbours: { index: 1, total: 2, label: 'Rules', prev: null, next: 'rules:H-0003' } };

  it('J opens the next item, C asks to confirm, keys never act while typing', async () => {
    at('/app/portals/shop/review?show=rules', { [`${API}?show=rules`]: keysPage, [`${API}?show=rules&select=rules%3AH-0003`]: keysPage });
    const side = await screen.findByRole('region', { name: 'Driver age' });
    const reason = within(side).getByRole('combobox', { name: 'Reason · one line' });
    fireEvent.keyDown(reason, { key: 'c' });
    expect(screen.queryByRole('dialog', { name: 'Confirm H-0002?' })).toBeNull(); // typing, not a key
    fireEvent.keyDown(document.body, { key: 'c' });
    expect(screen.getByRole('dialog', { name: 'Confirm H-0002?' })).toBeTruthy();
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Confirm H-0002?' })).getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(document.body, { key: 'j' });
    expect(await screen.findByRole('region', { name: 'Driver age' })).toBeTruthy();
  });

  it('can be turned off in this browser', async () => {
    at('/app/portals/shop/review?show=rules', { [`${API}?show=rules`]: keysPage });
    await screen.findByRole('region', { name: 'Driver age' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Single-key shortcuts in this browser' }));
    expect(localStorage.getItem('mudpuppy.review.keys')).toBe('off');
    fireEvent.keyDown(document.body, { key: 'c' });
    expect(screen.queryByRole('dialog', { name: 'Confirm H-0002?' })).toBeNull();
    expect(screen.getByText('Single-key shortcuts are off')).toBeTruthy();
  });
});
