// A person's marks for the next scan (spec 032 US5, owner answer 3 of 2026-10-17; design
// 11-map-runs §6). Only Probe marks on form steps exist yet: "map the portal first and see what it
// has; once it is marked we can start probing it." A mark stays open until a probe scan uses it
// (the pathfinder server sets `used_by_run_id`) or the BA removes it here. The dashboard only reads.

import { newId, nowIso } from '@pathfinder/core';
import type { PathfinderDb } from '@pathfinder/store';
import { z } from 'zod';
import { HttpError } from './http-error.js';
import { parseBody } from './http-io.js';

const MarkBody = z
  .object({
    author: z.string().trim().min(1).max(200).default('BA'),
    kind: z.literal('probe', { error: 'only Probe marks exist yet' }),
    target_kind: z.literal('form_step', { error: 'a Probe mark goes on a form step' }),
    target_id: z.string().min(1),
  })
  .strict();

export interface MarkService {
  add(portal: string, body: unknown): Promise<{ id: string; created: boolean }>;
  remove(portal: string, body: unknown): Promise<{ removed: number }>;
}

export function createMarkService(deps: { db: PathfinderDb }): MarkService {
  const openMark = (portal: string, b: z.infer<typeof MarkBody>) =>
    deps.db
      .selectFrom('marks')
      .select('id')
      .where('portal_id', '=', portal)
      .where('kind', '=', b.kind)
      .where('target_kind', '=', b.target_kind)
      .where('target_id', '=', b.target_id)
      .where('used_by_run_id', 'is', null)
      .executeTakeFirst();
  return {
    async add(portal, raw) {
      const body = parseBody(MarkBody, raw);
      const step = await deps.db
        .selectFrom('form_steps')
        .select('id')
        .where('id', '=', body.target_id)
        .where('portal_id', '=', portal)
        .executeTakeFirst();
      if (!step) throw new HttpError(404, `No form step ${body.target_id} on ${portal}.`);
      const existing = await openMark(portal, body);
      if (existing) return { id: existing.id, created: false };
      const id = newId();
      await deps.db
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
      const r = await deps.db
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
