// Business rules (spec 065) over a stubbed API: the list by status, one rule with its decision
// table, tests, history and export, Reword and Run the rule tests behind a confirm; DecisionTable.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DecisionTable } from '../src/design-system';
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

const API = '/api/portals/shop/rules';
const broken = { shape: 'failed', word: 'Broken' };
const row = {
  key: 'H-0003',
  shown_key: 'BR-009',
  claim: 'Drivers under 18 cannot buy.',
  status: broken,
  screen_key: 'SC-0001',
  screen_title: 'Dane kierowcy',
  action: 'button|dalej||',
  passed: 1,
  failed: 1,
  waiting: 0,
  last_tested: '2026-10-17T10:00:00Z',
};
const list = (over: Record<string, unknown> = {}) => ({
  portal: 'shop',
  total: 1,
  statuses: [{ value: 'broken', label: 'Broken 1' }],
  status: null,
  groups: [{ status: broken, rules: [row] }],
  export: { zip: '/api/portals/shop/rules/export.zip', csv: '/api/portals/shop/rules/export/rules.csv' },
  writes: true,
  ...over,
});
const one = (over: Record<string, unknown> = {}) => ({
  portal: 'shop',
  row,
  br_key: 'BR-009',
  doc_href: '/docs/shop/BR-009',
  fitness: 1,
  executions: 11,
  table: { inputs: ['age'], hit_policy: 'First match', rows: [{ cells: [{ cond: '< 18', any: false }], screen: 'SC-0002', is_screen: true, result: null }, { cells: [{ cond: 'any', any: true }], screen: 'SC-0003', is_screen: true, result: 'refused' }] },
  wordings: [],
  tests: [{ inputs: ['age = 17'], expect: 'SC-0002 ok', got: 'SC-0002 ok', verdict: { shape: 'ok', word: 'Pass' } }],
  history: [{ status: { shape: 'failed', word: 'Refuted' }, actor: 'Anna', reason: 'Wrong threshold.', at: '2026-10-17T11:00:00Z', undo: false, by_person: true, mark: 'failed' }],
  files: [{ value: '/api/portals/shop/rules/export/BR-009.md', label: 'Markdown' }],
  writes: true,
  changed: false,
  uncited: false,
  ...over,
});

describe('Business rules', () => {
  it('groups the rules by status and links each rule and screen', async () => {
    at('/app/portals/shop/rules', { [API]: list() });
    const group = await screen.findByRole('region', { name: 'Broken · 1' });
    expect(within(group).getByRole('link', { name: 'BR-009' }).getAttribute('href')).toBe('/app/portals/shop/rules/BR-009');
    expect(within(group).getByRole('link', { name: 'Dane kierowcy' }).getAttribute('href')).toBe('/app/portals/shop/screens/SC-0001');
    expect(screen.getByRole('link', { name: /Broken 1/ }).getAttribute('href')).toBe('/app/portals/shop/rules?status=broken');
    expect(screen.getByRole('link', { name: 'Rules' }).getAttribute('aria-current')).toBe('page');
  });

  it('starts the rule tests after asking', async () => {
    const fetch = at('/app/portals/shop/rules', { [API]: list(), ['POST /api/portals/shop/check-runs']: { ok: true, message: 'The rule tests started.', href: null } });
    fireEvent.click(await screen.findByRole('button', { name: 'Run the rule tests' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Run the rule tests?' })).getByRole('button', { name: 'Run the rule tests' }));
    expect(await screen.findByText('The rule tests started.')).toBeTruthy();
    const call = fetch.mock.calls.find((c) => c[0] === '/api/portals/shop/check-runs') as unknown as [string, { body: string }];
    expect(JSON.parse(call[1].body)).toEqual({ kind: 'replay' });
  });

  it('says how to find rules when there is none', async () => {
    at('/app/portals/shop/rules', { [API]: list({ total: 0, statuses: [], groups: [] }) });
    expect(await screen.findByText(/No business rule yet/)).toBeTruthy();
  });
});

describe('One rule', () => {
  it('shows the decision table, tests, a person’s reason and the export', async () => {
    at('/app/portals/shop/rules/BR-009', { [`${API}/BR-009`]: one(), [`${API}/BR-009/export`]: { markdown: '## BR-009\n\nIf age < 18 …', error: null } });
    const table = await screen.findByRole('region', { name: 'BR-009 decision table' });
    expect(within(table).getByText('< 18')).toBeTruthy();
    expect(within(table).getByText('any')).toBeTruthy();
    expect(within(table).getByText('refused')).toBeTruthy();
    expect(screen.getByText('Wrong threshold.').closest('.sy-note')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'BR-009' }).getAttribute('href')).toBe('/docs/shop/BR-009');
    expect(await screen.findByText(/If age < 18/)).toBeTruthy();
  });

  it('rewords the rule after asking, sent by its H key', async () => {
    const fetch = at('/app/portals/shop/rules/BR-009', {
      [`${API}/BR-009`]: one(),
      [`${API}/BR-009/export`]: { markdown: null, error: 'no such table: hypotheses' },
      [`POST ${API}/H-0003/reword`]: { ok: true, message: 'Reworded. The export uses it now.', href: null },
    });
    fireEvent.change(await screen.findByLabelText('Sentence'), { target: { value: 'Drivers under 18 are refused.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save the wording' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Reword BR-009?' })).getByRole('button', { name: 'Save the wording' }));
    expect(await screen.findByText('Reworded. The export uses it now.')).toBeTruthy();
    const call = fetch.mock.calls.find((c) => c[0] === `${API}/H-0003/reword`) as unknown as [string, { body: string }];
    expect(JSON.parse(call[1].body)).toEqual({ wording: 'Drivers under 18 are refused.', reason: '' });
    expect(await screen.findByText(/could not be built/)).toBeTruthy();
  });

  it('says when the rule needs data the UI does not show, or does not exist', async () => {
    at('/app/portals/shop/rules/BR-009', { [`${API}/BR-009`]: one({ table: null, changed: true }), [`${API}/BR-009/export`]: { markdown: null, error: null } });
    expect(await screen.findByText(/Decided on data not visible/)).toBeTruthy();
    expect(screen.getByText(/no longer holds on a newer release/)).toBeTruthy();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    at('/app/portals/shop/rules/H-0404', {});
    expect(await screen.findByText(/does not exist/)).toBeTruthy();
  });
});

describe('DecisionTable', () => {
  it('numbers the rows and marks the result column', () => {
    const { container } = render(<DecisionTable label="Rule table" inputs={['a', 'b']} result="→ Next screen" rows={[{ conditions: ['< 1', null], result: 'X' }]} />);
    expect(screen.getByRole('columnheader', { name: 'Inputs' }).getAttribute('colspan')).toBe('2');
    expect(screen.getByRole('rowheader', { name: '1' })).toBeTruthy();
    expect(container.querySelector('td.sy-dt-result')?.textContent).toBe('X');
  });

  it('puts the facts above, describing the table; the caption only names it (Q7)', () => {
    const { container } = render(<DecisionTable label="BR-021 decision table" inputs={['a']} result="→" rows={[]} facts={[['Hit policy', 'First match']]} />);
    const facts = container.querySelector('dl.sy-facts.sy-facts--table');
    expect(facts?.id).toBeTruthy();
    const table = screen.getByRole('table', { name: 'BR-021 decision table' });
    expect(table.getAttribute('aria-describedby')).toBe(facts?.id);
    expect(table.querySelector('caption')?.textContent).toBe('BR-021 decision table');
  });
});
