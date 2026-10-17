import { maxSafetyClass, newId, nowIso } from '@pathfinder/core';
import { readFormFields, testValueFor, type AutofillField } from '@pathfinder/crawler';
import {
  planTries,
  unknownProbes,
  type HappyNext,
  type ProbeTry,
  type ProbeValue,
} from '@pathfinder/probes';
import type { ServerContext } from '../../context.js';
import { ToolError } from '../../errors.js';
import type { ProbeFormInput, ProbeFormResult } from '../../runtime.js';
import { probeMarkOf, runChoices, useProbeMark, type RunRow } from '../../services/index.js';
import type { RunState } from '../run-state.js';
import { gateAct } from './act-gate.js';
import { counted, flushObstacles, phase, step } from './context.js';
import { findAgain } from './find-again.js';
import { classifyPress, press, recordOutcome, type ProbeTarget } from './probe.js';
import { returnToState } from './replay.js';
import { beginStep, bumpRun } from './stop.js';

/**
 * One call stops trying after this long and says how many tries are left; the next call on the
 * same step continues. A tool call must stay well under an MCP client's timeout (60 s by default).
 */
export const PROBE_CALL_MS = 40_000;

/** The happy press, stored like a try so a suite can repeat it (probe id `happy-path`). */
const HAPPY: ProbeTry = {
  key: 'happy-path',
  probe: 'happy-path',
  group: 'branch',
  target: null,
  writes: [],
  summary: 'the happy values',
};

/** Outcomes that are no probe try: the happy press and a step that could not be probed. */
const NOT_TRIES = ['happy-path', 'step'];

type Scope = { ctx: ServerContext; run: RunRow; rs: RunState; formStepId: string | null };

/** A field that takes a one-time code: probing it would mean guessing codes (O-M2: blocked). */
const isOneTimeCode = (f: AutofillField): boolean =>
  f.autocomplete === 'one-time-code' ||
  /\b(sms|one[- ]?time|otp|tan|verification)\b.*\bcode\b|\bkod (sms|jednorazowy)\b/i.test(f.label);

/** The happy-path value of every field: the persona's test data, else autofill's test value. */
function baseValues(fields: readonly AutofillField[], inputs: Record<string, string>) {
  const out = new Map<number, ProbeValue>();
  const groups = new Set<string>();
  for (const f of fields) {
    if (f.group !== undefined) {
      if (groups.has(f.group)) continue;
      groups.add(f.group);
    }
    const v = testValueFor({ ...f, empty: true }, inputs[f.label]);
    if (v !== null) out.set(f.index, v);
  }
  return out;
}

/**
 * `probe_form` (spec 032 US2): on a form step the run reached, press the step's control with the
 * happy values first (the reference), then with each try the catalogue plans within the budget,
 * and record every outcome. Map runs only; the agent chooses the step and, optionally, the probes.
 */
export async function probeForm(
  ctx: ServerContext,
  rs: RunState | undefined,
  input: ProbeFormInput,
): Promise<ProbeFormResult> {
  const run = await phase(ctx, 'begin_step', () => beginStep(ctx, rs, input.run_id));
  if (rs!.isTrace)
    throw new ToolError('SCHEMA_INVALID', 'probe_form is for map runs; a trace walks one process');
  // Probing only when asked (spec 032 US5, owner answer 3 of 2026-10-17).
  if (!runChoices(run).probe)
    throw new ToolError(
      'PROBE_NOT_ASKED',
      'this scan maps; forms are probed only in a probe run (start_run probe_marked) on marked steps',
    );
  const unknown = unknownProbes(input.probes ?? []);
  if (unknown.length > 0)
    throw new ToolError('SCHEMA_INVALID', `unknown probes: ${unknown.join(', ')}`);
  return counted(rs!, async () => {
    const out = await probeStep(ctx, run, rs!, input);
    await flushObstacles(ctx, rs!);
    return out;
  });
}

async function probeStep(
  ctx: ServerContext,
  run: RunRow,
  rs: RunState,
  input: ProbeFormInput,
): Promise<ProbeFormResult> {
  const started = performance.now();
  const budget = rs.effective.portal.probes;
  const used = await outcomesInRun(ctx, run.id);
  const result: ProbeFormResult = {
    form_step: null,
    outcomes: [],
    skipped: [],
    budget: { per_step: budget.per_step, per_run: budget.per_run, used_in_run: used },
  };
  const target = await gatedTarget(ctx, run, rs, input.action_id);
  if ('blocked' in target) return { ...result, blocked: target.blocked };
  const markId = await markOfTarget(ctx, run, target.stepId);
  result.form_step = await formStepOf(ctx, target.stepId);
  const progress = rs.probing.get(target.stateId);
  const limit = Math.min(budget.per_step - (progress?.done.size ?? 0), budget.per_run - used);
  if (limit <= 0) return { ...result, skipped: ['budget: no probes left for this step or run'] };

  const sc: Scope = { ctx, run, rs, formStepId: target.stepId };
  const ready = await readyStep(sc, target);
  if ('blocked' in ready) {
    // A one-time code blocks this step for good: the mark is used up.
    await useProbeMark(ctx, markId, run.id);
    return { ...result, blocked: ready.blocked };
  }
  const happy = progress?.happyNext ?? (await happyPress(sc, target, ready, result));
  if (happy === null) return result;
  const done = progress?.done ?? new Set<string>();
  rs.probing.set(target.stateId, { done, happyNext: happy });

  const planned = planTries(
    { fields: ready.fields, base: ready.base },
    {
      limit: limit + done.size,
      ...(input.probes ? { only: input.probes } : {}),
    },
  );
  const todo = planned.tries.filter((t) => !done.has(t.key));
  result.skipped.push(...planned.skipped.map((k) => `budget: ${k}`));
  for (const [i, t] of todo.entries()) {
    if (performance.now() - started > PROBE_CALL_MS) {
      result.more = todo.length - i;
      break;
    }
    done.add(t.key);
    if (await tryOne(sc, target, { t, base: ready.base, happyNext: happy }, result)) break;
  }
  await step({ ctx, run }, 'run_bookkeeping', () => bumpRun(ctx, run, started, target.depth + 1));
  result.budget.used_in_run = used + result.outcomes.length;
  return finishMark({ ctx, run, markId }, result);
}

/** A step probed to its end (no "more" left) uses up its mark. */
async function finishMark(
  m: { ctx: ServerContext; run: RunRow; markId: string },
  result: ProbeFormResult,
): Promise<ProbeFormResult> {
  if (result.more === undefined) await useProbeMark(m.ctx, m.markId, m.run.id);
  return result;
}

/** The open Probe mark on the step the control belongs to; refused when there is none (US5.5). */
async function markOfTarget(
  ctx: ServerContext,
  run: RunRow,
  stepId: string | null,
): Promise<string> {
  const markId = stepId === null ? null : await probeMarkOf(ctx, run.portal_id, stepId);
  if (markId !== null) return markId;
  const step = stepId === null ? null : await formStepOf(ctx, stepId);
  throw new ToolError(
    'STEP_NOT_MARKED',
    step === null
      ? 'this control is on no recorded form step; probe a step from the probe_marks list start_run returned'
      : `form step ${step.step_index} "${step.label}" is not marked for probing; probe a step from the probe_marks list start_run returned`,
  );
}

/**
 * The step's control through the act gate, and the run's limit: probes type and submit, so they
 * run only where the limit allows submitting forms (owner answer O-M1), whatever class the control
 * itself has (a "Next" can read like a pager). Refused means one `blocked` outcome (US2.5).
 */
async function gatedTarget(
  ctx: ServerContext,
  run: RunRow,
  rs: RunState,
  actionId: string,
): Promise<ProbeTarget | { blocked: string }> {
  const gated = await step({ ctx, run }, 'gate', () => gateAct(ctx, run, rs, actionId)).catch(
    async (e: unknown) => {
      if (!(e instanceof ToolError) || e.code !== 'ACTION_REFUSED') throw e;
      await recordBlocked(ctx, run, actionId, e.message);
      return null;
    },
  );
  if (gated === null) return { blocked: 'the action limit or safety class refuses this control' };
  const ceiling = gated.g.effectiveMaxActionClass;
  if (maxSafetyClass(ceiling, 'mutating') !== ceiling) {
    const why = `the action limit (${ceiling}) does not allow submitting forms`;
    await recordBlocked(ctx, run, actionId, why);
    return { blocked: why };
  }
  const { action } = gated;
  const state = await ctx.db
    .selectFrom('states')
    .select(['route_template', 'form_step_id'])
    .where('id', '=', action.state_id)
    .executeTakeFirstOrThrow();
  return {
    action,
    stateId: action.state_id,
    stepId: rs.stepOfState.get(action.state_id) ?? state.form_step_id,
    route: state.route_template,
    depth: rs.depthByState.get(action.state_id) ?? 0,
  };
}

interface Ready {
  fields: AutofillField[];
  base: Map<number, ProbeValue>;
  /** The control sits in a native `<form>`; a filter or add-to-cart outside one may apply in place. */
  inForm: boolean;
}

/** On the step, its fields read and the happy values chosen; a one-time code blocks it (O-M2). */
async function readyStep(sc: Scope, target: ProbeTarget): Promise<Ready | { blocked: string }> {
  const { ctx, run, rs } = sc;
  if (rs.currentStateId !== target.stateId) await returnToState(sc, target.stateId);
  const found = await findAgain(rs.session.page, target.action);
  const fields = found.locator ? await readFormFields(found.locator) : null;
  if (fields === null)
    throw new ToolError('SCHEMA_INVALID', `action ${target.action.id} does not submit a form`);
  if (fields.some(isOneTimeCode)) {
    await recordBlocked(ctx, run, target.action.id, 'the step asks for a one-time code (O-M2)');
    return { blocked: 'the step asks for a one-time code; nothing was typed' };
  }
  const base = baseValues(fields, rs.effective.persona.test_data);
  const inForm = await found
    .locator!.evaluate((el) => el.closest('form') !== null, undefined, { timeout: 5000 })
    .catch(() => true);
  return { fields, base, inForm };
}

/** The happy press: the reference a branch is measured against, and the test-data check. */
async function happyPress(
  sc: Scope,
  target: ProbeTarget,
  ready: Ready,
  result: ProbeFormResult,
): Promise<HappyNext | null> {
  const { rs } = sc;
  const happy = await press(sc, target, { base: ready.base, writes: [], fresh: true });
  if ('skipped' in happy) {
    result.skipped.push(happy.skipped);
    return null;
  }
  const k = await classifyPress(sc, target, happy, { group: 'branch', happyNext: null });
  // A control outside any <form> (a filter, an add-to-cart: F-18) may apply in place: it stays on
  // its step by design, so a changed page with no message is its reference. In a native form the
  // same press is a refusal, as a login that stays put without a visible message.
  const inPlace =
    k.c.kind === 'validation' &&
    !ready.inForm &&
    k.messages.length === 0 &&
    happy.result.state_id !== target.stateId;
  if (k.c.kind === 'validation' && !inPlace) {
    result.missing_test_data = missingData(
      ready.fields,
      rs.effective.persona.test_data,
      k.messages,
    );
    result.skipped.push('the happy values did not pass this step: add test data, then probe again');
    return null;
  }
  // Kept as an outcome so the suite has its happy-path variant; it counts against no budget.
  await recordOutcome(sc, target, {
    t: HAPPY,
    p: happy,
    c: {
      kind: 'next',
      accepted: false,
      possibleNewProcess: false,
      why: inPlace
        ? 'the happy values: the step applies in place; the reference for every try'
        : 'the happy values: the reference for every try',
    },
    messages: [],
    httpStatus: k.httpStatus,
  });
  return {
    stepId: rs.stepOfState.get(happy.result.state_id) ?? null,
    route: happy.result.route_template,
  };
}

/** One try; true when the rest of the step cannot be probed (the way back diverged). */
async function tryOne(
  sc: Scope,
  target: ProbeTarget,
  o: { t: ProbeTry; base: ReadonlyMap<number, ProbeValue>; happyNext: HappyNext },
  result: ProbeFormResult,
): Promise<boolean> {
  const { t } = o;
  try {
    const p = await press(sc, target, {
      base: o.base,
      writes: t.writes,
      ...(t.fault ? { fault: t.fault } : {}),
      fresh: false,
    });
    if ('skipped' in p) {
      result.skipped.push(`${t.key}: ${p.skipped}`);
      return false;
    }
    // A fault that broke nothing (the step sent no request) is no technical state.
    if (p.fault !== null && !p.fault.hit) {
      result.skipped.push(`${t.key}: no request to break, the step sent none`);
      return false;
    }
    const k = await classifyPress(sc, target, p, { group: t.group, happyNext: o.happyNext });
    await recordOutcome(sc, target, { t, p, ...k });
    result.outcomes.push({
      probe: t.probe,
      key: t.key,
      target: t.target,
      outcome_kind: k.c.kind,
      to_state: p.result.state_id,
      messages: k.messages.slice(0, 3).map((m) => m.text),
      ...(k.c.accepted ? { accepted: true } : {}),
      ...(k.c.possibleNewProcess ? { possible_new_process: true } : {}),
    });
    return false;
  } catch (e) {
    if (!(e instanceof ToolError) || !['REPLAY_DIVERGED', 'NO_PATH'].includes(e.code)) throw e;
    result.skipped.push(`${t.key} and the rest: ${e.message}`);
    return true;
  }
}

/** Labels the happy values could not satisfy: the fields with messages, else the required ones without test data. */
function missingData(
  fields: readonly AutofillField[],
  inputs: Record<string, string>,
  messages: readonly { field: string | null }[],
): string[] {
  const named = [...new Set(messages.map((m) => m.field).filter((f): f is string => f !== null))];
  if (named.length > 0) return named;
  return fields
    .filter((f) => f.label && inputs[f.label] === undefined && f.type !== 'radio')
    .map((f) => f.label);
}

async function outcomesInRun(ctx: ServerContext, runId: string): Promise<number> {
  const r = await ctx.db
    .selectFrom('probe_outcomes')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('run_id', '=', runId)
    .where('probe_id', 'not in', NOT_TRIES)
    .executeTakeFirstOrThrow();
  return Number(r.n);
}

async function formStepOf(
  ctx: ServerContext,
  id: string | null,
): Promise<ProbeFormResult['form_step']> {
  if (id === null) return null;
  const r = await ctx.db
    .selectFrom('form_steps')
    .select(['id', 'step_index', 'label'])
    .where('id', '=', id)
    .executeTakeFirst();
  return r ?? null;
}

/** A step that could not be probed at all: one `blocked` outcome on the step's own evidence. */
async function recordBlocked(
  ctx: ServerContext,
  run: RunRow,
  actionId: string,
  reason: string,
): Promise<void> {
  const action = await ctx.db
    .selectFrom('actions')
    .innerJoin('states', 'states.id', 'actions.state_id')
    .select(['actions.state_id', 'states.evidence_ref', 'states.form_step_id'])
    .where('actions.id', '=', actionId)
    .executeTakeFirstOrThrow();
  await ctx.db
    .insertInto('probe_outcomes')
    .values({
      id: newId(),
      run_id: run.id,
      from_state_id: action.state_id,
      form_step_id: action.form_step_id,
      probe_id: 'step',
      probe_group: 'validation',
      target: null,
      inputs_json: '[]',
      path_json: '{"start_url":"","steps":[]}',
      fault: null,
      outcome_kind: 'blocked',
      to_state_id: null,
      accepted: 0,
      possible_new_process: 0,
      messages_json: '[]',
      http_status: null,
      reason,
      evidence_ref: action.evidence_ref,
      edge_id: null,
      created_at: nowIso(),
    })
    .execute();
}
