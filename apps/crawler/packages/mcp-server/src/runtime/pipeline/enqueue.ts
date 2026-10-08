import { newId, nowIso } from '@pathfinder/core';
import {
  attachLocators,
  classifyCandidates,
  decide,
  enqueueActions,
  extractCandidates,
  observePage,
  type ClassifiedAction,
  type GateContext,
} from '@pathfinder/crawler';
import type { Refusal } from '@pathfinder/safety';
import type { ServerContext } from '../../context.js';
import type { RunRow } from '../../services/index.js';
import type { RunState } from '../run-state.js';
import { decision, event, reported, type Report, type Reported } from './context.js';
import { gateContext, TRACE_CLASSIFY, usage } from './gate.js';

export type IssuedAction = ClassifiedAction & {
  actionId: string;
  actionJson: unknown;
  allowed: boolean;
  skip_reason?: string;
};

type Observed = Awaited<ReturnType<typeof observePage>>;

/** The recorded page the actions belong to. */
export interface IssuePage {
  state_id: string;
  created: boolean;
  evidenceRef: string;
  alreadyInRun: boolean;
  routeTemplate: string;
  clusterId: string;
  depth: number;
}

/** Issue server action ids for the page's candidates and queue them for exploration (first visit only). */
export async function issueAndEnqueue(
  ctx: ServerContext,
  run: RunRow,
  rs: RunState,
  observed: Observed,
  page: IssuePage,
): Promise<Reported<IssuedAction[]>> {
  const { issued, g } = await issueActions(ctx, run, rs, observed, page);
  // Queue for exploration only the first time this run sees the state, and only if the policy admits it.
  // A trace run follows one process and uses no frontier.
  if (page.alreadyInRun || rs.isTrace) return reported(issued);
  return reported(issued, await queueForExploration(ctx, run, rs, { observed, page, issued, g }));
}

/** Server-issued action ids, stable per (state, role, name, nth) so a revisit reuses them. */
async function issueActions(
  ctx: ServerContext,
  run: RunRow,
  rs: RunState,
  observed: Observed,
  page: IssuePage,
): Promise<{ issued: IssuedAction[]; g: GateContext }> {
  const { state_id, evidenceRef, depth } = page;
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

  // This page's actions land one level below it; the browser's previous page does not count.
  const g = gateContext(rs, await usage(ctx, run, rs, 0, depth + 1));
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
  return { issued, g };
}

/** Queue the issued actions on the frontier, or record why the policy does not expand the state. */
async function queueForExploration(
  ctx: ServerContext,
  run: RunRow,
  rs: RunState,
  args: { observed: Observed; page: IssuePage; issued: IssuedAction[]; g: GateContext },
): Promise<Report[]> {
  const { observed, page, issued, g } = args;
  const { state_id, created, routeTemplate, depth } = page;
  const isNew = rs.policy.isNewCluster(page.clusterId);
  const admission = rs.policy.admit({ clusterId: page.clusterId, routeTemplate, created });
  if (!admission.expand) return recordNotExpanded(ctx, run, page, admission);
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
  return frontierReports(r, issued, { priority, depth });
}

/** `event frontier_enqueue` per queued item; `event frontier_skip` and a `skip` decision per skipped one. */
export function frontierReports(
  r: Pick<Awaited<ReturnType<typeof enqueueActions>>, 'enqueued' | 'skipped'>,
  issued: readonly Pick<IssuedAction, 'actionId' | 'role' | 'name' | 'nth'>[],
  at: { priority: number; depth: number },
): Report[] {
  const described = (actionId: string) => {
    const a = issued.find((x) => x.actionId === actionId);
    return a ? { role: a.role, accessible_name: a.name, nth: a.nth } : { action_id: actionId };
  };
  const enqueued = r.enqueued.map((q) =>
    event('frontier_enqueue', {
      frontier_id: q.frontierId,
      action: described(q.actionId),
      safety_class: q.safetyClass,
      ...at,
    }),
  );
  const skipped = r.skipped.flatMap((s) => [
    event('frontier_skip', {
      frontier_id: s.frontierId,
      action: described(s.actionId),
      safety_class: s.safetyClass,
      ...at,
      rule: s.refusal.rule,
      reason: s.refusal.reason,
    }),
    decision({
      kind: 'skip',
      rule: s.refusal.rule,
      reason: s.refusal.reason,
      subject_ref: s.frontierId,
      detail: {
        status: s.refusal.status,
        safety_class: s.safetyClass,
        ...(s.refusal.policyId ? { policy_id: s.refusal.policyId } : {}),
      },
    }),
  ]);
  return [...enqueued, ...skipped];
}

/** The state is recorded but not expanded (cluster window, per-template cap): one skipped item. */
async function recordNotExpanded(
  ctx: ServerContext,
  run: RunRow,
  page: IssuePage,
  admission: Refusal,
): Promise<Report[]> {
  const { state_id, routeTemplate, depth } = page;
  const frontierId = newId();
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
  return [
    event('frontier_skip', {
      frontier_id: frontierId,
      action: { kind: 'expand', route_template: routeTemplate },
      safety_class: 'read',
      priority: 0,
      depth,
      rule: admission.rule,
      reason: admission.reason,
    }),
    decision({
      kind: 'skip',
      rule: admission.rule,
      reason: admission.reason,
      subject_ref: state_id,
    }),
  ];
}
