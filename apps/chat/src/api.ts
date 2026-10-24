// Local HTTP + SSE API of the chat service (R-30 T014, contracts/chat-http-api.md).
// Bound to 127.0.0.1 only. The routes live per resource in `api-*.ts`; this file wires them.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type BetterSqlite3 from 'better-sqlite3';
import { amendmentRoutes } from './api-amendments.js';
import { type AmendmentService } from './amendments.js';
import { checkRunRoutes } from './api-check-runs.js';
import { controlRoutes, conversationRoutes, type ConversationDeps } from './api-conversations.js';
import { markRoutes } from './api-marks.js';
import { type AddFlag, modelRoutes } from './api-model.js';
import { portalRoutes, type PortalCommands } from './api-portals.js';
import { probeSuiteRoutes } from './api-probe-suites.js';
import { processRoutes } from './api-processes.js';
import { proposalRoutes } from './api-proposals.js';
import { workbenchRoutes } from './api-workbench.js';
import type { CheckRunDeps } from './check-runs.js';
import type { ErrorInput, LogResult } from './error-log.js';
import { HttpError } from './http-error.js';
import { sendJson } from './http-io.js';
import type { MarkService } from './marks.js';
import type { ProbeSuiteService } from './probe-suites.js';
import { type ProcessService } from './process-service.js';
import { type ProposalService } from './proposal-service.js';
import { ChatError } from './service.js';
import type { WorkbenchService } from './workbench-service.js';

export interface ApiOptions extends ConversationDeps {
  logError: (input: ErrorInput) => Promise<LogResult>;
  version: string;
  /** Amendment commands (T030). Without it the amendment routes answer 404. */
  amendments?: AmendmentService;
  /** The assistant's proposals (spec 022 R6). Without it the proposal routes answer 404. */
  proposals?: ProposalService;
  /** BA processes, process models, drafts, suggestions (spec 022 M5). Without it the routes answer 404. */
  processes?: ProcessService;
  /** The owner's decision on a probe suite (spec 032 US3). Without it the routes answer 404. */
  probeSuites?: ProbeSuiteService;
  /** The BA's Probe marks on form steps (spec 032 US5). Without it the route answers 404. */
  marks?: MarkService;
  /** Check runs on the headless driver (spec 039 owner answer 12). Without it the route answers 404. */
  checkRuns?: CheckRunDeps;
  /** The store, for a person's acceptance of τ or the classifier (owner answers 5, 14). */
  modelStore?: BetterSqlite3.Database;
  /** A confirmed A/B test's cookie into the portal's Hints (OV-2). Without it: not written. */
  addExperimentFlag?: AddFlag;
  /** Portals from the dashboard (spec 011); each throws `PortalRefusal`. Without it: 404. */
  portals?: PortalCommands;
  /** The Workbench (spec 043). Without it the Workbench routes answer 404. */
  workbench?: WorkbenchService;
}

type Route = (
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  path: string,
  url: URL,
) => Promise<boolean>;

/** Every resource's routes, in the order they are tried; the first that answers wins. */
function routesOf(opts: ApiOptions): Route[] {
  const modelDeps = opts.modelStore && { raw: opts.modelStore, addFlag: opts.addExperimentFlag };
  return [
    (req, res, method, path) => portalRoutes(req, res, method, path, opts.portals),
    (req, res, method, path) => conversationRoutes(req, res, method, path, opts),
    // Amendments with revisions (T030, T033; spec 022 contracts/amendments-api.md).
    (req, res, method, path) => amendmentRoutes(req, res, method, path, opts.amendments),
    (req, res, method, path) => proposalRoutes(req, res, method, path, opts.proposals),
    (req, res, method, path) => processRoutes(req, res, method, path, opts.processes),
    (req, res, method, path) => probeSuiteRoutes(req, res, method, path, opts.probeSuites),
    (req, res, method, path) => markRoutes(req, res, method, path, opts.marks),
    (req, res, method, path) => checkRunRoutes(req, res, method, path, opts.checkRuns),
    (req, res, method, path) => modelRoutes(req, res, method, path, modelDeps),
    (req, res, method, path) => workbenchRoutes(req, res, method, path, opts.workbench),
    (_req, res, method, path) => controlRoutes(res, method, path, opts),
  ];
}

export function createApi(opts: ApiOptions): Server {
  const routes = routesOf(opts);

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = req.method ?? 'GET';
    if (method === 'GET' && path === '/healthz') {
      sendJson(res, 200, { ok: true, agent: opts.service.agentStatus(), version: opts.version });
      return;
    }
    for (const r of routes) if (await r(req, res, method, path, url)) return;
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
      sendJson(res, status, { ...(error instanceof HttpError ? error.extra : {}), ref, message });
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
