// Probe suite routes of the chat service (spec 032 US3): the dashboard's Review posts the owner's
// decision here; the dashboard itself never writes.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError } from './http-error.js';
import { readJson, sendJson } from './http-io.js';
import type { ProbeSuiteService } from './probe-suites.js';

const ROUTE = /^\/portals\/([^/]+)\/probe-suites\/([^/]+)\/(approve|dismiss|edit)$/;

/** Handles the request when it is a probe suite route; returns false otherwise. */
export async function probeSuiteRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  path: string,
  suites: ProbeSuiteService | undefined,
): Promise<boolean> {
  const m = ROUTE.exec(path);
  if (m === null) return false;
  if (suites === undefined) throw new HttpError(404, 'This address does not exist.');
  if (method !== 'POST') throw new HttpError(405, 'This method is not allowed here.');
  const [portal, id, verb] = [decodeURIComponent(m[1]!), decodeURIComponent(m[2]!), m[3]!];
  const body = await readJson(req);
  switch (verb) {
    case 'approve':
      sendJson(res, 200, await suites.approve(portal, id, body));
      break;
    case 'edit':
      sendJson(res, 200, await suites.edit(portal, id, body));
      break;
    default:
      sendJson(res, 200, await suites.dismiss(portal, id, body));
  }
  return true;
}
