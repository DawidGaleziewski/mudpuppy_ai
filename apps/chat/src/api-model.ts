// A person's acceptance of the portal model's screen threshold or similarity classifier (spec 039
// owner answers 5 and 14): the dashboard's Settings ▸ Screen identity posts here
// (`POST /portals/{p}/model/accept`); the store computes the calibration and refuses what is not
// ready. Same effect as `pnpm model:decide … accept-tau | accept-classifier`.

import type { IncomingMessage, ServerResponse } from 'node:http';
import type BetterSqlite3 from 'better-sqlite3';
import { ModelDecisionError, acceptClassifier, acceptTau } from '@pathfinder/store';
import { z } from 'zod';
import { HttpError } from './http-error.js';
import { readJson, sendJson } from './http-io.js';

const ROUTE = /^\/portals\/([^/]+)\/model\/accept$/;

const AcceptBody = z
  .object({
    what: z.enum(['tau', 'classifier']),
    /** Who accepts (the dashboard's reviewer). */
    by: z.string().trim().min(1).max(200),
    /** A fingerprint profile other than the portal's current one (`name@hash`). */
    profile: z.string().min(1).optional(),
  })
  .strict();

/** Handles the request when it is the accept route; returns false otherwise. */
export async function modelRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  path: string,
  raw: BetterSqlite3.Database | undefined,
): Promise<boolean> {
  const m = ROUTE.exec(path);
  if (m === null) return false;
  if (raw === undefined) throw new HttpError(404, 'This address does not exist.');
  if (method !== 'POST') throw new HttpError(405, 'This method is not allowed here.');
  const portal = decodeURIComponent(m[1]!);
  const body = AcceptBody.safeParse(await readJson(req));
  if (!body.success) throw new HttpError(400, body.error.issues.map((i) => i.message).join('; '));
  const { what, by, profile } = body.data;
  const opts = { by, ...(profile === undefined ? {} : { profile }) };
  try {
    sendJson(
      res,
      201,
      what === 'tau'
        ? { tau: acceptTau(raw, portal, opts) }
        : { classifier: acceptClassifier(raw, portal, opts) },
    );
  } catch (error) {
    if (error instanceof ModelDecisionError) throw new HttpError(409, error.message);
    throw error;
  }
  return true;
}
