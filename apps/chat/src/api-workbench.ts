// Workbench routes of the chat service (spec 043, contracts/workbench-http.md). The dashboard
// calls them server-side; the words lane streams on the conversation's usual
// `GET /conversations/{c}/events` (the wb_* events).

import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError } from './http-error.js';
import { readJson, sendJson } from './http-io.js';
import type { Body, WorkbenchService } from './workbench-service.js';

type Handler = (wb: WorkbenchService, id: string, body: Body) => unknown;

/** POST routes in order: [pattern, status, handler]; `id` is the first group, or ''. */
const POSTS: [RegExp, number, Handler][] = [
  [/^\/workbench\/conversations$/, 201, (wb, _id, body) => wb.createConversation(body)],
  [/^\/workbench\/conversations\/([^/]+)\/turns$/, 202, (wb, id, body) => wb.turn(id, body)],
  [/^\/workbench\/conversations\/([^/]+)\/path$/, 200, (wb, id, body) => wb.setPath(id, body)],
  [/^\/workbench\/commands$/, 201, (wb, _id, body) => wb.proposeFromButton(body)],
  [/^\/workbench\/commands\/([^/]+)\/token$/, 200, (wb, id) => wb.token(id)],
  [/^\/workbench\/commands\/([^/]+)\/confirm$/, 200, (wb, id, body) => wb.confirm(id, body)],
  [/^\/workbench\/commands\/([^/]+)\/cancel$/, 200, (wb, id) => wb.cancel(id)],
  [/^\/workbench\/views\/([^/]+)\/feedback$/, 200, (wb, id, body) => wb.feedback(id, body)],
];

async function bodyOf(req: IncomingMessage): Promise<Body> {
  const parsed = await readJson(req);
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Body)
    : {};
}

/** Handles the request when it is a Workbench route; returns false otherwise. */
export async function workbenchRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  path: string,
  workbench: WorkbenchService | undefined,
): Promise<boolean> {
  if (!path.startsWith('/workbench/')) return false;
  if (workbench === undefined) throw new HttpError(404, 'This address does not exist.');
  if (method === 'GET' && path === '/workbench/usage') {
    sendJson(res, 200, workbench.usage());
    return true;
  }
  if (method !== 'POST') throw new HttpError(405, 'This method is not allowed here.');
  for (const [pattern, status, handle] of POSTS) {
    const m = pattern.exec(path);
    if (m === null) continue;
    const id = m[1] === undefined ? '' : decodeURIComponent(m[1]);
    sendJson(res, status, await handle(workbench, id, await bodyOf(req)));
    return true;
  }
  throw new HttpError(404, 'This address does not exist.');
}
