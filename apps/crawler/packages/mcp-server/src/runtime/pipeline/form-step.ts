import { newId, nowIso, type StateKind } from '@pathfinder/core';
import {
  canonicalizeAria,
  errorSignals,
  FormStepIndex,
  formControls,
  hasErrors,
  type FormStep,
  type StepAssignment,
} from '@pathfinder/fingerprint';
import type { ServerContext } from '../../context.js';
import type { RunRow } from '../../services/index.js';
import type { RunState } from '../run-state.js';
import { event, type Report } from './context.js';

/** A state's place in a form flow (spec 032 US1): its step on the route, and its kind. */
export interface FormStepOf {
  stepId: string | null;
  kind: StateKind;
  assignment: StepAssignment | null;
}

/** The portal's stored steps, loaded once per run so step numbers hold across runs. */
async function stepsOf(ctx: ServerContext, rs: RunState, portalId: string): Promise<FormStepIndex> {
  if (rs.formSteps) return rs.formSteps;
  const rows = await ctx.db
    .selectFrom('form_steps')
    .selectAll()
    .where('portal_id', '=', portalId)
    .orderBy('step_index')
    .execute();
  const known: FormStep[] = rows.map((r) => ({
    id: r.id,
    routeTemplate: r.route_template,
    stepIndex: r.step_index,
    formName: r.form_name,
    controls: JSON.parse(r.controls_json) as string[],
    label: r.label,
  }));
  rs.formSteps = new FormStepIndex(known);
  return rs.formSteps;
}

/** Store a new step, or the controls a known step showed for the first time (revealed fields). */
async function persist(ctx: ServerContext, run: RunRow, a: StepAssignment): Promise<void> {
  const controls = JSON.stringify(a.step.controls);
  if (a.created)
    await ctx.db
      .insertInto('form_steps')
      .values({
        id: a.step.id,
        portal_id: run.portal_id,
        route_template: a.step.routeTemplate,
        step_index: a.step.stepIndex,
        form_name: a.step.formName,
        controls_json: controls,
        label: a.step.label,
        first_seen_run: run.id,
        created_at: nowIso(),
      })
      .execute();
  else if (a.added.length > 0)
    await ctx.db
      .updateTable('form_steps')
      .set({ controls_json: controls })
      .where('id', '=', a.step.id)
      .execute();
}

/**
 * The form step and kind of the page just observed (research.md): steps by form name, else by
 * control overlap; `validation` when the step shows invalid controls or alert texts. A page without
 * form controls is no step and stays `main`.
 */
export async function assignFormStep(
  ctx: ServerContext,
  sc: { run: RunRow; rs: RunState },
  page: { routeTemplate: string; snapshot: string },
): Promise<FormStepOf> {
  const nodes = canonicalizeAria(page.snapshot).nodes;
  const fc = formControls(nodes);
  if (fc.controls.length === 0) return { stepId: null, kind: 'main', assignment: null };
  const index = await stepsOf(ctx, sc.rs, sc.run.portal_id);
  const assignment = index.assign(page.routeTemplate, fc, newId)!;
  await persist(ctx, sc.run, assignment);
  const kind: StateKind = hasErrors(errorSignals(nodes)) ? 'validation' : 'main';
  return { stepId: assignment.step.id, kind, assignment };
}

/** The `form_step` trace event of a state that belongs to a step. */
export function formStepReports(stateId: string, f: FormStepOf): Report[] {
  if (f.assignment === null) return [];
  const a = f.assignment;
  return [
    event('form_step', {
      state_id: stateId,
      form_step_id: a.step.id,
      step_index: a.step.stepIndex,
      created: a.created,
      reason: a.reason,
      overlap: Number(a.overlap.toFixed(2)),
      added: a.added,
      state_kind: f.kind,
    }),
  ];
}
