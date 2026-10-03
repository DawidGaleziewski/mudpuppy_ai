import {
  isSyntheticInput,
  maskText,
  newId,
  nowIso,
  emitForRun,
  shapeUrl,
  type PhaseName,
} from '@pathfinder/core';
import {
  classifyCandidates,
  decide,
  enqueueActions,
  extractCandidates,
  attachLocators,
  observePage,
  pendingItemForAction,
  settleFrontierItem,
  stepOutcomes,
  type ClassifiedAction,
  type GateContext,
  type SettleOutcome,
} from '@pathfinder/crawler';
import { computeFingerprint } from '@pathfinder/fingerprint';
import { classifyAction, type ActionDescriptor, type Refusal } from '@pathfinder/safety';
import type { ServerContext } from '../context.js';
import { ToolError } from '../errors.js';
import type { ActInput, NavigateInput, PageResult } from '../runtime.js';
import { appendStep, closeProcess, stepCount, type StepKind } from '../services/trace.js';
import {
  assertRunActive,
  completeRun,
  isBudgetExhausted,
  recordApiCall,
  recordForm,
  recordState,
  recordTransition,
  type RunRow,
} from '../services/index.js';
import { recordObstacles } from './obstacles-trace.js';
import { inPwGroup } from './pw-trace.js';
import type { RunState } from './run-state.js';

/** A timed stage of the current tool call (contracts/trace-spans.md); untraced outside a call. */
function phase<T>(ctx: ServerContext, name: PhaseName, fn: () => Promise<T>): Promise<T> {
  return ctx.tracer.phase(name, () => inPwGroup(name, fn));
}

/** Terminal styling Playwright puts in its error call logs. */
const ANSI_STYLE = new RegExp(`${String.fromCharCode(27)}\\[\\d+m`, 'g');

/** `event obstacle` for every dismissal since the last flush (research §16). */
function flushObstacles(ctx: ServerContext, state: RunState): void {
  const events = state.session.obstacles.events;
  const fresh = events.slice(state.obstacleCursor);
  state.obstacleCursor = events.length;
  if (fresh.length) recordObstacles(ctx.tracer, fresh);
}

/** Count the browser's requests for this call and emit their `request_aggregate` when it ends. */
async function counted<T>(rs: RunState, fn: () => Promise<T>): Promise<T> {
  rs.trace.beginCall();
  try {
    return await (rs.pw ? rs.pw.chunk(fn) : fn());
  } finally {
    rs.trace.endCall();
  }
}

/** `event gate_decision` for an agent input (navigate URL or issued action). */
function traceGate(
  ctx: ServerContext,
  rs: RunState,
  input: { kind: 'navigate'; url: string } | { kind: 'act'; action: ActionRow },
  d: ReturnType<typeof decide>,
): void {
  ctx.tracer.event('gate_decision', {
    input_kind: input.kind,
    ...(input.kind === 'navigate'
      ? { url: shapeUrl(input.url, (u) => rs.peekRouteTemplate(u)) }
      : {
          action: {
            role: input.action.role,
            accessible_name: input.action.accessible_name,
            nth: input.action.json.nth,
          },
        }),
    safety_class: d.classification.safetyClass,
    allowed: d.allowed,
    rule: d.allowed ? null : d.rule,
    reason: d.allowed ? null : d.reason,
    ...(!d.allowed && d.policyId ? { policy_id: d.policyId } : {}),
  });
}

/** The item-view cap (FR-024) with an `event item_cap` whenever the cap applies to the template. */
async function itemCapChecked(
  ctx: ServerContext,
  rs: RunState,
  runId: string,
  routeTemplate: string,
): Promise<Refusal | null> {
  const cap = await rs.policy.itemCap(ctx.db, runId, routeTemplate);
  if (!cap) return null;
  ctx.tracer.event('item_cap', {
    route_template: routeTemplate,
    count: cap.count,
    cap: cap.cap,
    allowed: cap.refusal === null,
  });
  return cap.refusal;
}

async function usage(
  ctx: ServerContext,
  run: RunRow,
  rs: RunState,
  actionsInState: number,
): Promise<GateContext['usage']> {
  const { n } = await ctx.db
    .selectFrom('state_observations')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('run_id', '=', run.id)
    .executeTakeFirstOrThrow();
  const depth = rs.currentStateId ? (rs.depthByState.get(rs.currentStateId) ?? 0) + 1 : 1;
  return {
    depth,
    states: Number(n),
    actionsInState,
    elapsedMs: run.elapsed_ms,
    steps: run.steps_used,
  };
}

function gateContext(rs: RunState, u: GateContext['usage']): GateContext {
  return {
    scope: rs.scope,
    denylist: rs.effective.portal.denylist,
    rules: rs.ruleSet,
    robots: rs.robots.registry,
    effectiveMaxActionClass: rs.effective.effectiveMaxActionClass,
    usage: u,
    ...(rs.isTrace ? { classify: TRACE_CLASSIFY } : {}),
  };
}

/** Trace runs submit GET forms (quote calculators); label and target rules still raise. */
const TRACE_CLASSIFY = { safeFormSubmitIsRead: true } as const;

/** The navigation policy handed to the request gate: the same `decide` as `navigate`, minus budgets. */
export function navigationPolicy(rs: RunState): (url: string) => Refusal | null {
  return (url) => {
    const d = decide(
      { kind: 'navigate', url },
      { ...gateContext(rs, { depth: 0, states: 0, actionsInState: 0, elapsedMs: 0, steps: 0 }) },
    );
    if (d.allowed) return null;
    return {
      status: d.status,
      rule: d.rule,
      reason: d.reason,
      ...(d.policyId ? { policyId: d.policyId } : {}),
    };
  };
}

/** Persist a detected block: `stopped_warning`, a decision-log warning, and nothing more (FR-008). Idempotent. */
export function persistStop(ctx: ServerContext, rs: RunState, warning: string): Promise<void> {
  rs.stopPersisted ??= (async () => {
    emitForRun(ctx.tracer, rs.runId, 'run_stop', { warning: maskText(warning) });
    if (rs.processId)
      await closeProcess(ctx, rs.processId, { outcome: 'stopped', blocked_reason: warning });
    await completeRun(
      ctx,
      { run_id: rs.runId, status: 'stopped_warning', warning },
      rs.session.gate.robotsStats(),
    );
    await ctx.decisions.record({
      run_id: rs.runId,
      kind: 'warning',
      rule: 'block_detected',
      reason: warning,
    });
  })();
  return rs.stopPersisted;
}

async function throwIfStopped(ctx: ServerContext, rs: RunState): Promise<void> {
  const stop = rs.session.gate.stopped;
  if (!stop) return;
  await persistStop(ctx, rs, stop.warning);
  throw new ToolError('RUN_STOPPED', stop.warning);
}

/** Guard applied at the start of every browser-touching tool. */
export async function beginStep(
  ctx: ServerContext,
  rs: RunState | undefined,
  runId: string,
): Promise<RunRow> {
  const run = await assertRunActive(ctx, runId);
  if (!rs)
    throw new ToolError(
      'RUN_STOPPED',
      `run ${runId} has no active browser session in this server; call start_run with resume_run_id`,
    );
  await throwIfStopped(ctx, rs);
  if (await isBudgetExhausted(ctx, run)) {
    if (rs.processId)
      await closeProcess(ctx, rs.processId, {
        outcome: 'stopped',
        blocked_reason: 'a step, time or state budget is exhausted',
      });
    await completeRun(ctx, { run_id: run.id, status: 'completed' }, rs.session.gate.robotsStats());
    throw new ToolError(
      'RUN_STOPPED',
      'a step, time or state budget is exhausted; the run has completed',
    );
  }
  return run;
}

async function bumpRun(
  ctx: ServerContext,
  run: RunRow,
  startedAt: number,
  depth: number,
): Promise<void> {
  const counters = {
    steps_used: run.steps_used + 1,
    elapsed_ms: run.elapsed_ms + (Date.now() - startedAt),
    max_depth_reached: Math.max(run.max_depth_reached, depth),
  };
  await ctx.db.updateTable('runs').set(counters).where('id', '=', run.id).execute();
  ctx.tracer.event('run_status', { status: run.status, ...counters });
}

/** `event stabilization_timeout` when the page never settled (research §9). */
function traceSettle(ctx: ServerContext, rs: RunState, outcome: SettleOutcome): void {
  if (!outcome.diagnostics) return;
  const d = outcome.diagnostics;
  ctx.tracer.event('stabilization_timeout', {
    timeout_ms: Math.round(outcome.waitedMs),
    in_flight: d.inFlight.map((r) => ({
      url: shapeUrl(r.url, (u) => rs.peekRouteTemplate(u)),
      resource_type: r.resourceType,
      age_ms: Math.round(r.ageMs),
    })),
    since_mutation_ms: d.sinceMutationMs === null ? null : Math.round(d.sinceMutationMs),
    running_animations: d.runningAnimations,
  });
}

export interface ActionRow {
  id: string;
  state_id: string;
  role: string;
  accessible_name: string | null;
  json: {
    nth: number;
    /** Trace runs: a fill/check/select control. */
    input?: 'fill' | 'check' | 'select';
    href?: string;
    method?: string;
    form?: ActionDescriptor['form'];
    attributes?: Record<string, string>;
    locators: { kind: string; value: string; rank: number }[];
    snapshot_ref?: string;
    page_url: string;
  };
}

/** The transition record carries the action's signals and locators but not where it was found. */
function withoutPageUrl(json: ActionRow['json']): Omit<ActionRow['json'], 'page_url'> {
  const copy: Partial<ActionRow['json']> = { ...json };
  delete copy.page_url;
  return copy as Omit<ActionRow['json'], 'page_url'>;
}

function descriptorOf(a: ActionRow): ActionDescriptor {
  return {
    role: a.role,
    ...(a.accessible_name ? { name: a.accessible_name } : {}),
    ...(a.json.href ? { href: a.json.href } : {}),
    ...(a.json.method ? { method: a.json.method } : {}),
    ...(a.json.form ? { form: a.json.form } : {}),
    ...(a.json.attributes ? { attributes: a.json.attributes } : {}),
    ...(a.json.input ? { input: a.json.input } : {}),
  };
}

async function getAction(ctx: ServerContext, runId: string, actionId: string): Promise<ActionRow> {
  const row = await ctx.db
    .selectFrom('actions')
    .selectAll()
    .where('id', '=', actionId)
    .where('run_id', '=', runId)
    .executeTakeFirst();
  if (!row)
    throw new ToolError(
      'UNKNOWN_ACTION',
      `action_id ${actionId} was not issued by the server for this run`,
    );
  return {
    id: row.id,
    state_id: row.state_id,
    role: row.role,
    accessible_name: row.accessible_name,
    json: JSON.parse(row.action_json),
  };
}

/** Observe the current page, fingerprint it and record everything (states, forms, API calls, actions, frontier). */
async function processPage(
  ctx: ServerContext,
  run: RunRow,
  rs: RunState,
  via: { kind: 'navigate' } | { kind: 'act'; action: ActionRow },
  depth: number,
  /** Trace runs: the step this call is, recorded once the page is observed. */
  step?: TraceStep,
): Promise<PageResult> {
  const { session } = rs;
  const stabilization = await phase(ctx, 'settle', async () => {
    const outcome = await session.settleTraced();
    traceSettle(ctx, rs, outcome);
    flushObstacles(ctx, rs);
    const result = outcome.result;
    await throwIfStopped(ctx, rs);
    return result;
  });

  const observed = await phase(ctx, 'observe', () => observePage(session.page));
  const net = await phase(ctx, 'net_drain', async () => {
    const drained = await session.recorder.drain();
    await throwIfStopped(ctx, rs);
    return drained;
  });

  const { masked, routeTemplate, fp, assignment } = await phase(ctx, 'fingerprint', async () => {
    const masked = maskText(observed.ariaSnapshot);
    const routeTemplate = rs.routeTemplateFor(observed.url);
    const fp = computeFingerprint({ routeTemplate, ariaSnapshot: masked });
    const assignment = rs.index.assign(fp);
    await ctx.decisions.record({
      run_id: run.id,
      kind: assignment.decision.kind,
      rule: `fingerprint:${assignment.decision.reason}`,
      reason: `${assignment.decision.kind} into ${assignment.clusterId} (similarity ${assignment.decision.similarity.toFixed(2)}, threshold ${assignment.decision.threshold})`,
      subject_ref: fp.level1,
      detail: { matched: assignment.decision.matchedFingerprint, route_template: routeTemplate },
    });
    ctx.tracer.event('fingerprint_assign', {
      route_template: routeTemplate,
      level1: fp.level1,
      decision: assignment.decision.kind,
      cluster_id: assignment.clusterId,
      matched: assignment.decision.matchedFingerprint ?? null,
      similarity: assignment.decision.similarity,
      threshold: assignment.decision.threshold,
    });
    return { masked, routeTemplate, fp, assignment };
  });

  const { evidenceRef, alreadyInRun, state_id, created, stateRow } = await phase(
    ctx,
    'record_state',
    async () => {
      const evidenceRef = await ctx.evidence.storeText(masked, 'yaml');
      const alreadyInRun = await ctx.db
        .selectFrom('state_observations')
        .innerJoin('states', 'states.id', 'state_observations.state_id')
        .select('states.id')
        .where('state_observations.run_id', '=', run.id)
        .where('states.fingerprint', '=', fp.level1)
        .executeTakeFirst();
      const { state_id, created } = await recordState(ctx, {
        run_id: run.id,
        fingerprint: fp.level1,
        cluster_id: assignment.clusterId,
        route_template: routeTemplate,
        title: maskText(observed.title),
        evidence_ref: evidenceRef,
        confidence: 'observed',
        stabilization,
      });
      const stateRow = await ctx.db
        .selectFrom('states')
        .select(['cluster_id', 'title', 'route_template'])
        .where('id', '=', state_id)
        .executeTakeFirstOrThrow();
      ctx.tracer.event('state_recorded', { state_id, created, evidence_ref: evidenceRef });
      return { evidenceRef, alreadyInRun, state_id, created, stateRow };
    },
  );
  if (!rs.depthByState.has(state_id)) rs.depthByState.set(state_id, depth);

  // Forms: recorded once per state per run, never submitted (FR-011). Per run, not per state: a
  // trace over states an earlier run created still carries the forms the BA reads from its runs.
  const formCount = await phase(ctx, 'record_forms', async () => {
    let n = 0;
    if (alreadyInRun !== undefined) return n;
    for (const f of observed.forms) {
      if (f.fields.length === 0) continue;
      await recordForm(ctx, {
        run_id: run.id,
        state_id,
        fields: f.fields.map((x) => ({ ...x, required: x.required })),
        evidence_ref: evidenceRef,
        confidence: 'observed',
      });
      n += 1;
    }
    return n;
  });

  // Edge (for act) first: API calls observed during an action hang off it.
  let edgeId: string | undefined;
  if (via.kind === 'act') {
    const a = via.action;
    const transitionJson = withoutPageUrl(a.json);
    edgeId = await phase(
      ctx,
      'record_transition',
      async () =>
        (
          await recordTransition(ctx, {
            run_id: run.id,
            from_state: a.state_id,
            to_state: state_id,
            action: { role: a.role, accessible_name: a.accessible_name, ...transitionJson },
            safety_class: classifyAction(
              descriptorOf(a),
              rs.ruleSet,
              rs.isTrace ? TRACE_CLASSIFY : {},
            ).safetyClass,
            status: 'executed',
            evidence_ref: evidenceRef,
            confidence: 'observed',
            stabilization,
          })
        ).edge_id,
    );
  }

  await phase(ctx, 'record_api_calls', () => recordNetwork(ctx, run, net, edgeId, state_id));

  const issued = await phase(ctx, 'enqueue_frontier', () =>
    issueAndEnqueue(ctx, run, rs, observed, {
      state_id,
      created,
      evidenceRef,
      alreadyInRun: alreadyInRun !== undefined,
      routeTemplate,
      clusterId: assignment.clusterId,
      depth,
    }),
  );

  let recordedStep: PageResult['step'];
  if (step && rs.processId) {
    const processId = rs.processId;
    recordedStep = await phase(ctx, 'record_step', async () => {
      const after = { url: observed.url, title: observed.title, snapshot: masked };
      const outcomes = rs.lastObserved ? stepOutcomes(rs.lastObserved, after) : [];
      // A click that changes nothing visible is a fact worth recording (e.g. a submit the
      // browser's own form validation held back, which the ARIA snapshot does not show).
      if (outcomes.length === 0 && step.kind === 'click') {
        outcomes.push('No visible change after the step');
        // The browser's own message for each field that holds the submit back, e.g. an empty
        // required field or a value that misses its pattern.
        for (const form of observed.forms)
          for (const field of form.fields)
            for (const msg of field.validation_messages ?? [])
              outcomes.push(`Browser validation on ${field.name}: ${maskText(msg)}`);
      }
      const ord = await appendStep(ctx, processId, {
        intent: step.intent,
        kind: step.kind,
        action_id: step.action_id,
        edge_id: edgeId ?? null,
        value: step.value,
        state_before: rs.currentStateId,
        state_after: state_id,
        outcomes,
        evidence_ref: evidenceRef,
      });
      return { ord, outcomes };
    });
  }
  rs.lastObserved = { url: observed.url, title: observed.title, snapshot: masked };
  rs.currentStateId = state_id;
  rs.currentUrl = observed.url;

  const inputs = rs.effective.persona.trace_inputs ?? {};
  return {
    state_id,
    created,
    cluster_id: stateRow.cluster_id,
    title: stateRow.title,
    route_template: stateRow.route_template,
    forms: formCount,
    actions: issued.map((a) => ({
      action_id: a.actionId,
      role: a.role,
      accessible_name: a.name,
      safety_class: a.safetyClass,
      allowed: a.allowed,
      ...(a.skip_reason ? { skip_reason: a.skip_reason } : {}),
      ...(a.input && a.input !== 'check' && a.name !== null && inputs[a.name] !== undefined
        ? { suggested_value: inputs[a.name] }
        : {}),
    })),
    ...(edgeId ? { edge_id: edgeId } : {}),
    ...(recordedStep ? { step: recordedStep } : {}),
  };
}

/** What a trace call adds to its step row; the server fills in everything it observed. */
interface TraceStep {
  intent: string;
  kind: StepKind;
  action_id: string | null;
  value: string | null;
}

async function recordNetwork(
  ctx: ServerContext,
  run: RunRow,
  net: Awaited<ReturnType<RunState['session']['recorder']['drain']>>,
  edgeId: string | undefined,
  state_id: string,
): Promise<void> {
  for (const call of net.calls) {
    try {
      await recordApiCall(ctx, {
        run_id: run.id,
        edge_id: edgeId ?? null,
        ...call,
        console_errors: net.console_errors,
      });
    } catch (e) {
      if (!(e instanceof ToolError)) throw e;
      await ctx.decisions.record({
        run_id: run.id,
        kind: 'refuse',
        rule: e.code,
        reason: `API call ${call.method} ${call.url_template} not recorded: ${e.message}`,
        subject_ref: state_id,
      });
    }
  }
  if (net.calls.length === 0 && net.console_errors.length > 0) {
    await ctx.decisions.record({
      run_id: run.id,
      kind: 'warning',
      rule: 'console_errors',
      reason: `${net.console_errors.length} console error(s)/failed request(s) observed`,
      subject_ref: state_id,
      detail: { errors: net.console_errors },
    });
  }
}

type IssuedAction = ClassifiedAction & {
  actionId: string;
  actionJson: unknown;
  allowed: boolean;
  skip_reason?: string;
};

/** Issue server action ids for the page's candidates and queue them for exploration (first visit only). */
async function issueAndEnqueue(
  ctx: ServerContext,
  run: RunRow,
  rs: RunState,
  observed: Awaited<ReturnType<typeof observePage>>,
  page: {
    state_id: string;
    created: boolean;
    evidenceRef: string;
    alreadyInRun: boolean;
    routeTemplate: string;
    clusterId: string;
    depth: number;
  },
): Promise<IssuedAction[]> {
  const { state_id, created, evidenceRef, alreadyInRun, routeTemplate, depth } = page;
  // Actions: server-issued ids, stable per (state, role, name, nth) so a revisit reuses them.
  const extracted = extractCandidates(observed.ariaSnapshot, observed.forms, {
    mode: rs.isTrace ? 'trace' : 'map',
  });
  const candidates = classifyCandidates(extracted, rs.ruleSet, rs.isTrace ? TRACE_CLASSIFY : {});
  const locatorSets = attachLocators(extracted, observed.testIds);
  const existing = await ctx.db
    .selectFrom('actions')
    .selectAll()
    .where('run_id', '=', run.id)
    .where('state_id', '=', state_id)
    .execute();
  const idFor = (c: ClassifiedAction): string | undefined =>
    existing.find(
      (e) =>
        e.role === c.role &&
        (e.accessible_name ?? null) === c.name &&
        (JSON.parse(e.action_json) as { nth: number }).nth === c.nth,
    )?.id;

  const g = gateContext(rs, await usage(ctx, run, rs, 0));
  const issued: IssuedAction[] = [];
  for (const [ci, c] of candidates.entries()) {
    const d = decide({ kind: 'act', descriptor: c.descriptor, currentUrl: observed.url }, g);
    const json = {
      nth: c.nth,
      ...(c.input ? { input: c.input } : {}),
      ...(c.href ? { href: c.href } : {}),
      ...(c.descriptor.form ? { form: c.descriptor.form } : {}),
      locators: locatorSets[ci] ?? [],
      // QA can re-read the element in the snapshot of the page it was found on.
      snapshot_ref: evidenceRef,
      page_url: observed.url,
    };
    let id = idFor(c);
    if (!id) {
      id = newId();
      await ctx.db
        .insertInto('actions')
        .values({
          id,
          run_id: run.id,
          state_id,
          role: c.role,
          accessible_name: c.name,
          action_json: JSON.stringify(json),
          safety_class: d.classification.safetyClass,
          allowed: d.allowed ? 1 : 0,
          skip_reason: d.allowed ? null : `${d.rule}: ${d.reason}`,
          created_at: nowIso(),
        })
        .execute();
    }
    issued.push({
      ...c,
      actionId: id,
      actionJson: { role: c.role, accessible_name: c.name, ...json },
      allowed: d.allowed,
      ...(d.allowed ? {} : { skip_reason: `${d.rule}: ${d.reason}` }),
    });
  }

  // Queue for exploration only the first time this run sees the state, and only if the policy admits it.
  // A trace run follows one process and uses no frontier.
  if (!alreadyInRun && !rs.isTrace) {
    const isNew = rs.policy.isNewCluster(page.clusterId);
    const admission = rs.policy.admit({ clusterId: page.clusterId, routeTemplate, created });
    if (admission.expand) {
      const priority = rs.policy.priorityFor(depth, isNew);
      const r = await enqueueActions({
        db: ctx.db,
        runId: run.id,
        stateId: state_id,
        depth,
        priority,
        currentUrl: observed.url,
        actions: issued,
        gate: g,
      });
      const described = (actionId: string) => {
        const a = issued.find((x) => x.actionId === actionId);
        return a ? { role: a.role, accessible_name: a.name, nth: a.nth } : { action_id: actionId };
      };
      for (const q of r.enqueued)
        ctx.tracer.event('frontier_enqueue', {
          frontier_id: q.frontierId,
          action: described(q.actionId),
          safety_class: q.safetyClass,
          priority,
          depth,
        });
      for (const s of r.skipped) {
        ctx.tracer.event('frontier_skip', {
          frontier_id: s.frontierId,
          action: described(s.actionId),
          safety_class: s.safetyClass,
          priority,
          depth,
          rule: s.refusal.rule,
          reason: s.refusal.reason,
        });
        await ctx.decisions.record({
          run_id: run.id,
          kind: 'skip',
          rule: s.refusal.rule,
          reason: s.refusal.reason,
          subject_ref: s.frontierId,
          detail: {
            status: s.refusal.status,
            safety_class: s.safetyClass,
            ...(s.refusal.policyId ? { policy_id: s.refusal.policyId } : {}),
          },
        });
      }
    } else {
      const frontierId = newId();
      ctx.tracer.event('frontier_skip', {
        frontier_id: frontierId,
        action: { kind: 'expand', route_template: routeTemplate },
        safety_class: 'read',
        priority: 0,
        depth,
        rule: admission.rule,
        reason: admission.reason,
      });
      await ctx.db
        .insertInto('frontier')
        .values({
          id: frontierId,
          run_id: run.id,
          state_id,
          action_id: null,
          action_json: JSON.stringify({ kind: 'expand', state_id, route_template: routeTemplate }),
          safety_class: 'read',
          status: admission.status,
          priority: 0,
          depth,
          reason: `${admission.rule}: ${admission.reason}`,
          created_at: nowIso(),
          updated_at: nowIso(),
        })
        .execute();
      await ctx.decisions.record({
        run_id: run.id,
        kind: 'skip',
        rule: admission.rule,
        reason: admission.reason,
        subject_ref: state_id,
      });
    }
  }

  return issued;
}

async function refuse(
  ctx: ServerContext,
  run: RunRow,
  rs: RunState,
  refusal: Refusal,
  subject: string,
  action: Record<string, unknown>,
  safetyClass: string,
  stateId: string | null,
  actionId: string | null,
): Promise<never> {
  await ctx.decisions.record({
    run_id: run.id,
    kind: 'refuse',
    rule: refusal.rule,
    reason: refusal.reason,
    subject_ref: subject,
    detail: {
      status: refusal.status,
      ...(refusal.policyId ? { policy_id: refusal.policyId } : {}),
    },
  });
  if (stateId) {
    const pending = actionId ? await pendingItemForAction(ctx.db, run.id, actionId) : undefined;
    if (pending)
      await settleFrontierItem(
        ctx.db,
        pending.id,
        refusal.status,
        `${refusal.rule}: ${refusal.reason}`,
      );
    else {
      await ctx.db
        .insertInto('frontier')
        .values({
          id: newId(),
          run_id: run.id,
          state_id: stateId,
          action_id: actionId,
          action_json: JSON.stringify(action),
          safety_class: safetyClass as 'read',
          status: refusal.status,
          priority: 0,
          depth: 0,
          reason: `${refusal.rule}: ${refusal.reason}`,
          created_at: nowIso(),
          updated_at: nowIso(),
        })
        .execute();
    }
  }
  void rs;
  throw new ToolError('ACTION_REFUSED', refusal.reason, {
    rule: refusal.rule,
    status: refusal.status,
  });
}

export async function navigate(
  ctx: ServerContext,
  rs: RunState | undefined,
  input: NavigateInput,
): Promise<PageResult> {
  const run = await phase(ctx, 'begin_step', () => beginStep(ctx, rs, input.run_id));
  requireIntent(rs!, input.intent);
  return counted(rs!, () => navigateStep(ctx, run, rs!, input));
}

/** Trace calls must say what the step is for (contracts/crawler-trace-tools.md). */
function requireIntent(rs: RunState, intent: string | undefined): void {
  if (rs.isTrace && (intent === undefined || intent.trim() === ''))
    throw new ToolError('SCHEMA_INVALID', 'intent: required in a trace run');
}

async function navigateStep(
  ctx: ServerContext,
  run: RunRow,
  state: RunState,
  input: NavigateInput,
): Promise<PageResult> {
  const started = Date.now();
  state.obstacleCursor = state.session.obstacles.events.length;
  const g = await phase(ctx, 'gate', async () => {
    const g = gateContext(state, await usage(ctx, run, state, 0));
    const d = decide({ kind: 'navigate', url: input.url }, g);
    traceGate(ctx, state, { kind: 'navigate', url: input.url }, d);
    if (!d.allowed) {
      return refuse(
        ctx,
        run,
        state,
        d,
        input.url,
        { kind: 'navigate', url: input.url },
        d.classification.safetyClass,
        state.currentStateId,
        null,
      );
    }
    let routeTemplate: string;
    try {
      routeTemplate = state.routeTemplateFor(input.url);
    } catch {
      routeTemplate = '/';
    }
    const cap = await itemCapChecked(ctx, state, run.id, routeTemplate);
    if (cap)
      return refuse(
        ctx,
        run,
        state,
        cap,
        input.url,
        { kind: 'navigate', url: input.url },
        'read',
        state.currentStateId,
        null,
      );
    return g;
  });

  await phase(ctx, 'goto', async () => {
    await state.session.goto(input.url);
    await throwIfStopped(ctx, state);
  });
  const depth = g.usage.depth;
  const result = await processPage(
    ctx,
    run,
    state,
    { kind: 'navigate' },
    depth,
    state.isTrace
      ? { intent: input.intent!, kind: 'navigate', action_id: null, value: null }
      : undefined,
  );
  await phase(ctx, 'run_bookkeeping', () => bumpRun(ctx, run, started, depth));
  flushObstacles(ctx, state);
  return result;
}

export async function act(
  ctx: ServerContext,
  rs: RunState | undefined,
  input: ActInput,
): Promise<PageResult> {
  const run = await phase(ctx, 'begin_step', () => beginStep(ctx, rs, input.run_id));
  requireIntent(rs!, input.intent);
  return counted(rs!, () => actStep(ctx, run, rs!, input));
}

/**
 * The value a fill/select step types or picks: the agent's, else the persona's `trace_inputs` value
 * for the field's label. Values must be synthetic ({@link isSyntheticInput}): one the PII scrubber
 * would change is refused, except an e-mail on a reserved test TLD.
 */
function inputValue(rs: RunState, action: ActionRow, value: string | undefined): string | null {
  const kind = action.json.input;
  if (kind !== 'fill' && kind !== 'select') {
    if (value !== undefined)
      throw new ToolError('SCHEMA_INVALID', 'value: only for fill and select actions');
    return null;
  }
  const v =
    value ??
    (action.accessible_name !== null
      ? rs.effective.persona.trace_inputs?.[action.accessible_name]
      : undefined);
  if (v === undefined)
    throw new ToolError(
      'SCHEMA_INVALID',
      `value: required for ${kind} "${action.accessible_name ?? action.role}" (no trace_inputs value for it)`,
    );
  if (!isSyntheticInput(v))
    throw new ToolError(
      'PII_SUSPECTED',
      'value looks like personal data; use an obviously synthetic value (e-mail on .invalid, .test or .example)',
    );
  return v;
}

async function actStep(
  ctx: ServerContext,
  run: RunRow,
  state: RunState,
  input: ActInput,
): Promise<PageResult> {
  const started = Date.now();
  state.obstacleCursor = state.session.obstacles.events.length;
  if (state.isTrace) {
    // A trace acts on the page as it is now. Re-opening an earlier page would silently drop what
    // the previous steps typed, so an action id from another state is refused instead.
    const issued = await getAction(ctx, run.id, input.action_id);
    if (issued.state_id !== state.currentStateId)
      throw new ToolError(
        'UNKNOWN_ACTION',
        `action_id ${input.action_id} belongs to an earlier page state; in a trace use the action ids from the latest navigate/act result`,
      );
  }
  const { action, g, d } = await phase(ctx, 'gate', () =>
    gateAct(ctx, run, state, input.action_id),
  );
  const value = inputValue(state, action, input.value);

  // Reach the state the action belongs to (through the same gates) when the browser is elsewhere.
  if (state.currentStateId !== action.state_id) {
    await phase(ctx, 'reach_state', async () => {
      const to = action.json.page_url;
      const nav = decide({ kind: 'navigate', url: to }, g);
      traceGate(ctx, state, { kind: 'navigate', url: to }, nav);
      if (!nav.allowed)
        return refuse(
          ctx,
          run,
          state,
          nav,
          to,
          { kind: 'navigate', url: to },
          nav.classification.safetyClass,
          action.state_id,
          action.id,
        );
      await state.session.goto(to);
      await throwIfStopped(ctx, state);
      traceSettle(ctx, state, await state.session.settleTraced());
      await state.session.recorder.drain();
    });
  }

  // FR-024: a link to another item page is refused once the item view cap is reached.
  if (action.json.href) {
    await phase(ctx, 'gate', async () => {
      let target: string | undefined;
      try {
        target = new URL(action.json.href!, action.json.page_url).toString();
      } catch {
        /* unparseable href: no item-cap check, the gate already vetted the action */
      }
      if (!target) return;
      const cap = await itemCapChecked(ctx, state, run.id, state.routeTemplateFor(target));
      if (cap) {
        return refuse(
          ctx,
          run,
          state,
          cap,
          action.id,
          { role: action.role, accessible_name: action.accessible_name },
          'read',
          action.state_id,
          action.id,
        );
      }
    });
  }

  const locatorAttrs = {
    role: action.role,
    accessible_name: action.accessible_name,
    nth: action.json.nth,
  };
  const { locator, matches } = await phase(ctx, 'locate', async () => {
    const all = state.session.page.getByRole(
      action.role as never,
      action.accessible_name ? { name: action.accessible_name, exact: true } : {},
    );
    const matches = await all.count();
    const locator = all.nth(action.json.nth);
    if ((await locator.count()) === 0) {
      ctx.tracer.event('locator', { ...locatorAttrs, matches, outcome: 'absent' });
      const refusal: Refusal = {
        status: 'unreachable',
        rule: 'unreachable',
        reason: `${action.role} ${JSON.stringify(action.accessible_name)} is no longer present on ${action.json.page_url}`,
      };
      return refuse(
        ctx,
        run,
        state,
        refusal,
        action.id,
        { role: action.role, accessible_name: action.accessible_name },
        d.classification.safetyClass,
        action.state_id,
        action.id,
      );
    }
    return { locator, matches };
  });
  await phase(ctx, 'click', async () => {
    // Reachability first (trial: actionability only, nothing is clicked), then the click itself with
    // the budget of a page load: a click that starts a navigation waits for it, and at a low rate
    // limit that request can queue for a while. A slow navigation must not read as an unreachable
    // element.
    let stage = 'click failed';
    try {
      await locator.click({ trial: true, timeout: 5000 });
      stage = 'navigation after click did not start';
      const kind = action.json.input;
      if (kind === 'fill') {
        stage = 'fill failed';
        await locator.fill(value!, { timeout: 5000 });
      } else if (kind === 'select') {
        stage = 'select failed';
        await locator.selectOption(value!, { timeout: 5000 });
      } else if (kind === 'check') {
        stage = 'check failed';
        await locator.check({ timeout: 5000 });
      } else await locator.click({ timeout: 30_000 });
      ctx.tracer.event('locator', { ...locatorAttrs, matches, outcome: kind ?? 'clicked' });
    } catch (e) {
      ctx.tracer.event('locator', {
        ...locatorAttrs,
        matches,
        outcome: 'click_failed',
        error: maskText((e as Error).message.split('\n')[0] ?? ''),
        // Playwright's call log says why the click never became actionable (an element that
        // "intercepts pointer events", "not visible", "not stable"); the first line never does.
        // The reason is at the end of the log, so the tail is kept.
        call_log: maskText(
          (e as Error).message
            .replace(ANSI_STYLE, '')
            .split('\n')
            .slice(1)
            .map((l) => l.trim().slice(0, 200))
            .filter(Boolean)
            .slice(-10)
            .join(' | '),
        ),
      });
      // A handler may have fired during the failed click; without this the trace would hide it.
      flushObstacles(ctx, state);
      await throwIfStopped(ctx, state);
      const refusal: Refusal = {
        status: 'unreachable',
        rule: 'click_failed',
        reason: `${stage}: ${(e as Error).message.split('\n')[0]}`,
      };
      return refuse(
        ctx,
        run,
        state,
        refusal,
        action.id,
        { role: action.role, accessible_name: action.accessible_name },
        d.classification.safetyClass,
        action.state_id,
        action.id,
      );
    }
    await throwIfStopped(ctx, state);
  });

  const fromDepth = state.depthByState.get(action.state_id) ?? 0;
  // Typing into a form stays on the same page: only clicks take the trace one level deeper.
  const toDepth = action.json.input ? fromDepth : fromDepth + 1;
  const result = await processPage(
    ctx,
    run,
    state,
    { kind: 'act', action },
    toDepth,
    state.isTrace
      ? { intent: input.intent!, kind: action.json.input ?? 'click', action_id: action.id, value }
      : undefined,
  );
  await phase(ctx, 'run_bookkeeping', async () => {
    const pending = await pendingItemForAction(ctx.db, run.id, action.id);
    if (pending) await settleFrontierItem(ctx.db, pending.id, 'done', null);
    await bumpRun(ctx, run, started, toDepth);
  });
  flushObstacles(ctx, state);
  return result;
}

/** Load the issued action and re-check it; refuses (and records a skipped edge) when not allowed. */
async function gateAct(
  ctx: ServerContext,
  run: RunRow,
  state: RunState,
  actionId: string,
): Promise<{ action: ActionRow; g: GateContext; d: ReturnType<typeof decide> }> {
  const action = await getAction(ctx, run.id, actionId);
  const descriptor = descriptorOf(action);

  // The server re-derives the class and re-checks everything; nothing the agent says is trusted.
  const priorActions = await ctx.db
    .selectFrom('edges')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('run_id', '=', run.id)
    .where('from_state', '=', action.state_id)
    .executeTakeFirstOrThrow();
  const g = gateContext(state, await usage(ctx, run, state, Number(priorActions.n)));
  const d = decide({ kind: 'act', descriptor, currentUrl: action.json.page_url }, g);
  traceGate(ctx, state, { kind: 'act', action }, d);
  if (!d.allowed) {
    const stateEvidence = await ctx.db
      .selectFrom('states')
      .select('evidence_ref')
      .where('id', '=', action.state_id)
      .executeTakeFirstOrThrow();
    await recordTransition(ctx, {
      run_id: run.id,
      from_state: action.state_id,
      to_state: null,
      action: {
        role: action.role,
        accessible_name: action.accessible_name,
        ...withoutPageUrl(action.json),
      },
      safety_class: d.classification.safetyClass,
      status: 'skipped',
      evidence_ref: stateEvidence.evidence_ref,
      confidence: 'observed',
    });
    const refused = refuse(
      ctx,
      run,
      state,
      d,
      action.id,
      { role: action.role, accessible_name: action.accessible_name },
      d.classification.safetyClass,
      action.state_id,
      action.id,
    );
    // A trace stops where the safety class does (production, or any ceiling below the action):
    // robots, denylist and scope refusals stay plain ACTION_REFUSED.
    if (state.isTrace && d.status === 'skipped_unsafe') {
      await refused.catch(() => undefined);
      return traceBoundary(ctx, run, state, action, d);
    }
    return refused;
  }

  return { action, g, d };
}

/**
 * Close the trace at the first action the run may not execute (contracts/crawler-trace-tools.md):
 * process `boundary_reached` with what stays unobserved, a crawler open question about it, run
 * `completed`, a linked follow-up `blocked`, then TRACE_BOUNDARY_REACHED for the agent to report.
 */
async function traceBoundary(
  ctx: ServerContext,
  run: RunRow,
  state: RunState,
  action: ActionRow,
  d: Extract<ReturnType<typeof decide>, { allowed: false }>,
): Promise<never> {
  const processId = state.processId!;
  const name = action.accessible_name ?? action.role;
  const cls = d.classification.safetyClass;
  const environment = state.effective.portal.environment;
  const notObservable = `What happens after '${name}'? Not observable: ${cls} on ${environment}`;
  await ctx.db
    .insertInto('open_questions')
    .values({
      id: newId(),
      run_id: run.id,
      text: maskText(notObservable),
      about_ref: action.state_id,
      status: 'open',
      created_at: nowIso(),
    })
    .execute();
  await closeProcess(ctx, processId, {
    outcome: 'boundary_reached',
    boundary_action_id: action.id,
    not_observable: notObservable,
    blocked_reason: `${d.rule}: ${d.reason}`,
  });
  await completeRun(ctx, { run_id: run.id, status: 'completed' }, state.session.gate.robotsStats());
  throw new ToolError(
    'TRACE_BOUNDARY_REACHED',
    `'${name}' is ${cls}, above what this run may execute on ${environment}; the trace stopped and the run is completed. Report the steps so far and stop.`,
    {
      process_id: processId,
      steps: await stepCount(ctx, processId),
      action: { role: action.role, name: action.accessible_name, safety_class: cls },
      rule: d.rule,
    },
  );
}
