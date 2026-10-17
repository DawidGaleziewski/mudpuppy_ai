// `list_differing_states` and `propose_verdicts` (spec 033 US3, contracts/reconcile-tools.md):
// the BA reads the groups of differing states with their evidence and the verdicts already
// proposed or confirmed, and proposes one verdict per outcome. A proposal stores the group as the
// BA saw it (its snapshot), so Review shows exactly what was reasoned about; the owner confirms it
// through the chat service (D-2). A newer proposal for the same group supersedes the open one.

import { newId, nowIso } from '@pathfinder/core';
import { Hypothesis, ProposedVerdict, Verdict } from '@pathfinder/docs-model';
import { z } from 'zod';
import type { BaContext } from '../../context.js';
import { ToolError, parseInput } from '../../errors.js';
import { assertNoPii, inTransaction, json, requireActiveSession } from './common.js';
import { differingStates, type DifferingGroup } from './differing-states.js';

export const ListDifferingStatesInput = z
  .object({ portal_id: z.string().min(1), route: z.string().min(1).optional() })
  .strict();

export const ProposeVerdictsInput = z
  .object({
    session_id: z.string().min(1),
    portal_id: z.string().min(1),
    group_key: z.string().min(1),
    verdicts: z.array(ProposedVerdict).min(1).max(40),
  })
  .strict();

interface ReconciliationRead {
  id: string;
  group_key: string;
  status: string;
  proposal_json: string;
  proposed_at: string;
  confirmed_json: string | null;
  confirmed_by: string | null;
}

/** The newest reconciliation of each group key of a portal (confirmed or open). */
function latestByKey(ctx: BaContext, portal: string): Map<string, ReconciliationRead> {
  const rows = ctx.raw
    .prepare(
      `SELECT id, group_key, status, proposal_json, proposed_at, confirmed_json, confirmed_by
         FROM reconciliations WHERE portal_id = ? AND status <> 'superseded'
        ORDER BY proposed_at, id`,
    )
    .all(portal) as ReconciliationRead[];
  return new Map(rows.map((r) => [r.group_key, r]));
}

export function listDifferingStates(ctx: BaContext, raw: unknown) {
  const input = parseInput(ListDifferingStatesInput, raw);
  const known = latestByKey(ctx, input.portal_id);
  const groups = differingStates(ctx, input.portal_id, input.route).map((g) => {
    const r = known.get(g.key);
    return {
      ...g,
      reconciliation: r
        ? {
            id: r.id,
            status: r.status,
            proposed: json(r.proposal_json),
            confirmed: r.confirmed_json ? json(r.confirmed_json) : null,
            confirmed_by: r.confirmed_by,
          }
        : null,
    };
  });
  return { groups, verdicts: Verdict.options, hypotheses: Hypothesis.options };
}

/** Exactly one verdict per outcome state of the group (FR-015). */
function checkCovers(group: DifferingGroup, stateIds: string[]): void {
  const want = new Set(group.outcomes.map((o) => o.state_id));
  const given = new Set(stateIds);
  const missing = [...want].filter((s) => !given.has(s));
  const extra = [...given].filter((s) => !want.has(s));
  if (missing.length || extra.length || given.size !== stateIds.length)
    throw new ToolError(
      'VERDICTS_INCOMPLETE',
      'give exactly one verdict per outcome state of the group',
      { missing, not_in_group: extra, outcome_states: [...want] },
    );
}

export function proposeVerdicts(ctx: BaContext, raw: unknown) {
  const input = parseInput(ProposeVerdictsInput, raw);
  const session = requireActiveSession(ctx, input.session_id);
  if (session.portal_id !== input.portal_id)
    throw new ToolError('SCHEMA_INVALID', `session ${session.id} is for ${session.portal_id}`, {
      field: 'portal_id',
    });
  const group = differingStates(ctx, input.portal_id).find((g) => g.key === input.group_key);
  if (!group)
    throw new ToolError('GROUP_UNKNOWN', `no differing-states group ${input.group_key} now`, {
      group_key: input.group_key,
    });
  checkCovers(
    group,
    input.verdicts.map((v) => v.state_id),
  );
  // Only the reasons are free text; state ids are UUIDs, which the token rule would flag (F-07).
  assertNoPii(
    input.verdicts.map((v) => v.reason),
    'verdicts.reason',
  );
  const id = newId();
  return inTransaction(ctx, () => {
    const open = ctx.raw
      .prepare(
        `SELECT id FROM reconciliations WHERE portal_id = ? AND group_key = ? AND status = 'proposed'`,
      )
      .get(input.portal_id, input.group_key) as { id: string } | undefined;
    if (open)
      ctx.raw.prepare(`UPDATE reconciliations SET status = 'superseded' WHERE id = ?`).run(open.id);
    ctx.raw
      .prepare(
        `INSERT INTO reconciliations (id, portal_id, group_key, group_kind, snapshot_json,
           proposal_json, proposed_by, proposed_at, status, confirmed_json, confirmed_by, confirmed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'proposed', NULL, NULL, NULL)`,
      )
      .run(
        id,
        input.portal_id,
        group.key,
        group.kind,
        JSON.stringify(group),
        JSON.stringify(input.verdicts),
        input.session_id,
        nowIso(),
      );
    return { id, status: 'proposed', superseded: open?.id ?? null };
  });
}
