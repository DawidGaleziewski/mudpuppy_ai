// A person's marks for the next scan (spec 032 US5; spec 034 R-66; design 11-map-runs §6): Probe on a
// form step, and Start here, Focus, Retry, Recheck and Skip on a screen's state or an action (transition).
// A mark stays open until a scan uses it (the pathfinder server sets `used_by_run_id`) or the BA
// removes it here. The dashboard only reads.

import { newId, nowIso } from '@pathfinder/core';
import type { PathfinderDb } from '@pathfinder/store';
import { z } from 'zod';
import { HttpError } from './http-error.js';
import { parseBody } from './http-io.js';

/** Which targets each kind of mark goes on (design §6 table "Mark | On"). */
export const MARK_TARGETS = {
  start: ['state'],
  focus: ['state', 'transition'],
  probe: ['form_step'],
  retry: ['state', 'transition'],
  recheck: ['state'],
  skip: ['state', 'transition'],
} as const satisfies Record<string, readonly ('state' | 'transition' | 'form_step')[]>;
export type MarkKind = keyof typeof MARK_TARGETS;

const MarkBody = z
  .object({
    author: z.string().trim().min(1).max(200).default('BA'),
    kind: z.enum(Object.keys(MARK_TARGETS) as [MarkKind, ...MarkKind[]]),
    target_kind: z.enum(['form_step', 'state', 'transition']),
    target_id: z.string().min(1),
  })
  .strict()
  .refine((b) => (MARK_TARGETS[b.kind] as readonly string[]).includes(b.target_kind), {
    message: 'this mark does not go on that target (Probe: a form step; Start here, Recheck: a screen; Focus, Retry, Skip: a screen or an action)',
    path: ['target_kind'],
  });
type MarkBody = z.infer<typeof MarkBody>;

export interface MarkService {
  add(portal: string, body: unknown): Promise<{ id: string; created: boolean }>;
  remove(portal: string, body: unknown): Promise<{ removed: number }>;
}

const TARGET_NAMES = { form_step: 'form step', state: 'screen state', transition: 'action' } as const;

export function createMarkService(deps: { db: PathfinderDb }): MarkService {
  const { db } = deps;
  const openMark = (portal: string, b: MarkBody) =>
    db
      .selectFrom('marks')
      .select('id')
      .where('portal_id', '=', portal)
      .where('kind', '=', b.kind)
      .where('target_kind', '=', b.target_kind)
      .where('target_id', '=', b.target_id)
      .where('used_by_run_id', 'is', null)
      .executeTakeFirst();
  /** The target exists on this portal: a form step, a state, or a transition from one of its states. */
  const targetExists = async (portal: string, b: MarkBody): Promise<boolean> => {
    if (b.target_kind === 'form_step')
      return (
        (await db
          .selectFrom('form_steps')
          .select('id')
          .where('id', '=', b.target_id)
          .where('portal_id', '=', portal)
          .executeTakeFirst()) !== undefined
      );
    if (b.target_kind === 'state')
      return (
        (await db
          .selectFrom('states')
          .select('id')
          .where('id', '=', b.target_id)
          .where('portal_id', '=', portal)
          .executeTakeFirst()) !== undefined
      );
    return (
      (await db
        .selectFrom('transitions as e')
        .innerJoin('states as s', 's.id', 'e.from_state')
        .select('e.id')
        .where('e.id', '=', b.target_id)
        .where('s.portal_id', '=', portal)
        .executeTakeFirst()) !== undefined
    );
  };
  return {
    async add(portal, raw) {
      const body = parseBody(MarkBody, raw);
      if (!(await targetExists(portal, body)))
        throw new HttpError(404, `No ${TARGET_NAMES[body.target_kind]} ${body.target_id} on ${portal}.`);
      const existing = await openMark(portal, body);
      if (existing) return { id: existing.id, created: false };
      const id = newId();
      await db
        .insertInto('marks')
        .values({
          id,
          portal_id: portal,
          kind: body.kind,
          target_kind: body.target_kind,
          target_id: body.target_id,
          created_by: body.author,
          created_at: nowIso(),
          used_by_run_id: null,
          used_at: null,
        })
        .execute();
      return { id, created: true };
    },
    async remove(portal, raw) {
      const body = parseBody(MarkBody, raw);
      const r = await db
        .deleteFrom('marks')
        .where('portal_id', '=', portal)
        .where('kind', '=', body.kind)
        .where('target_kind', '=', body.target_kind)
        .where('target_id', '=', body.target_id)
        .where('used_by_run_id', 'is', null)
        .executeTakeFirst();
      return { removed: Number(r.numDeletedRows) };
    },
  };
}
