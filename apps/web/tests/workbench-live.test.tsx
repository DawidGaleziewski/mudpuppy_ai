// Spec 075 (the R-96 spike): the live Workbench in the browser. AG-UI frames feed the A2UI
// surfaces (a snapshot, then only the patched paths); a lost frame or silence opens a new socket;
// the components dispatch their actions up the socket; the persona creator sends a sign-in to the
// vault only, and Confirm carries names; a portal choice moves the page.

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { A2uiSurface } from '@a2ui/react/v0_9';
import { EventType } from '@ag-ui/core';
import { liveCatalog } from '../src/workbench-live/catalog';
import { LiveContext } from '../src/workbench-live/context';
import type { LiveState } from '../src/workbench-live/protocol';
import { itemOf, LiveLink, onFrame, useLiveWorkbench } from '../src/workbench-live/useLiveWorkbench';

const RUN = '01a110d5-0000-7000-8000-000000000001';
const CONV = '0199a000-0000-7000-8000-0000000000c1';

function state(): LiveState {
  return {
    view: { phase: 1, generated: true },
    conversation: { id: CONV, portal: 'reference-insurer', path: 'mapping' },
    portal: { id: 'reference-insurer', store: 'main:local-dev', environment: 'local-dev', paused: null },
    options: { portal: [], store: [], persona: [] },
    live: RUN,
    scans: {
      [RUN]: {
        short: '01a110d5-0000',
        meter: { status: 'running', steps: 12, limit: 400, pages: 3, queued: 9, at: '/porownanie' },
        pages: [
          { order: 1, route: '/', state: 1, title: 'Start', at: '2026-10-06T10:47:00.000Z', step: 2, status: 'ok', sideTrips: 0 },
          { order: 2, route: '/porownanie', state: 1, title: 'Porównanie', at: '2026-10-06T10:48:00.000Z', step: 12, status: 'here', sideTrips: 1 },
        ],
        narration: [{ at: '2026-10-06T10:48:00.000Z', text: 'Opened /porownanie — Porównanie.', cites: [`${RUN}#12`], kind: 'live' }],
        stop: null,
        graph: {
          width: 400, height: 300, nodeW: 150, nodeH: 96, path: ['s1', 's2'],
          nodes: [
            { id: 's1', route: '/', title: 'Start', x: 0, y: 0, order: 1, status: 'observed', here: false, stopped: false },
            { id: 's2', route: '/porownanie', title: 'Porównanie', x: 200, y: 150, order: 2, status: 'observed', here: true, stopped: false },
          ],
          edges: [{ d: 'M75 96 C75 120 275 120 275 150', kind: 'tree' }],
        }, // prettier-ignore
      },
    },
    commands: {
      'cmd-0000000000d1': {
        commandId: '0199a000-0000-7000-8000-0000000000d1', command: 'persona.add', label: 'Add a persona', state: 'proposed',
        facts: [['Adds', 'a persona to reference-insurer']], reason: 'you asked for one.', result: '', links: [], error: null,
        errorRef: null, running: 'Adding…', editable: true, args: { name: 'agent-anna' }, signIns: ['KLIENT'], personas: [],
        persona: null, askPersona: false, undo: false,
      }, // prettier-ignore
    },
    choices: {
      'choice-00000000c401': { choiceId: '0199a000-0000-7000-8000-00000000c401', kind: 'portal', question: 'Which portal?', options: [{ value: 'proving-ground-shop-local', label: 'proving-ground-shop-local' }], answer: null },
    },
    ui: { selected: null },
  };
}

const surface = (id: string, children: { id: string; component: string; [k: string]: unknown }[]) => ({
  name: 'a2ui',
  value: [
    { version: 'v0.9.1', createSurface: { surfaceId: id, catalogId: 'https://mudpuppy.local/a2ui/catalogs/workbench/v1/catalog.json' } },
    { version: 'v0.9.1', updateComponents: { surfaceId: id, components: [{ id: 'root', component: 'View', path: 'mapping', why: 'You asked to map it.', children: children.map((c) => c.id), data: { path: '/view' } }, ...children] } },
  ],
});

const setters = () => ({ setState: vi.fn(), setMessages: vi.fn(), setStreaming: vi.fn(), setBusy: vi.fn(), setChatUp: vi.fn(), setNotices: vi.fn() });

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

function Shown({ link, id }: { link: LiveLink; id: string }) {
  const s = link.processor.getSurface(id);
  return (
    <MemoryRouter initialEntries={['/app/portals/reference-insurer/workbench/live']}>
      <LiveContext.Provider value={{ conversation: CONV, state: link.state }}>
        <Routes>
          <Route path="*" element={<>{s && <A2uiSurface surface={s as never} />}<Where /></>} />
        </Routes>
      </LiveContext.Provider>
    </MemoryRouter>
  );
}

/** A socket that records what goes up. */
function attachSent(link: LiveLink): unknown[] {
  const sent: unknown[] = [];
  link.attach({ readyState: 1, send: (t: string) => sent.push(JSON.parse(t)), close: () => undefined } as unknown as WebSocket);
  return sent;
}

describe('frames into surfaces', () => {
  it('a change is written at its item, never deeper (F-03)', () => {
    expect(itemOf(`/scans/${RUN}/meter/steps`)).toBe(`/scans/${RUN}`);
    expect(itemOf('/commands/cmd-1/state')).toBe('/commands/cmd-1');
    expect(itemOf('/ui/selected')).toBe('/ui/selected');
    expect(itemOf('/live')).toBe('/live');
  });

  it('a snapshot fills the live map; a delta changes only its path', async () => {
    const link = new LiveLink(liveCatalog);
    const s = setters();
    onFrame(link, s, { seq: 1, type: EventType.STATE_SNAPSHOT, snapshot: state() });
    onFrame(link, s, { seq: 2, type: EventType.CUSTOM, ...surface('stage', [{ id: 'map', component: 'LiveMap', scan: RUN, data: { path: `/scans/${RUN}` } }]) });
    render(<Shown link={link} id="stage" />);
    expect(await screen.findByText(/step 12 of 400/)).toBeTruthy();
    expect(screen.getByText('◉ crawler here')).toBeTruthy();
    expect(screen.getByRole('img', { name: /2 screens/ })).toBeTruthy();
    act(() => onFrame(link, s, { seq: 3, type: EventType.STATE_DELTA, delta: [{ op: 'replace', path: `/scans/${RUN}/meter/steps`, value: 13 }] }));
    expect(await screen.findByText(/step 13 of 400/)).toBeTruthy();
    expect(link.state?.scans[RUN]?.meter.steps).toBe(13);
  });

  it('a click on the map is an A2UI action up the socket', async () => {
    const link = new LiveLink(liveCatalog);
    onFrame(link, setters(), { seq: 1, type: EventType.STATE_SNAPSHOT, snapshot: state() });
    onFrame(link, setters(), { seq: 2, type: EventType.CUSTOM, ...surface('t1', [{ id: 'map', component: 'LiveMap', scan: RUN, data: { path: `/scans/${RUN}` } }]) });
    const sent = attachSent(link);
    render(<Shown link={link} id="t1" />);
    fireEvent.click(await screen.findByRole('button', { name: /2\. \/porownanie/ }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ type: 'action', action: { name: 'page.select', surfaceId: 't1', sourceComponentId: 'map', context: { scan: RUN, route: '/porownanie', state: 1 } } });
  });
});

describe('the persona creator', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{"stored":true}', { status: 200 })))));
  afterEach(() => vi.unstubAllGlobals());

  it("a new sign-in goes to the vault only; Confirm carries the persona's names", async () => {
    const link = new LiveLink(liveCatalog);
    onFrame(link, setters(), { seq: 1, type: EventType.STATE_SNAPSHOT, snapshot: state() });
    onFrame(link, setters(), { seq: 2, type: EventType.CUSTOM, ...surface('t2', [{ id: 'cmd-0000000000d1', component: 'CommandCard', command: 'persona.add', data: { path: '/commands/cmd-0000000000d1' } }]) });
    const sent = attachSent(link);
    render(<Shown link={link} id="t2" />);
    fireEvent.click(await screen.findByLabelText(/Signs in/));
    fireEvent.change(screen.getByLabelText(/Credential name/), { target: { value: 'AGENT_ANNA' } });
    fireEvent.change(screen.getByLabelText(/^Login/), { target: { value: 'test-login-not-real' } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'test-password-not-real' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save persona' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/chat/conversations/${CONV}/credentials`);
    expect(JSON.parse(init.body as string)).toEqual({
      portal: 'reference-insurer',
      environment: 'local-dev',
      values: { AGENT_ANNA_LOGIN: 'test-login-not-real', AGENT_ANNA_PASSWORD: 'test-password-not-real' },
    });
    expect(sent[0]).toMatchObject({ action: { name: 'command.confirm', context: { command: 'cmd-0000000000d1', args: { name: 'agent-anna', credential: 'AGENT_ANNA' } } } });
    expect(JSON.stringify(sent)).not.toContain('not-real');
  });

  it('a new sign-in without its values is refused before anything is sent', async () => {
    const link = new LiveLink(liveCatalog);
    onFrame(link, setters(), { seq: 1, type: EventType.STATE_SNAPSHOT, snapshot: state() });
    onFrame(link, setters(), { seq: 2, type: EventType.CUSTOM, ...surface('t2', [{ id: 'cmd-0000000000d1', component: 'CommandCard', command: 'persona.add', data: { path: '/commands/cmd-0000000000d1' } }]) });
    const sent = attachSent(link);
    render(<Shown link={link} id="t2" />);
    fireEvent.click(await screen.findByLabelText(/Signs in/));
    fireEvent.change(screen.getByLabelText(/Credential name/), { target: { value: 'AGENT_ANNA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save persona' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(sent).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('a choice', () => {
  it('a portal pick tells the assistant and moves the page to that portal', async () => {
    const link = new LiveLink(liveCatalog);
    onFrame(link, setters(), { seq: 1, type: EventType.STATE_SNAPSHOT, snapshot: state() });
    onFrame(link, setters(), { seq: 2, type: EventType.CUSTOM, ...surface('t3', [{ id: 'choice-00000000c401', component: 'Choice', data: { path: '/choices/choice-00000000c401' } }]) });
    const sent = attachSent(link);
    render(<Shown link={link} id="t3" />);
    fireEvent.change(await screen.findByRole('combobox', { name: 'Which portal?' }), { target: { value: 'proving-ground-shop-local' } });
    fireEvent.click(screen.getByRole('button', { name: 'Switch' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ action: { name: 'choice.answer', context: { choice: 'choice-00000000c401', value: 'proving-ground-shop-local' } } });
    expect(screen.getByTestId('where').textContent).toBe('/app/portals/proving-ground-shop-local/workbench/live');
  });
});

class FakeSocket {
  static all: FakeSocket[] = [];
  static OPEN = 1;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  send() {}
  close() {
    this.closed = true;
    this.onclose?.();
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  frame(f: object) {
    this.onmessage?.({ data: JSON.stringify(f) });
  }
}

function Probe({ c }: { c: string }) {
  const live = useLiveWorkbench(c, 'main:local-dev', liveCatalog);
  return <span data-testid="status">{`${live.status} ${String(live.state?.scans[RUN]?.meter.steps ?? '-')}`}</span>;
}

describe('the socket', () => {
  beforeEach(() => {
    FakeSocket.all = [];
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeSocket);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('a lost frame opens a new socket, which starts from a fresh snapshot', () => {
    render(<Probe c={CONV} />);
    const first = FakeSocket.all[0]!;
    expect(first.url).toContain(`/api/workbench/live/${CONV}/ws?store=main%3Alocal-dev`);
    act(() => {
      first.open();
      first.frame({ seq: 1, type: EventType.STATE_SNAPSHOT, snapshot: state() });
    });
    expect(screen.getByTestId('status').textContent).toBe('open 12');
    act(() => first.frame({ seq: 3, type: EventType.STATE_DELTA, delta: [] }));
    expect(first.closed).toBe(true);
    expect(screen.getByTestId('status').textContent).toBe('reconnecting 12');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(FakeSocket.all).toHaveLength(2);
  });

  it('a silent socket is closed after 40 s and opened again', () => {
    render(<Probe c={CONV} />);
    act(() => FakeSocket.all[0]!.open());
    act(() => {
      vi.advanceTimersByTime(45_000);
    });
    expect(FakeSocket.all[0]!.closed).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(FakeSocket.all.length).toBeGreaterThan(1);
  });
});
