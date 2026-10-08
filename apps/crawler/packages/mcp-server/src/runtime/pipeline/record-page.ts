import { maskText } from '@pathfinder/core';
import { stepOutcomes, type SettleOutcome } from '@pathfinder/crawler';
import { classifyAction } from '@pathfinder/safety';
import type { PageResult } from '../../runtime.js';
import { recordForm, recordTransition } from '../../services/index.js';
import { appendStep } from '../../services/trace.js';
import { descriptorOf, withoutPageUrl } from './actions.js';
import { reported, step, type StepContext } from './context.js';
import type { Observed } from './fingerprint-step.js';
import { TRACE_CLASSIFY } from './gate.js';

/**
 * Forms: recorded once per state per run, never submitted (FR-011). Per run, not per state: a trace
 * over states an earlier run created still carries the forms the BA reads from its runs.
 */
export function recordFormsStep(
  sc: StepContext,
  page: { observed: Observed; stateId: string; evidenceRef: string; alreadyInRun: boolean },
): Promise<number> {
  const { ctx, run } = sc;
  return step(sc, 'record_forms', async () => {
    let n = 0;
    if (page.alreadyInRun) return reported(n);
    for (const f of page.observed.forms) {
      if (f.fields.length === 0) continue;
      await recordForm(ctx, {
        run_id: run.id,
        state_id: page.stateId,
        fields: f.fields.map((x) => ({ ...x, required: x.required })),
        evidence_ref: page.evidenceRef,
        confidence: 'observed',
      });
      n += 1;
    }
    return reported(n);
  });
}

/** The executed edge of an `act` call; API calls observed during the action hang off it. */
export async function recordTransitionStep(
  sc: StepContext,
  page: { stateId: string; evidenceRef: string; stabilization: SettleOutcome['result'] },
): Promise<string | undefined> {
  const { ctx, run, rs, via } = sc;
  if (via.kind !== 'act') return undefined;
  const a = via.action;
  const transitionJson = withoutPageUrl(a.json);
  return step(sc, 'record_transition', async () => {
    const { edge_id } = await recordTransition(ctx, {
      run_id: run.id,
      from_state: a.state_id,
      to_state: page.stateId,
      action: { role: a.role, accessible_name: a.accessible_name, ...transitionJson },
      safety_class: classifyAction(descriptorOf(a), rs.ruleSet, rs.isTrace ? TRACE_CLASSIFY : {})
        .safetyClass,
      status: 'executed',
      evidence_ref: page.evidenceRef,
      confidence: 'observed',
      stabilization: page.stabilization,
    });
    return reported(edge_id);
  });
}

/** Trace runs: the process step this call is, with what visibly changed (spec 004 R-14). */
export async function recordTraceStep(
  sc: StepContext,
  page: {
    observed: Observed;
    masked: string;
    stateId: string;
    evidenceRef: string;
    edgeId: string | undefined;
  },
): Promise<PageResult['step']> {
  const { ctx, rs } = sc;
  const traceStep = sc.step;
  if (!traceStep || !rs.processId) return undefined;
  const processId = rs.processId;
  const { observed } = page;
  return step(sc, 'record_step', async () => {
    const after = { url: observed.url, title: observed.title, snapshot: page.masked };
    const outcomes = rs.lastObserved ? stepOutcomes(rs.lastObserved, after) : [];
    // A click that changes nothing visible is a fact worth recording (e.g. a submit the
    // browser's own form validation held back, which the ARIA snapshot does not show).
    if (outcomes.length === 0 && traceStep.kind === 'click') {
      outcomes.push('No visible change after the step');
      // The browser's own message for each field that holds the submit back, e.g. an empty
      // required field or a value that misses its pattern.
      for (const form of observed.forms)
        for (const field of form.fields)
          for (const msg of field.validation_messages ?? [])
            outcomes.push(`Browser validation on ${field.name}: ${maskText(msg)}`);
    }
    const ord = await appendStep(ctx, processId, {
      intent: traceStep.intent,
      kind: traceStep.kind,
      action_id: traceStep.action_id,
      edge_id: page.edgeId ?? null,
      value: traceStep.value,
      state_before: rs.currentStateId,
      state_after: page.stateId,
      outcomes,
      evidence_ref: page.evidenceRef,
    });
    return reported({ ord, outcomes });
  });
}
