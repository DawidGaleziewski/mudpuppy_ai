import { newId, nowIso, type PathfinderDb, type SafetyClass } from '@pathfinder/core';
import type { Refusal } from '@pathfinder/safety';
import type { ClassifiedAction } from './action-extractor.js';
import { decide, type GateContext } from './action-gate.js';
import { countItemPageVisits } from './report.js';

export interface FrontierPolicyOptions {
  /** How many recent states the same-cluster window remembers. Default 20. */
  windowSize?: number;
  /** A cluster seen this many times in the window stops being expanded. Default 5. */
  maxSameClusterInWindow?: number;
  /** Max distinct states per route template. Default 50. */
  maxPerTemplate?: number;
  /** Max individual item/listing pages (FR-024); undefined = no cap. */
  itemViewCap?: number;
  /** Route templates that count as item pages. */
  itemRouteTemplates?: readonly string[];
}

export interface AdmitInput {
  clusterId: string;
  routeTemplate: string;
  /** True when this state was new (not seen before by any run). */
  created: boolean;
}

export type Admission = { expand: true } | ({ expand: false } & Refusal);

/**
 * Exploration policy for the server-owned frontier (research §10): BFS by depth with a novelty boost,
 * a sliding window over recent cluster ids that stops a same-cluster branch after N hits, and
 * per-template and item-view caps. The queue itself lives in the `frontier` table so a run resumes
 * from it (FR-020).
 */
export class FrontierPolicy {
  private readonly window: string[] = [];
  private readonly perTemplate = new Map<string, number>();
  private readonly seenClusters = new Set<string>();
  private readonly o: Required<Omit<FrontierPolicyOptions, 'itemViewCap'>> & {
    itemViewCap?: number;
  };

  constructor(options: FrontierPolicyOptions = {}) {
    this.o = {
      windowSize: options.windowSize ?? 20,
      maxSameClusterInWindow: options.maxSameClusterInWindow ?? 5,
      maxPerTemplate: options.maxPerTemplate ?? 50,
      itemRouteTemplates: options.itemRouteTemplates ?? [],
      ...(options.itemViewCap !== undefined ? { itemViewCap: options.itemViewCap } : {}),
    };
  }

  /** Rebuild the in-memory window after a resume, oldest first. */
  restore(recent: readonly { clusterId: string; routeTemplate: string }[]): void {
    for (const r of recent) this.note(r.clusterId, r.routeTemplate);
  }

  private note(clusterId: string, routeTemplate: string): void {
    this.window.push(clusterId);
    if (this.window.length > this.o.windowSize) this.window.shift();
    this.perTemplate.set(routeTemplate, (this.perTemplate.get(routeTemplate) ?? 0) + 1);
    this.seenClusters.add(clusterId);
  }

  /** Decide whether the actions of a just-observed state should be queued; records the visit. */
  admit(s: AdmitInput): Admission {
    const inWindow = this.window.filter((c) => c === s.clusterId).length;
    const templateCount = this.perTemplate.get(s.routeTemplate) ?? 0;
    this.note(s.clusterId, s.routeTemplate);
    if (inWindow >= this.o.maxSameClusterInWindow) {
      return {
        expand: false,
        status: 'budget_reached',
        rule: 'cap:same_cluster',
        reason: `cluster ${s.clusterId} already appeared ${inWindow} times in the last ${this.o.windowSize} states (trap guard)`,
      };
    }
    if (templateCount >= this.o.maxPerTemplate) {
      return {
        expand: false,
        status: 'budget_reached',
        rule: 'cap:per_template',
        reason: `${templateCount} states already recorded for route template ${s.routeTemplate}`,
      };
    }
    return { expand: true };
  }

  /** Novelty boost: actions from a state in a cluster not seen before go first. */
  priorityFor(depth: number, clusterIsNew: boolean): number {
    return -depth * 10 + (clusterIsNew ? 5 : 0);
  }

  isNewCluster(clusterId: string): boolean {
    return !this.seenClusters.has(clusterId);
  }

  isItemTemplate(routeTemplate: string): boolean {
    return this.o.itemRouteTemplates.includes(routeTemplate);
  }

  /** FR-024: refuse another item page once the cap is reached. */
  async checkItemCap(
    db: PathfinderDb,
    runId: string,
    routeTemplate: string,
  ): Promise<Refusal | null> {
    if (this.o.itemViewCap === undefined || !this.isItemTemplate(routeTemplate)) return null;
    const visited = await countItemPageVisits(db, runId, this.o.itemRouteTemplates);
    return visited >= this.o.itemViewCap
      ? {
          status: 'budget_reached',
          rule: 'cap:item_view_cap',
          reason: `item_view_cap ${this.o.itemViewCap} reached (${visited} item pages visited)`,
        }
      : null;
  }
}

export interface EnqueueParams {
  db: PathfinderDb;
  runId: string;
  stateId: string;
  depth: number;
  priority: number;
  currentUrl: string;
  actions: readonly (ClassifiedAction & { actionId: string; actionJson: unknown })[];
  gate: GateContext;
}

export interface EnqueueResult {
  queued: number;
  skipped: { frontierId: string; actionId: string; refusal: Refusal; safetyClass: SafetyClass }[];
}

/**
 * Put a state's candidate actions on the frontier: allowed ones as `pending`, everything the gate
 * refuses as a skipped row carrying the rule and reason, so the report can list it (FR-010).
 */
export async function enqueueActions(p: EnqueueParams): Promise<EnqueueResult> {
  const result: EnqueueResult = { queued: 0, skipped: [] };
  const ts = nowIso();
  for (const a of p.actions) {
    const d = decide({ kind: 'act', descriptor: a.descriptor, currentUrl: p.currentUrl }, p.gate);
    const frontierId = newId();
    const base = {
      id: frontierId,
      run_id: p.runId,
      state_id: p.stateId,
      action_id: a.actionId,
      action_json: JSON.stringify(a.actionJson),
      safety_class: d.classification.safetyClass,
      priority: p.priority,
      depth: p.depth,
      created_at: ts,
      updated_at: ts,
    };
    if (d.allowed) {
      await p.db
        .insertInto('frontier')
        .values({ ...base, status: 'pending', reason: null })
        .execute();
      result.queued += 1;
    } else {
      await p.db
        .insertInto('frontier')
        .values({ ...base, status: d.status, reason: `${d.rule}: ${d.reason}` })
        .execute();
      result.skipped.push({
        frontierId,
        actionId: a.actionId,
        refusal: d,
        safetyClass: d.classification.safetyClass,
      });
    }
  }
  return result;
}

/** Move a queue row on once `act` handled it. */
export async function settleFrontierItem(
  db: PathfinderDb,
  frontierId: string,
  status:
    'done' | 'skipped_unsafe' | 'out_of_scope' | 'denylisted' | 'budget_reached' | 'unreachable',
  reason: string | null,
): Promise<void> {
  await db
    .updateTable('frontier')
    .set({ status, reason, updated_at: nowIso() })
    .where('id', '=', frontierId)
    .execute();
}

/** The pending frontier row for an action id, if any. */
export async function pendingItemForAction(db: PathfinderDb, runId: string, actionId: string) {
  return db
    .selectFrom('frontier')
    .selectAll()
    .where('run_id', '=', runId)
    .where('action_id', '=', actionId)
    .where('status', '=', 'pending')
    .executeTakeFirst();
}
