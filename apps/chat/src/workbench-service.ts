// The Workbench in the chat service (spec 043, contracts/workbench-http.md): conversations, turns
// with their context, the Path switch, feedback and the day's turn cap; the command cards are in
// workbench-cards.ts. The assistant's own tools are in the MCP process (mcp-workbench-tools.ts);
// this is what the dashboard calls.

import type BetterSqlite3 from 'better-sqlite3';
import { newId, nowIso } from '@mudpuppy/core';
import { PATHS, type WbPath } from '@mudpuppy/workbench-contract';
import { HttpError } from './http-error.js';
import type { ChatService } from './service.js';
import { cardActions } from './workbench-cards.js';
import { chipsOf, turnContext } from './workbench-context.js';
import type { Launches } from './workbench-session.js';
import type { Telemetry } from './workbench-telemetry.js';
import { currentTurn } from './workbench-turn.js';
import type { WorkspacePaths } from './workflow-data.js';

/** Turns per person per day (doc 17 § 4.7). */
export const TURN_CAP = 200;
export const PHASE = 1;
const REASONS = new Set(['wrong_path', 'missing_something', 'too_much', 'wrong_data', 'other']);

export interface WorkbenchDeps {
  raw: BetterSqlite3.Database;
  service: ChatService;
  paths: WorkspacePaths;
  launches: Launches;
  telemetry: Telemetry;
  /** Stop notices to the conversations following a run (the chat's own stop does it). */
  stopped?: (runId: string) => void;
  commandsOn?: () => boolean;
}

export type Body = Record<string, unknown>;

export const asText = (v: unknown, field: string, max = 4000): string => {
  if (typeof v !== 'string' || v.trim() === '') throw new HttpError(400, `${field} is required.`);
  return v.trim().slice(0, max);
};

/** The portal of a Workbench conversation; 404 for any other conversation. */
export function workbenchPortal(raw: BetterSqlite3.Database, id: string): string {
  const row = raw.prepare(`SELECT portal_id, kind FROM chat_conversations WHERE id = ?`).get(id) as
    { portal_id: string | null; kind: string } | undefined;
  if (row?.kind !== 'workbench' || row.portal_id === null)
    throw new HttpError(404, 'This Workbench conversation does not exist.');
  return row.portal_id;
}

function turnsToday(raw: BetterSqlite3.Database): number {
  const since = `${new Date().toISOString().slice(0, 10)}T00:00:00`;
  const row = raw
    .prepare(
      `SELECT count(*) AS n FROM chat_messages m JOIN chat_conversations c ON c.id = m.conversation_id
       WHERE c.kind = 'workbench' AND m.role = 'user' AND m.created_at >= ?`,
    )
    .get(since) as { n: number };
  return row.n;
}

function createConversation(raw: BetterSqlite3.Database, body: Body): { conversation_id: string } {
  const portal = asText(body.portal, 'portal', 100);
  const id = newId();
  const now = nowIso();
  raw
    .prepare(
      `INSERT INTO chat_conversations (id, portal_id, goal, status, created_at, updated_at, kind)
       VALUES (?, ?, 'workbench', 'active', ?, ?, 'workbench')`,
    )
    .run(id, portal, now, now);
  raw
    .prepare(`INSERT INTO workbench_conversations (conversation_id, updated_at) VALUES (?, ?)`)
    .run(id, now);
  return { conversation_id: id };
}

async function turn(deps: WorkbenchDeps, id: string, body: Body): Promise<{ turn: number }> {
  const { raw } = deps;
  const portal = workbenchPortal(raw, id);
  const text = asText(body.text, 'text');
  if (turnsToday(raw) >= TURN_CAP)
    throw new HttpError(429, `The day's ${String(TURN_CAP)} Workbench turns are used up.`);
  const chips = chipsOf(body.ctx);
  for (const c of chips) deps.telemetry('wb_ask', { target: c.kind });
  const context = turnContext(raw, { conversationId: id, portal, phase: PHASE, chips });
  await deps.service.send(id, text, `${context}\n\n${text}`);
  return { turn: currentTurn(raw, id) };
}

/** The person's Path switch (WB-UI-03): their path wins until they ask for something else. */
function setPath(
  deps: WorkbenchDeps,
  id: string,
  body: Body,
): { path: WbPath; path_source: 'you' } {
  const { raw } = deps;
  workbenchPortal(raw, id);
  const path = body.path;
  if (!(PATHS as readonly unknown[]).includes(path) || (path !== 'chat' && path !== 'mapping'))
    throw new HttpError(400, 'This path is not available in the beta yet.');
  const before = raw
    .prepare(`SELECT path FROM workbench_conversations WHERE conversation_id = ?`)
    .get(id) as { path: string } | undefined;
  raw
    .prepare(
      `INSERT INTO workbench_conversations (conversation_id, path, path_source, updated_at)
       VALUES (?, ?, 'you', ?)
       ON CONFLICT (conversation_id) DO UPDATE SET path = excluded.path, path_source = 'you',
         updated_at = excluded.updated_at`,
    )
    .run(id, path, nowIso());
  deps.telemetry('wb_path_switched', { from: before?.path ?? 'chat', to: path });
  return { path, path_source: 'you' };
}

/** Right view? (WB-UI-28): one answer per view and person, changeable; reasons only with No. */
function feedback(deps: WorkbenchDeps, viewId: string, body: Body): { value: string } {
  const by = asText(body.by, 'by', 100);
  const value = body.value;
  if (value !== 'yes' && value !== 'no') throw new HttpError(400, 'Answer yes or no.');
  const given = Array.isArray(body.reasons) ? (body.reasons as unknown[]) : [];
  const reasons = [
    ...new Set(given.filter((r): r is string => typeof r === 'string' && REASONS.has(r))),
  ];
  const text =
    typeof body.text === 'string' && body.text.trim() !== ''
      ? body.text.trim().slice(0, 500)
      : null;
  if (deps.raw.prepare(`SELECT id FROM workbench_views WHERE id = ?`).get(viewId) === undefined)
    throw new HttpError(404, 'This view does not exist.');
  const now = nowIso();
  deps.raw
    .prepare(
      `INSERT INTO workbench_feedback (view_id, by, value, reasons_json, text, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (view_id, by) DO UPDATE SET value = excluded.value,
         reasons_json = excluded.reasons_json, text = excluded.text, updated_at = excluded.updated_at`,
    )
    .run(viewId, by, value, JSON.stringify(value === 'no' ? reasons : []), text, now, now);
  deps.telemetry('wb_view_feedback', { view_id: viewId, value, reasons, has_text: text !== null });
  return { value };
}

export function createWorkbenchService(deps: WorkbenchDeps) {
  return {
    createConversation: (body: Body) => createConversation(deps.raw, body),
    turn: (id: string, body: Body) => turn(deps, id, body),
    setPath: (id: string, body: Body) => setPath(deps, id, body),
    feedback: (viewId: string, body: Body) => feedback(deps, viewId, body),
    usage: () => ({ turns_today: turnsToday(deps.raw), cap: TURN_CAP }),
    ...cardActions(deps),
  };
}

export type WorkbenchService = ReturnType<typeof createWorkbenchService>;
