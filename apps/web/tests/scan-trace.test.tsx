// A scan's Trace and Process (spec 056) over a stubbed API: the summary, a call opened loads its
// phases and events as facts, the filters asked of the API; the process with its diagram source.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Diagram, drawable } from '../src/design-system';
import { SCAN, scanHead } from './fixtures-scan-views';
import { at } from './render-at';

afterEach(() => {
  vi.unstubAllGlobals();
});

const API = `/api/scans/${SCAN}`;
const ok = { shape: 'ok', word: 'OK' };
const summary = {
  has_trace: true,
  calls: 2,
  by_tool: [{ name: 'pf_click', count: 2 }],
  by_status: [{ status: { shape: 'skipped', word: 'Refused' }, count: 1 }],
  tokens: '1200 in / 300 out · 4 turns',
  levels: 'standard',
  health: { shape: 'ok', word: 'Clean' },
  health_parts: [],
  phases: [{ name: 'act', count: 2, sum: '1s', p50: '400ms', p95: '600ms' }],
  slowest: [{ id: 'c-1', seq: 1, name: 'pf_click', duration: '600ms', status: ok }],
};
const call = {
  id: 'c-1',
  seq: 1,
  name: 'pf_click',
  status: { shape: 'skipped', word: 'Refused' },
  duration: '80ms',
  rationale: 'Trying to buy',
  between_calls: false,
  tool_use_id: 'tu-1',
  payload: null,
  attrs: '{\n  "x": 1\n}',
  pw_trace: null,
  agent: { imported: true, tokens: '10 in / 2 out', text: 'Let me click Buy' },
};
const calls = {
  filter: { tool: [], status: [], problems: false },
  tool_options: [{ value: 'pf_click', label: 'pf_click' }],
  status_options: [{ value: 'refused', label: 'Refused' }],
  items: [call],
  total: 1,
  next_cursor: null,
  unmatched: [{ tool: 'mcp__mudpuppy__act', at: '2026-10-22T01:00:00.000Z', text: 'never got there' }],
};
const children = {
  scan: SCAN,
  phases: [
    {
      name: 'gate',
      status: ok,
      duration: '5ms',
      share: 100,
      events: [
        {
          kind: 'event',
          name: 'decision',
          summary: 'refused',
          detail: { facts: [{ label: 'Rule', value: 'ceiling:mutating', mono: true }], lines: [], rule: 'ceiling:mutating' },
        },
      ],
    },
  ],
  events: [],
};

describe('Trace', () => {
  it('shows the summary and loads a call’s phases when it is opened', async () => {
    const fetch = at(`/app/scans/${SCAN}/trace`, {
      [API]: scanHead,
      [`${API}/trace/summary`]: summary,
      [`${API}/trace`]: calls,
      '/api/spans/c-1/children': children,
    });
    expect(await screen.findByText('1200 in / 300 out · 4 turns')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Time per phase' })).toBeTruthy();
    const list = await screen.findByRole('list', { name: 'Tool calls' });
    expect(within(list).getByText('Agent-stated: Trying to buy')).toBeTruthy();
    expect(fetch.mock.calls.some((c) => c[0] === '/api/spans/c-1/children')).toBe(false);
    const details = within(list).getByText('pf_click').closest('details');
    if (!details) throw new Error('no call disclosure');
    details.open = true;
    fireEvent(details, new Event('toggle'));
    expect(await screen.findByText('ceiling:mutating', { selector: '.sy-mono' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Decision log for ceiling:mutating' }).getAttribute('href')).toBe(
      `/app/scans/${SCAN}/decisions?rule=ceiling%3Amutating`,
    );
    expect(screen.getByText('Let me click Buy')).toBeTruthy();
    expect(screen.getByText('mcp__mudpuppy__act')).toBeTruthy();
  });

  it('asks the API for the tools and statuses ticked', async () => {
    const fetch = at(`/app/scans/${SCAN}/trace`, {
      [API]: scanHead,
      [`${API}/trace/summary`]: summary,
      [`${API}/trace`]: calls,
      [`${API}/trace?status=refused`]: { ...calls, filter: { ...calls.filter, status: ['refused'] }, items: [], total: 0 },
    });
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Refused' }));
    expect(await screen.findByText(/No calls match these filters/)).toBeTruthy();
    expect(fetch.mock.calls.map((c) => c[0])).toContain(`${API}/trace?status=refused`);
  });

  it('says so when the scan has no trace', async () => {
    at(`/app/scans/${SCAN}/trace`, {
      [API]: scanHead,
      [`${API}/trace/summary`]: { ...summary, has_trace: false },
      [`${API}/trace`]: { ...calls, items: [], total: 0, unmatched: [] },
    });
    expect(await screen.findByText(/No trace recorded for this scan. It predates tracing, or never/)).toBeTruthy();
  });
});

const phase = (name: string, kind: string, first: number | null, last: number | null, state = 'done') => ({
  name,
  kind,
  state,
  start: '2026-10-06T10:49:20.000Z',
  end: '2026-10-06T10:53:40.000Z',
  seconds: 60,
  first_step: first,
  last_step: last,
  time_line: `10:49:20Z · 1 min 0 s · ${first === null ? 'no steps' : `steps ${String(first)}–${String(last)}`}`,
});
const phases = {
  has_phases: true,
  summary: '6 Oct 10:49:20Z – 10:58:44Z · 9 min 24 s · 171 steps',
  status: { shape: 'stopped', word: 'Interrupted' },
  steps: 171,
  phases: [phase('Explore', 'work', 1, 76), phase('Waiting for you', 'wait', null, null), phase('Fill forms', 'work', 77, 139, 'failed')],
  axis: [
    { left: 0, label: '10:49:20Z' },
    { left: 100, label: '10:58:44Z' },
  ],
};

describe('Trace phase bar (spec 072, designer Q2)', () => {
  it('draws the phases; one filters the calls to its steps and Show all clears it', async () => {
    const fetch = at(`/app/scans/${SCAN}/trace`, {
      [API]: scanHead,
      [`${API}/trace/summary`]: summary,
      [`${API}/trace/phases`]: phases,
      [`${API}/trace`]: calls,
      [`${API}/trace?first=77&last=139`]: { ...calls, total: 63 },
    });
    // a text query first: role queries over this whole page outlast findBy's default wait in jsdom
    const fill = (await screen.findByText('Fill forms')).closest('button')!;
    expect(fill.textContent).toMatch(/^Fill forms, 10:49:20Z.*, ended in a failure at step 139$/);
    expect(fill.closest('li')?.getAttribute('data-state')).toBe('failed');
    expect(screen.getByText('Waiting for you', { selector: '.sy-phasebar__name' }).closest('li')?.getAttribute('data-kind')).toBe('wait');
    fireEvent.click(fill);
    expect(fill.getAttribute('aria-pressed')).toBe('true');
    expect(await screen.findByText('Showing Fill forms: steps 77–139 · 10:49:20Z – 10:53:40Z')).toBeTruthy();
    await waitFor(() => expect(fetch.mock.calls.map((c) => c[0])).toContain(`${API}/trace?first=77&last=139`));
    fireEvent.click(screen.getByRole('button', { name: 'Show all 171 steps' }));
    expect(fill.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByText(/^Showing /)).toBeNull();
  });
});

describe('Process', () => {
  it('shows a trace run’s process, its map source and its steps', async () => {
    at(`/app/scans/${SCAN}/process`, {
      [API]: scanHead,
      [`${API}/process`]: {
        process: {
          name: 'Buy a car policy',
          goal: 'Reach the purchase confirmation',
          persona: 'guest',
          outcome: { shape: 'stopped', word: 'Boundary reached' },
          observed_result: 'Premium shown',
          boundary_action: 'button "Kup polisę"',
          followup: null,
          started_at: '2026-10-22T01:00:00.000Z',
          ended_at: null,
          not_observable: 'mutating on production',
        },
        diagram: 'flowchart TD\n  start(["Buy a car policy"])',
        steps: [
          {
            id: 's-1',
            ord: 1,
            intent: 'Open the calculator',
            kind: 'navigate',
            value: null,
            action: null,
            outcomes: ['outcome 1'],
            confidence: ok,
            evidence: null,
          },
        ],
      },
    });
    expect(await screen.findByText('Boundary reached')).toBeTruthy();
    expect(screen.getByText(/flowchart TD/)).toBeTruthy(); // the source until Mermaid draws it
    expect(within(screen.getByRole('table', { name: 'Recorded steps in order' })).getByText('Open the calculator')).toBeTruthy();
  });

  it('says so for a scan without a process', async () => {
    at(`/app/scans/${SCAN}/process`, { [API]: scanHead, [`${API}/process`]: { process: null, diagram: null, steps: [] } });
    expect(await screen.findByRole('heading', { name: 'No process recorded for this scan' })).toBeTruthy();
  });
});

describe('Diagram', () => {
  it('draws the picture once Mermaid renders it, the source until then', async () => {
    window.mermaid = { initialize: vi.fn(), render: vi.fn(() => Promise.resolve({ svg: '<svg data-drawn="yes" viewBox="0 0 900 300"></svg>' })) };
    render(<Diagram source="flowchart TD" caption="Process map" />);
    await waitFor(() => expect(document.querySelector('svg[data-drawn="yes"]')).toBeTruthy());
    expect(screen.getByRole('img', { name: 'Process map' })).toBeTruthy();
    delete window.mermaid;
  });

  it("sits in the map's frame with its zoom bar, and Mermaid gets step labels it can draw (R-103 (9))", async () => {
    const render_ = vi.fn<(id: string, src: string) => Promise<{ svg: string }>>(() => Promise.resolve({ svg: '<svg viewBox="0 0 900 300"></svg>' }));
    window.mermaid = { initialize: vi.fn(), render: render_ };
    const source = 'flowchart TD\n  s1["1. navigate: Open the calculator"] --> s2["2. fill: Enter the car model"]';
    render(<Diagram embedded source={source} caption="Process map" />);
    const bar = await screen.findByRole('toolbar', { name: 'Zoom the diagram' });
    expect(bar.parentElement?.className).toBe('sy-graphview sy-graphview--embedded');
    expect(render_.mock.calls[0]?.[1]).toContain('s1["1\\. navigate: Open the calculator"]');
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByRole('button', { name: /reset to 100%/ }).textContent).toBe('125%');
    delete window.mermaid;
  });

  it('leaves a source without numbered labels as it is', () => {
    expect(drawable('flowchart TD\n  a["Buy"] --> b(["2 policies"])')).toBe('flowchart TD\n  a["Buy"] --> b(["2 policies"])');
  });
});
