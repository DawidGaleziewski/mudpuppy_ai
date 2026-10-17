// `propose_probe_suite` (spec 032 US3, owner decision D-2): after a probing scan the BA picks, per
// form, which recorded probe outcomes become variants of a `traces.yaml` trace, names them and says
// what each should do. The server builds the steps from the outcomes themselves (the run's way to
// the step, the try's values, its fault), so the suite repeats exactly what was observed. The
// suite is stored `open`: it waits in Review for the owner and never runs before approval.

import { newId, nowIso, type OutcomeKind } from '@pathfinder/core';
import { TraceSpecEntry, type TraceStep, type TraceVariant } from '@pathfinder/config';
import { z } from 'zod';
import type { BaContext } from '../../context.js';
import { ToolError, parseInput } from '../../errors.js';
import { assertNoPii, json, requireActiveSession } from './common.js';

const Slug = z.string().regex(/^[a-z][a-z0-9-]*$/, 'a lowercase slug');

export const ProposeProbeSuiteInput = z
  .object({
    session_id: z.string().min(1),
    run_id: z.string().min(1),
    /** The trace's id in `traces.yaml` and its name and goal, in the portal's terms. */
    trace: z.object({ id: Slug, name: z.string().min(1), goal: z.string().min(1) }).strict(),
    variants: z
      .array(
        z
          .object({
            id: Slug,
            probe_outcome_id: z.string().min(1),
            /** Why this variant is worth running every time (what it shows about the form). */
            why: z.string().min(1).max(500),
          })
          .strict(),
      )
      .min(1)
      .max(40),
  })
  .strict();

/** What a suite expects of each outcome kind; temporary and blocked outcomes are no variant. */
const EXPECT: Partial<Record<OutcomeKind, TraceVariant['expect']>> = {
  next: 'proceed',
  validation: 'validation_error',
  technical: 'technical_error',
  branch: 'branch',
};

interface OutcomeRow {
  id: string;
  run_id: string;
  form_step_id: string | null;
  probe_id: string;
  outcome_kind: OutcomeKind;
  fault: TraceVariant['fault'] | null;
  inputs_json: string;
  path_json: string;
}

interface LabelStep {
  name: string;
  kind: TraceStep['kind'];
  value?: string;
}

/** A step's intent in the suite, by kind (a trace step needs one). */
const INTENT: Record<TraceStep['kind'], (s: LabelStep) => string> = {
  click: (s) => `press ${s.name}`,
  check: (s) => `choose ${s.name}`,
  select: (s) => `pick ${s.value ?? ''} for ${s.name}`,
  fill: (s) => `enter ${s.name}`,
};

/** The outcome's steps: the way to the form step, then the try's own values and press. */
function stepsOf(o: OutcomeRow): { startUrl: string; steps: TraceStep[] } {
  const path = json<{ start_url: string; steps: LabelStep[] }>(o.path_json);
  const steps: TraceStep[] = [...path.steps, ...json<LabelStep[]>(o.inputs_json)].map((s) => ({
    ...s,
    intent: INTENT[s.kind](s),
  }));
  return { startUrl: path.start_url, steps };
}

export function proposeProbeSuite(
  ctx: BaContext,
  raw: unknown,
): { suite_id: string; status: 'open'; variants: number; note: string } {
  const input = parseInput(ProposeProbeSuiteInput, raw);
  requireActiveSession(ctx, input.session_id);
  assertNoPii({ trace: input.trace, why: input.variants.map((v) => v.why) }, 'suite');
  const run = ctx.raw.prepare('SELECT portal_id FROM runs WHERE id = ?').get(input.run_id) as
    { portal_id: string } | undefined;
  if (!run) throw new ToolError('RUN_NOT_FOUND', `run ${input.run_id} not found`);
  const find = ctx.raw.prepare('SELECT * FROM probe_outcomes WHERE id = ? AND run_id = ?');
  const rows = input.variants.map((v) => {
    const o = find.get(v.probe_outcome_id, input.run_id) as OutcomeRow | undefined;
    if (!o)
      throw new ToolError(
        'UNKNOWN_REF',
        `probe outcome ${v.probe_outcome_id} is not in run ${input.run_id}`,
      );
    const expect = EXPECT[o.outcome_kind];
    if (expect === undefined)
      throw new ToolError(
        'SCHEMA_INVALID',
        `outcome ${o.id} is ${o.outcome_kind}: a temporary or blocked outcome is no variant (recheck it, or ask)`,
      );
    return { v, o, expect, ...stepsOf(o) };
  });
  const happy = rows.find((r) => r.expect === 'proceed') ?? rows[0]!;
  const trace = TraceSpecEntry.safeParse({
    ...input.trace,
    start_url: happy.startUrl,
    steps: happy.steps,
    variants: rows.map((r) => ({
      id: r.v.id,
      expect: r.expect,
      steps: r.steps,
      ...(r.o.fault ? { fault: r.o.fault } : {}),
      probe: r.o.probe_id,
    })),
  });
  if (!trace.success)
    throw new ToolError('SCHEMA_INVALID', `the suite is not a valid trace: ${trace.error.message}`);
  const id = newId();
  ctx.raw
    .prepare(
      `INSERT INTO probe_suites (id, portal_id, run_id, form_step_id, trace_json, notes_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
    )
    .run(
      id,
      run.portal_id,
      input.run_id,
      happy.o.form_step_id,
      JSON.stringify(trace.data),
      JSON.stringify(
        rows.map((r) => ({ variant: r.v.id, probe_outcome_id: r.o.id, why: r.v.why })),
      ),
      nowIso(),
    );
  return {
    suite_id: id,
    status: 'open',
    variants: rows.length,
    note: 'The suite waits in Review: the owner keeps or drops variants and approves it before it ever runs.',
  };
}
