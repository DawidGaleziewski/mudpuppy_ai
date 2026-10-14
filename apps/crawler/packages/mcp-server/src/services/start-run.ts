import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { minSafetyClass, newId, nowIso, SafetyClass } from '@pathfinder/core';
import { preflight, type PreflightResult } from '@pathfinder/crawler';
import { z } from 'zod';
import type { ServerContext } from '../context.js';
import { ToolError, parseInput } from '../errors.js';
import { getRun, type RunRow } from './common.js';
import { ownerColumns } from './run-lifecycle.js';
import { scopeOf } from './run-budget.js';
import {
  FocusError,
  focusScope,
  portalRuleSet,
  ruleSetSummary,
  type ScanFocus,
} from '@pathfinder/safety';
import { createRunRobots, robotsSnapshot, type RunRobots } from './robots.js';
import { createProcess, openFollowup, processOfRun } from './trace.js';
import { resolveRunCredentials, runSecrets } from './credentials.js';
import { personaRefs } from '@pathfinder/vault';
import type { LoadedHook } from '@pathfinder/hooks';
import { loadRunHooks } from './run-hooks.js';

const Globs = z
  .array(z.string().trim().regex(/^\//, 'a path starting with /; * matches anything'))
  .max(50);

const ScanFocusInput = z
  .object({
    start_url: z.url().optional(),
    only_domains: z
      .array(
        z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z0-9.-]+$/, 'a host name such as en.example.org'),
      )
      .max(20)
      .optional(),
    only_paths: Globs.optional(),
    exclude_paths: Globs.optional(),
  })
  .strict();

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
    /** Which of the portal's environments (spec 011); a resumed run keeps its own. */
    environment: z.enum(['production', 'staging', 'sandbox']).optional(),
    /**
     * The BA's choice for this run (spec 011 FR-013): lowers the run's limit below the portal's
     * and persona's, never raises it. A resumed run keeps its own unless given again.
     */
    max_action_class: SafetyClass.optional(),
    /** Answer image requests with a placeholder (spec 011 FR-014); a resumed run keeps its own. */
    skip_images: z.boolean().optional(),
    /**
     * The BA's focus for this run (spec 011 FR-017): start page, hosts and paths to stay within,
     * paths to leave out. Only narrows the scope; a resumed run keeps its own unless given again.
     */
    focus: ScanFocusInput.optional(),
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
  /** Where the run starts: the focus's start page, else the portal's (a trace's first `navigate`). */
  base_url: string;
  /** The BA's focus for this run (spec 011 FR-017), when there is one. */
  focus?: ScanFocus;
  resumed: boolean;
  effective_max_action_class: SafetyClass;
  /** Images are answered with a placeholder in this run (spec 011 FR-014). */
  skip_images: boolean;
  budgets: { steps: number; run_time_minutes: number; states: number };
}

type Approved = Extract<PreflightResult, { ok: true }> & { hooks: readonly LoadedHook[] };

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
    // The environment the run targets: asked for, or the resumed run's own (spec 011 FR-009).
    // Runs of every environment are recorded in this server's store, labelled with it.
    let environment = input.environment;
    if (environment === undefined && input.resume_run_id !== undefined) {
      const row = await ctx.db
        .selectFrom('runs')
        .select('environment')
        .where('id', '=', input.resume_run_id)
        .executeTakeFirst();
      environment = row?.environment as typeof environment;
    }
    const pre = preflight(input.portal_id, input.persona_id, {
      root: ctx.root,
      ...(environment !== undefined ? { environment } : {}),
    });
    if (!pre.ok) throw new ToolError(pre.code, pre.message, { reasons: pre.reasons });
    // The portal's hooks (spec 023): a broken mapping refuses the run before anything is written.
    const hooks = await loadRunHooks(ctx.root, pre.effective.portal);
    return { input, pre: { ...pre, hooks } };
  });
  const { portal, persona } = pre.effective;
  // The run's limit and scope: the portal's and persona's, lowered and narrowed by the BA's choices
  // for this run. A focus that would widen the scope is refused before anything is written.
  const limited = (
    choices: RunChoices,
  ): {
    effectiveMaxActionClass: SafetyClass;
    approved: Approved;
    startUrl: string;
  } => {
    const effectiveMaxActionClass =
      choices.max_action_class === null
        ? pre.effective.effectiveMaxActionClass
        : minSafetyClass(pre.effective.effectiveMaxActionClass, choices.max_action_class);
    let scope = pre.scope;
    if (choices.focus !== null) {
      try {
        scope = focusScope(pre.scope, choices.focus, portal.base_url);
      } catch (e) {
        if (!(e instanceof FocusError)) throw e;
        throw new ToolError('SCHEMA_INVALID', `focus: ${e.message}`, { field: 'focus' });
      }
    }
    return {
      effectiveMaxActionClass,
      approved: { ...pre, scope, effective: { ...pre.effective, effectiveMaxActionClass } },
      startUrl: choices.focus?.start_url ?? portal.base_url,
    };
  };
  // Credentials before anything else is written or launched: a missing ref refuses the run.
  // Guests have nothing to resolve, and their traces stay as they were.
  const secrets =
    Object.keys(personaRefs(persona.auth)).length === 0
      ? {}
      : await ctx.tracer.phase('resolve_credentials', () =>
          resolveRunCredentials(ctx, portal.id, persona, portal.environment),
        );

  if (input.resume_run_id !== undefined) {
    const resumeId = input.resume_run_id;
    const run = await ctx.tracer.phase('resume_check', () =>
      resumableRun(ctx, resumeId, portal.id, persona.id),
    );
    // A resumed run keeps its choices unless the BA gave new ones.
    const prior = runChoices(run);
    const choices: RunChoices = {
      max_action_class: input.max_action_class ?? prior.max_action_class,
      skip_images: input.skip_images ?? prior.skip_images,
      focus: input.focus ?? prior.focus,
    };
    const { effectiveMaxActionClass, approved, startUrl } = limited(choices);
    // A resumed run reads robots.txt again; a change is logged by the policy writer (FR-006).
    const robots = await ctx.tracer.phase('robots_fetch', async () => {
      const robots = createRunRobots(ctx, run.id, portal, { buffer: false });
      await loadBaseRobots(robots, startUrl);
      return robots;
    });
    const snapshot = JSON.parse(run.config_snapshot) as Record<string, unknown>;
    const resumed = await ctx.tracer.phase('insert_run', async () => {
      await ctx.db
        .updateTable('runs')
        // The resuming server drives the run from now on (F-14).
        .set({
          status: 'running',
          ended_at: null,
          config_snapshot: JSON.stringify({
            ...snapshot,
            effective_max_action_class: effectiveMaxActionClass,
            choices,
            scope: approved.scope,
          }),
          ...ownerColumns(ctx),
        })
        .where('id', '=', run.id)
        .execute();
      return getRun(ctx, run.id);
    });
    const resumedProcess = await processOfRun(ctx, run.id);
    runSecrets.set(run.id, secrets);
    return {
      output: {
        run_id: run.id,
        mode: resumedProcess ? 'trace' : 'map',
        ...(resumedProcess ? { process_id: resumedProcess.id } : {}),
        base_url: startUrl,
        ...(choices.focus ? { focus: choices.focus } : {}),
        resumed: true,
        effective_max_action_class: effectiveMaxActionClass,
        skip_images: choices.skip_images,
        budgets: remainingBudgets(resumed),
      },
      run: resumed,
      approved,
      robots,
    };
  }

  const choices: RunChoices = {
    max_action_class: input.max_action_class ?? null,
    skip_images: input.skip_images ?? false,
    focus: input.focus ?? null,
  };
  const { effectiveMaxActionClass, approved, startUrl } = limited(choices);

  const followupRecordId =
    input.followup_key === undefined
      ? null
      : await openFollowup(ctx, portal.id, input.followup_key);
  const id = newId();
  const robots = await ctx.tracer.phase('robots_fetch', async () => {
    const robots = createRunRobots(ctx, id, portal, { buffer: true });
    await loadBaseRobots(robots, startUrl);
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
          choices,
          scope: approved.scope,
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
        ...ownerColumns(ctx),
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
  runSecrets.set(id, secrets);
  return {
    output: {
      run_id: id,
      mode: input.mode,
      ...(processId ? { process_id: processId } : {}),
      base_url: startUrl,
      ...(choices.focus ? { focus: choices.focus } : {}),
      resumed: false,
      effective_max_action_class: effectiveMaxActionClass,
      skip_images: choices.skip_images,
      budgets: remainingBudgets(run),
    },
    run,
    approved,
    robots,
  };
}

/** The BA's choices for one run (spec 011 FR-013, FR-014), kept in `config_snapshot.choices`. */
export interface RunChoices {
  /** Lowers the run's limit; null = the portal's and persona's limit. */
  max_action_class: SafetyClass | null;
  skip_images: boolean;
  /** Narrows the run's scope and start page (spec 011 FR-017); null = the whole portal. */
  focus: ScanFocus | null;
}

export function runChoices(run: Pick<RunRow, 'config_snapshot'>): RunChoices {
  try {
    const c = (JSON.parse(run.config_snapshot) as { choices?: Record<string, unknown> }).choices;
    return {
      max_action_class: SafetyClass.safeParse(c?.max_action_class).data ?? null,
      skip_images: c?.skip_images === true,
      focus: ScanFocusInput.safeParse(c?.focus).data ?? null,
    };
  } catch {
    return { max_action_class: null, skip_images: false, focus: null };
  }
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
