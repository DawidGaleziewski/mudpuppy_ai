import type { PathfinderDb } from '@pathfinder/core';

export interface Coverage {
  states: number;
  actions_executed: number;
  actions_skipped_by_class: Record<string, number>;
  api_endpoints: number;
  /** Distinct item/listing pages visited in this run (FR-024). */
  item_page_visits: number;
}

const num = (v: number | string | bigint): number => Number(v);

/** Count item pages: states this run saw whose route template is one of the portal's `item_route_templates`. */
export async function countItemPageVisits(
  db: PathfinderDb,
  runId: string,
  itemRouteTemplates: readonly string[],
): Promise<number> {
  if (itemRouteTemplates.length === 0) return 0;
  const row = await db
    .selectFrom('state_observations')
    .innerJoin('states', 'states.id', 'state_observations.state_id')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('state_observations.run_id', '=', runId)
    .where('states.route_template', 'in', [...itemRouteTemplates])
    .executeTakeFirstOrThrow();
  return num(row.n);
}

/** FR-021 coverage: states, actions executed, actions skipped by class, distinct API endpoints, item visits. */
export async function computeCoverage(
  db: PathfinderDb,
  runId: string,
  itemRouteTemplates: readonly string[] = [],
): Promise<Coverage> {
  const states = await db
    .selectFrom('state_observations')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('run_id', '=', runId)
    .executeTakeFirstOrThrow();
  const executed = await db
    .selectFrom('edges')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('run_id', '=', runId)
    .where('status', '=', 'executed')
    .executeTakeFirstOrThrow();
  const skipped = await db
    .selectFrom('frontier')
    .select(['safety_class', (eb) => eb.fn.countAll<number>().as('n')])
    .where('run_id', '=', runId)
    .where('status', 'not in', ['pending', 'done'])
    .groupBy('safety_class')
    .execute();
  const endpoints = await db
    .selectFrom('network_calls')
    .select(['method', 'url_template'])
    .distinct()
    .where('run_id', '=', runId)
    .execute();
  return {
    states: num(states.n),
    actions_executed: num(executed.n),
    actions_skipped_by_class: Object.fromEntries(skipped.map((r) => [r.safety_class, num(r.n)])),
    api_endpoints: endpoints.length,
    item_page_visits: await countItemPageVisits(db, runId, itemRouteTemplates),
  };
}

export interface SkippedAction {
  frontier_id: string;
  state_id: string;
  status: string;
  safety_class: string;
  rule: string | null;
  reason: string;
  description: string;
}

export interface FrontierReport {
  run_id: string;
  coverage: Coverage;
  skipped: SkippedAction[];
  pending: number;
}

function describeAction(json: string): string {
  try {
    const a = JSON.parse(json) as {
      kind?: string;
      url?: string;
      role?: string;
      accessible_name?: string | null;
    };
    if (a.kind === 'navigate' && a.url) return `navigate ${a.url}`;
    return (
      [a.role, a.accessible_name ? JSON.stringify(a.accessible_name) : null]
        .filter(Boolean)
        .join(' ') || 'action'
    );
  } catch {
    return 'action';
  }
}

/** Worklist of everything deliberately not done, with class and reason, plus coverage (FR-010, FR-021, FR-024). */
export async function buildFrontierReport(
  db: PathfinderDb,
  runId: string,
  itemRouteTemplates: readonly string[] = [],
): Promise<FrontierReport> {
  const rows = await db
    .selectFrom('frontier')
    .select(['id', 'state_id', 'status', 'safety_class', 'reason', 'action_json'])
    .where('run_id', '=', runId)
    .where('status', 'not in', ['pending', 'done'])
    .orderBy('id')
    .execute();
  const pending = await db
    .selectFrom('frontier')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('run_id', '=', runId)
    .where('status', '=', 'pending')
    .executeTakeFirstOrThrow();
  return {
    run_id: runId,
    coverage: await computeCoverage(db, runId, itemRouteTemplates),
    pending: num(pending.n),
    skipped: rows.map((r) => ({
      frontier_id: r.id,
      state_id: r.state_id,
      status: r.status,
      safety_class: r.safety_class,
      rule: null,
      reason: r.reason ?? '',
      description: describeAction(r.action_json),
    })),
  };
}

const REASON_LABEL: Record<string, string> = {
  skipped_unsafe: 'not read-only',
  out_of_scope: 'out of scope',
  denylisted: 'denylisted',
  budget_reached: 'budget reached',
  unreachable: 'unreachable',
};

export function renderReport(r: FrontierReport): string {
  const c = r.coverage;
  const lines = [
    `# Frontier report for run ${r.run_id}`,
    '',
    `- States: ${c.states}`,
    `- Actions executed: ${c.actions_executed}`,
    `- Actions skipped by class: ${
      Object.entries(c.actions_skipped_by_class)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ') || 'none'
    }`,
    `- API endpoints seen: ${c.api_endpoints}`,
    `- Item pages visited: ${c.item_page_visits}`,
    `- Still pending: ${r.pending}`,
    '',
    '## Skipped actions',
    '',
  ];
  if (r.skipped.length === 0) lines.push('None.');
  for (const s of r.skipped)
    lines.push(
      `- [${REASON_LABEL[s.status] ?? s.status}] ${s.safety_class}: ${s.description} — ${s.reason}`,
    );
  return lines.join('\n');
}
