// Local HTTP + SSE API of the chat service (R-30 T014, contracts/chat-http-api.md).
// Bound to 127.0.0.1 only. Credentials, scope and amendment routes come in later tasks.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { z } from 'zod';
import {
  AmendmentBody,
  MAX_ATTACHMENT_BYTES,
  ReapplyBody,
  type AmendmentService,
} from './amendments.js';
import { CredentialsBody, type CredentialsHandler } from './credentials.js';
import { Environment } from '@pathfinder/config';
import { EnvironmentBody, NewPortalBody, PortalRefusal, type PortalSummary } from './portals.js';
import { RunRefusal, type StoppedRun } from './runs.js';
import { ScopeRefusal, SetScopeInput } from './scope.js';
import type { ProcessScope } from '@pathfinder/chat-model';
import type { ErrorInput, ErrorRecord, LogResult } from './error-log.js';
import { HttpError } from './http-error.js';
import { ChatError, type ChatService, type SequencedEvent } from './service.js';

export const HEARTBEAT_MS = 15_000;
const MAX_BODY_BYTES = 256 * 1024;
/** Base64 inflates by a third; leave room for the JSON around it. */
const MAX_ATTACHMENT_BODY_BYTES = Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 64 * 1024;

export interface ApiOptions {
  service: ChatService;
  logError: (input: ErrorInput) => Promise<LogResult>;
  findError: (ref: string) => Promise<ErrorRecord | null>;
  version: string;
  heartbeatMs?: number;
  /** Vault form path (T018). Without it the credentials route answers 404. */
  credentials?: CredentialsHandler;
  /** Amendment commands (T030). Without it the amendment routes answer 404. */
  amendments?: AmendmentService;
  /** Save a process scope (T027); throws `ScopeRefusal`. Without it the route answers 404. */
  scope?: (conversationId: string, body: SetScopeInput) => ProcessScope;
  /** Stop a running run (T041); throws `RunRefusal`. Without it the route answers 404. */
  stopRun?: (runId: string) => StoppedRun;
  /** Running runs a conversation follows (T050); without it [stop] only cancels the turn. */
  runsOfConversation?: (conversationId: string) => string[];
  /** Portals from the dashboard (spec 011); each throws `PortalRefusal`. Without it: 404. */
  portals?: PortalCommands;
}

export interface PortalCommands {
  create: (body: NewPortalBody) => PortalSummary;
  describe: (id: string) => PortalSummary;
  setEnvironment: (id: string, env: Environment, body: EnvironmentBody) => PortalSummary;
  removeEnvironment: (id: string, env: Environment) => PortalSummary;
}

const PORTAL_STATUS: Record<PortalRefusal['code'], number> = {
  PORTAL_EXISTS: 409,
  LAST_ENVIRONMENT: 409,
  PORTAL_NOT_FOUND: 404,
  INVALID: 400,
};

/** Run a portal command; a refusal becomes its HTTP status with the reasons in the message. */
function portalCall(run: () => PortalSummary): PortalSummary {
  try {
    return run();
  } catch (error) {
    if (error instanceof PortalRefusal)
      throw new HttpError(
        PORTAL_STATUS[error.code],
        error.details.length > 0
          ? `${error.message}: ${error.details.join('; ')}`
          : `${error.message}.`,
      );
    throw error;
  }
}

const CreateBody = z.object({
  portal: z.string().min(1).max(200).optional(),
  goal: z.string().max(10_000).optional(),
  /** Spec 011: [new conversation] for the chosen portal never resumes its active one. */
  fresh: z.boolean().optional(),
});
const MessageBody = z.object({ text: z.string().trim().min(1).max(50_000) });

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  });
  res.end(text);
}

async function readJson(req: IncomingMessage, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > maxBytes) throw new HttpError(400, 'The request is too large.');
    chunks.push(buf);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new HttpError(400, 'The request body is not valid JSON.');
  }
}

function parseBody<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first === undefined ? '' : ` (${first.path.join('.') || 'body'})`;
    throw new HttpError(400, `The request is not valid${where}.`);
  }
  return parsed.data;
}

function parseLastEventId(req: IncomingMessage): number | null {
  const raw = req.headers['last-event-id'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || !/^\d+$/.test(value)) return null;
  return Number(value);
}

export function createApi(opts: ApiOptions): Server {
  const { service } = opts;

  async function openEvents(
    req: IncomingMessage,
    res: ServerResponse,
    conversationId: string,
  ): Promise<void> {
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
    res.write(
      `event: status\ndata: ${JSON.stringify({ busy: service.isBusy(conversationId) })}\n\n`,
    );
    const write = ({ id, event }: SequencedEvent): void => {
      res.write(`id: ${String(id)}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };
    const unsubscribe = service.subscribe(conversationId, parseLastEventId(req), write);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), opts.heartbeatMs ?? HEARTBEAT_MS);
    heartbeat.unref();
    res.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = req.method ?? 'GET';

    if (method === 'GET' && path === '/healthz') {
      sendJson(res, 200, { ok: true, agent: service.agentStatus(), version: opts.version });
      return;
    }
    // Spec 011: portals from the dashboard: "+ new portal" and the portal settings page.
    const portals = opts.portals;
    if (method === 'POST' && path === '/portals') {
      if (portals === undefined) throw new HttpError(404, 'This address does not exist.');
      const body = parseBody(NewPortalBody, await readJson(req));
      sendJson(
        res,
        201,
        portalCall(() => portals.create(body)),
      );
      return;
    }
    const portalOne = /^\/portals\/([^/]+)$/.exec(path);
    if (method === 'GET' && portalOne !== null) {
      if (portals === undefined) throw new HttpError(404, 'This address does not exist.');
      const id = decodeURIComponent(portalOne[1]!);
      sendJson(
        res,
        200,
        portalCall(() => portals.describe(id)),
      );
      return;
    }
    const portalEnv = /^\/portals\/([^/]+)\/environments\/([^/]+)$/.exec(path);
    if ((method === 'PUT' || method === 'DELETE') && portalEnv !== null) {
      if (portals === undefined) throw new HttpError(404, 'This address does not exist.');
      const id = decodeURIComponent(portalEnv[1]!);
      const env = Environment.safeParse(decodeURIComponent(portalEnv[2]!));
      if (!env.success)
        throw new HttpError(400, 'The environment must be production, staging or sandbox.');
      if (method === 'PUT') {
        const body = parseBody(EnvironmentBody, await readJson(req));
        sendJson(
          res,
          200,
          portalCall(() => portals.setEnvironment(id, env.data, body)),
        );
      } else
        sendJson(
          res,
          200,
          portalCall(() => portals.removeEnvironment(id, env.data)),
        );
      return;
    }
    if (method === 'POST' && path === '/conversations') {
      const body = parseBody(CreateBody, await readJson(req));
      const { conversation, steps } = await service.createConversation(body);
      sendJson(res, 201, { id: conversation.id, steps });
      return;
    }
    const messages = /^\/conversations\/([^/]+)\/messages$/.exec(path);
    if (method === 'POST' && messages !== null) {
      const body = parseBody(MessageBody, await readJson(req));
      const { messageId } = await service.send(decodeURIComponent(messages[1]!), body.text);
      sendJson(res, 202, { messageId });
      return;
    }
    const events = /^\/conversations\/([^/]+)\/events$/.exec(path);
    if (method === 'GET' && events !== null) {
      await openEvents(req, res, decodeURIComponent(events[1]!));
      return;
    }
    const credentials = /^\/conversations\/([^/]+)\/credentials$/.exec(path);
    if (method === 'POST' && credentials !== null) {
      if (opts.credentials === undefined) throw new HttpError(404, 'This address does not exist.');
      const id = decodeURIComponent(credentials[1]!);
      const body = parseBody(CredentialsBody, await readJson(req));
      if (!(await service.exists(id)))
        throw new HttpError(404, 'This conversation does not exist.');
      sendJson(res, 200, await opts.credentials.store(body));
      return;
    }
    // Process scope confirmed in the dashboard checklist (T027, FR-014, FR-015).
    const scope = /^\/conversations\/([^/]+)\/scope$/.exec(path);
    if (method === 'POST' && scope !== null) {
      if (opts.scope === undefined) throw new HttpError(404, 'This address does not exist.');
      const id = decodeURIComponent(scope[1]!);
      const body = parseBody(SetScopeInput, await readJson(req));
      if (!(await service.exists(id)))
        throw new HttpError(404, 'This conversation does not exist.');
      let saved: ProcessScope;
      try {
        saved = opts.scope(id, body);
      } catch (error) {
        if (error instanceof ScopeRefusal)
          throw new HttpError(400, `${error.message}: ${error.details.join('; ')}`);
        throw error;
      }
      service.inject(id, [
        {
          type: 'notice',
          text: `Process scope saved: "${saved.process_name}" from ${saved.start_state_id} to ${saved.end_state_id} (${String(saved.selected_state_ids.length)} screens). Ask the assistant to produce its documentation.`,
        },
      ]);
      sendJson(res, 201, saved);
      return;
    }
    const amendmentsRoot = /^\/portals\/([^/]+)\/amendments$/.exec(path);
    if (method === 'POST' && amendmentsRoot !== null) {
      if (opts.amendments === undefined) throw new HttpError(404, 'This address does not exist.');
      const body = parseBody(AmendmentBody, await readJson(req, MAX_ATTACHMENT_BODY_BYTES));
      const created = await opts.amendments.create(decodeURIComponent(amendmentsRoot[1]!), body);
      sendJson(res, 201, created);
      return;
    }
    const amendmentOne = /^\/portals\/([^/]+)\/amendments\/([^/]+)$/.exec(path);
    if (method === 'DELETE' && amendmentOne !== null) {
      if (opts.amendments === undefined) throw new HttpError(404, 'This address does not exist.');
      const withdrawn = await opts.amendments.withdraw(
        decodeURIComponent(amendmentOne[1]!),
        decodeURIComponent(amendmentOne[2]!),
      );
      sendJson(res, 200, withdrawn);
      return;
    }
    // T033: re-apply or dismiss a superseded amendment (FR-022).
    const amendmentAction = /^\/portals\/([^/]+)\/amendments\/([^/]+)\/(reapply|dismiss)$/.exec(
      path,
    );
    if (method === 'POST' && amendmentAction !== null) {
      if (opts.amendments === undefined) throw new HttpError(404, 'This address does not exist.');
      const portal = decodeURIComponent(amendmentAction[1]!);
      const id = decodeURIComponent(amendmentAction[2]!);
      if (amendmentAction[3] === 'reapply') {
        const body = parseBody(ReapplyBody, await readJson(req));
        sendJson(res, 201, await opts.amendments.reapply(portal, id, body));
      } else sendJson(res, 200, await opts.amendments.dismiss(portal, id));
      return;
    }
    // T050: the chat's [stop] button. Ends the assistant's turn and stops every run the
    // conversation follows (interrupted, so they can be resumed); answers what was stopped.
    const cancel = /^\/conversations\/([^/]+)\/cancel$/.exec(path);
    if (method === 'POST' && cancel !== null) {
      const id = decodeURIComponent(cancel[1]!);
      if (!(await service.exists(id)))
        throw new HttpError(404, 'This conversation does not exist.');
      const stoppedRuns: StoppedRun[] = [];
      for (const runId of opts.runsOfConversation?.(id) ?? []) {
        try {
          if (opts.stopRun) stoppedRuns.push(opts.stopRun(runId));
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
      return;
    }
    // T051: [reset assistant]. A fresh assistant session on the next message; history is kept.
    const reset = /^\/conversations\/([^/]+)\/reset$/.exec(path);
    if (method === 'POST' && reset !== null) {
      await service.reset(decodeURIComponent(reset[1]!));
      sendJson(res, 200, { reset: true });
      return;
    }
    // T041: the "Stop scan" button. The run becomes interrupted, so it can be resumed later.
    const stop = /^\/runs\/([^/]+)\/stop$/.exec(path);
    if (method === 'POST' && stop !== null) {
      if (opts.stopRun === undefined) throw new HttpError(404, 'This address does not exist.');
      try {
        sendJson(res, 200, opts.stopRun(decodeURIComponent(stop[1]!)));
      } catch (error) {
        if (error instanceof RunRefusal)
          throw new HttpError(error.code === 'RUN_NOT_FOUND' ? 404 : 409, `${error.message}.`);
        throw error;
      }
      return;
    }
    const errors = /^\/errors\/([^/]+)$/.exec(path);
    if (method === 'GET' && errors !== null) {
      const record = await opts.findError(decodeURIComponent(errors[1]!));
      if (record === null) throw new HttpError(404, 'No log entry has this reference.');
      sendJson(res, 200, record);
      return;
    }
    throw new HttpError(404, 'This address does not exist.');
  }

  return createServer((req, res) => {
    route(req, res).catch(async (error: unknown) => {
      const known = error instanceof HttpError || error instanceof ChatError;
      const status = known ? error.status : 500;
      const message = known ? error.message : 'Something went wrong in the chat service.';
      const { ref } = await opts.logError({
        conversation_id: null,
        where: `${req.method ?? '?'} ${(req.url ?? '').split('?')[0] ?? ''}`,
        message,
        detail: known ? { status } : error,
      });
      if (res.headersSent) {
        res.end();
        return;
      }
      sendJson(res, status, { ref, message });
    });
  });
}

/** Listen on loopback only. Port 0 picks a free port; the bound port is returned. */
export function listenLocal(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      resolve(typeof address === 'object' && address !== null ? address.port : port);
    });
  });
}
