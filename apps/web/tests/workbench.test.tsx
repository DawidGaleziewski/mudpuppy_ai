import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { at } from './render-at';

afterEach(() => {
  vi.unstubAllGlobals();
});

const RUN = '01a110d5-0000-7000-8000-000000000001';
const page = (n: number, route: string, failed = false) => ({ order: n, state_id: `st-${String(n)}`, route, state: 1, title: route, step: n * 10, at: '2026-10-06T10:47:24.000Z', side_pages: 0, failed, screenshot_ref: null });
const scan = { run_id: RUN, status: 'stopped', started_at: '2026-10-06T10:47:02.000Z', ended_at: '2026-10-06T10:52:42.000Z', steps: 171, pages: 17, queued: 113, route_pages: [page(1, '/'), page(2, '/kontakt', true)], here: page(2, '/kontakt', true), stop_reason: 'element not found after 10 s', events: [{ step: 171, at: '2026-10-06T10:52:42.000Z' }] };
const frame = {
  dom_id: 't1-map', title: 'Live map', source: 'From events up to 10:52:42Z', title_mono: false, card: true, failure: false, state: 'ready', status: 'stopped',
  why: { path: 'mapping', by_you: false, because: 'You asked to map the OC/AC calculator.', asked: 'Map it.', shows: ['Live map of scan'], data: 'Events of scan', other_paths: ['chat'] },
  feedback: { url: '', value: null, reasons: [] }, stale_since: null,
};
const command = {
  dom_id: 'cmd-cmd-0001', title: 'Resume from last checkpoint', state: 'proposed', facts: [['Starts', 'a new scan that continues 01a110d5-0000']], reason: "the form's button never appeared.",
  proposed_by: 'assistant', token: 'test-token-not-real', result: '', result_links: [], error: '', error_ref: null, running_word: 'Resuming…', ask_persona: false, personas: [], persona: null, no_persona_url: null,
};
const model = {
  portal: 'shop',
  conversation: { id: 'conv-1', portal: 'shop', path: 'mapping', path_source: 'assistant', title: null, created_at: '2026-10-06T10:46:00.000Z' },
  turns: [
    {
      turn: { n: 1, asked: 'Map the OC/AC calculator.', is_event: false, answer: ['Starting a map scan.'], notices: [], view: { id: 'view-1' }, commands: [] },
      cards: [{ frame, type: 'LiveMap', scan, page: null, record: null, records: [], folded: false, turn: 1 }],
      narration: [{ at: '2026-10-06T10:47:02.000Z', text: 'Scan started.', ref: `${RUN}#1`, step: 1, kind: 'milestone' }],
      suggestions: ['Why did it stop here?'],
      commands: [command],
    },
  ],
  sel: null, sheet: null, why: 'You asked to map the OC/AC calculator.', starters: [], recent: [], blocked: null, notice: null, live: null, live_card: null, ask: '', paused: null,
  path_words: { chat: 'Chat', mapping: 'Mapping', troubleshoot: 'Troubleshoot', explain: 'Explain' },
  reasons: [['wrong_path', 'Wrong path']],
  statuses: { wb_scan: { stopped: { shape: 'stopped', word: 'Stopped' }, stale: { shape: 'unobserved', word: 'Not live' } }, wb_cmd: { proposed: { shape: 'draft', word: 'Proposed' } } },
};

describe('Workbench', () => {
  it('shows the turn with its live map, narration and a command card that confirms with its token', async () => {
    const fetch = at('/app/portals/shop/workbench', {
      '/api/workbench/portals/shop': model,
      'POST /api/workbench/commands/cmd-0001/confirm': { ok: true, message: 'Confirmed.', href: null },
    });
    expect(await screen.findByText('Starting a map scan.')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Pages visited, in order' })).toBeTruthy();
    expect(screen.getByText('Failed here')).toBeTruthy();
    expect(screen.getByText('Scan started.')).toBeTruthy();
    expect(screen.getByText('Picked by the assistant: You asked to map the OC/AC calculator.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Why this view?' }));
    expect(screen.getByText('Mapping · picked by the assistant')).toBeTruthy();
    const card = screen.getByText('Resume from last checkpoint', { selector: '.sy-cmd__title' }).closest('section') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: 'Confirm' }));
    await vi.waitFor(() => {
      const post = fetch.mock.calls.find((c) => c[0] === '/api/workbench/commands/cmd-0001/confirm');
      expect(JSON.parse(post?.[1]?.body as string)).toEqual({ token: 'test-token-not-real' });
    });
  });

  it('a suggestion fills the message box', async () => {
    at('/app/portals/shop/workbench', { '/api/workbench/portals/shop': model });
    fireEvent.click(await screen.findByRole('button', { name: 'Why did it stop here?' }));
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Message' }).value).toBe('Why did it stop here?');
  });
});
