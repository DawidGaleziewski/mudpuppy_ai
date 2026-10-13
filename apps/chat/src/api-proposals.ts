// Proposal routes of the chat service (spec 022 R6, FE-A04): a person applies, discards or undoes
// what the assistant proposed. Applying on a moved head answers 409 STALE_PROPOSAL.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError } from './http-error.js';
import { parseBody, readJson, sendJson } from './http-io.js';
import { DecideProposalBody, type ProposalService } from './proposal-service.js';

const ACTION = /^\/portals\/([^/]+)\/proposals\/([^/]+)\/(apply|discard|undo)$/;

/** Handles the request when it is a proposal route; returns false otherwise. */
export async function proposalRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  path: string,
  proposals: ProposalService | undefined,
): Promise<boolean> {
  const action = ACTION.exec(path);
  if (action === null) return false;
  if (proposals === undefined) throw new HttpError(404, 'This address does not exist.');
  if (method !== 'POST') throw new HttpError(405, 'This method is not allowed here.');
  const portal = decodeURIComponent(action[1]!);
  const id = decodeURIComponent(action[2]!);
  const body = parseBody(DecideProposalBody, await readJson(req));
  const verb = action[3] as 'apply' | 'discard' | 'undo';
  sendJson(res, 200, await proposals[verb](portal, id, body));
  return true;
}
