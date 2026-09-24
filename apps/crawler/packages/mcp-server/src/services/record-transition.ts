import {
  Confidence,
  EdgeStatus,
  SafetyClass,
  Stabilization,
  newId,
  nowIso,
} from '@pathfinder/core';
import { classifyAction, portalRuleSet, type ActionDescriptor } from '@pathfinder/safety';
import type { PortalConfig } from '@pathfinder/config';
import { z } from 'zod';
import type { ServerContext } from '../context.js';
import { ToolError, parseInput } from '../errors.js';
import { getRun, requireEvidenceAndConfidence } from './common.js';

export const LocatorKind = z.enum(['role', 'label', 'text', 'test_id', 'container']);

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
    href: z.string().optional(),
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
  })
  .strict();

export const RecordTransitionInput = z
  .object({
    run_id: z.string().min(1),
    from_state: z.string().min(1),
    to_state: z.string().min(1).nullable(),
    action: ActionInput,
    safety_class: SafetyClass,
    status: EdgeStatus,
    evidence_ref: z.string().min(1),
    confidence: Confidence,
    error: z.record(z.string(), z.unknown()).nullable().default(null),
    stabilization: Stabilization.default('settled'),
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
  };
}

/**
 * Records an edge. The class is re-derived with the `safety` package and a differing supplied class
 * is rejected (FR-004). Executing a non-read action on a production run is a hard reject: the last
 * line of defence behind the action gate.
 */
export async function recordTransition(
  ctx: ServerContext,
  raw: unknown,
): Promise<{ edge_id: string }> {
  requireEvidenceAndConfidence(raw);
  const input = parseInput(RecordTransitionInput, raw);
  const run = await getRun(ctx, input.run_id);

  // The run's own rule set, rebuilt from the portal file captured in its config snapshot.
  const { portal } = JSON.parse(run.config_snapshot) as { portal: PortalConfig };
  const derived = classifyAction(descriptorOf(input.action), portalRuleSet(portal)).safetyClass;
  if (derived !== input.safety_class) {
    throw new ToolError(
      'SAFETY_CLASS_MISMATCH',
      `supplied safety_class ${input.safety_class} differs from the server-derived class ${derived}`,
      { derived },
    );
  }
  if (input.status === 'executed' && derived !== 'read' && run.environment === 'production') {
    throw new ToolError(
      'UNSAFE_ACTION_EXECUTED',
      `refusing to record an executed ${derived} action on a production run`,
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
    .insertInto('edges')
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
    })
    .execute();
  return { edge_id: id };
}
