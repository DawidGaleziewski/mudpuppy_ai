// Review (spec 062) over a stubbed API: the tabs and groups, the selected item, a decision behind a
// confirm whose answer offers Undo, a record's review, an item with nothing more than its row, and
// the Explained and Decided tabs.
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

const API = '/api/portals/shop/review';
const status = (shape: string, word: string) => ({ shape, word });
const row = (over: Record<string, unknown>) => ({
  tags: [],
  chip: null,
  status: null,
  meta: null,
  hint: null,
  route: null,
  at: null,
  keys: [],
  ...over,
});
const rule = row({ kind: 'rules', id: 'H-0002', title: 'Driver must be 21 or older', status: status('needs', 'Tested'), keys: ['H-0002'], at: '2026-10-23T00:00:00Z' });
const removal = (n: number) => row({ kind: 'removals', id: `d${String(n)}`, title: `Link ${String(n)} gone within one build.`, chip: { word: 'Removed', variant: null }, keys: [`H-000${String(n)}`] });
const base = {
  portal: 'shop',
  decides: true,
  tab: 'needs',
  total: 3,
  explained_count: 1,
  decided_count: 1,
  same_screen_pairs: 0,
  kinds: [
    { value: 'rules', label: 'Rules' },
    { value: 'removals', label: 'Removals' },
    { value: 'records', label: 'Records to confirm' },
    { value: 'suites', label: 'Probe suites to approve' },
  ],
  counts: { rules: 1, removals: 2, records: 0, suites: 0 },
  show: null,
  groups: [
    { kind: 'rules', label: 'Rules', count: 1, rows: [rule], empty: '', alike: [], page: 1, pages: 1, decides: true },
    { kind: 'removals', label: 'Removals', count: 2, rows: [removal(5), removal(6)], empty: '', alike: [{ label: 'Links gone within one build', keys: ['H-0005', 'H-0006'], count: 2 }], page: 1, pages: 1, decides: true },
  ],
  empty_kinds: [
    { value: 'records', label: 'Records to confirm' },
    { value: 'suites', label: 'Probe suites to approve' },
  ],
  filters: { parts: [{ value: 'Shell', label: 'Shell (3)' }], ages: [], part: null, age: null, active: false },
  reasons: { rules: ['Seen the release.'] },
  selected: { row: rule, has_detail: true, text: 'Mined from 12 cases.', link: { value: '/app/portals/shop/rules/H-0002', label: 'Open the rule: its decision table and tests' }, also: [], rev: null, revs: null, cited: [] },
  neighbours: { index: 1, total: 1, label: 'Rules', prev: null, next: null },
  explained: [],
  decided: [],
};

describe('Review', () => {
  it('shows the groups with the first as the one intent plate and the selected item beside', async () => {
    at('/app/portals/shop/review', { [API]: base });
    const rules = await screen.findByRole('region', { name: 'Rules' });
    expect(rules.className).toContain('sy-plate--intent');
    expect(screen.getByRole('region', { name: 'Removals' }).className).not.toContain('sy-plate--intent');
    expect(within(rules).getByRole('link', { name: 'Driver must be 21 or older' }).getAttribute('href')).toBe('/app/portals/shop/review?select=rules%3AH-0002');
    const nav = screen.getByRole('navigation', { name: 'Kinds of decision' });
    expect(within(nav).getByRole('link', { name: /Removals/ }).getAttribute('href')).toBe('/app/portals/shop/review?show=removals');
    expect(screen.getByRole('link', { name: 'Probe suites to approve' })).toBeTruthy(); // nothing waits there
    const detail = screen.getByRole('region', { name: 'Driver must be 21 or older' });
    expect(within(detail).getByText('Mined from 12 cases.')).toBeTruthy();
    expect(within(detail).getByRole('link', { name: 'Open the rule: its decision table and tests' }).getAttribute('href')).toBe('/app/portals/shop/rules/H-0002');
    expect(screen.getByRole('link', { name: 'Review' }).getAttribute('aria-current')).toBe('page');
  });

  it('confirms after asking, then offers Undo, which asks too', async () => {
    const fetch = at('/app/portals/shop/review', {
      [API]: base,
      [`POST ${API}/decide`]: { ok: true, message: 'Confirmed: H-0002.', href: null, undo: 'cmd-1' },
      [`POST ${API}/undo`]: { ok: true, message: 'Undone: H-0002.', href: null },
    });
    const detail = await screen.findByRole('region', { name: 'Driver must be 21 or older' });
    // the reason suggests the last ones used (a list), so it is a combobox
    fireEvent.change(within(detail).getByRole('combobox', { name: 'Reason · one line' }), { target: { value: 'Seen it' } });
    fireEvent.click(within(detail).getByRole('button', { name: 'Confirm' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Confirm H-0002?' })).getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Confirmed: H-0002.')).toBeTruthy();
    const post = fetch.mock.calls.find((c) => c[0] === `${API}/decide`) as unknown as [string, { body: string }];
    expect(JSON.parse(post[1].body)).toEqual({ keys: ['H-0002'], action: 'confirm', reason: 'Seen it', also: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Undo this decision?' })).getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('Undone: H-0002.')).toBeTruthy();
    const undo = fetch.mock.calls.find((c) => c[0] === `${API}/undo`) as unknown as [string, { body: string }];
    expect(JSON.parse(undo[1].body)).toEqual({ decision: 'cmd-1' });
  });

  it('a reject needs a reason; alike items are rejected together with one reason', async () => {
    const fetch = at('/app/portals/shop/review', { [API]: base, [`POST ${API}/decide`]: { ok: true, message: 'Rejected: H-0005, H-0006.', href: null } });
    const detail = await screen.findByRole('region', { name: 'Driver must be 21 or older' });
    expect(within(detail).getByRole('button', { name: 'Reject' }).hasAttribute('disabled')).toBe(true);
    const removals = screen.getByRole('region', { name: 'Removals' });
    fireEvent.change(within(removals).getByRole('textbox', { name: 'Reason for 2' }), { target: { value: 'still there' } });
    fireEvent.click(within(removals).getByRole('button', { name: 'Reject 2' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: /^Reject 2: 2 alike/ })).getByRole('button', { name: 'Reject' }));
    expect(await screen.findByText('Rejected: H-0005, H-0006.')).toBeTruthy();
    const post = fetch.mock.calls.find((c) => c[0] === `${API}/decide`) as unknown as [string, { body: string }];
    expect(JSON.parse(post[1].body)).toMatchObject({ keys: ['H-0005', 'H-0006'], action: 'reject', reason: 'still there' });
  });

});

describe('Review decisions', () => {
  it('decides the rows the person selected', async () => {
    const fetch = at('/app/portals/shop/review', { [API]: base, [`POST ${API}/decide`]: { ok: true, message: 'Confirmed: H-0006.', href: null } });
    const removals = await screen.findByRole('region', { name: 'Removals' });
    const boxes = within(removals).getAllByRole('checkbox', { name: 'Select' });
    fireEvent.click(boxes[1] as HTMLElement);
    expect(within(removals).getByText('1 selected')).toBeTruthy();
    fireEvent.click(within(removals).getByRole('button', { name: 'Confirm selected' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Confirm 1: 1 selected?' })).getByRole('button', { name: 'Confirm' }));
    await screen.findByText('Confirmed: H-0006.');
    const post = fetch.mock.calls.find((c) => c[0] === `${API}/decide`) as unknown as [string, { body: string }];
    expect(JSON.parse(post[1].body)).toMatchObject({ keys: ['H-0006'], action: 'confirm' });
  });

  it('reviews a record: confirm its revision, a reject needs its text', async () => {
    const record = row({ kind: 'records', id: 'BR-021', tags: ['BR-021'], title: 'Driver age', status: status('draft', 'Draft'), meta: 'rev 2 · business rule' });
    const page = {
      ...base,
      show: 'records',
      groups: [{ kind: 'records', label: 'Records to confirm', count: 1, rows: [record], empty: '', alike: [], page: 1, pages: 1, decides: false }],
      selected: { row: record, has_detail: true, text: null, link: { value: '/app/portals/shop/docs/BR-021', label: 'Open the full record in Docs' }, also: [], rev: 2, revs: 2, cited: [{ state: 'st-1', title: 'Kierowca', route: '/kalkulator/kierowca', picture: null }] },
    };
    const fetch = at('/app/portals/shop/review?show=records', { [`${API}?show=records`]: page, [`POST ${API}/records/BR-021`]: { ok: true, message: 'Recorded confirm on BR-021 revision 2.', href: null } });
    const detail = await screen.findByRole('region', { name: 'Driver age' });
    expect(within(detail).getByRole('link', { name: 'Kierowca' }).getAttribute('href')).toBe('/app/states/st-1');
    expect(within(detail).getByRole('button', { name: 'Reject rev 2' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(within(detail).getByRole('button', { name: 'Confirm rev 2' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Confirm BR-021 revision 2?' })).getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Recorded confirm on BR-021 revision 2.')).toBeTruthy();
    const post = fetch.mock.calls.find((c) => c[0] === `${API}/records/BR-021`) as unknown as [string, { body: string }];
    expect(JSON.parse(post[1].body)).toEqual({ action: 'confirm', rev: 2, text: '' });
  });

  it('an item with nothing beyond its row (an edit conflict) says so', async () => {
    const conflict = row({ kind: 'conflicts', id: 'c-1', title: 'Two saves of AMD-001' });
    const page = { ...base, selected: { row: conflict, has_detail: false, text: null, link: null, also: [], rev: null, revs: null, cited: [] } };
    at('/app/portals/shop/review', { [API]: page });
    const detail = await screen.findByRole('region', { name: 'Two saves of AMD-001' });
    expect(within(detail).getByText('Nothing more is recorded for this item.')).toBeTruthy();
    expect(within(detail).queryByRole('button', { name: 'Confirm' })).toBeNull();
  });

  it('says how to turn decisions on without a reviewer', async () => {
    at('/app/portals/shop/review', { [API]: { ...base, decides: false, groups: base.groups.map((g) => ({ ...g, decides: false })) } });
    const detail = await screen.findByRole('region', { name: 'Driver must be 21 or older' });
    expect(within(detail).getByText(/Review actions are off/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirm selected' })).toBeNull();
  });

});

describe('Review tabs', () => {
  it('lists what a rule explained and what was decided', async () => {
    const explained = { ...base, tab: 'explained', groups: [], explained: [{ id: 'd9', word: 'Renamed', screen: 'SC-0004', finding: 'Dalej became Next', explanation: { word: 'Release', variant: null }, explanation_text: 'Changed with release 5696.', rule: 'R2', at: '2026-10-23T00:00:00Z' }] };
    at('/app/portals/shop/review?tab=explained', { [`${API}?tab=explained`]: explained });
    expect(await screen.findByRole('link', { name: 'Before / after' })).toBeTruthy();
    expect(screen.getByText('Changed with release 5696.')).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it('lists the decisions with their reasons and an undone one marked', async () => {
    const decided = { ...base, tab: 'decided', groups: [], decided: [{ key: 'BR-021', kind: 'decision rule', claim: 'Driver age', status: status('ok', 'Confirmed'), undone: true, actor: 'Anna', reason: 'Seen the release.', at: '2026-10-23T00:00:00Z', is_rule: true }] };
    at('/app/portals/shop/review?tab=decided', { [`${API}?tab=decided`]: decided });
    expect((await screen.findByRole('link', { name: 'BR-021' })).getAttribute('href')).toBe('/app/portals/shop/rules/BR-021');
    expect(screen.getByText('Undone')).toBeTruthy();
    expect(screen.getByText('Seen the release.')).toBeTruthy();
    const tabs = screen.getByRole('navigation', { name: 'Review views' });
    expect(within(tabs).getByRole('link', { name: /Decided/ }).getAttribute('aria-current')).toBe('page');
  });
});
