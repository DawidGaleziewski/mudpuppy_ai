import { newId, nowIso } from '@pathfinder/core';
import { shapeUrl } from '@pathfinder/trace';
import {
  decide,
  pendingItemForAction,
  settleFrontierItem,
  type GateContext,
} from '@pathfinder/crawler';
import type { Refusal } from '@pathfinder/safety';
import type { ServerContext } from '../../context.js';
import { ToolError } from '../../errors.js';
import type { RunRow } from '../../services/index.js';
import type { RunState } from '../run-state.js';
import { loginScope, noteHost } from '../transit.js';
import type { ActionRow } from './actions.js';
import { decision, event, fail, orFail, reported, type Report, type Reported } from './context.js';

/** `event gate_decision` for an agent input (navigate URL or issued action). */
export function gateEvent(
  rs: RunState,
  input: { kind: 'navigate'; url: string } | { kind: 'act'; action: ActionRow },
  d: ReturnType<typeof decide>,
): Report {
  return event('gate_decision', {
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
export async function itemCapChecked(
  ctx: ServerContext,
  rs: RunState,
  runId: string,
  routeTemplate: string,
): Promise<Reported<Refusal | null>> {
  const cap = await rs.policy.itemCap(ctx.db, runId, routeTemplate);
  if (!cap) return reported(null);
  return reported(cap.refusal, [
    event('item_cap', {
      route_template: routeTemplate,
      count: cap.count,
      cap: cap.cap,
      allowed: cap.refusal === null,
    }),
  ]);
}

export async function usage(
  ctx: ServerContext,
  run: RunRow,
  rs: RunState,
  actionsInState: number,
  /** The depth the step lands at; defaults to one below the page the browser is on. */
  depth = rs.currentStateId ? (rs.depthByState.get(rs.currentStateId) ?? 0) + 1 : 1,
): Promise<GateContext['usage']> {
  const { n } = await ctx.db
    .selectFrom('state_observations')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('run_id', '=', run.id)
    .executeTakeFirstOrThrow();
  return {
    depth,
    states: Number(n),
    actionsInState,
    elapsedMs: run.elapsed_ms,
    steps: run.steps_used,
  };
}

export function gateContext(rs: RunState, u: GateContext['usage']): GateContext {
  return {
    // A trace follows one process as deep as it goes; its step budget bounds it, not the map's
    // depth budget (spec 004 F-14). A probe run goes from one marked step to the next: depth
    // bounds exploring, which it does not do (spec 032 F-23). A replay walks a recorded path to
    // its start point: depth counts from there (spec 034 A-4).
    scope:
      rs.isTrace || rs.isProbe || rs.replay?.target !== undefined
        ? { ...rs.scope, max_depth: Number.MAX_SAFE_INTEGER }
        : rs.scope,
    denylist: rs.effective.portal.denylist,
    rules: rs.ruleSet,
    robots: rs.robots.registry,
    effectiveMaxActionClass: rs.effective.effectiveMaxActionClass,
    usage: u,
    ...(rs.isTrace ? { classify: TRACE_CLASSIFY } : {}),
  };
}

/** Trace runs submit GET forms (quote calculators); label and target rules still raise. */
export const TRACE_CLASSIFY = { safeFormSubmitIsRead: true } as const;

/** The navigation policy handed to the request gate: the same `decide` as `navigate`, minus budgets. */
export function navigationPolicy(rs: RunState): (url: string) => Refusal | null {
  return (url) => {
    const g = gateContext(rs, { depth: 0, states: 0, actionsInState: 0, elapsedMs: 0, steps: 0 });
    // A login passes through its transit zone whatever the run's scope (spec 037 FR-004).
    if (rs.loggingIn) {
      noteHost(rs, url);
      g.scope = loginScope(g.scope);
    }
    const d = decide({ kind: 'navigate', url }, g);
    if (d.allowed) return null;
    return {
      status: d.status,
      rule: d.rule,
      reason: d.reason,
      ...(d.policyId ? { policyId: d.policyId } : {}),
    };
  };
}

/** What a refusal is about: the decision's subject and, when known, its frontier item. */
export interface RefusalTarget {
  /** `subject_ref` of the decision (a URL or an action id). */
  subject: string;
  /** Stored as the frontier item's `action_json` when no item exists yet. */
  action: Record<string, unknown>;
  safetyClass: string;
  /** No frontier item is written without a state (a navigate before any page was observed). */
  stateId: string | null;
  actionId: string | null;
}

/** The refusal target of an issued action, settled on its own frontier item. */
export function actionTarget(action: ActionRow, safetyClass: string): RefusalTarget {
  return {
    subject: action.id,
    action: { role: action.role, accessible_name: action.accessible_name },
    safetyClass,
    stateId: action.state_id,
    actionId: action.id,
  };
}

/**
 * Settle the refusal's frontier item and fail with ACTION_REFUSED to the agent; the enclosing
 * `step()` writes `reports` (what the step saw first) and the refusal's decision.
 */
export async function refuse(
  ctx: ServerContext,
  run: RunRow,
  refusal: Refusal,
  target: RefusalTarget,
  reports: Report[] = [],
): Promise<never> {
  const all = [
    ...reports,
    decision({
      kind: 'refuse',
      rule: refusal.rule,
      reason: refusal.reason,
      subject_ref: target.subject,
      detail: {
        status: refusal.status,
        ...(refusal.policyId ? { policy_id: refusal.policyId } : {}),
      },
    }),
  ];
  await orFail(all, settleRefused(ctx, run, refusal, target));
  return fail(
    all,
    new ToolError('ACTION_REFUSED', refusal.reason, {
      rule: refusal.rule,
      status: refusal.status,
    }),
  );
}

/** The refused item on the frontier: its pending item settled, or a new one (none before a page). */
async function settleRefused(
  ctx: ServerContext,
  run: RunRow,
  refusal: Refusal,
  target: RefusalTarget,
): Promise<void> {
  const { action, safetyClass, stateId, actionId } = target;
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
}

/** Trace calls must say what the step is for (contracts/crawler-trace-tools.md). */
export function requireIntent(rs: RunState, intent: string | undefined): void {
  if (rs.isTrace && (intent === undefined || intent.trim() === ''))
    throw new ToolError('SCHEMA_INVALID', 'intent: required in a trace run');
}
