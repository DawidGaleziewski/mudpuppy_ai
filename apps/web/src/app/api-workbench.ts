// The Workbench (`web/api_workbench.py` over `views_workbench.page_model`): the page model as the
// dashboard sends it, its writes, and the stream. The words arrive over the chat relay
// (`/chat/conversations/{id}/events`); a view or a command landing reads the page again, and a
// running scan is read every 2 s (the data lane, WB-UI-13).
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson, type StatusOut } from './api';
import type { Write } from './api-write';

export interface WbPage {
  order: number;
  state_id: string;
  route: string;
  state: number;
  title: string;
  step: number;
  at: string;
  side_pages: number;
  failed: boolean;
  screenshot_ref: string | null;
}

export interface WbScan {
  run_id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  steps: number;
  pages: number;
  queued: number;
  route_pages: WbPage[];
  here: WbPage | null;
  stop_reason: string | null;
  events: { step: number; at: string }[];
}

export interface WbFrame {
  dom_id: string;
  title: string;
  source: string;
  title_mono: boolean;
  card: boolean;
  failure: boolean;
  state: string;
  status: string | null;
  why: { path: string; by_you: boolean; because: string; asked: string; shows: string[]; data: string; other_paths: string[] } | null;
  feedback: { url: string; value: string | null; reasons: string[] } | null;
  stale_since: string | null;
}

export interface WbRecord {
  key: string;
  title: string;
  type_word: string | null;
  confirmed: boolean;
}

export interface WbCard {
  frame: WbFrame;
  type: string;
  scan: WbScan | null;
  page: WbPage | null;
  record: WbRecord | null;
  records: [string, WbRecord | null][];
  folded: boolean;
  turn: number;
}

export interface WbCommandCard {
  dom_id: string;
  title: string;
  state: string;
  facts: [string, string][];
  reason: string;
  proposed_by: string;
  token: string | null;
  result: string;
  result_links: [string, string][];
  error: string;
  error_ref: string | null;
  running_word: string;
  ask_persona: boolean;
  personas: string[];
  persona: string | null;
  no_persona_url: string | null;
}

export interface WbTurn {
  turn: { n: number; asked: string; is_event: boolean; answer: string[]; notices: string[]; view: { id: string } | null; commands: { id: string; state: string }[] };
  cards: WbCard[];
  narration: { at: string; text: string; ref: string; step: number; kind: string }[];
  suggestions: string[];
  commands: WbCommandCard[];
}

export interface WbConversation {
  id: string;
  portal: string;
  path: string;
  path_source: 'you' | 'assistant';
  title: string | null;
  created_at: string;
}

export interface WbPageModel {
  portal: string | null;
  conversation: WbConversation | null;
  turns: WbTurn[];
  sel: string | null;
  sheet: [WbScan, WbPage] | null;
  why: string | null;
  starters: string[];
  recent: [WbConversation, string][];
  blocked: string | null;
  notice: string | null;
  live: WbScan | null;
  live_card: string | null;
  ask: string;
  paused: string | null;
  path_words: Record<string, string>;
  reasons: [string, string][];
  statuses: { wb_scan: Record<string, StatusOut>; wb_cmd: Record<string, StatusOut> };
}

export const workbenchHref = (portal: string, q: { c?: string; sel?: string; new?: boolean } = {}) => {
  const p = new URLSearchParams();
  if (q.c) p.set('c', q.c);
  if (q.sel) p.set('sel', q.sel);
  if (q.new) p.set('new', '1');
  const s = p.toString();
  return `/app/portals/${encodeURIComponent(portal)}/workbench${s ? `?${s}` : ''}`;
};

export const workbenchKey = (portal: string) => ['workbench', portal] as const;

export const useWorkbench = (portal: string, q: { c: string | null; sel: string | null; fresh: boolean }) => {
  const p = new URLSearchParams();
  if (q.c) p.set('c', q.c);
  if (q.sel) p.set('sel', q.sel);
  if (q.fresh) p.set('new', '1');
  const query = p.toString();
  return useQuery({
    queryKey: [...workbenchKey(portal), query],
    queryFn: () => getJson<WbPageModel>(`/api/workbench/portals/${encodeURIComponent(portal)}${query ? `?${query}` : ''}`),
    // the data lane: a running scan is read again every 2 s, nothing in between
    refetchInterval: (r) => (r.state.data?.live ? 2000 : false),
  });
};

const base = '/api/workbench';

export const wbWrites = {
  send: (portal: string, c: string | null, text: string): Write => ({ path: `${base}/portals/${encodeURIComponent(portal)}/turns`, body: { c: c ?? '', text, ctx: [] } }),
  path: (c: string, path: string): Write => ({ path: `${base}/conversations/${encodeURIComponent(c)}/path`, body: { path } }),
  open: (c: string, turn: number, command: string, scan: string): Write => ({ path: `${base}/commands`, body: { c, turn, command, scan } }),
  confirm: (id: string, token: string, persona: string | null): Write => ({ path: `${base}/commands/${encodeURIComponent(id)}/confirm`, body: { token, ...(persona ? { persona } : {}) } }),
  cancel: (id: string): Write => ({ path: `${base}/commands/${encodeURIComponent(id)}/cancel`, body: {} }),
  feedback: (view: string, answer: { value: string; toggle?: string; text?: string }): Write => ({ path: `${base}/views/${encodeURIComponent(view)}/feedback`, body: answer }),
};

/**
 * The words lane: the assistant's answer as it streams (shown under the turn it answers), and a
 * fresh read of the page when a view or a command lands or the assistant goes idle.
 */
export function useWbStream(portal: string, conversation: string | null) {
  const client = useQueryClient();
  const [answer, setAnswer] = useState('');
  const text = useRef('');
  useEffect(() => {
    if (!conversation || typeof EventSource === 'undefined') return;
    const source = new EventSource(`/chat/conversations/${encodeURIComponent(conversation)}/events`);
    const refresh = () => void client.invalidateQueries({ queryKey: workbenchKey(portal) });
    source.addEventListener('message_chunk', (e) => {
      try {
        const chunk = (JSON.parse((e as MessageEvent<string>).data) as { text?: unknown }).text;
        if (typeof chunk === 'string') text.current += chunk;
      } catch {
        return;
      }
      setAnswer(text.current);
    });
    for (const kind of ['wb_view', 'wb_command', 'wb_no_view', 'message_done']) source.addEventListener(kind, refresh);
    source.addEventListener('idle', () => {
      text.current = '';
      setAnswer('');
      refresh();
    });
    return () => source.close();
  }, [client, portal, conversation]);
  return answer;
}
