// Route of the chat service for differing states (spec 033 US4): the dashboard's Review posts the
// owner's confirmed verdicts here, `POST /portals/{p}/reconciliations/{id}/confirm`.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError } from './http-error.js';
import { readJson, sendJson } from './http-io.js';
import type { ReconciliationService } from './reconciliations.js';

const ROUTE = /^\/portals\/([^/]+)\/reconciliations\/([^/]+)\/confirm$/;

/** Handles the request when it is the confirm route; returns false otherwise. */
export async function reconciliationRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  path: string,
  service: ReconciliationService | undefined,
): Promise<boolean> {
  const m = ROUTE.exec(path);
  if (m === null) return false;
  if (service === undefined) throw new HttpError(404, 'This address does not exist.');
  if (method !== 'POST') throw new HttpError(405, 'This method is not allowed here.');
  const portal = decodeURIComponent(m[1]!);
  const id = decodeURIComponent(m[2]!);
  sendJson(res, 200, await service.confirm(portal, id, await readJson(req)));
  return true;
}
