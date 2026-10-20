import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  BrowserSession,
  recordAssets,
  trackAssetHealth,
  type StabilizerOptions,
} from '@pathfinder/crawler';
import { computeFingerprint } from '@pathfinder/fingerprint';
import type { ServerContext } from '../context.js';
import type { Runtime } from '../runtime.js';
import {
  act,
  goToState,
  login,
  navigate,
  navigationPolicy,
  persistStop,
  probeForm,
} from './pipeline/index.js';
import { RunState } from './run-state.js';
import { processOfRun } from '../services/trace.js';
import { parsePlan } from '../services/run-plan.js';
import { runChoices } from '../services/start-run.js';
import { startPwTrace } from './pw-trace.js';
import { runSecrets } from '../services/credentials.js';
import { createRunTraceHooks } from './trace-hooks.js';
import { runHooks } from './hooks.js';

export interface BrowserRuntimeOptions {
  headless?: boolean;
  /** Settle windows; tests shorten them. */
  stabilizer?: StabilizerOptions;
}

/**
 * The real `Runtime`: one Playwright browser per run, owned by this process. Everything a tool does in
 * the browser goes through `pipeline/` (action gate -> request gate -> observe -> record).
 */
export function createBrowserRuntime(opts: BrowserRuntimeOptions = {}): Runtime {
  const runs = new Map<string, RunState>();

  const closeSession = async (runId: string): Promise<void> => {
    const rs = runs.get(runId);
    runs.delete(runId);
    // onRunEnd before the context closes (spec 023 US1.5); a failing hook never blocks closing.
    if (rs?.hooks?.has('onRunEnd')) await rs.hooks.run('onRunEnd', '').catch(() => undefined);
    await rs?.session.close();
  };
  /** The run has ended: its browser and its resolved credentials go. */
  const closeRun = async (runId: string): Promise<void> => {
    runSecrets.delete(runId);
    await closeSession(runId);
  };

  return {
    async openSession(ctx: ServerContext, run, approved, robots) {
      const rs = await ctx.tracer.phase('open_session', () => launch(ctx, run, approved, robots));
      await ctx.tracer.phase('restore_index', () => restore(ctx, run, rs));
      runs.set(run.id, rs);
      // onRunStart: the context exists, nothing has been opened or logged in yet (spec 023 US1.1).
      rs.hooks = runHooks(ctx, rs, approved.hooks ?? []);
      if (rs.hooks.has('onRunStart')) await rs.hooks.run('onRunStart', '');
    },
    navigate: (ctx, input) => navigate(ctx, runs.get(input.run_id), input),
    act: (ctx, input) => act(ctx, runs.get(input.run_id), input),
    probeForm: (ctx, input) => probeForm(ctx, runs.get(input.run_id), input),
    goToState: (ctx, input) => goToState(ctx, runs.get(input.run_id), input),
    login: (ctx, input) => login(ctx, runs.get(input.run_id), input),
    closeRun,
    robotsStats: (runId) => runs.get(runId)?.session.gate.robotsStats(),
    async closeAll() {
      await Promise.all([...runs.keys()].map(closeRun));
    },
  };

  async function launch(
    ctx: ServerContext,
    run: Parameters<Runtime['openSession']>[1],
    approved: Parameters<Runtime['openSession']>[2],
    robots: Parameters<Runtime['openSession']>[3],
  ): Promise<RunState> {
    await closeSession(run.id); // a resumed run replaces any earlier session (keeps its credentials)
    const holder: { rs?: RunState } = {};
    const templateFor = (url: string): string => {
      try {
        return holder.rs ? holder.rs.peekRouteTemplate(url) : new URL(url).pathname;
      } catch {
        return '<unparseable>';
      }
    };
    const trace = createRunTraceHooks(ctx.tracer, run.id, templateFor);
    // Spec 011 FR-014: images skipped by the BA's choice; the decision log says so once per run,
    // each image is a placeholder in the page and a trace event.
    let skipNoted = false;
    const skipImages = runChoices(run).skip_images
      ? {
          onSkip: (url: string) => {
            if (skipNoted) return;
            skipNoted = true;
            void ctx.decisions
              .record({
                run_id: run.id,
                kind: 'note',
                rule: 'choice:skip_images',
                reason:
                  'images skipped for this run (the BA chose it when the scan was requested); each image shows an "Image skipped" placeholder in screenshots',
                subject_ref: url,
                detail: { first_url: url },
              })
              .catch((err: unknown) => ctx.logger.error({ err }, 'failed to log skipped images'));
          },
        }
      : undefined;
    const session = await BrowserSession.launch({
      ...(skipImages ? { skipImages } : {}),
      observe: trace.observe,
      effective: approved.effective,
      // Sample bodies for the contracts export, never on production (spec 034 A-9).
      keepSamples: run.environment !== 'production',
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
    const rs = new RunState({
      runId: run.id,
      session,
      effective: approved.effective,
      scope: approved.scope,
      robots,
      trace,
    });
    rs.processId = (await processOfRun(ctx, run.id))?.id ?? null;
    rs.isFormProbing = runChoices(run).form_probing;
    rs.headless = runChoices(run).replay;
    rs.plan = parsePlan(run.plan_json);
    rs.assets = trackAssetHealth(session.context);
    const markerHeader = approved.effective.portal.model.build_marker?.header;
    rs.loaded = recordAssets(session.context, session.page, markerHeader ? { markerHeader } : {});
    holder.rs = rs;
    // Playwright traces keep DOM snapshots with typed input values: a run that logs in with vault
    // credentials pauses the trace around every login (spec 009 FR-019a), and says so. Every
    // environment is traced (spec 021).
    const hasCredentials = Object.keys(runSecrets.get(run.id) ?? {}).length > 0;
    if (hasCredentials)
      await ctx.decisions.record({
        run_id: run.id,
        kind: 'note',
        rule: 'pw_trace:login_masked',
        reason: 'Playwright trace recorded with every login left out (vault credentials)',
      });
    rs.pw = await startPwTrace({
      context: session.context,
      tracer: ctx.tracer,
      logger: ctx.logger,
      dataDir: join(ctx.root, 'data'),
      portal: run.portal_id,
      runId: run.id,
    });
    return rs;
  }

  async function restore(
    ctx: ServerContext,
    run: Parameters<Runtime['openSession']>[1],
    rs: RunState,
  ): Promise<void> {
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
    // `navigate` looks depths up by URL; each issued action remembers the URL of its page, so a
    // page's URL gets its state's depth back (spec 004 F-04, spec 015 T032).
    const pages = await ctx.db
      .selectFrom('actions')
      .select(['state_id', 'action_json'])
      .where('run_id', '=', run.id)
      .execute();
    for (const a of pages) {
      const depth = rs.depthByState.get(a.state_id);
      const url = (JSON.parse(a.action_json) as { page_url?: string }).page_url;
      if (depth === undefined || url === undefined) continue;
      const known = rs.depthByUrl.get(url);
      if (known === undefined || known > depth) rs.depthByUrl.set(url, depth);
    }
  }
}
