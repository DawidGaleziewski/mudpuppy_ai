// Confirming the BA's verdicts on differing states (spec 033 US4, contracts/reconcile-tools.md).
// The BA proposes (pathfinder-ba `propose_verdicts`); the owner confirms in Review, keeping or
// changing each verdict, and the dashboard posts here (it never writes itself). One verdict per
// outcome of the proposal; a proposal already confirmed or superseded is not confirmed again.

import { nowIso } from '@pathfinder/core';
import { ConfirmedVerdict } from '@pathfinder/docs-model';
import type { PathfinderDb } from '@pathfinder/store';
import { z } from 'zod';
import { HttpError } from './http-error.js';
import { parseBody } from './http-io.js';

const ConfirmBody = z
  .object({
    author: z.string().trim().min(1).max(200),
    verdicts: z.array(ConfirmedVerdict).min(1).max(40),
  })
  .strict();

export interface ReconciliationService {
  confirm(portal: string, id: string, body: unknown): Promise<{ id: string; status: 'confirmed' }>;
}

export function createReconciliationService(deps: { db: PathfinderDb }): ReconciliationService {
  return {
    async confirm(portal, id, raw) {
      const body = parseBody(ConfirmBody, raw);
      const row = await deps.db
        .selectFrom('reconciliations')
        .select(['status', 'proposal_json'])
        .where('id', '=', id)
        .where('portal_id', '=', portal)
        .executeTakeFirst();
      if (!row) throw new HttpError(404, `No proposal ${id} on ${portal}.`);
      if (row.status !== 'proposed')
        throw new HttpError(409, `This proposal is ${row.status}; open the latest one in Review.`);
      const proposed = (JSON.parse(row.proposal_json) as { state_id: string }[]).map(
        (v) => v.state_id,
      );
      const given = body.verdicts.map((v) => v.state_id);
      if (given.length !== proposed.length || !proposed.every((s) => given.includes(s)))
        throw new HttpError(400, 'Give one verdict for each outcome of the proposal.');
      const done = await deps.db
        .updateTable('reconciliations')
        .set({
          status: 'confirmed',
          confirmed_json: JSON.stringify(body.verdicts),
          confirmed_by: body.author,
          confirmed_at: nowIso(),
        })
        .where('id', '=', id)
        .where('status', '=', 'proposed')
        .executeTakeFirst();
      if (Number(done.numUpdatedRows) !== 1)
        throw new HttpError(409, 'Someone else changed this proposal; reload Review.');
      return { id, status: 'confirmed' };
    },
  };
}
