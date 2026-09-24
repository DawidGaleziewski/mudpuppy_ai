import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { newId, nowIso, type SafetyClass } from '@pathfinder/core';
import { preflight, type PreflightResult } from '@pathfinder/crawler';
import { z } from 'zod';
import type { ServerContext } from '../context.js';
import { ToolError, parseInput } from '../errors.js';
import { getRun, type RunRow } from './common.js';
import { scopeOf } from './run-budget.js';
import { portalRuleSet, ruleSetSummary } from '@pathfinder/safety';
import { createRunRobots, robotsSnapshot, type RunRobots } from './robots.js';

const StartRunInput = z
  .object({
    portal_id: z.string().min(1),
    persona_id: z.string().min(1),
    resume_run_id: z.string().min(1).optional(),
  })
  .strict();

export interface StartRunOutput {
  run_id: string;
  resumed: boolean;
  effective_max_action_class: SafetyClass;
  budgets: { steps: number; run_time_minutes: number; states: number };
}

type Approved = Extract<PreflightResult, { ok: true }>;

function remainingBudgets(run: RunRow): StartRunOutput['budgets'] {
  const s = scopeOf(run);
  return {
    steps: Math.max(0, (s.max_steps ?? 0) - run.steps_used),
    run_time_minutes: Math.max(0, (s.max_run_time_minutes ?? 0) - run.elapsed_ms / 60_000),
    states: s.max_states ?? 0,
  };
}

/**
 * Fetch the base host's robots.txt (FR-001, FR-004). Unreachable or 5xx refuses the run before any
 * page opens; the other in-scope hosts are fetched on first use by the request gate.
 */
async function loadBaseRobots(robots: RunRobots, baseUrl: string): Promise<void> {
  const policy = await robots.registry.ensure(baseUrl);
  if (policy?.outcome === 'unreachable') {
    const source = new URL('/robots.txt', baseUrl).toString();
    throw new ToolError(
      'ROBOTS_UNAVAILABLE',
      `${source} could not be read (${policy.failure ?? 'unreachable'}); no page is opened until it can`,
      { url: source },
    );
  }
}

/**
 * Database part of `start_run`, done AFTER `preflight` and BEFORE any browser is launched. Creates the
 * run row with the resolved `config_snapshot`, or resumes an interrupted run from persisted state
 * (FR-020) without re-recording anything. Returns what the browser session needs.
 */
export async function startRunRecord(
  ctx: ServerContext,
  raw: unknown,
): Promise<{ output: StartRunOutput; run: RunRow; approved: Approved; robots: RunRobots }> {
  const input = parseInput(StartRunInput, raw);

  if (
    !existsSync(join(ctx.root, 'portals', input.portal_id, 'portal.yaml')) &&
    /^[a-z0-9][a-z0-9_-]*$/.test(input.portal_id)
  ) {
    throw new ToolError('PORTAL_NOT_FOUND', `no portals/${input.portal_id}/portal.yaml`);
  }
  const pre = preflight(input.portal_id, input.persona_id, { root: ctx.root });
  if (!pre.ok) throw new ToolError(pre.code, pre.message, { reasons: pre.reasons });

  const { portal, persona, effectiveMaxActionClass } = pre.effective;
  if (portal.environment !== ctx.dbEnvironment) {
    throw new ToolError(
      'ENV_GUARD_REFUSED',
      `this server records into the "${ctx.dbEnvironment}" database but portal "${portal.id}" is "${portal.environment}"; start a server for that environment`,
    );
  }

  if (input.resume_run_id !== undefined) {
    const run = await getRun(ctx, input.resume_run_id).catch((e: unknown) => {
      if (e instanceof ToolError && e.code === 'RUN_NOT_FOUND')
        throw new ToolError('RUN_NOT_RESUMABLE', e.message);
      throw e;
    });
    if (run.portal_id !== portal.id || run.persona_id !== persona.id) {
      throw new ToolError(
        'RUN_NOT_RESUMABLE',
        `run ${run.id} belongs to ${run.portal_id}/${run.persona_id}, not ${portal.id}/${persona.id}`,
      );
    }
    if (run.status !== 'interrupted') {
      throw new ToolError(
        'RUN_NOT_RESUMABLE',
        `run ${run.id} is ${run.status}; only an interrupted run can be resumed`,
      );
    }
    // A resumed run reads robots.txt again; a change is logged by the policy writer (FR-006).
    const robots = createRunRobots(ctx, run.id, portal, { buffer: false });
    await loadBaseRobots(robots, portal.base_url);
    await ctx.db
      .updateTable('runs')
      .set({ status: 'running', ended_at: null })
      .where('id', '=', run.id)
      .execute();
    const resumed = await getRun(ctx, run.id);
    return {
      output: {
        run_id: run.id,
        resumed: true,
        effective_max_action_class: effectiveMaxActionClass,
        budgets: remainingBudgets(resumed),
      },
      run: resumed,
      approved: pre,
      robots,
    };
  }

  const id = newId();
  const robots = createRunRobots(ctx, id, portal, { buffer: true });
  await loadBaseRobots(robots, portal.base_url);
  await ctx.db
    .insertInto('runs')
    .values({
      id,
      portal_id: portal.id,
      persona_id: persona.id,
      mode: 'map',
      environment: portal.environment,
      env_version_or_date: nowIso().slice(0, 10),
      seed_id: null,
      viewport: `${persona.viewport.width}x${persona.viewport.height}`,
      locale: persona.locale,
      browser: 'chromium',
      config_snapshot: JSON.stringify({
        portal,
        persona,
        effective_max_action_class: effectiveMaxActionClass,
        scope: pre.scope,
        robots: robotsSnapshot(robots),
        rule_set: ruleSetSummary(portalRuleSet(portal)),
      }),
      status: 'running',
      warning: null,
      steps_used: 0,
      elapsed_ms: 0,
      max_depth_reached: 0,
      started_at: nowIso(),
      ended_at: null,
      coverage: null,
    })
    .execute();
  await robots.flush();
  const run = await getRun(ctx, id);
  return {
    output: {
      run_id: id,
      resumed: false,
      effective_max_action_class: effectiveMaxActionClass,
      budgets: remainingBudgets(run),
    },
    run,
    approved: pre,
    robots,
  };
}
