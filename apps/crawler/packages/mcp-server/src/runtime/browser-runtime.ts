import { readFile } from 'node:fs/promises';
import { BrowserSession, type StabilizerOptions } from '@pathfinder/crawler';
import { computeFingerprint } from '@pathfinder/fingerprint';
import type { ServerContext } from '../context.js';
import type { Runtime } from '../runtime.js';
import { act, navigate, navigationPolicy, persistStop } from './pipeline.js';
import { RunState } from './run-state.js';

export interface BrowserRuntimeOptions {
  headless?: boolean;
  /** Settle windows; tests shorten them. */
  stabilizer?: StabilizerOptions;
}

/**
 * The real `Runtime`: one Playwright browser per run, owned by this process. Everything a tool does in
 * the browser goes through `pipeline.ts` (action gate -> request gate -> observe -> record).
 */
export function createBrowserRuntime(opts: BrowserRuntimeOptions = {}): Runtime {
  const runs = new Map<string, RunState>();

  const closeRun = async (runId: string): Promise<void> => {
    const rs = runs.get(runId);
    runs.delete(runId);
    await rs?.session.close();
  };

  return {
    async openSession(ctx: ServerContext, run, approved, robots) {
      await closeRun(run.id); // a resumed run replaces any earlier session
      const holder: { rs?: RunState } = {};
      const session = await BrowserSession.launch({
        effective: approved.effective,
        headless: opts.headless ?? true,
        ...(opts.stabilizer ? { stabilizer: opts.stabilizer } : {}),
        onStop: (e) => {
          if (holder.rs) {
            persistStop(ctx, holder.rs, e.warning)
              .then(() => holder.rs?.session.limiter.halt())
              .catch((err: unknown) => ctx.logger.error({ err }, 'failed to persist run stop'));
          }
        },
        limiter: robots.limiter,
        robots: {
          registry: robots.registry,
          pageRequests: robots.pageRequests,
          templateFor: (url) => {
            try {
              return holder.rs ? holder.rs.routeTemplateFor(url) : new URL(url).pathname;
            } catch {
              return url;
            }
          },
          onNote: (n) => {
            void ctx.decisions
              .record({
                run_id: run.id,
                kind: 'note',
                rule: n.rule,
                reason: `the page requested a robots.txt-disallowed URL (${n.action})`,
                subject_ref: n.template,
                detail: { url_template: n.template, action: n.action, first_url: n.url },
              })
              .catch((err: unknown) => ctx.logger.error({ err }, 'failed to log robots note'));
          },
        },
        navigationPolicy: (url) => (holder.rs ? navigationPolicy(holder.rs)(url) : null),
        onNavigationRefused: (url, refusal) => {
          void ctx.decisions
            .record({
              run_id: run.id,
              kind: 'refuse',
              rule: refusal.rule,
              reason: refusal.reason,
              subject_ref: url,
              detail: {
                via: 'request_gate',
                status: refusal.status,
                ...(refusal.policyId ? { policy_id: refusal.policyId } : {}),
              },
            })
            .catch((err: unknown) => ctx.logger.error({ err }, 'failed to log navigation refusal'));
        },
      });
      const rs = new RunState(run.id, session, approved.effective, approved.scope, robots);
      holder.rs = rs;

      // Clusters are per portal (spec 002 FR-027): rebuild the fingerprint index from this portal's
      // recorded states only, in creation order, so cluster ids stay consistent across its runs.
      const all = await ctx.db
        .selectFrom('states')
        .select(['route_template', 'evidence_ref'])
        .where('portal_id', '=', run.portal_id)
        .orderBy('created_at')
        .orderBy('id')
        .execute();
      for (const s of all) {
        try {
          const snapshot = await readFile(ctx.evidence.resolve(s.evidence_ref), 'utf8');
          rs.index.assign(
            computeFingerprint({ routeTemplate: s.route_template, ariaSnapshot: snapshot }),
          );
        } catch (err) {
          ctx.logger.warn(
            { err, evidence_ref: s.evidence_ref },
            'could not restore a state into the fingerprint index',
          );
        }
      }

      // Resume (FR-020): rebuild the in-memory policy window and depths from what is already recorded.
      const seen = await ctx.db
        .selectFrom('state_observations')
        .innerJoin('states', 'states.id', 'state_observations.state_id')
        .select(['states.id', 'states.cluster_id', 'states.route_template'])
        .where('state_observations.run_id', '=', run.id)
        .orderBy('state_observations.observed_at')
        .execute();
      rs.policy.restore(
        seen.map((s) => ({ clusterId: s.cluster_id, routeTemplate: s.route_template })),
      );
      const depths = await ctx.db
        .selectFrom('frontier')
        .select(['state_id', 'depth'])
        .where('run_id', '=', run.id)
        .execute();
      for (const d of depths)
        if (!rs.depthByState.has(d.state_id) || rs.depthByState.get(d.state_id)! > d.depth)
          rs.depthByState.set(d.state_id, d.depth);
      runs.set(run.id, rs);
    },
    navigate: (ctx, input) => navigate(ctx, runs.get(input.run_id), input),
    act: (ctx, input) => act(ctx, runs.get(input.run_id), input),
    closeRun,
    robotsStats: (runId) => runs.get(runId)?.session.gate.robotsStats(),
    async closeAll() {
      await Promise.all([...runs.keys()].map(closeRun));
    },
  };
}
