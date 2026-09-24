import { newId } from '@pathfinder/core';
import type { PortalConfig } from '@pathfinder/config';
import {
  DEFAULT_RATE_LIMIT,
  createRateLimiter,
  createRobotsRegistry,
  type RateLimiter,
  type RobotsFetchRecord,
  type RobotsRegistry,
} from '@pathfinder/crawler';
import type { ServerContext } from '../context.js';

/** The run's robots state, created by `start_run` and handed to the browser session. */
export interface RunRobots {
  registry: RobotsRegistry;
  /** The run's single limiter: robots fetches and page traffic share it (FR-001). */
  limiter: RateLimiter;
  pageRequests: PortalConfig['robots_page_requests'];
  /** Write policy rows buffered before the run row existed. */
  flush(): Promise<void>;
}

export interface RobotsCoverage {
  hosts: string[];
  refused_navigations: number;
  page_requests_blocked: number;
  page_requests_allowed: number;
}

type PolicyRow = {
  id: string;
  run_id: string;
  host: string;
  source_url: string;
  final_url: string | null;
  outcome: RobotsFetchRecord['outcome'];
  http_status: number | null;
  product_token: string;
  group_used: string | null;
  crawl_delay_s: number | null;
  ignored_lines: number;
  truncated: 0 | 1;
  content_sha256: string | null;
  evidence_ref: string;
  fetched_at: string;
};

async function insertPolicy(ctx: ServerContext, row: PolicyRow): Promise<void> {
  const previous = await ctx.db
    .selectFrom('robots_policies')
    .select(['id', 'outcome', 'content_sha256'])
    .where('run_id', '=', row.run_id)
    .where('host', '=', row.host)
    .orderBy('fetched_at', 'desc')
    .orderBy('id', 'desc')
    .executeTakeFirst();
  await ctx.db.insertInto('robots_policies').values(row).execute();
  if (
    previous &&
    (previous.outcome !== row.outcome || previous.content_sha256 !== row.content_sha256)
  ) {
    await ctx.decisions.record({
      run_id: row.run_id,
      kind: 'note',
      rule: 'robots:changed',
      reason: `robots.txt of ${row.host} changed (${previous.outcome} → ${row.outcome}); the new rules apply from now on`,
      subject_ref: row.source_url,
      detail: { host: row.host, previous_policy_id: previous.id, policy_id: row.id },
    });
  }
}

/**
 * Robots state of one run (research §3). With `buffer`, policy rows wait for `flush()` because the
 * run row they reference does not exist yet (the base host is fetched before it is created);
 * evidence files are written at once.
 */
export function createRunRobots(
  ctx: ServerContext,
  runId: string,
  portal: PortalConfig,
  opts: { buffer: boolean },
): RunRobots {
  const rate = portal.rate_limit ?? DEFAULT_RATE_LIMIT;
  const limiter = createRateLimiter({
    requestsPerSecond: rate.requests_per_second,
    maxConcurrency: rate.max_concurrency,
  });
  let buffering = opts.buffer;
  const pending: PolicyRow[] = [];
  const registry = createRobotsRegistry({
    allowedDomains: portal.scope.allowed_domains,
    userAgent: rate.user_agent,
    limiter,
    ...(ctx.fetch ? { fetch: ctx.fetch } : {}),
    async persist(rec) {
      const evidenceRef = await ctx.evidence.storeJson({
        source_url: rec.source_url,
        final_url: rec.final_url,
        redirects: rec.redirects,
        http_status: rec.http_status,
        outcome: rec.outcome,
        failure: rec.failure,
        fetched_at: rec.fetched_at,
        sitemaps: rec.sitemaps,
        truncated: rec.truncated,
        body: rec.body,
      });
      const row: PolicyRow = {
        id: newId(),
        run_id: runId,
        host: rec.host,
        source_url: rec.source_url,
        final_url: rec.final_url,
        outcome: rec.outcome,
        http_status: rec.http_status,
        product_token: rec.product_token,
        group_used: rec.group_used,
        crawl_delay_s: rec.crawl_delay_s,
        ignored_lines: rec.ignored_lines,
        truncated: rec.truncated ? 1 : 0,
        content_sha256: rec.content_sha256,
        evidence_ref: evidenceRef,
        fetched_at: rec.fetched_at,
      };
      if (buffering) pending.push(row);
      else await insertPolicy(ctx, row);
      return { policyId: row.id, evidenceRef };
    },
  });
  return {
    registry,
    limiter,
    pageRequests: portal.robots_page_requests,
    async flush() {
      buffering = false;
      for (const row of pending.splice(0)) await insertPolicy(ctx, row);
    },
  };
}

/** The `robots` part of the config snapshot: what applied when the run started. */
export function robotsSnapshot(robots: RunRobots) {
  return {
    product_token: robots.registry.productToken,
    page_requests: robots.pageRequests,
    policies: robots.registry.policies().map((p) => ({
      host: p.host,
      policy_id: p.policyId,
      outcome: p.outcome,
      evidence_ref: p.evidenceRef,
    })),
  };
}

/**
 * `finish_run` coverage for robots. Page request counts come from the live request gate when the
 * session is still open; otherwise each recorded `note` (one per URL template and rule) counts once.
 */
export async function robotsCoverage(
  ctx: ServerContext,
  runId: string,
  live?: { pageRequestsBlocked: number; pageRequestsAllowed: number },
): Promise<RobotsCoverage> {
  const hosts = await ctx.db
    .selectFrom('robots_policies')
    .select('host')
    .distinct()
    .where('run_id', '=', runId)
    .orderBy('host')
    .execute();
  const refused = await ctx.db
    .selectFrom('decision_log')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('run_id', '=', runId)
    .where('kind', 'in', ['skip', 'refuse'])
    .where('rule', 'like', 'robots:%')
    .executeTakeFirstOrThrow();
  let blocked = live?.pageRequestsBlocked;
  let allowed = live?.pageRequestsAllowed;
  if (blocked === undefined || allowed === undefined) {
    const notes = await ctx.db
      .selectFrom('decision_log')
      .select('detail_json')
      .where('run_id', '=', runId)
      .where('kind', '=', 'note')
      .where('rule', 'like', 'robots:%')
      .execute();
    const actions = notes.map(
      (n) => (JSON.parse(n.detail_json ?? '{}') as { action?: string }).action,
    );
    blocked = actions.filter((a) => a === 'blocked').length;
    allowed = actions.filter((a) => a === 'allowed').length;
  }
  return {
    hosts: hosts.map((h) => h.host),
    refused_navigations: Number(refused.n),
    page_requests_blocked: blocked,
    page_requests_allowed: allowed,
  };
}
