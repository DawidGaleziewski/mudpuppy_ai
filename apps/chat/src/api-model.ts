// A person's decisions on the portal model from the dashboard (spec 039):
// - `POST /portals/{p}/model/accept`: accept the screen threshold or the similarity classifier
//   (owner answers 5 and 14; Settings ▸ Screen identity); the store computes the calibration and
//   refuses what is not ready. Same effect as `pnpm model:decide … accept-tau | accept-classifier`.
// - `POST /portals/{p}/model/decide`: confirm or reject a finding or rule (H-nnnn) from Review
//   (T100, designer screen v2-04), with the person's reason. Same effect as
//   `pnpm model:decide … confirm|reject`. Overturn waits for R-87. Confirming an A/B test adds
//   its cookie to the portal's Hints (`model.experiment_flags`, owner answer OV-2).
// - `POST /portals/{p}/model/label`: a person's answer to "Same screen?" for two page versions
//   (designer screen v2-14): same screen, same with different data, or different screens. A
//   constraint for the next rebuild. Same effect as `pnpm model:decide … label`.
// - `POST /portals/{p}/model/undo`: Undo one decide command (all its keys), spec 040 T010.
// - `POST /portals/{p}/model/reword`: a person's sentence for a rule in the documentation (T014).

import type { IncomingMessage, ServerResponse } from 'node:http';
import type BetterSqlite3 from 'better-sqlite3';
import {
  ModelDecisionError,
  acceptClassifier,
  acceptTau,
  decideHypothesis,
  labelPair,
  rewordHypothesis,
  undoDecision,
} from '@pathfinder/store';
import { newId } from '@pathfinder/core';
import { z } from 'zod';
import { HttpError } from './http-error.js';
import { readJson, sendJson } from './http-io.js';
import type { ExperimentFlag } from './portals.js';

const ROUTE = /^\/portals\/([^/]+)\/model\/(accept|decide|label|undo|reword)$/;

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

const UndoBody = z.object({ decision: z.string().min(1).max(200), by: By }).strict();

const RewordBody = z
  .object({
    key: z.string().regex(/^H-\d{4,}$/),
    wording: z.string().trim().min(1).max(2000),
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

/** Adds a confirmed A/B test's flag to the portal's Hints; true when it was new (OV-2). */
export type AddFlag = (portal: string, flag: ExperimentFlag) => boolean;

/** The store the routes decide in, and where a confirmed A/B test's cookie goes. */
export interface ModelDeps {
  raw: BetterSqlite3.Database;
  addFlag?: AddFlag;
}

/**
 * Every key in one transaction: a refused key decides none of them. A confirmed A/B test adds
 * its cookie to the portal's Hints (owner answer OV-2), so later scans read the arm.
 */
function decide(
  raw: BetterSqlite3.Database,
  portal: string,
  body: unknown,
  addFlag?: AddFlag,
): unknown {
  const { keys, decision, by, reason } = parse(DecideBody, body);
  const decisionId = newId(); // one command, one Undo (designer § 5.4)
  const decided = raw.transaction(() =>
    keys.map((key) => ({
      key,
      status: decideHypothesis(raw, { portal, key, decision, actor: by, reason, decisionId }),
    })),
  )();
  if (decision !== 'confirm' || addFlag === undefined) return { decision: decisionId, decided };
  const hints = keys.flatMap((key) => {
    const flag = abFlagOf(raw, portal, key);
    return flag !== null && addFlag(portal, flag) ? [`${flag.kind} ${flag.name}`] : [];
  });
  return { decision: decisionId, decided, hints };
}

/** Undo one decide command. A hint a confirmed A/B test added stays (Settings ▸ Hints edits it). */
function undo(raw: BetterSqlite3.Database, portal: string, body: unknown): unknown {
  const { decision, by } = parse(UndoBody, body);
  return { undone: undoDecision(raw, { portal, decisionId: decision, actor: by }) };
}

function reword(raw: BetterSqlite3.Database, portal: string, body: unknown): unknown {
  const { key, wording, by, reason } = parse(RewordBody, body);
  rewordHypothesis(raw, { portal, key, wording, actor: by, ...(reason ? { reason } : {}) });
  return { reworded: { key, wording } };
}

/**
 * The flag that separates a confirmed A/B test: `cookie` or `storage` in an agent's claim, or rule
 * R5's note "separated by cookie:NAME" on the hypothesis's first event; null for any other
 * hypothesis.
 */
function abFlagOf(raw: BetterSqlite3.Database, portal: string, key: string): ExperimentFlag | null {
  const row = raw
    .prepare(
      `SELECT h.claim_json, e.reason FROM hypotheses h JOIN hypothesis_events e
         ON e.hypothesis_id = h.id
       WHERE h.portal_id = ? AND h.key = ? AND h.kind = 'ab_test' ORDER BY e.at, e.id LIMIT 1`,
    )
    .get(portal, key) as { claim_json: string; reason: string | null } | undefined;
  if (row === undefined) return null;
  const claim = JSON.parse(row.claim_json) as Record<string, unknown>;
  for (const kind of ['cookie', 'storage'] as const) {
    const name = claim[kind];
    if (typeof name === 'string' && name.length > 0) return { kind, name };
  }
  const m = /separated by (cookie|storage):(\S+)/.exec(row.reason ?? '');
  return m === null ? null : { kind: m[1] as ExperimentFlag['kind'], name: m[2]! };
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

const HANDLERS = { accept, decide, label, undo, reword } as const;

/** Handles the request when it is a model route; returns false otherwise. */
export async function modelRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  path: string,
  deps: ModelDeps | undefined,
): Promise<boolean> {
  const m = ROUTE.exec(path);
  if (m === null) return false;
  if (deps === undefined) throw new HttpError(404, 'This address does not exist.');
  const { raw, addFlag } = deps;
  if (method !== 'POST') throw new HttpError(405, 'This method is not allowed here.');
  const portal = decodeURIComponent(m[1]!);
  const body = await readJson(req);
  try {
    sendJson(res, 201, HANDLERS[m[2] as keyof typeof HANDLERS](raw, portal, body, addFlag));
  } catch (error) {
    if (error instanceof ModelDecisionError) throw new HttpError(409, error.message);
    throw error;
  }
  return true;
}
