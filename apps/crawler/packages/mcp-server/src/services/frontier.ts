import { FrontierItemStatus, SafetyClass, newId, nowIso } from '@mudpuppy/core';
import { z } from 'zod';
import type { ServerContext } from '../context.js';
import { parseInput } from '../errors.js';
import { assertRunActive, getRun } from './common.js';
import { isBudgetExhausted } from './run-budget.js';
import { nextPendingRow } from './frontier-order.js';
import { inferSameTarget } from './same-target.js';
import { inferSharedButton } from './shared-button.js';
import { linkPath } from './link-path.js';

export const AddFrontierItemInput = z
  .object({
    run_id: z.string().min(1),
    state_id: z.string().min(1),
    action_id: z.string().min(1).nullable().default(null),
    /** Descriptor for the item; for navigate refusals `{ kind: "navigate", url }`. */
    action: z.record(z.string(), z.unknown()),
    safety_class: SafetyClass,
    status: FrontierItemStatus,
    reason: z.string().trim().min(1).nullable().default(null),
    priority: z.number().int().default(0),
    depth: z.number().int().nonnegative().default(0),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.status !== 'pending' && v.status !== 'done' && v.reason === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'required for every skip status (FR-010)',
      });
    }
  });

/** Queue a pending item or record a skipped one; both live in the same table (data/schema/README.md). */
export async function addFrontierItem(
  ctx: ServerContext,
  raw: unknown,
): Promise<{ frontier_id: string }> {
  const input = parseInput(AddFrontierItemInput, raw);
  await getRun(ctx, input.run_id);
  const id = newId();
  const ts = nowIso();
  await ctx.db
    .insertInto('frontier')
    .values({
      id,
      run_id: input.run_id,
      state_id: input.state_id,
      action_id: input.action_id,
      action_json: JSON.stringify(input.action),
      safety_class: input.safety_class,
      status: input.status,
      priority: input.priority,
      depth: input.depth,
      reason: input.reason,
      created_at: ts,
      updated_at: ts,
    })
    .execute();
  return { frontier_id: id };
}

function describe(actionJson: string): string {
  try {
    const a = JSON.parse(actionJson) as {
      kind?: string;
      url?: string;
      role?: string;
      accessible_name?: string | null;
      href?: string;
      label?: string;
    };
    if (a.kind === 'navigate' && a.url) return `navigate to ${a.url}`;
    // An unnamed link says where it goes, an unnamed field what it is labelled: a bare "link"
    // gave the agent no reason to open the bank's icon link to szczegoly.do (spec 038, S11).
    if (!a.accessible_name && a.role === 'link' && a.href) {
      const to = linkPath(a.href);
      if (to) return `link (no name) to ${to}`;
    }
    if (!a.accessible_name && a.role && a.label)
      return `${a.role} labelled ${JSON.stringify(a.label)}`;
    return (
      [a.role, a.accessible_name ? JSON.stringify(a.accessible_name) : null]
        .filter(Boolean)
        .join(' ') || 'action'
    );
  } catch {
    return 'action';
  }
}

/** What `get_next_frontier_item` returns, and what map-mode results carry as `next`. */
export type NextFrontierItem =
  | {
      item: {
        frontier_id: string;
        state_id: string;
        action_id: string | null;
        description: string;
      };
    }
  | { item: null; reason: 'empty' | 'budget_exhausted' };

/**
 * Links to route templates the run has not visited first, then highest priority, then oldest id
 * (UUIDv7 = FIFO; tiers in `frontier-order.ts`, spec 026). `act` moves the handed-out row on;
 * link items whose target the run already reached are settled here as inferred instead (spec 013
 * US2).
 */
export async function getNextFrontierItem(
  ctx: ServerContext,
  raw: unknown,
): Promise<NextFrontierItem> {
  const input = parseInput(z.object({ run_id: z.string().min(1) }).strict(), raw);
  const run = await assertRunActive(ctx, input.run_id);
  const nextPending = () => nextPendingRow(ctx, input.run_id);
  let next = await nextPending();
  const settled = async (row: Parameters<typeof inferSameTarget>[1]) =>
    (await inferSameTarget(ctx, row)) || (await inferSharedButton(ctx, row));
  while (next && (await settled(next.row))) next = await nextPending();
  const row = next?.row;
  const pick = async (attrs: Record<string, unknown>): Promise<void> => {
    if (ctx.tracer.level === 'off') return;
    const { n } = await ctx.db
      .selectFrom('frontier')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('run_id', '=', input.run_id)
      .where('status', '=', 'pending')
      .executeTakeFirstOrThrow();
    ctx.tracer.event('frontier_pick', { ...attrs, pending: Number(n) });
  };
  if (!row) {
    const reason = (await isBudgetExhausted(ctx, run))
      ? ('budget_exhausted' as const)
      : ('empty' as const);
    await pick({ reason });
    return { item: null, reason };
  }
  if (await isBudgetExhausted(ctx, run)) {
    await pick({ reason: 'budget_exhausted' });
    return { item: null, reason: 'budget_exhausted' as const };
  }
  await pick({
    frontier_id: row.id,
    priority: row.priority,
    depth: row.depth,
    tier: next?.tier,
  });
  return {
    item: {
      frontier_id: row.id,
      state_id: row.state_id,
      action_id: row.action_id,
      description: describe(row.action_json),
    },
  };
}
