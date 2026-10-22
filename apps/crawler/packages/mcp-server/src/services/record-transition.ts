import {
  Confidence,
  Driver,
  TransitionStatus,
  FoundBy,
  SafetyClass,
  Stabilization,
  StepResult,
  TransitionKind,
  newId,
  nowIso,
} from '@mudpuppy/core';
import { classifyAction, portalRuleSet, type ActionDescriptor } from '@mudpuppy/safety';
import type { PortalConfig } from '@mudpuppy/config';
import { z } from 'zod';
import type { ServerContext } from '../context.js';
import { ToolError, parseInput } from '../errors.js';
import { getRun, requireEvidenceAndConfidence } from './common.js';

export const LocatorKind = z.enum(['role', 'label', 'text', 'test_id', 'container', 'path']);

export const ActionInput = z
  .object({
    role: z.string().min(1),
    accessible_name: z.string().nullable().default(null),
    /** Ranked candidates (FR-013); at least one is required. */
    locators: z
      .array(
        z
          .object({
            kind: LocatorKind,
            value: z.string().min(1),
            rank: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .min(1),
    /** Evidence ref of the snapshot the locators were derived from. */
    snapshot_ref: z.string().optional(),
    /** Index among same role+name elements, so the action can be located again. */
    nth: z.number().int().nonnegative().optional(),
    // Signals the classifier re-derives the class from.
    /** Trace runs: a fill/check/select control (spec 004 R-14). */
    input: z.enum(['fill', 'check', 'select']).optional(),
    /** An unnamed field's visible label (spec 038, LO-48). */
    label: z.string().min(1).optional(),
    href: z.string().optional(),
    /** The link's absolute target; same-target link items are inferred from it (spec 013 R3). */
    target_url: z.string().optional(),
    method: z.string().optional(),
    form: z
      .object({
        method: z.string().optional(),
        action: z.string().optional(),
        purpose: z.enum(['search', 'filter', 'sort', 'paginate', 'other']).optional(),
        hasPassword: z.boolean().optional(),
      })
      .strict()
      .optional(),
    attributes: z.record(z.string(), z.string()).optional(),
    /** Role-less clickables (spec 015 R1): the click signals that found it and its tag. */
    found_by: z.array(FoundBy).min(1).optional(),
    tag: z.string().min(1).optional(),
    /** Frame path of the document it lives in (spec 015 R3); absent for the top document. */
    frame: z.string().min(1).optional(),
    /** The model's element key (spec 039 design § 5.5): matches the action across runs. */
    element_key: z.string().min(1).optional(),
  })
  .strict();

export const RecordTransitionInput = z
  .object({
    run_id: z.string().min(1),
    from_state: z.string().min(1),
    to_state: z.string().min(1).nullable(),
    action: ActionInput,
    safety_class: SafetyClass,
    status: TransitionStatus,
    evidence_ref: z.string().min(1),
    confidence: Confidence,
    error: z.record(z.string(), z.unknown()).nullable().default(null),
    stabilization: Stabilization.default('settled'),
    // MudPuppy 2.0 (spec 039 design § 5.7): the transition as a step of a journey.
    journey_id: z.string().min(1),
    seq: z.number().int().positive(),
    /** The observation the step started from; null only when the journey has none yet. */
    from_observation_id: z.string().min(1).nullable(),
    element_key: z.string().min(1),
    kind: TransitionKind,
    result: StepResult,
    driver: Driver.default('agent'),
  })
  .strict();

export function descriptorOf(action: z.infer<typeof ActionInput>): ActionDescriptor {
  return {
    role: action.role,
    ...(action.accessible_name !== null ? { name: action.accessible_name } : {}),
    ...(action.href !== undefined ? { href: action.href } : {}),
    ...(action.method !== undefined ? { method: action.method } : {}),
    ...(action.form !== undefined ? { form: action.form } : {}),
    ...(action.attributes !== undefined ? { attributes: action.attributes } : {}),
    ...(action.input !== undefined ? { input: action.input } : {}),
    ...(action.tag !== undefined ? { tag: action.tag } : {}),
  };
}

/**
 * Records a transition. The class is re-derived with the `safety` package and a differing supplied class
 * is rejected (FR-004). Whether the action may run at all is the action gate's decision.
 */
export async function recordTransition(
  ctx: ServerContext,
  raw: unknown,
): Promise<{ transition_id: string }> {
  requireEvidenceAndConfidence(raw);
  const input = parseInput(RecordTransitionInput, raw);
  const run = await getRun(ctx, input.run_id);

  // The run's own rule set, rebuilt from the portal file captured in its config snapshot.
  const { portal } = JSON.parse(run.config_snapshot) as { portal: PortalConfig };
  // Trace runs read GET form submits as read (spec 004 R-14); the gate used the same option.
  const derived = classifyAction(
    descriptorOf(input.action),
    portalRuleSet(portal),
    run.mode === 'trace' ? { safeFormSubmitIsRead: true } : {},
  ).safetyClass;
  if (derived !== input.safety_class) {
    throw new ToolError(
      'SAFETY_CLASS_MISMATCH',
      `supplied safety_class ${input.safety_class} differs from the server-derived class ${derived}`,
      { derived },
    );
  }

  for (const [field, id] of [
    ['from_state', input.from_state],
    ['to_state', input.to_state],
  ] as const) {
    if (id === null) continue;
    const s = await ctx.db
      .selectFrom('states')
      .select('id')
      .where('id', '=', id)
      .where('portal_id', '=', run.portal_id)
      .executeTakeFirst();
    if (!s)
      throw new ToolError(
        'UNKNOWN_REF',
        `${field} ${id} is not a state of portal ${run.portal_id}`,
      );
  }

  const id = newId();
  await ctx.db
    .insertInto('transitions')
    .values({
      id,
      run_id: run.id,
      from_state: input.from_state,
      to_state: input.to_state,
      action_json: JSON.stringify(input.action),
      safety_class: derived,
      status: input.status,
      evidence_ref: input.evidence_ref,
      confidence: input.confidence,
      error: input.error === null ? null : JSON.stringify(input.error),
      stabilization: input.stabilization,
      created_at: nowIso(),
      journey_id: input.journey_id,
      seq: input.seq,
      from_observation_id: input.from_observation_id,
      element_key: input.element_key,
      kind: input.kind,
      result: input.result,
      driver: input.driver,
    })
    .execute();
  return { transition_id: id };
}
