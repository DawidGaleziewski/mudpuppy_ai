// Amendment routes of the chat service (R-30 T030, T033; spec 022 contracts/amendments-api.md).
// Every write is one revision; a stale `base_rev` answers 409 STALE_REVISION with the latest head.

import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  AmendmentBody,
  DecideBody,
  EditBody,
  MAX_ATTACHMENT_BYTES,
  ReapplyBody,
  RestoreBody,
  type AmendmentService,
} from './amendments.js';
import { HttpError } from './http-error.js';
import { parseBody, readJson, sendJson } from './http-io.js';

/** Base64 inflates by a third; leave room for the JSON around it. */
const MAX_ATTACHMENT_BODY_BYTES = Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 64 * 1024;

const ROOT = /^\/portals\/([^/]+)\/amendments$/;
const ONE = /^\/portals\/([^/]+)\/amendments\/([^/]+)$/;
const ACTION =
  /^\/portals\/([^/]+)\/amendments\/([^/]+)\/(reapply|reanchor|dismiss|restore|revisions)$/;

/** `author` and `base_rev` from the query string (the dashboard's withdraw button has no body). */
function decideFromQuery(url: URL): unknown {
  const base = url.searchParams.get('base_rev');
  return {
    ...(url.searchParams.get('author') ? { author: url.searchParams.get('author') } : {}),
    ...(base !== null && /^\d+$/.test(base) ? { base_rev: Number(base) } : {}),
  };
}

/** One amendment's write or read: `portal`, `id`, the request (for its body or query). */
type Act = (
  s: AmendmentService,
  portal: string,
  id: string,
  req: IncomingMessage,
) => Promise<unknown>;

const reapply: Act = async (s, portal, id, req) =>
  s.reapply(portal, id, parseBody(ReapplyBody, await readJson(req)));

/** `METHOD verb` (on `/amendments/{id}/{verb}`) or `METHOD` (on `/amendments/{id}`). */
const ACTS: Record<string, Act> = {
  'GET revisions': (s, portal, id) => s.revisions(portal, id),
  'POST reapply': reapply,
  'POST reanchor': reapply,
  'POST dismiss': async (s, portal, id, req) =>
    s.dismiss(portal, id, parseBody(DecideBody, await readJson(req))),
  'POST restore': async (s, portal, id, req) =>
    s.restore(portal, id, parseBody(RestoreBody, await readJson(req))),
  PATCH: async (s, portal, id, req) =>
    s.edit(portal, id, parseBody(EditBody, await readJson(req))),
  DELETE: async (s, portal, id, req) => {
    const fromBody = (await readJson(req)) as Record<string, unknown>;
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    return s.withdraw(
      portal,
      id,
      parseBody(DecideBody, { ...(decideFromQuery(url) as object), ...fromBody }),
    );
  },
};

/** Handles the request when it is an amendment route; returns false otherwise. */
export async function amendmentRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  path: string,
  amendments: AmendmentService | undefined,
): Promise<boolean> {
  const root = ROOT.exec(path);
  const item = ACTION.exec(path) ?? ONE.exec(path);
  if (root === null && item === null) return false;
  if (amendments === undefined) throw new HttpError(404, 'This address does not exist.');

  if (root !== null && method === 'POST') {
    const body = parseBody(AmendmentBody, await readJson(req, MAX_ATTACHMENT_BODY_BYTES));
    sendJson(res, 201, await amendments.create(decodeURIComponent(root[1]!), body));
    return true;
  }
  const act = item === null ? undefined : ACTS[item[3] ? `${method} ${item[3]}` : method];
  if (item === null || act === undefined)
    throw new HttpError(405, 'This method is not allowed here.');
  const portal = decodeURIComponent(item[1]!);
  sendJson(res, 200, await act(amendments, portal, decodeURIComponent(item[2]!), req));
  return true;
}
