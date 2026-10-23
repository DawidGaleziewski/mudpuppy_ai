// The assistant drawer (spec 069) over a stubbed API and a fake EventSource: opening and closing,
// the timeline, a message sent with the page's context, the reply streaming in, Stop, a
// credential stored after asking, starting a conversation, and the chat service stopped.
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { at } from './render-at';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

/** A stand-in for the browser's EventSource that the test drives with `emit`. */
class FakeSource {
  static last: FakeSource | null = null;
  static CLOSED = 2;
  readyState = 1;
  onerror: (() => void) | null = null;
  listeners = new Map<string, ((e: { data: string }) => void)[]>();
  constructor(public url: string) {
    FakeSource.last = this;
  }
  addEventListener(name: string, fn: (e: { data: string }) => void) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), fn]);
  }
  emit(name: string, data: unknown) {
    act(() => {
      for (const fn of this.listeners.get(name) ?? []) fn({ data: JSON.stringify(data) });
    });
  }
  close() {
    this.readyState = 2;
  }
}

beforeEach(() => {
  vi.stubGlobal('EventSource', FakeSource);
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  FakeSource.last = null;
});

const CONV = '/chat/conversations/conv-1';
const page = (over: Record<string, unknown> = {}) => ({
  portal: 'shop',
  service_up: true,
  start_hint: null,
  conversation: { id: 'conv-1', portal: 'shop', events: `${CONV}/events`, send: `${CONV}/messages`, cancel: `${CONV}/cancel`, reset: `${CONV}/reset`, credentials: `${CONV}/credentials` },
  items: [
    { id: 'm1', kind: 'user', text: 'Map the quote flow', at: '2026-10-23T10:00:00Z', ref: null, credential: null, proposal: null },
    { id: 'm2', kind: 'assistant', text: 'Starting a scan.', at: '2026-10-23T10:00:05Z', ref: null, credential: null, proposal: null },
    { id: 'm3', kind: 'error', text: 'The scan stopped.', at: '2026-10-23T10:01:00Z', ref: 'ERR-abc', credential: null, proposal: null },
    { id: 'm4', kind: 'credential', text: 'Login form reached.', at: '2026-10-23T10:02:00Z', ref: null, credential: { ref: 'SHOP_PASSWORD', portal: 'shop', environment: 'sandbox', persona: 'client', reason: 'Login form reached.', stored: false, status: { shape: 'needs', word: 'Needs you' } }, proposal: null },
  ],
  ...over,
});
const docs = { portal: 'shop', sections: [{ id: 'overview', label: 'Overview', count: 0 }], section: { id: 'overview', label: 'Overview', count: 0 }, statuses: [], counts: [], sessions: [], records: null, diagram: null };
const routes = (assistant: unknown, more: Record<string, unknown> = {}) => ({ '/api/portals/shop/docs': docs, '/api/portals/shop/assistant': assistant, ...more });
const open = async () => fireEvent.click(await screen.findByRole('button', { name: 'Ask the assistant' }));
const drawer = () => screen.getByRole('complementary', { name: 'Assistant' });

describe('The assistant drawer', () => {
  it('opens with an address that asks for it (designer Q11: no full chat page)', async () => {
    at('/app/portals/shop/docs?assistant=open', routes(page()));
    expect(await screen.findByRole('complementary', { name: 'Assistant' })).toBeTruthy();
  });

  it('opens on the button and Ctrl+J, shows the timeline, closes on Esc', async () => {
    at('/app/portals/shop/docs', routes(page()));
    await open();
    expect(await within(drawer()).findByText('Starting a scan.')).toBeTruthy();
    expect(within(drawer()).getByRole('link', { name: 'ERR-abc' }).getAttribute('href')).toBe('/app/errors/ERR-abc');
    expect(within(drawer()).getByText('Needs you')).toBeTruthy();
    expect(FakeSource.last?.url).toBe(`${CONV}/events`);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('complementary', { name: 'Assistant' })).toBeNull();
    fireEvent.keyDown(document, { key: 'j', ctrlKey: true });
    expect(await screen.findByRole('complementary', { name: 'Assistant' })).toBeTruthy();
  });

  it('sends a message and streams the reply until the turn ends', async () => {
    const fetch = at('/app/portals/shop/docs', routes(page(), { [`POST ${CONV}/messages`]: {} }), 202);
    await open();
    fireEvent.change(await within(drawer()).findByLabelText('Message'), { target: { value: 'What changed?' } });
    fireEvent.click(within(drawer()).getByRole('button', { name: 'Send' }));
    expect(await within(drawer()).findByText('What changed?')).toBeTruthy();
    const call = fetch.mock.calls.find((c) => c[0] === `${CONV}/messages`) as unknown as [string, { body: string }];
    expect(JSON.parse(call[1].body)).toEqual({ text: 'What changed?', context: { kind: 'portal' } });
    FakeSource.last?.emit('tool_started', { toolCallId: 't1', tool: 'list_runs' });
    expect(within(drawer()).getByText('Running: list_runs')).toBeTruthy();
    FakeSource.last?.emit('message_chunk', { text: 'Two screens ' });
    FakeSource.last?.emit('message_chunk', { text: 'changed.' });
    expect(within(drawer()).getByText('Two screens changed.')).toBeTruthy();
    expect(within(drawer()).getByRole('button', { name: 'Stop' })).toBeTruthy();
    FakeSource.last?.emit('idle', {});
    expect(within(drawer()).queryByRole('button', { name: 'Stop' })).toBeNull();
  });

  it('stores a credential after asking, never showing its value', async () => {
    const fetch = at('/app/portals/shop/docs', routes(page(), { [`POST ${CONV}/credentials`]: { stored: true, refs: ['SHOP_PASSWORD'] } }));
    await open();
    fireEvent.change(await within(drawer()).findByLabelText('Value of SHOP_PASSWORD'), { target: { value: 'test-key-not-real' } });
    fireEvent.click(within(drawer()).getByRole('button', { name: 'Store in vault' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Store SHOP_PASSWORD in the vault?' })).getByRole('button', { name: 'Store in vault' }));
    expect(await within(drawer()).findByText('SHOP_PASSWORD is in the vault. The value is not shown again.')).toBeTruthy();
    const call = fetch.mock.calls.find((c) => c[0] === `${CONV}/credentials`) as unknown as [string, { body: string }];
    expect(JSON.parse(call[1].body)).toEqual({ portal: 'shop', environment: 'sandbox', values: { SHOP_PASSWORD: 'test-key-not-real' } });
    expect(screen.queryByDisplayValue('test-key-not-real')).toBeNull();
  });

  it('starts a conversation when there is none, and says how to start the chat service', async () => {
    const fetch = at('/app/portals/shop/docs', routes(page({ conversation: null, items: [] }), { ['POST /chat/conversations']: { id: 'conv-2' } }));
    await open();
    fireEvent.click(await within(drawer()).findByRole('button', { name: 'Start a conversation' }));
    expect(fetch.mock.calls.some((c) => c[0] === '/chat/conversations')).toBe(true);
    vi.unstubAllGlobals();
    vi.stubGlobal('EventSource', FakeSource);
    sessionStorage.clear();
    document.body.innerHTML = '';
    at('/app/portals/shop/docs', routes(page({ service_up: false, start_hint: 'MUDPUPPY_ENV=sandbox pnpm --dir apps/chat start' })));
    await open();
    expect(await within(drawer()).findByText('MUDPUPPY_ENV=sandbox pnpm --dir apps/chat start')).toBeTruthy();
    expect(within(drawer()).getByRole('button', { name: 'Send' }).hasAttribute('disabled')).toBe(true);
  });
});

const home = {
  portal: 'shop',
  environment: 'local-dev',
  model_seq: 4,
  model_built_at: '2026-10-22T20:00:00Z',
  lanes: [],
  last_scan: null,
  needs: { total: 0, by_kind: [], top: [] },
  changes: { all: 0, needs: 0, explained: 0, by_process: [] },
  processes: 0,
  proposed: 0,
  rules: { total: 0, by_status: [] },
};

describe('The assistant on Home, the scan line and page actions (spec 070)', () => {
  it('sends Home’s message in the drawer it opens', async () => {
    const fetch = at('/app/portals/shop', { '/api/portals/shop/home': home, '/api/portals/shop/assistant': page(), [`POST ${CONV}/messages`]: {} }, 202);
    const plate = await screen.findByRole('region', { name: 'Assistant' });
    fireEvent.change(within(plate).getByLabelText('Message'), { target: { value: 'What changed?' } });
    fireEvent.click(within(plate).getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('complementary', { name: 'Assistant' })).toBeTruthy();
    await vi.waitFor(() => expect(fetch.mock.calls.some((c) => c[0] === `${CONV}/messages`)).toBe(true));
    const call = fetch.mock.calls.find((c) => c[0] === `${CONV}/messages`) as unknown as [string, { body: string }];
    expect(JSON.parse(call[1].body)).toMatchObject({ text: 'What changed?' });
    expect(sessionStorage.getItem('mudpuppy.assistant.say')).toBeNull();
  });

  it('shows the conversation’s scan in one line, in the one grammar (designer Q12)', async () => {
    const id = '01a110e7-2068-7d10-8c55-91e2b3f4a6d8';
    const scan = { status: { shape: 'running', word: 'Running' }, kind: 'AI scan', scan: id, progress: '12 / 120 steps · 9 pages · 3 queued', last: 'no new step for 9 min', last_muted: true, href: `/app/scans/${id}`, running: true };
    at('/app/portals/shop/docs', routes(page({ scan })));
    await open();
    expect(await within(drawer()).findByText('12 / 120 steps · 9 pages · 3 queued')).toBeTruthy();
    expect(within(drawer()).getByText('AI scan')).toBeTruthy();
    expect(within(drawer()).getByText('01a110e7-2068').getAttribute('title')).toBe(id); // 13 characters, the whole id on hover
    expect(within(drawer()).getByText('no new step for 9 min').className).toContain('sy-muted');
    expect(within(drawer()).getByRole('link', { name: 'Open' }).getAttribute('href')).toBe(`/app/scans/${id}`);
  });

  it('turns the assistant’s page actions into addresses on this site', async () => {
    const { pageOf } = await import('../src/app/api-assistant');
    expect(pageOf({ action: 'open', path: '/app/portals/shop/rules' })).toBe('/app/portals/shop/rules');
    expect(pageOf({ action: 'open', path: 'https://elsewhere.example' })).toBeNull();
    expect(pageOf({ action: 'open', path: '//elsewhere.example' })).toBeNull();
    expect(pageOf({ action: 'highlight', stateId: 'st-1', elementKey: 'button|dalej||' })).toBe('/app/states/st-1?hl=button%7Cdalej%7C%7C');
  });
});
