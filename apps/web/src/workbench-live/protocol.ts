// The live Workbench's wire (spec 075, the R-96 spike): AG-UI events down the dashboard's
// WebSocket (`/api/workbench/live/{c}/ws`), each with a `seq`; the shared state they carry; and
// what goes up. The state's paths are the A2UI data model's (designer 19/13).

import { EventType } from '@ag-ui/core';
import type { Operation } from 'fast-json-patch';

export { EventType };

export interface LivePage {
  order: number;
  route: string;
  state: number;
  title: string;
  at: string;
  step: number;
  status: 'ok' | 'here' | 'failed';
  sideTrips: number;
}

export interface LiveNode {
  id: string;
  route: string;
  title: string;
  x: number;
  y: number;
  order: number;
  status: string;
  here: boolean;
  stopped: boolean;
}

export interface LiveGraph {
  width: number;
  height: number;
  nodeW: number;
  nodeH: number;
  nodes: LiveNode[];
  edges: { d: string; kind: string }[];
  path: string[];
}

export interface LiveScan {
  short: string;
  meter: { status: string; steps: number; limit: number | null; pages: number; queued: number; at: string | null };
  pages: LivePage[];
  narration: { at: string; text: string; cites: string[]; kind: string }[];
  stop: { at: string | null; route: string | null; step: number | null; reason: string | null; kept: { pages: number; queued: number } } | null;
  graph: LiveGraph | null;
}

export interface LiveCommand {
  commandId: string;
  command: string;
  label: string;
  state: string;
  facts: [string, string][];
  reason: string;
  result: string;
  links: [string, string][];
  error: string | null;
  errorRef: string | null;
  running: string;
  editable: boolean;
  args: Record<string, unknown>;
  signIns: string[];
  personas: string[];
  persona: string | null;
  askPersona: boolean;
  undo: boolean;
}

export interface Option {
  value: string;
  label: string;
}

export interface LiveChoice {
  choiceId: string;
  kind: 'portal' | 'store' | 'persona' | 'answer';
  question: string;
  options: Option[];
  answer: string | null;
}

export interface LiveState {
  view: { phase: number; generated: boolean };
  conversation: { id: string; portal: string; path: string };
  portal: { id: string; store: string; environment: string; paused: string | null };
  options: { portal: Option[]; store: Option[]; persona: Option[] };
  live: string | null;
  scans: Record<string, LiveScan>;
  commands: Record<string, LiveCommand>;
  choices: Record<string, LiveChoice>;
  ui: { selected: { scan?: string; route: string; state?: number } | null };
}

export interface LiveMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  turn: number;
}

/** One frame down the socket: an AG-UI event and its sequence number. */
export type Frame =
  | { seq: number; type: EventType.STATE_SNAPSHOT; snapshot: LiveState }
  | { seq: number; type: EventType.STATE_DELTA; delta: Operation[] }
  | { seq: number; type: EventType.MESSAGES_SNAPSHOT; messages: LiveMessage[] }
  | { seq: number; type: EventType.TEXT_MESSAGE_START; messageId: string }
  | { seq: number; type: EventType.TEXT_MESSAGE_CONTENT; messageId: string; delta: string; chatId?: string }
  | { seq: number; type: EventType.TEXT_MESSAGE_END; messageId: string }
  | { seq: number; type: EventType.RUN_STARTED; runId: string }
  | { seq: number; type: EventType.RUN_FINISHED; runId: string; chatId?: string }
  | { seq: number; type: EventType.CUSTOM; name: string; value: unknown };

/** What goes up: an A2UI action, or a message from the composer. */
export type Up =
  | { type: 'action'; action: { name: string; surfaceId?: string; sourceComponentId?: string; context: Record<string, unknown> } }
  | { type: 'say'; text: string };

export const liveSocketUrl = (conversation: string, store: string | null, chatAfter: string | null): string => {
  const q = new URLSearchParams();
  if (store) q.set('store', store);
  if (chatAfter) q.set('chat_after', chatAfter);
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const query = q.toString();
  return `${scheme}://${window.location.host}/api/workbench/live/${encodeURIComponent(conversation)}/ws${query ? `?${query}` : ''}`;
};
