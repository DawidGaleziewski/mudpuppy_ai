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
import { createProcess, openFollowup, processOfRun } from './trace.js';

const StartRunInput = z
  .object({
    portal_id: z.string().min(1),
    persona_id: z.string().min(1),
    resume_run_id: z.string().min(1).optional(),
    mode: z.enum(['map', 'trace']).default('map'),
    process: z
      .object({ name: z.string().trim().min(1).max(200), goal: z.string().trim().min(1).max(500) })
      .strict()
      .optional(),
    followup_key: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((v, c) => {
    // A resumed run keeps its own mode and process.
    if (v.resume_run_id !== undefined) return;
    if (v.mode === 'trace' && v.process === undefined)
      c.addIssue({ code: 'custom', path: ['process'], message: 'required when mode is trace' });
    if (v.mode === 'map' && v.process !== undefined)
      c.addIssue({ code: 'custom', path: ['process'], message: 'only allowed when mode is trace' });
    if (v.mode === 'map' && v.followup_key !== undefined)
      c.addIssue({
        code: 'custom',
        path: ['followup_key'],
        message: 'only allowed when mode is trace',
      });
  });

export interface StartRunOutput {
  run_id: string;
  mode: 'map' | 'trace';
  /** The trace run's process; absent for map runs. */
  process_id?: string;
  /** The portal's start URL: a trace has no frontier, so its first `navigate` goes here. */
  base_url: string;
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
  const { input, pre } = await ctx.tracer.phase('preflight', async () => {
    const input = parseInput(StartRunInput, raw);
    if (
      !existsSync(join(ctx.root, 'portals', input.portal_id, 'portal.yaml')) &&
      /^[a-z0-9][a-z0-9_-]*$/.test(input.portal_id)
    ) {
      throw new ToolError('PORTAL_NOT_FOUND', `no portals/${input.portal_id}/portal.yaml`);
    }
    const pre = preflight(input.portal_id, input.persona_id, { root: ctx.root });
    if (!pre.ok) throw new ToolError(pre.code, pre.message, { reasons: pre.reasons });
    const { portal } = pre.effective;
    if (portal.environment !== ctx.dbEnvironment) {
      throw new ToolError(
        'ENV_GUARD_REFUSED',
        `this server records into the "${ctx.dbEnvironment}" database but portal "${portal.id}" is "${portal.environment}"; start a server for that environment`,
      );
    }
    return { input, pre };
  });
  const { portal, persona, effectiveMaxActionClass } = pre.effective;

  if (input.resume_run_id !== undefined) {
    const resumeId = input.resume_run_id;
    const run = await ctx.tracer.phase('resume_check', () =>
      resumableRun(ctx, resumeId, portal.id, persona.id),
    );
    // A resumed run reads robots.txt again; a change is logged by the policy writer (FR-006).
    const robots = await ctx.tracer.phase('robots_fetch', async () => {
      const robots = createRunRobots(ctx, run.id, portal, { buffer: false });
      await loadBaseRobots(robots, portal.base_url);
      return robots;
    });
    const resumed = await ctx.tracer.phase('insert_run', async () => {
      await ctx.db
        .updateTable('runs')
        .set({ status: 'running', ended_at: null })
        .where('id', '=', run.id)
        .execute();
      return getRun(ctx, run.id);
    });
    const resumedProcess = await processOfRun(ctx, run.id);
    return {
      output: {
        run_id: run.id,
        mode: resumedProcess ? 'trace' : 'map',
        ...(resumedProcess ? { process_id: resumedProcess.id } : {}),
        base_url: portal.base_url,
        resumed: true,
        effective_max_action_class: effectiveMaxActionClass,
        budgets: remainingBudgets(resumed),
      },
      run: resumed,
      approved: pre,
      robots,
    };
  }

  const followupRecordId =
    input.followup_key === undefined
      ? null
      : await openFollowup(ctx, portal.id, input.followup_key);
  const id = newId();
  const robots = await ctx.tracer.phase('robots_fetch', async () => {
    const robots = createRunRobots(ctx, id, portal, { buffer: true });
    await loadBaseRobots(robots, portal.base_url);
    return robots;
  });
  const run = await ctx.tracer.phase('insert_run', async () => {
    await ctx.db
      .insertInto('runs')
      .values({
        id,
        portal_id: portal.id,
        persona_id: persona.id,
        mode: input.mode,
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
    return getRun(ctx, id);
  });
  const processId =
    input.mode === 'trace' && input.process
      ? await createProcess(ctx, {
          run_id: id,
          portal_id: portal.id,
          persona_id: persona.id,
          name: input.process.name,
          goal: input.process.goal,
          followup_record_id: followupRecordId,
        })
      : undefined;
  return {
    output: {
      run_id: id,
      mode: input.mode,
      ...(processId ? { process_id: processId } : {}),
      base_url: portal.base_url,
      resumed: false,
      effective_max_action_class: effectiveMaxActionClass,
      budgets: remainingBudgets(run),
    },
    run,
    approved: pre,
    robots,
  };
}

/** The interrupted run of the same portal and persona that `resume_run_id` names. */
async function resumableRun(
  ctx: ServerContext,
  resumeId: string,
  portalId: string,
  personaId: string,
): Promise<RunRow> {
  const run = await getRun(ctx, resumeId).catch((e: unknown) => {
    if (e instanceof ToolError && e.code === 'RUN_NOT_FOUND')
      throw new ToolError('RUN_NOT_RESUMABLE', e.message);
    throw e;
  });
  if (run.portal_id !== portalId || run.persona_id !== personaId) {
    throw new ToolError(
      'RUN_NOT_RESUMABLE',
      `run ${run.id} belongs to ${run.portal_id}/${run.persona_id}, not ${portalId}/${personaId}`,
    );
  }
  if (run.status !== 'interrupted') {
    throw new ToolError(
      'RUN_NOT_RESUMABLE',
      `run ${run.id} is ${run.status}; only an interrupted run can be resumed`,
    );
  }
  return run;
}
