// The live Workbench's socket (spec 075, the R-96 spike): one WebSocket per conversation with our
// own reconnect (backoff 1 s → 15 s), a watchdog on the server's 15 s heartbeat, and a fresh
// snapshot after any gap in `seq` (D-2). The shared state is kept by JSON Patch; every change is
// written into the A2UI surfaces' data model at the patched path only (designer 19/13 "Only
// changed paths"). A component's action goes up the same socket.

import { useCallback, useEffect, useState } from 'react';
import { applyPatch, deepClone, getValueByPointer, type Operation } from 'fast-json-patch';
import { MessageProcessor, type Catalog, type ComponentApi, type SurfaceModel } from '@a2ui/web_core/v0_9';
import { EventType, liveSocketUrl, type Frame, type LiveMessage, type LiveState, type Up } from './protocol';

const VERSION = 'v0.9.1';
const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000];
/** No frame for this long (two heartbeats and a bit): the socket is dead, open a new one. */
const SILENT_MS = 40_000;

export type Status = 'connecting' | 'open' | 'reconnecting';

export interface Notice {
  tone: 'ok' | 'failure';
  text: string;
}

export interface Live {
  status: Status;
  chatUp: boolean;
  state: LiveState | null;
  messages: LiveMessage[];
  /** The assistant's words of the running turn, until the stored message replaces them. */
  streaming: string;
  busy: boolean;
  surfaces: SurfaceModel<ComponentApi>[];
  notices: Notice[];
  act: (name: string, context?: Record<string, unknown>) => void;
  say: (text: string) => void;
}

type Surfaces = SurfaceModel<ComponentApi>[];

/** Collections whose items components bind whole: a change is written at the item. */
const COLLECTIONS = new Set(['scans', 'commands', 'choices', 'ui', 'options']);

/** The path a change is written at: its collection's item, else its top-level key. */
export function itemOf(path: string): string {
  const [, top = '', item] = path.split('/');
  return COLLECTIONS.has(top) && item !== undefined ? `/${top}/${item}` : `/${top}`;
}

/** What lives outside React for one page: the socket, the A2UI processor, the state as last patched. */
export class LiveLink {
  readonly processor: MessageProcessor;
  state: LiveState | null = null;
  /** The chat's last event id: a new socket resumes the words from it. */
  chatAfter: string | null = null;
  private ws: WebSocket | null = null;

  constructor(catalog: Catalog<ComponentApi>) {
    this.processor = new MessageProcessor([catalog], (a) => this.send({ type: 'action', action: a }));
    // a surface the server creates later starts with the state as it is now
    this.processor.onSurfaceCreated((s) => this.feed(null, s.id));
  }

  attach(ws: WebSocket | null): void {
    this.ws = ws;
  }

  close(): void {
    this.ws?.close();
  }

  send(up: Up): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(up));
  }

  /**
   * Write the state's changes into every surface's data model, or all of it. A change is written at
   * its item (`/scans/{id}`, `/commands/{id}`, `/ui/selected`), never deeper: the data model
   * changes objects in place and the renderer compares props by value, so a component bound to
   * `/scans/{id}` would not see a write to `/scans/{id}/meter/steps` (findings F-03).
   */
  feed(ops: Operation[] | null, only?: string): void {
    const state = this.state;
    if (state === null) return;
    const items = ops === null ? ['/'] : [...new Set(ops.map((op) => itemOf(op.path)))];
    const updates = items.map((path) => ({ path, value: path === '/' ? state : getValueByPointer(state, path) as unknown }));
    for (const surfaceId of only === undefined ? this.processor.getSurfaces().keys() : [only])
      this.processor.processMessages(updates.map((u) => ({ version: VERSION, updateDataModel: { surfaceId, ...u } })) as never);
  }
}

interface Setters {
  setState: (s: LiveState) => void;
  setMessages: (m: LiveMessage[]) => void;
  setStreaming: (f: (s: string) => string) => void;
  setBusy: (b: boolean) => void;
  setChatUp: (b: boolean) => void;
  setNotices: (f: (n: Notice[]) => Notice[]) => void;
}

function onCustom(link: LiveLink, s: Setters, name: string, value: unknown): void {
  if (name === 'a2ui') link.processor.processMessages(value as never);
  else if (name === 'notice') s.setNotices((n) => [...n.slice(-2), value as Notice]);
  else if (name === 'chat') s.setChatUp((value as { up: boolean }).up);
}

/** One frame into the page's state. */
export function onFrame(link: LiveLink, s: Setters, f: Frame): void {
  switch (f.type) {
    case EventType.STATE_SNAPSHOT:
      link.state = f.snapshot;
      link.feed(null);
      s.setState(f.snapshot);
      return;
    case EventType.STATE_DELTA: {
      if (link.state === null) return;
      link.state = applyPatch(deepClone(link.state) as LiveState, f.delta, false, false).newDocument;
      link.feed(f.delta);
      s.setState(link.state);
      return;
    }
    case EventType.MESSAGES_SNAPSHOT:
      s.setMessages(f.messages);
      return;
    case EventType.TEXT_MESSAGE_START:
      s.setStreaming(() => '');
      return;
    case EventType.TEXT_MESSAGE_CONTENT:
      link.chatAfter = f.chatId ?? link.chatAfter;
      s.setStreaming((t) => t + f.delta);
      return;
    case EventType.RUN_STARTED:
      s.setBusy(true);
      return;
    case EventType.RUN_FINISHED:
      link.chatAfter = f.chatId ?? link.chatAfter;
      s.setBusy(false);
      s.setStreaming(() => '');
      return;
    case EventType.CUSTOM:
      onCustom(link, s, f.name, f.value);
      return;
    default:
      return;
  }
}

/** The surfaces the processor holds, kept in React state. */
function useSurfaces(link: LiveLink): Surfaces {
  const [surfaces, setSurfaces] = useState<Surfaces>([]);
  useEffect(() => {
    const p = link.processor;
    const sync = () => setSurfaces([...p.getSurfaces().values()]);
    const created = p.onSurfaceCreated(sync);
    const deleted = p.onSurfaceDeleted(sync);
    return () => {
      created.unsubscribe();
      deleted.unsubscribe();
    };
  }, [link]);
  return surfaces;
}

/** Open the socket and keep it open: reconnect with backoff, and on silence or a lost frame. */
function connect(link: LiveLink, s: Setters & { setStatus: (st: Status) => void }, url: () => string): () => void {
  let tries = 0;
  let lastSeq = 0;
  let lastFrame = Date.now();
  let closed = false;
  let retry: number | undefined;
  const open = () => {
    const ws = new WebSocket(url());
    link.attach(ws);
    ws.onopen = () => {
      tries = 0;
      lastSeq = 0;
      lastFrame = Date.now();
      s.setStatus('open');
    };
    ws.onmessage = (e: MessageEvent<string>) => {
      lastFrame = Date.now();
      const f = JSON.parse(e.data) as Frame;
      // a lost frame: the state may be wrong, so start again from a fresh snapshot (D-2)
      if (f.seq !== lastSeq + 1) return ws.close();
      lastSeq = f.seq;
      onFrame(link, s, f);
    };
    ws.onclose = () => {
      if (closed) return;
      s.setStatus('reconnecting');
      retry = window.setTimeout(open, BACKOFF_MS[Math.min(tries, BACKOFF_MS.length - 1)]);
      tries += 1;
    };
  };
  open();
  const watchdog = window.setInterval(() => {
    if (Date.now() - lastFrame > SILENT_MS) link.close();
  }, 5000);
  return () => {
    closed = true;
    window.clearTimeout(retry);
    window.clearInterval(watchdog);
    link.close();
    link.attach(null);
  };
}

/** The live conversation over its socket; `conversation` null: nothing to open yet. */
export function useLiveWorkbench(conversation: string | null, store: string | null, catalog: Catalog<ComponentApi>): Live {
  const [link] = useState(() => new LiveLink(catalog));
  const [status, setStatus] = useState<Status>('connecting');
  const [chatUp, setChatUp] = useState(true);
  const [state, setState] = useState<LiveState | null>(null);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const surfaces = useSurfaces(link);

  useEffect(() => {
    if (conversation === null || typeof WebSocket === 'undefined') return;
    const setters = { setState, setMessages, setStreaming, setBusy, setChatUp, setNotices, setStatus };
    return connect(link, setters, () => liveSocketUrl(conversation, store, link.chatAfter));
  }, [conversation, store, link]);

  const act = useCallback((name: string, context: Record<string, unknown> = {}) => link.send({ type: 'action', action: { name, context } }), [link]);
  const say = useCallback((text: string) => link.send({ type: 'say', text }), [link]);
  return { status, chatUp, state, messages, streaming, busy, surfaces, notices, act, say };
}
