import { maskText, newId, nowIso, type PathfinderDb } from '@pathfinder/core';
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
import type { RunState } from './run-state.js';

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
  db: PathfinderDb,
  run: RunRow,
  startedAt: number,
  depth: number,
): Promise<void> {
  await db
    .updateTable('runs')
    .set({
      steps_used: run.steps_used + 1,
      elapsed_ms: run.elapsed_ms + (Date.now() - startedAt),
      max_depth_reached: Math.max(run.max_depth_reached, depth),
    })
    .where('id', '=', run.id)
    .execute();
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
  const stabilization = await session.settle();
  await throwIfStopped(ctx, rs);

  const observed = await observePage(session.page);
  const net = await session.recorder.drain();
  await throwIfStopped(ctx, rs);

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
  if (!rs.depthByState.has(state_id)) rs.depthByState.set(state_id, depth);

  // Forms: recorded once per state, never submitted (FR-011).
  let formCount = 0;
  if (created) {
    for (const f of observed.forms) {
      if (f.fields.length === 0) continue;
      await recordForm(ctx, {
        run_id: run.id,
        state_id,
        fields: f.fields.map((x) => ({ ...x, required: x.required })),
        evidence_ref: evidenceRef,
        confidence: 'observed',
      });
      formCount += 1;
    }
  }

  // Edge (for act) first: API calls observed during an action hang off it.
  let edgeId: string | undefined;
  if (via.kind === 'act') {
    const a = via.action;
    const transitionJson = withoutPageUrl(a.json);
    edgeId = (
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
    ).edge_id;
  }

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
  const issued: (ClassifiedAction & {
    actionId: string;
    actionJson: unknown;
    allowed: boolean;
    skip_reason?: string;
  })[] = [];
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
    const isNew = rs.policy.isNewCluster(assignment.clusterId);
    const admission = rs.policy.admit({ clusterId: assignment.clusterId, routeTemplate, created });
    if (admission.expand) {
      const r = await enqueueActions({
        db: ctx.db,
        runId: run.id,
        stateId: state_id,
        depth,
        priority: rs.policy.priorityFor(depth, isNew),
        currentUrl: observed.url,
        actions: issued,
        gate: g,
      });
      for (const s of r.skipped) {
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
      await ctx.db
        .insertInto('frontier')
        .values({
          id: newId(),
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
  const run = await beginStep(ctx, rs, input.run_id);
  const state = rs!;
  const started = Date.now();
  const g = gateContext(state, await usage(ctx, run, state, 0));
  const d = decide({ kind: 'navigate', url: input.url }, g);
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
  const cap = await state.policy.checkItemCap(ctx.db, run.id, routeTemplate);
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

  await state.session.goto(input.url);
  await throwIfStopped(ctx, state);
  const depth = g.usage.depth;
  const result = await processPage(ctx, run, state, { kind: 'navigate' }, depth);
  await bumpRun(ctx.db, run, started, depth);
  return result;
}

export async function act(
  ctx: ServerContext,
  rs: RunState | undefined,
  input: { run_id: string; action_id: string },
): Promise<PageResult> {
  const run = await beginStep(ctx, rs, input.run_id);
  const state = rs!;
  const started = Date.now();
  const action = await getAction(ctx, run.id, input.action_id);
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

  // Reach the state the action belongs to (through the same gates) when the browser is elsewhere.
  if (state.currentStateId !== action.state_id) {
    const to = action.json.page_url;
    const nav = decide({ kind: 'navigate', url: to }, g);
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
    await state.session.settle();
    await state.session.recorder.drain();
  }

  // FR-024: a link to another item page is refused once the item view cap is reached.
  if (action.json.href) {
    let target: string | undefined;
    try {
      target = new URL(action.json.href, action.json.page_url).toString();
    } catch {
      /* unparseable href: no item-cap check, the gate already vetted the action */
    }
    if (target) {
      const cap = await state.policy.checkItemCap(ctx.db, run.id, state.routeTemplateFor(target));
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
    }
  }

  const locator = state.session.page
    .getByRole(
      action.role as never,
      action.accessible_name ? { name: action.accessible_name, exact: true } : {},
    )
    .nth(action.json.nth);
  if ((await locator.count()) === 0) {
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
  try {
    await locator.click({ timeout: 5000 });
  } catch (e) {
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

  const fromDepth = state.depthByState.get(action.state_id) ?? 0;
  const result = await processPage(ctx, run, state, { kind: 'act', action }, fromDepth + 1);
  const pending = await pendingItemForAction(ctx.db, run.id, action.id);
  if (pending) await settleFrontierItem(ctx.db, pending.id, 'done', null);
  await bumpRun(ctx.db, run, started, fromDepth + 1);
  return result;
}
