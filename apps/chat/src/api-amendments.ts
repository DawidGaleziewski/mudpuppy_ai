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

/** Handles the request when it is an amendment route; returns false otherwise. */
export async function amendmentRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  path: string,
  url: URL,
  amendments: AmendmentService | undefined,
): Promise<boolean> {
  const root = ROOT.exec(path);
  const one = ONE.exec(path);
  const action = ACTION.exec(path);
  if (root === null && one === null && action === null) return false;
  if (amendments === undefined) throw new HttpError(404, 'This address does not exist.');

  if (root !== null && method === 'POST') {
    const body = parseBody(AmendmentBody, await readJson(req, MAX_ATTACHMENT_BODY_BYTES));
    sendJson(res, 201, await amendments.create(decodeURIComponent(root[1]!), body));
    return true;
  }
  if (one !== null) {
    const portal = decodeURIComponent(one[1]!);
    const id = decodeURIComponent(one[2]!);
    if (method === 'DELETE') {
      const fromBody = (await readJson(req)) as Record<string, unknown>;
      const body = parseBody(DecideBody, { ...(decideFromQuery(url) as object), ...fromBody });
      sendJson(res, 200, await amendments.withdraw(portal, id, body));
      return true;
    }
    if (method === 'PATCH') {
      sendJson(
        res,
        200,
        await amendments.edit(portal, id, parseBody(EditBody, await readJson(req))),
      );
      return true;
    }
  }
  if (action !== null) {
    const portal = decodeURIComponent(action[1]!);
    const id = decodeURIComponent(action[2]!);
    const verb = action[3];
    if (method === 'GET' && verb === 'revisions') {
      sendJson(res, 200, await amendments.revisions(portal, id));
      return true;
    }
    if (method === 'POST' && (verb === 'reapply' || verb === 'reanchor')) {
      sendJson(
        res,
        200,
        await amendments.reapply(portal, id, parseBody(ReapplyBody, await readJson(req))),
      );
      return true;
    }
    if (method === 'POST' && verb === 'dismiss') {
      sendJson(
        res,
        200,
        await amendments.dismiss(portal, id, parseBody(DecideBody, await readJson(req))),
      );
      return true;
    }
    if (method === 'POST' && verb === 'restore') {
      sendJson(
        res,
        200,
        await amendments.restore(portal, id, parseBody(RestoreBody, await readJson(req))),
      );
      return true;
    }
  }
  throw new HttpError(405, 'This method is not allowed here.');
}
