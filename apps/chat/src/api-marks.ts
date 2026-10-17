// Mark routes of the chat service (spec 032 US5, design 11-map-runs §10 `POST/DELETE
// /portals/{p}/marks`): the dashboard's screen page posts the BA's Probe mark here.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError } from './http-error.js';
import { readJson, sendJson } from './http-io.js';
import type { MarkService } from './marks.js';

const ROUTE = /^\/portals\/([^/]+)\/marks$/;

/** Handles the request when it is a mark route; returns false otherwise. */
export async function markRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  path: string,
  marks: MarkService | undefined,
): Promise<boolean> {
  const m = ROUTE.exec(path);
  if (m === null) return false;
  if (marks === undefined) throw new HttpError(404, 'This address does not exist.');
  const portal = decodeURIComponent(m[1]!);
  if (method === 'POST') {
    const out = await marks.add(portal, await readJson(req));
    sendJson(res, out.created ? 201 : 200, out);
  } else if (method === 'DELETE') sendJson(res, 200, await marks.remove(portal, await readJson(req)));
  else throw new HttpError(405, 'This method is not allowed here.');
  return true;
}
