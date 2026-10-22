import { nowIso } from '@pathfinder/core';
import type { ServerContext } from '../context.js';

/**
 * Probe marks (spec 032 US5, owner answer 3 of 2026-10-17): a person marks form steps for probing
 * after a map scan; a form-probing run probes only those. The chat service writes the marks; a
 * form-probing run uses them.
 */
export interface ProbeMarkItem {
  mark_id: string;
  form_step_id: string;
  route: string;
  step_index: number;
  label: string;
  /** A URL a page of the step was seen on: where the crawler opens the form. */
  url: string | null;
}

/** The portal's open Probe marks on form steps, in route and step order. */
export async function openProbeMarks(
  ctx: ServerContext,
  portalId: string,
): Promise<ProbeMarkItem[]> {
  const rows = await ctx.db
    .selectFrom('marks as m')
    .innerJoin('form_steps as f', 'f.id', 'm.form_step_id')
    .select([
      'm.id as mark_id',
      'f.id as form_step_id',
      'f.route_template',
      'f.step_index',
      'f.label',
    ])
    .where('m.portal_id', '=', portalId)
    .where('m.kind', '=', 'probe')
    .where('m.used_by_run_id', 'is', null)
    .orderBy('f.route_template')
    .orderBy('f.step_index')
    .execute();
  const out: ProbeMarkItem[] = [];
  for (const r of rows) {
    const visit = await ctx.db
      .selectFrom('observations as v')
      .innerJoin('states as s', 's.id', 'v.state_id')
      .select('v.url')
      .where('s.form_step_id', '=', r.form_step_id)
      .orderBy('v.created_at')
      .limit(1)
      .executeTakeFirst();
    out.push({
      mark_id: r.mark_id,
      form_step_id: r.form_step_id,
      route: r.route_template,
      step_index: r.step_index,
      label: r.label,
      url: visit?.url ?? null,
    });
  }
  return out;
}

/** The open Probe mark on a form step, or null when the step is not marked. */
export async function probeMarkOf(
  ctx: ServerContext,
  portalId: string,
  formStepId: string,
): Promise<string | null> {
  const row = await ctx.db
    .selectFrom('marks')
    .select('id')
    .where('portal_id', '=', portalId)
    .where('kind', '=', 'probe')
    .where('origin', '=', 'person')
    .where('form_step_id', '=', formStepId)
    .where('used_by_run_id', 'is', null)
    .executeTakeFirst();
  return row?.id ?? null;
}

/** The form-probing run probed the step to its end: the mark is used and leaves the open list. */
export async function useProbeMark(
  ctx: ServerContext,
  markId: string,
  runId: string,
): Promise<void> {
  await ctx.db
    .updateTable('marks')
    .set({ used_by_run_id: runId, used_at: nowIso() })
    .where('id', '=', markId)
    .where('used_by_run_id', 'is', null)
    .execute();
}
