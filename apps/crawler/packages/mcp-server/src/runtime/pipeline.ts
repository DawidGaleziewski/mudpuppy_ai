import { maskText, newId, nowIso, emitForRun, shapeUrl, type PhaseName } from '@pathfinder/core';
import {
  classifyCandidates,
  decide,
  enqueueActions,
  extractCandidates,
  attachLocators,
  observePage,
  pendingItemForAction,
  settleFrontierItem,
  type ClassifiedAction,
  type GateContext,
  type SettleOutcome,
} from '@pathfinder/crawler';
import { computeFingerprint } from '@pathfinder/fingerprint';
import { classifyAction, type ActionDescriptor, type Refusal } from '@pathfinder/safety';
import type { ServerContext } from '../context.js';
import { ToolError } from '../errors.js';
import type { PageResult } from '../runtime.js';
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
  };
}

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

  // Forms: recorded once per state, never submitted (FR-011).
  const formCount = await phase(ctx, 'record_forms', async () => {
    let n = 0;
    if (!created) return n;
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
            safety_class: classifyAction(descriptorOf(a), rs.ruleSet).safetyClass,
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

  rs.currentStateId = state_id;
  rs.currentUrl = observed.url;

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
    })),
    ...(edgeId ? { edge_id: edgeId } : {}),
  };
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
  const extracted = extractCandidates(observed.ariaSnapshot, observed.forms);
  const candidates = classifyCandidates(extracted, rs.ruleSet);
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
  if (!alreadyInRun) {
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
  input: { run_id: string; url: string },
): Promise<PageResult> {
  const run = await phase(ctx, 'begin_step', () => beginStep(ctx, rs, input.run_id));
  return counted(rs!, () => navigateStep(ctx, run, rs!, input));
}

async function navigateStep(
  ctx: ServerContext,
  run: RunRow,
  state: RunState,
  input: { run_id: string; url: string },
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
  const result = await processPage(ctx, run, state, { kind: 'navigate' }, depth);
  await phase(ctx, 'run_bookkeeping', () => bumpRun(ctx, run, started, depth));
  flushObstacles(ctx, state);
  return result;
}

export async function act(
  ctx: ServerContext,
  rs: RunState | undefined,
  input: { run_id: string; action_id: string },
): Promise<PageResult> {
  const run = await phase(ctx, 'begin_step', () => beginStep(ctx, rs, input.run_id));
  return counted(rs!, () => actStep(ctx, run, rs!, input));
}

async function actStep(
  ctx: ServerContext,
  run: RunRow,
  state: RunState,
  input: { run_id: string; action_id: string },
): Promise<PageResult> {
  const started = Date.now();
  state.obstacleCursor = state.session.obstacles.events.length;
  const { action, g, d } = await phase(ctx, 'gate', () =>
    gateAct(ctx, run, state, input.action_id),
  );

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
    try {
      await locator.click({ timeout: 5000 });
      ctx.tracer.event('locator', { ...locatorAttrs, matches, outcome: 'clicked' });
    } catch (e) {
      ctx.tracer.event('locator', {
        ...locatorAttrs,
        matches,
        outcome: 'click_failed',
        error: maskText((e as Error).message.split('\n')[0] ?? ''),
      });
      await throwIfStopped(ctx, state);
      const refusal: Refusal = {
        status: 'unreachable',
        rule: 'click_failed',
        reason: `click failed: ${(e as Error).message.split('\n')[0]}`,
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
  const result = await processPage(ctx, run, state, { kind: 'act', action }, fromDepth + 1);
  await phase(ctx, 'run_bookkeeping', async () => {
    const pending = await pendingItemForAction(ctx.db, run.id, action.id);
    if (pending) await settleFrontierItem(ctx.db, pending.id, 'done', null);
    await bumpRun(ctx, run, started, fromDepth + 1);
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
    return refuse(
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
  }

  return { action, g, d };
}
