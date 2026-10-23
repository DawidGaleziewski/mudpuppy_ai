// The assistant drawer (`web/api_assistant.py` over `queries_app_assistant.py`), typed as the
// pydantic models declare them; the stream of a turn (the dashboard's SSE relay of the chat
// service, `/chat/conversations/{id}/events`); and its calls, the dashboard's `/chat/…` forwarders.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson, type StatusOut } from './api';

export interface AssistantItem {
  id: string;
  kind: 'user' | 'assistant' | 'system' | 'error' | 'credential' | 'proposal';
  text: string;
  at: string;
  ref: string | null;
  credential: { ref: string; portal: string; environment: string; persona: string; reason: string | null; stored: boolean; status: StatusOut } | null;
  proposal: { summary: string; key: string | null; target: string | null; text: string | null; status: StatusOut; href: string } | null;
}

export interface AssistantConversation {
  id: string;
  portal: string | null;
  events: string;
  send: string;
  cancel: string;
  reset: string;
  credentials: string;
}

export interface AssistantPage {
  portal: string;
  service_up: boolean;
  start_hint: string | null;
  conversation: AssistantConversation | null;
  items: AssistantItem[];
  full_page: string;
}

/** What "This page" means on a page (spec 022 R6, `apps/chat/src/page-context.ts`). */
export interface PageContext {
  type: 'screen' | 'process' | 'review' | 'scan' | 'docs';
  id: string;
  rev?: number;
  ids?: string[];
  label?: string;
}

export const assistantKey = (portal: string) => ['portals', portal, 'assistant'] as const;

export const useAssistant = (portal: string, enabled: boolean) =>
  useQuery({
    queryKey: assistantKey(portal),
    queryFn: () => getJson<AssistantPage>(`/api/portals/${encodeURIComponent(portal)}/assistant`),
    enabled,
  });

/** A call to the chat service through the dashboard: its status and JSON answer (a refusal's `message` and `ref`). */
export async function chatCall(path: string, body: unknown): Promise<{ status: number; answer: { message?: string; ref?: string | null; id?: string } }> {
  try {
    const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) });
    const answer = (await r.json().catch(() => ({}))) as { message?: string; ref?: string | null; id?: string };
    return { status: r.status, answer };
  } catch {
    return { status: 0, answer: { message: 'The dashboard did not answer.' } };
  }
}

/** A line the turn adds before the stored history catches up: the streamed reply, a notice, a failure. */
export interface LiveLine {
  kind: 'assistant' | 'notice' | 'error';
  text: string;
  ref?: string | null;
  /** A streamed message that is complete. */
  done?: boolean;
}

interface Tool {
  tool?: string;
  parent?: string;
}

/** "What is happening now" from the open tool calls (the htmx drawer's words). */
function describe(busy: boolean, tools: Map<string, Tool>): string {
  if (!busy) return '';
  if (tools.size === 0) return 'Thinking…';
  const last = [...tools.values()].at(-1);
  const crawler = [...tools.values()].some((t) => t.parent && tools.get(t.parent)?.tool === 'Agent');
  if (crawler) return 'Crawler is mapping the portal…';
  if (last?.tool === 'Agent') return 'Working on a subtask…';
  return `Running: ${last?.tool ?? 'a tool'}`;
}

/** A field of an event as text, or `fallback` when it is not one. */
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

const parse = (e: MessageEvent<string>): Record<string, unknown> => {
  try {
    return JSON.parse(e.data) as Record<string, unknown>;
  } catch {
    return {};
  }
};

/**
 * The live turn of a conversation: the streamed reply and notices, whether the assistant is busy
 * and what it is doing. When the turn ends (`idle`) the stored history is fetched again and the
 * live lines go. EventSource reconnects by itself; the relay passes Last-Event-ID on.
 */
export function useChatStream(portal: string, conversation: AssistantConversation | null, serviceUp: boolean) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<LiveLine[]>([]);
  const [now, setNow] = useState('');
  const tools = useRef(new Map<string, Tool>());
  const refresh = useCallback(() => void client.invalidateQueries({ queryKey: assistantKey(portal) }), [client, portal]);
  const add = useCallback((line: LiveLine) => setLive((l) => [...l, line]), []);
  const settle = useCallback(
    (on: boolean) => {
      setBusy(on);
      if (!on) tools.current.clear();
      setNow(describe(on, tools.current));
    },
    [],
  );
  useEffect(() => {
    if (!conversation || !serviceUp || typeof EventSource === 'undefined') return;
    const source = new EventSource(conversation.events);
    const on = (name: string, handle: (d: Record<string, unknown>) => void) => source.addEventListener(name, (e) => handle(parse(e as MessageEvent<string>)));
    on('status', (d) => settle(Boolean(d.busy)));
    on('message_chunk', (d) =>
      setLive((l) => {
        const last = l.at(-1);
        const text = str(d.text);
        return last?.kind === 'assistant' && !last.done ? [...l.slice(0, -1), { ...last, text: last.text + text }] : [...l, { kind: 'assistant', text }];
      }),
    );
    // The reply's message is complete: the next chunk starts a new one.
    on('message_done', () => setLive((l) => l.map((x) => (x.kind === 'assistant' ? { ...x, done: true } : x))));
    on('tool_started', (d) => {
      tools.current.set(str(d.toolCallId), { tool: str(d.tool), parent: str(d.parentToolCallId) });
      setNow(describe(true, tools.current));
    });
    on('tool_finished', (d) => {
      tools.current.delete(str(d.toolCallId));
      setNow(describe(true, tools.current));
    });
    on('refused', (d) => add({ kind: 'notice', text: `Not allowed: ${str(d.reason)}` }));
    on('error', (d) => add({ kind: 'error', text: str(d.message, 'The assistant failed.'), ref: str(d.ref) || null }));
    on('notice', (d) => add({ kind: 'notice', text: str(d.text) }));
    on('idle', () => {
      settle(false);
      refresh();
      setLive([]);
    });
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) {
        setNow('The assistant is not running. Start it, then reload.');
        settle(false);
      }
    };
    return () => source.close();
  }, [conversation, serviceUp, settle, add, refresh]);
  return { busy, live, now, setBusy: settle, add, refresh };
}
