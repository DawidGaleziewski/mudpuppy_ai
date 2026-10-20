// The BA's hypothesis tools (spec 039 design § 10.4, T055): `list_hypotheses`, `get_hypothesis`,
// `propose_hypothesis`, `add_hypothesis_test` and `list_deviations`. They replace spec 033's
// `list_differing_states` / `propose_verdicts`: a difference between scans is a deviation, its
// explanation a hypothesis with a test, and a person confirms (`pnpm model:decide`, Review).

import {
  addHypothesisTest,
  AgentHypothesisKind,
  EvidenceRefInput,
  getHypothesis,
  HypothesisInputError,
  HypothesisTestInput,
  listDeviations,
  listHypotheses,
  proposeHypothesis,
} from '@pathfinder/store';
import { HYPOTHESIS_STATUSES } from '@pathfinder/model';
import { z } from 'zod';
import type { BaContext } from '../../context.js';
import { ToolError, parseInput } from '../../errors.js';
import { assertNoPii, requireActiveSession } from './common.js';

/** Store refusals in the tool error shape the agent acts on. */
export function hypothesisError(e: unknown): never {
  if (e instanceof HypothesisInputError) throw new ToolError(e.code, e.message);
  throw e;
}

export const ListHypothesesInput = z
  .object({
    portal_id: z.string().min(1),
    status: z.enum(HYPOTHESIS_STATUSES).optional(),
    kind: z.string().min(1).optional(),
    limit: z.number().int().positive().max(200).optional(),
  })
  .strict();

export function listHypothesesTool(ctx: BaContext, raw: unknown) {
  const i = parseInput(ListHypothesesInput, raw);
  return {
    hypotheses: listHypotheses(ctx.raw, i.portal_id, {
      ...(i.status ? { status: i.status } : {}),
      ...(i.kind ? { kind: i.kind } : {}),
      ...(i.limit ? { limit: i.limit } : {}),
    }),
  };
}

export const GetHypothesisInput = z
  .object({ portal_id: z.string().min(1), key: z.string().regex(/^H-\d{4,}$/) })
  .strict();

export function getHypothesisTool(ctx: BaContext, raw: unknown) {
  const i = parseInput(GetHypothesisInput, raw);
  try {
    return getHypothesis(ctx.raw, i.portal_id, i.key);
  } catch (e) {
    return hypothesisError(e);
  }
}

export const ProposeHypothesisToolInput = z
  .object({
    session_id: z.string().min(1),
    portal_id: z.string().min(1),
    kind: AgentHypothesisKind,
    claim: z.string().trim().min(1).max(600),
    claim_json: z.record(z.string(), z.unknown()).optional(),
    evidence: z.array(EvidenceRefInput).min(1).max(30),
    tests: z.array(HypothesisTestInput).max(20).optional(),
  })
  .strict();

export function proposeHypothesisTool(ctx: BaContext, raw: unknown) {
  const i = parseInput(ProposeHypothesisToolInput, raw);
  const session = requireActiveSession(ctx, i.session_id);
  if (session.portal_id !== i.portal_id)
    throw new ToolError('PORTAL_MISMATCH', `session ${i.session_id} is on ${session.portal_id}`);
  assertNoPii(i.claim, 'claim');
  try {
    return proposeHypothesis(ctx.raw, {
      portal: i.portal_id,
      kind: i.kind,
      claim: i.claim,
      claim_json: i.claim_json ?? {},
      evidence: i.evidence,
      tests: i.tests ?? [],
      actor: 'ba-agent',
    });
  } catch (e) {
    return hypothesisError(e);
  }
}

export const AddHypothesisTestInput = z
  .object({
    session_id: z.string().min(1),
    portal_id: z.string().min(1),
    key: z.string().regex(/^H-\d{4,}$/),
    test: HypothesisTestInput,
  })
  .strict();

export function addHypothesisTestTool(ctx: BaContext, raw: unknown) {
  const i = parseInput(AddHypothesisTestInput, raw);
  requireActiveSession(ctx, i.session_id);
  try {
    return addHypothesisTest(ctx.raw, { portal: i.portal_id, key: i.key, test: i.test });
  } catch (e) {
    return hypothesisError(e);
  }
}

export const ListDeviationsInput = z
  .object({
    portal_id: z.string().min(1),
    status: z.enum(['open', 'waiting_test', 'explained']).optional(),
    limit: z.number().int().positive().max(200).optional(),
  })
  .strict();

export function listDeviationsTool(ctx: BaContext, raw: unknown) {
  const i = parseInput(ListDeviationsInput, raw);
  return {
    deviations: listDeviations(ctx.raw, i.portal_id, {
      ...(i.status ? { status: i.status } : {}),
      ...(i.limit ? { limit: i.limit } : {}),
    }),
  };
}
