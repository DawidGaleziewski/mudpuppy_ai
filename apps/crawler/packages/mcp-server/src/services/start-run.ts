import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { minSafetyClass, newId, nowIso, type SafetyClass } from '@mudpuppy/core';
import { preflight, type PreflightResult } from '@mudpuppy/crawler';
import type { z } from 'zod';
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
} from '@mudpuppy/safety';
import { createRunRobots, robotsSnapshot, type RunRobots } from './robots.js';
import { createProcess, openFollowup, processOfRun } from './trace.js';
import { resolveRunCredentials, runSecrets } from './credentials.js';
import { personaRefs } from '@mudpuppy/vault';
import type { LoadedHook } from '@mudpuppy/hooks';
import { loadRunHooks } from './run-hooks.js';
import { openProbeMarks, type ProbeMarkItem } from './probe-marks.js';
import type { DirectedType } from './run-plan.js';
import { resolveDirected, useMarks, type StartPoint } from './run-plan-resolve.js';
import { newRunChoices, runChoices, StartRunInput, type RunChoices } from './start-run-input.js';

export interface StartRunOutput {
  run_id: string;
  mode: 'map' | 'trace' | 'probe';
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
  /** A form-probing run's marked form steps (spec 032 US5): the only steps `probe_form` accepts. */
  probe_marks?: ProbeMarkItem[];
  /** A directed run (spec 034 R-66): its type and where it starts; reach each with go_to_state. */
  run_type?: DirectedType;
  start_points?: StartPoint[];
}

type Approved = Extract<PreflightResult, { ok: true }> & { hooks: readonly LoadedHook[] };
type Input = z.infer<typeof StartRunInput>;
type Started = { output: StartRunOutput; run: RunRow; approved: Approved; robots: RunRobots };
type Secrets = Awaited<ReturnType<typeof resolveRunCredentials>> | Record<string, never>;

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

async function fetchRobots(
  ctx: ServerContext,
  runId: string,
  {
    portal,
    startUrl,
    buffer,
  }: { portal: Approved['effective']['portal']; startUrl: string; buffer: boolean },
): Promise<RunRobots> {
  return ctx.tracer.phase('robots_fetch', async () => {
    const robots = createRunRobots(ctx, runId, portal, { buffer });
    await loadBaseRobots(robots, startUrl);
    return robots;
  });
}

/** The input, the portal and persona preflight and the portal's hooks; nothing written yet. */
async function preflightRun(
  ctx: ServerContext,
  raw: unknown,
): Promise<{ input: Input; pre: Approved }> {
  return ctx.tracer.phase('preflight', async () => {
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
    const ownRun = input.resume_run_id ?? input.plan?.parent_run_id;
    if (environment === undefined && ownRun !== undefined) {
      const row = await ctx.db
        .selectFrom('runs')
        .select('environment')
        .where('id', '=', ownRun)
        .executeTakeFirst();
      environment = row?.environment;
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
}

/**
 * The run's limit and scope: the portal's and persona's, lowered and narrowed by the BA's choices
 * for this run. A focus that would widen the scope is refused before anything is written.
 */
function limited(
  pre: Approved,
  choices: RunChoices,
): { effectiveMaxActionClass: SafetyClass; approved: Approved; startUrl: string } {
  const { portal } = pre.effective;
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
}

/** Resume an interrupted run from persisted state (FR-020) without re-recording anything. */
async function resumeRun(
  ctx: ServerContext,
  { input, pre, secrets }: { input: Input; pre: Approved; secrets: Secrets },
): Promise<Started> {
  const { portal, persona } = pre.effective;
  const resumeId = input.resume_run_id!;
  const run = await ctx.tracer.phase('resume_check', () =>
    resumableRun(ctx, resumeId, portal.id, persona.id),
  );
  // A resumed run keeps its choices unless the BA gave new ones.
  const prior = runChoices(run);
  const choices: RunChoices = {
    max_action_class: input.max_action_class ?? prior.max_action_class,
    skip_images: input.skip_images ?? prior.skip_images,
    focus: input.focus ?? prior.focus,
    form_probing: prior.form_probing,
    replay: prior.replay,
  };
  const { effectiveMaxActionClass, approved, startUrl } = limited(pre, choices);
  // A resumed run reads robots.txt again; a change is logged by the policy writer (FR-006).
  const robots = await fetchRobots(ctx, run.id, { portal, startUrl, buffer: false });
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

/**
 * A new run's directed plan and probe marks, before any row is written: nothing to start from or
 * nothing to probe refuses it. Depth counts from a directed run's start points (spec 034 A-4).
 */
async function planNewRun(ctx: ServerContext, input: Input, pre: Approved) {
  const { portal, persona } = pre.effective;
  const choices = newRunChoices(input);
  const limits = limited(pre, choices);
  const directed =
    input.run_type === undefined
      ? null
      : await resolveDirected(
          ctx,
          { portal: portal.id, persona: persona.id },
          input.run_type,
          input.plan ?? {},
        );
  const depth = directed?.plan.depth ?? null;
  const approved: Approved =
    depth === null
      ? limits.approved
      : { ...limits.approved, scope: { ...limits.approved.scope, max_depth: Math.max(depth, 1) } };
  // Nothing to probe: refused before any browser opens or row is written.
  const probeMarks = choices.form_probing ? await openProbeMarks(ctx, portal.id) : undefined;
  if (probeMarks?.length === 0)
    throw new ToolError(
      'NO_PROBE_MARKS',
      `no form step of ${portal.id} is marked for probing; a person marks one on its screen page first`,
    );
  return { choices, limits, directed, approved, probeMarks };
}

type Plan = Awaited<ReturnType<typeof planNewRun>>;

/** The new run's row with its resolved `config_snapshot`; directed runs use their marks. */
async function insertRunRow(
  ctx: ServerContext,
  { id, input, plan, robots }: { id: string; input: Input; plan: Plan; robots: RunRobots },
): Promise<RunRow> {
  const { portal, persona } = plan.approved.effective;
  const { directed } = plan;
  return ctx.tracer.phase('insert_run', async () => {
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
          effective_max_action_class: plan.limits.effectiveMaxActionClass,
          choices: plan.choices,
          scope: plan.approved.scope,
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
        ...(directed
          ? {
              run_type: directed.plan.type,
              parent_run_id: directed.plan.parent_run_id,
              plan_json: JSON.stringify(directed.plan),
            }
          : {}),
      })
      .execute();
    await robots.flush();
    if (directed) await useMarks(ctx, directed.plan.mark_ids, id);
    return getRun(ctx, id);
  });
}

async function newRun(
  ctx: ServerContext,
  { input, pre, secrets }: { input: Input; pre: Approved; secrets: Secrets },
): Promise<Started> {
  const { portal, persona } = pre.effective;
  const plan = await planNewRun(ctx, input, pre);
  const { choices, directed, approved, probeMarks } = plan;
  const { effectiveMaxActionClass, startUrl } = plan.limits;
  const followupRecordId =
    input.followup_key === undefined
      ? null
      : await openFollowup(ctx, portal.id, input.followup_key);
  const id = newId();
  const robots = await fetchRobots(ctx, id, { portal, startUrl, buffer: true });
  const run = await insertRunRow(ctx, { id, input, plan, robots });
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
      ...(probeMarks ? { probe_marks: probeMarks } : {}),
      ...(directed ? { run_type: directed.plan.type, start_points: directed.startPoints } : {}),
    },
    run,
    approved,
    robots,
  };
}

/**
 * Database part of `start_run`, done AFTER `preflight` and BEFORE any browser is launched. Creates the
 * run row with the resolved `config_snapshot`, or resumes an interrupted run from persisted state
 * (FR-020) without re-recording anything. Returns what the browser session needs.
 */
export async function startRunRecord(ctx: ServerContext, raw: unknown): Promise<Started> {
  const { input, pre } = await preflightRun(ctx, raw);
  const { portal, persona } = pre.effective;
  // Credentials before anything else is written or launched: a missing ref refuses the run.
  // Guests have nothing to resolve, and their traces stay as they were.
  const secrets =
    Object.keys(personaRefs(persona.auth)).length === 0
      ? {}
      : await ctx.tracer.phase('resolve_credentials', () =>
          resolveRunCredentials(ctx, portal.id, persona, portal.environment),
        );
  return input.resume_run_id !== undefined
    ? resumeRun(ctx, { input, pre, secrets })
    : newRun(ctx, { input, pre, secrets });
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
