// Conversation routes of the chat service (R-30, contracts/chat-http-api.md): create, messages,
// the event stream, credentials (T018), process scope (T027), stop (T050) and reset (T051); a
// run's stop (T041) and the error log lookup.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import type { ProcessScope } from '@mudpuppy/chat-model';
import { CredentialsBody, type CredentialsHandler } from './credentials.js';
import type { ErrorRecord } from './error-log.js';
import { HttpError } from './http-error.js';
import { parseBody, readJson, sendJson } from './http-io.js';
import { PageContext, contextLine } from './page-context.js';
import { RunRefusal, type StoppedRun } from './runs.js';
import { ScopeRefusal, SetScopeInput } from './scope.js';
import type { ChatService, SequencedEvent } from './service.js';

export const HEARTBEAT_MS = 15_000;

/** What the conversation routes need; each optional part answers 404 when absent. */
export interface ConversationDeps {
  service: ChatService;
  heartbeatMs?: number;
  credentials?: CredentialsHandler;
  scope?: (conversationId: string, body: SetScopeInput) => ProcessScope;
  stopRun?: (runId: string) => StoppedRun;
  runsOfConversation?: (conversationId: string) => string[];
  findError: (ref: string) => Promise<ErrorRecord | null>;
}

const CreateBody = z.object({
  portal: z.string().min(1).max(200).optional(),
  goal: z.string().max(10_000).optional(),
  /** Spec 011: [new conversation] for the chosen portal never resumes its active one. */
  fresh: z.boolean().optional(),
});
const MessageBody = z.object({
  text: z.string().trim().min(1).max(50_000),
  /** Spec 022: the page the message is about ("This page") or the whole portal. */
  context: PageContext.optional(),
});

function parseLastEventId(req: IncomingMessage): number | null {
  const raw = req.headers['last-event-id'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || !/^\d+$/.test(value)) return null;
  return Number(value);
}

async function openEvents(
  deps: ConversationDeps,
  req: IncomingMessage,
  res: ServerResponse,
  conversationId: string,
): Promise<void> {
  const { service } = deps;
  if (!(await service.exists(conversationId)))
    throw new HttpError(404, 'This conversation does not exist.');
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.write(': connected\n\n');
  // T048: whether a turn is running, so a page opened or reloaded mid-turn shows it working.
  // No `id:`: it is connection state, not part of the replayable stream.
  res.write(`event: status\ndata: ${JSON.stringify({ busy: service.isBusy(conversationId) })}\n\n`);
  const write = ({ id, event }: SequencedEvent): void => {
    res.write(`id: ${String(id)}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  };
  const unsubscribe = service.subscribe(conversationId, parseLastEventId(req), write);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), deps.heartbeatMs ?? HEARTBEAT_MS);
  heartbeat.unref();
  res.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

async function storeCredentials(
  deps: ConversationDeps,
  req: IncomingMessage,
  res: ServerResponse,
  id: string,
): Promise<void> {
  if (deps.credentials === undefined) throw new HttpError(404, 'This address does not exist.');
  const body = parseBody(CredentialsBody, await readJson(req));
  if (!(await deps.service.exists(id)))
    throw new HttpError(404, 'This conversation does not exist.');
  const stored = await deps.credentials.store(body);
  // Names only, never values: tells the assistant (and the request card) it can go on.
  deps.service.inject(id, [
    {
      type: 'notice',
      text: `Stored in the vault: ${stored.refs.join(', ')} (${body.portal} · ${body.environment}). Values are never shown.`,
      tool: 'credential_stored',
    },
  ]);
  sendJson(res, 200, stored);
}

/** Process scope confirmed in the dashboard checklist (T027, FR-014, FR-015). */
async function saveScope(
  deps: ConversationDeps,
  req: IncomingMessage,
  res: ServerResponse,
  id: string,
): Promise<void> {
  if (deps.scope === undefined) throw new HttpError(404, 'This address does not exist.');
  const body = parseBody(SetScopeInput, await readJson(req));
  if (!(await deps.service.exists(id)))
    throw new HttpError(404, 'This conversation does not exist.');
  let saved: ProcessScope;
  try {
    saved = deps.scope(id, body);
  } catch (error) {
    if (error instanceof ScopeRefusal)
      throw new HttpError(400, `${error.message}: ${error.details.join('; ')}`);
    throw error;
  }
  deps.service.inject(id, [
    {
      type: 'notice',
      text: `Process scope saved: "${saved.process_name}" from ${saved.start_state_id} to ${saved.end_state_id} (${String(saved.selected_state_ids.length)} screens). Ask the assistant to produce its documentation.`,
    },
  ]);
  sendJson(res, 201, saved);
}

/** The conversation's create, message, event, credentials and scope routes. */
export async function conversationRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  path: string,
  deps: ConversationDeps,
): Promise<boolean> {
  if (method === 'POST' && path === '/conversations') {
    const body = parseBody(CreateBody, await readJson(req));
    const { conversation, steps } = await deps.service.createConversation(body);
    sendJson(res, 201, { id: conversation.id, steps });
    return true;
  }
  const messages = /^\/conversations\/([^/]+)\/messages$/.exec(path);
  if (method === 'POST' && messages !== null) {
    const body = parseBody(MessageBody, await readJson(req));
    const { messageId } = await deps.service.send(
      decodeURIComponent(messages[1]!),
      body.text,
      contextLine(body.context) + body.text,
    );
    sendJson(res, 202, { messageId });
    return true;
  }
  const events = /^\/conversations\/([^/]+)\/events$/.exec(path);
  if (method === 'GET' && events !== null) {
    await openEvents(deps, req, res, decodeURIComponent(events[1]!));
    return true;
  }
  const credentials = /^\/conversations\/([^/]+)\/credentials$/.exec(path);
  if (method === 'POST' && credentials !== null) {
    await storeCredentials(deps, req, res, decodeURIComponent(credentials[1]!));
    return true;
  }
  const scope = /^\/conversations\/([^/]+)\/scope$/.exec(path);
  if (method === 'POST' && scope !== null) {
    await saveScope(deps, req, res, decodeURIComponent(scope[1]!));
    return true;
  }
  return false;
}

/**
 * T050: the chat's [stop] button. Ends the assistant's turn and stops every run the
 * conversation follows (interrupted, so they can be resumed); answers what was stopped.
 */
async function cancelConversation(
  deps: ConversationDeps,
  res: ServerResponse,
  id: string,
): Promise<void> {
  const { service } = deps;
  if (!(await service.exists(id))) throw new HttpError(404, 'This conversation does not exist.');
  const stoppedRuns: StoppedRun[] = [];
  for (const runId of deps.runsOfConversation?.(id) ?? []) {
    try {
      if (deps.stopRun) stoppedRuns.push(deps.stopRun(runId));
    } catch (error) {
      if (!(error instanceof RunRefusal)) throw error; // ended meanwhile: nothing to stop
    }
  }
  const turn = service.isBusy(id);
  if (turn) await service.cancel(id);
  // Each stopped run already posts its own notice (T041).
  if (turn)
    service.inject(id, [
      { type: 'notice', text: 'You stopped the assistant. Send a message to continue.' },
    ]);
  sendJson(res, 200, { turn, runs: stoppedRuns });
}

/** T041: the "Stop scan" button. The run becomes interrupted, so it can be resumed later. */
function stopRun(deps: ConversationDeps, res: ServerResponse, runId: string): void {
  if (deps.stopRun === undefined) throw new HttpError(404, 'This address does not exist.');
  try {
    sendJson(res, 200, deps.stopRun(runId));
  } catch (error) {
    if (error instanceof RunRefusal)
      throw new HttpError(error.code === 'RUN_NOT_FOUND' ? 404 : 409, `${error.message}.`);
    throw error;
  }
}

/** [stop], [reset assistant] (T051: a fresh session on the next message), a run's stop, errors. */
export async function controlRoutes(
  res: ServerResponse,
  method: string,
  path: string,
  deps: ConversationDeps,
): Promise<boolean> {
  const cancel = /^\/conversations\/([^/]+)\/cancel$/.exec(path);
  if (method === 'POST' && cancel !== null) {
    await cancelConversation(deps, res, decodeURIComponent(cancel[1]!));
    return true;
  }
  const reset = /^\/conversations\/([^/]+)\/reset$/.exec(path);
  if (method === 'POST' && reset !== null) {
    await deps.service.reset(decodeURIComponent(reset[1]!));
    sendJson(res, 200, { reset: true });
    return true;
  }
  const stop = /^\/runs\/([^/]+)\/stop$/.exec(path);
  if (method === 'POST' && stop !== null) {
    stopRun(deps, res, decodeURIComponent(stop[1]!));
    return true;
  }
  const errors = /^\/errors\/([^/]+)$/.exec(path);
  if (method === 'GET' && errors !== null) {
    const record = await deps.findError(decodeURIComponent(errors[1]!));
    if (record === null) throw new HttpError(404, 'No log entry has this reference.');
    sendJson(res, 200, record);
    return true;
  }
  return false;
}
