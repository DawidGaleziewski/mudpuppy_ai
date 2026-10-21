// Check-run routes of the chat service (spec 039 owner answer 12): the dashboard's button posts
// here (`POST /portals/{p}/check-runs`); `GET` answers the check run still running, if any.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { runningCheckRun, startCheckRun, type CheckRunDeps } from './check-runs.js';
import { HttpError } from './http-error.js';
import { readJson, sendJson } from './http-io.js';

const ROUTE = /^\/portals\/([^/]+)\/check-runs$/;

/** Handles the request when it is a check-run route; returns false otherwise. */
export async function checkRunRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  path: string,
  deps: CheckRunDeps | undefined,
): Promise<boolean> {
  const m = ROUTE.exec(path);
  if (m === null) return false;
  if (deps === undefined) throw new HttpError(404, 'This address does not exist.');
  const portal = decodeURIComponent(m[1]!);
  if (method === 'POST') sendJson(res, 201, startCheckRun(deps, portal, await readJson(req)));
  else if (method === 'GET') sendJson(res, 200, { running: runningCheckRun(deps, portal) });
  else throw new HttpError(405, 'This method is not allowed here.');
  return true;
}
