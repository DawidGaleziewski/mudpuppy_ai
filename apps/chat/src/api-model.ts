// A person's decisions on the portal model from the dashboard (spec 039):
// - `POST /portals/{p}/model/accept`: accept the screen threshold or the similarity classifier
//   (owner answers 5 and 14; Settings ▸ Screen identity); the store computes the calibration and
//   refuses what is not ready. Same effect as `pnpm model:decide … accept-tau | accept-classifier`.
// - `POST /portals/{p}/model/decide`: confirm or reject a finding or rule (H-nnnn) from Review
//   (T100, designer screen v2-04), with the person's reason. Same effect as
//   `pnpm model:decide … confirm|reject`. Overturn waits for R-87.
// - `POST /portals/{p}/model/label`: a person's answer to "Same screen?" for two page versions
//   (designer screen v2-14): same screen, same with different data, or different screens. A
//   constraint for the next rebuild. Same effect as `pnpm model:decide … label`.

import type { IncomingMessage, ServerResponse } from 'node:http';
import type BetterSqlite3 from 'better-sqlite3';
import {
  ModelDecisionError,
  acceptClassifier,
  acceptTau,
  decideHypothesis,
  labelPair,
} from '@pathfinder/store';
import { z } from 'zod';
import { HttpError } from './http-error.js';
import { readJson, sendJson } from './http-io.js';

const ROUTE = /^\/portals\/([^/]+)\/model\/(accept|decide|label)$/;

/** Who decides (the dashboard's reviewer). */
const By = z.string().trim().min(1).max(200);

const AcceptBody = z
  .object({
    what: z.enum(['tau', 'classifier']),
    by: By,
    /** A fingerprint profile other than the portal's current one (`name@hash`). */
    profile: z.string().min(1).optional(),
  })
  .strict();

const DecideBody = z
  .object({
    /** The hypotheses decided together (a group of removals is one decision, UX-R24). */
    keys: z.array(z.string().regex(/^H-\d{4,}$/)).min(1).max(200),
    decision: z.enum(['confirm', 'reject']),
    by: By,
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();

const LabelBody = z
  .object({
    a: z.string().min(1).max(200),
    b: z.string().min(1).max(200),
    answer: z.enum(['same', 'same_data', 'different']),
    by: By,
    reason: z.string().trim().max(2000).optional(),
  })
  .strict();

/** The UI's answers in the label vocabulary (design § 6.3). */
const LABEL_OF = {
  same: { label: 'near_duplicate', ndKind: 'cosmetic' },
  same_data: { label: 'near_duplicate', ndKind: 'dynamic_data' },
  different: { label: 'distinct' },
} as const;

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new HttpError(400, parsed.error.issues.map((i) => i.message).join('; '));
  return parsed.data;
}

function accept(raw: BetterSqlite3.Database, portal: string, body: unknown): unknown {
  const { what, by, profile } = parse(AcceptBody, body);
  const opts = { by, ...(profile === undefined ? {} : { profile }) };
  return what === 'tau'
    ? { tau: acceptTau(raw, portal, opts) }
    : { classifier: acceptClassifier(raw, portal, opts) };
}

/** Every key in one transaction: a refused key decides none of them. */
function decide(raw: BetterSqlite3.Database, portal: string, body: unknown): unknown {
  const { keys, decision, by, reason } = parse(DecideBody, body);
  const decided = raw.transaction(() =>
    keys.map((key) => ({
      key,
      status: decideHypothesis(raw, { portal, key, decision, actor: by, reason }),
    })),
  )();
  return { decided };
}

function label(raw: BetterSqlite3.Database, portal: string, body: unknown): unknown {
  const { a, b, answer, by, reason } = parse(LabelBody, body);
  labelPair(raw, {
    portal,
    a,
    b,
    ...LABEL_OF[answer],
    actor: by,
    ...(reason ? { reason } : {}),
  });
  return { labelled: { a, b, answer } };
}

const HANDLERS = { accept, decide, label } as const;

/** Handles the request when it is a model route; returns false otherwise. */
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
  const body = await readJson(req);
  try {
    sendJson(res, 201, HANDLERS[m[2] as keyof typeof HANDLERS](raw, portal, body));
  } catch (error) {
    if (error instanceof ModelDecisionError) throw new HttpError(409, error.message);
    throw error;
  }
  return true;
}
