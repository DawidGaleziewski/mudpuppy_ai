// `request_scan` (R-30 T015, FR-004, FR-020): check that a scan has everything it needs, record
// the step as pending and hand the work to the `crawler` subagent (research R2b). The checks here
// only catch what is missing; every safety gate still runs in the mudpuppy server when the
// crawler starts the run, and its refusal reaches the BA unchanged.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import { z } from 'zod';
import {
  ConfigError,
  loadEffectiveConfig,
  portalEnvironments,
  Environment,
} from '@mudpuppy/config';
import { directedPrompt, directedScanCheck } from './scan-directed.js';
import { recordStep } from './steps.js';
import { portalFile, type WorkspacePaths } from './workflow-data.js';

const Paths = z
  .array(z.string().trim().regex(/^\//, 'a path starting with /; * matches anything'))
  .min(1)
  .max(50);

/** Mirrors `start_run`'s focus; the mudpuppy server refuses one that would widen the scope. */
export const ScanFocus = z
  .object({
    start_url: z.url().optional(),
    only_domains: z
      .array(
        z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z0-9.-]+$/, 'a host such as en.example.org'),
      )
      .min(1)
      .max(20)
      .optional(),
    only_paths: Paths.optional(),
    exclude_paths: Paths.optional(),
  })
  .strict()
  .refine((f) => Object.keys(f).length > 0, 'give at least one of its fields');

export const RequestScanInput = z.object({
  portal: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  /** Required for a new scan; a resumed run keeps its own when left out (spec 011 F-02). */
  persona: z
    .string()
    .regex(/^[a-z0-9][a-z0-9_/-]*$/)
    .optional(),
  /** One of the portal's environments; may be left out when it has only one (spec 011 FR-009). */
  environment: Environment.optional(),
  /** Continue a stopped (interrupted) map run of this portal and persona instead of a new one. */
  resume_run_id: z.string().min(1).optional(),
  /**
   * The BA's decision for this scan (spec 011 FR-013): true (the default for a new scan since
   * the owner's 2026-10-14 decision) lets the crawler fill and submit forms up to the portal's
   * limit; false ("only look") maps read-only. A resumed run keeps its own when left out.
   */
  allow_writes: z.boolean().optional(),
  /** Skip loading images (spec 011 FR-014); default false; a resumed run keeps its own. */
  skip_images: z.boolean().optional(),
  /**
   * The BA's focus for this scan (spec 011 FR-017): start page, hosts and path globs to stay
   * within, path globs to leave out. Only narrows the portal; a resumed run keeps its own.
   */
  focus: ScanFocus.optional(),
  /**
   * Trace one named process instead of mapping (spec 011 FR-019): the "map a process" step.
   * Not with `resume_run_id`.
   */
  process: z
    .object({ name: z.string().trim().min(1).max(200), goal: z.string().trim().min(1).max(500) })
    .strict()
    .optional(),
  /**
   * A "Probe forms" (form-probing) scan (spec 032 US5, owner answer 3 of 2026-10-17): probe only
   * the form steps the BA marked for probing, without mapping. A plain scan never probes. Not with
   * `resume_run_id` or `process`.
   */
  form_probing: z.boolean().optional(),
  /**
   * A directed scan (spec 034 R-66, design 11-map-runs §5): a new run that starts at recorded
   * screens by replaying the recorded path. `continue` picks up a stopped scan (plan.parent_run_id),
   * `focused` explores from the Start here / Focus marks (or plan.start_state_ids) within
   * plan.depth, `recheck` only records the current state of the Recheck-marked screens, `retry`
   * repeats one failed action (plan.target_transition_id) with a variation. Not with `resume_run_id`,
   * `process` or `form_probing`.
   */
  run_type: z.enum(['continue', 'focused', 'recheck', 'retry']).optional(),
  plan: z
    .object({
      parent_run_id: z.string().min(1).optional(),
      start_state_ids: z.array(z.string().min(1)).min(1).max(20).optional(),
      depth: z.number().int().min(0).max(10).optional(),
      target_transition_id: z.string().min(1).optional(),
      variation: z.enum(['none', 'wait_longer', 'other_input', 'no_submit']).optional(),
    })
    .strict()
    .optional(),
});
export type RequestScanInput = z.input<typeof RequestScanInput>;
export type ScanPlan = NonNullable<z.infer<typeof RequestScanInput>['plan']>;
export type DirectedType = NonNullable<z.infer<typeof RequestScanInput>['run_type']>;

/** What the scan may do, as told to the crawler; undefined keeps a resumed run's own. */
export interface ScanChoices {
  allowWrites?: boolean;
  skipImages?: boolean;
  focus?: z.infer<typeof ScanFocus>;
}

export class ScanRefusal extends Error {
  constructor(
    readonly code: 'MISSING_INPUT' | 'INVALID' | 'SCAN_RUNNING' | 'RUN_NOT_RESUMABLE',
    message: string,
    readonly missing: string[] = [],
  ) {
    super(message);
    this.name = 'ScanRefusal';
  }
}

export interface ScanHandoff {
  /** `map` is the "map a process" step: a trace of one named process. */
  step: 'scan' | 'map';
  status: 'pending';
  handoff: { agent: 'crawler'; prompt: string };
}

const REF = /^ref:(.+)$/;

export function requestScan(
  raw: BetterSqlite3.Database,
  paths: WorkspacePaths,
  conversationId: string,
  input: RequestScanInput,
): ScanHandoff {
  const { portal, resume_run_id, process, form_probing, run_type, plan, ...rest } =
    RequestScanInput.parse(input);
  if (process !== undefined && resume_run_id !== undefined)
    throw new ScanRefusal(
      'INVALID',
      'a process trace starts a new run; resume_run_id continues a stopped scan',
    );
  const probe = form_probing === true;
  if (run_type !== undefined)
    directedScanCheck(raw, portal, { run_type, plan, resume_run_id, process, probe });
  if (probe) formProbingCheck(raw, portal, { resume_run_id, process, ...rest });
  // The run this scan continues: a resumed one, or a directed scan's parent. After [reset
  // assistant] the orchestrator does not know its persona and guessed one (F-02): take the run's.
  const ownRun = resume_run_id ?? plan?.parent_run_id;
  const persona =
    rest.persona ??
    (ownRun === undefined
      ? undefined
      : (
          raw.prepare(`SELECT persona_id FROM runs WHERE id = ?`).get(ownRun) as
            { persona_id: string } | undefined
        )?.persona_id);
  const portalPath = portalFile(paths, portal);
  const personaPath =
    persona === undefined ? null : join(paths.repoRoot, 'personas', portal, `${persona}.yaml`);
  const missing: string[] = [];
  if (!existsSync(portalPath))
    missing.push('the portal: the BA adds it with "+ new portal" in the portal dropdown');
  if (personaPath === null || !existsSync(personaPath)) missing.push('persona');
  if (persona === undefined || personaPath === null || missing.length > 0)
    throw new ScanRefusal('MISSING_INPUT', 'the scan needs more information', missing);

  let auth: 'none' | Record<string, string>;
  let environment: Environment;
  try {
    // The portal's environment to scan (spec 011 FR-009): asked for, the continued run's own, or
    // the only one; with several and none named, the BA is asked which.
    const resumed =
      ownRun === undefined
        ? undefined
        : (
            raw.prepare(`SELECT environment FROM runs WHERE id = ?`).get(ownRun) as
              { environment: Environment } | undefined
          )?.environment;
    const declared = portalEnvironments(portalPath).map((e) => e.environment);
    const chosen = rest.environment ?? resumed ?? (declared.length === 1 ? declared[0] : undefined);
    if (chosen === undefined)
      throw new ScanRefusal('MISSING_INPUT', 'the portal has several environments', [
        `environment: one of ${declared.join(', ')}`,
      ]);
    environment = chosen;
    const fence = [
      join(paths.repoRoot, 'personas', '_mixins'),
      join(paths.repoRoot, 'personas', portal),
    ];
    auth = loadEffectiveConfig(portalPath, personaPath, { fence }, environment).persona.auth;
  } catch (error) {
    if (error instanceof ScanRefusal) throw error;
    if (error instanceof ConfigError)
      throw new ScanRefusal(
        'INVALID',
        'the portal or persona configuration has problems',
        error.problems,
      );
    throw error;
  }

  const refs =
    auth === 'none'
      ? []
      : Object.values(auth)
          .map((v) => REF.exec(v)?.[1])
          .filter((v): v is string => v !== undefined);
  const stored = new Set(
    (
      raw
        .prepare(`SELECT ref_name FROM credentials WHERE portal_id = ? AND environment = ?`)
        .all(portal, environment) as { ref_name: string }[]
    ).map((r) => r.ref_name),
  );
  const missingRefs = refs.filter((r) => !stored.has(r));
  if (missingRefs.length > 0)
    throw new ScanRefusal(
      'MISSING_INPUT',
      'test-user credentials are missing; the BA enters them in the credentials form',
      missingRefs.map((r) => `test-user credential ${r} for ${environment}`),
    );

  // One crawler per portal at a time: a scan and a process trace share the browser.
  const running = raw
    .prepare(
      `SELECT id, mode FROM runs WHERE portal_id = ? AND mode IN ('map', 'trace')
       AND status = 'running' LIMIT 1`,
    )
    .get(portal) as { id: string; mode: string } | undefined;
  if (running !== undefined)
    throw new ScanRefusal(
      'SCAN_RUNNING',
      `a ${running.mode === 'map' ? 'scan' : 'process trace'} of ${portal} is already running (run ${running.id})`,
    );

  if (resume_run_id !== undefined) {
    const run = raw
      .prepare(`SELECT portal_id, persona_id, mode, status FROM runs WHERE id = ?`)
      .get(resume_run_id) as
      { portal_id: string; persona_id: string; mode: string; status: string } | undefined;
    const problem =
      run === undefined
        ? 'does not exist'
        : run.portal_id !== portal || run.persona_id !== persona || run.mode !== 'map'
          ? `is not a scan of ${portal} as ${persona}`
          : run.status !== 'interrupted'
            ? `is ${run.status}; only a stopped (interrupted) scan can be resumed`
            : null;
    if (problem !== null)
      throw new ScanRefusal('RUN_NOT_RESUMABLE', `run ${resume_run_id} ${problem}`);
  }

  // A resumed run keeps its start time, so the step is linked to it now (the step recorder follows
  // the linked run); a new scan clears the link of an earlier one.
  const step = process === undefined ? 'scan' : 'map';
  recordStep(raw, {
    conversationId,
    portalId: portal,
    step,
    status: 'pending',
    runId: resume_run_id ?? null,
  });
  // A new scan may fill and submit forms, loads images and maps the whole portal unless the BA
  // decided otherwise (spec 011 FR-013, FR-014, FR-017); a resume passes only what the BA changed.
  const choices: ScanChoices =
    resume_run_id === undefined
      ? {
          allowWrites: rest.allow_writes ?? true,
          skipImages: rest.skip_images ?? false,
          ...(rest.focus !== undefined ? { focus: rest.focus } : {}),
        }
      : {
          ...(rest.allow_writes !== undefined ? { allowWrites: rest.allow_writes } : {}),
          ...(rest.skip_images !== undefined ? { skipImages: rest.skip_images } : {}),
          ...(rest.focus !== undefined ? { focus: rest.focus } : {}),
        };
  return {
    step,
    status: 'pending',
    handoff: {
      agent: 'crawler',
      prompt: briefFor(
        { portal, persona, environment, resume_run_id, process, probe, run_type, plan },
        choices,
      ),
    },
  };
}

function briefFor(
  s: {
    portal: string;
    persona: string;
    environment: string;
    resume_run_id: string | undefined;
    process: { name: string; goal: string } | undefined;
    probe: boolean;
    run_type: DirectedType | undefined;
    plan: ScanPlan | undefined;
  },
  choices: ScanChoices,
): string {
  if (s.run_type !== undefined)
    return directedPrompt(
      { portal: s.portal, persona: s.persona, environment: s.environment },
      s.run_type,
      s.plan ?? {},
      choiceArgs(choices),
    );
  if (s.probe) return probePrompt(s.portal, s.persona, s.environment, choices);
  if (s.process !== undefined)
    return tracePrompt(s.portal, s.persona, s.environment, s.process, choices);
  return scanPrompt(s.portal, s.persona, s.environment, s.resume_run_id, choices);
}

/**
 * A form-probing scan needs marks and a new run that may submit forms (probes type and submit,
 * O-M1). The mudpuppy server checks the marks again when the run starts.
 */
function formProbingCheck(
  raw: BetterSqlite3.Database,
  portal: string,
  rest: { resume_run_id?: string; process?: unknown; allow_writes?: boolean },
): void {
  if (rest.resume_run_id !== undefined || rest.process !== undefined)
    throw new ScanRefusal(
      'INVALID',
      'a form-probing scan is a new run of its own; it cannot resume a scan or trace a process',
    );
  if (rest.allow_writes === false)
    throw new ScanRefusal(
      'INVALID',
      'probing types wrong values and submits forms; a scan that only looks cannot probe',
    );
  const open = raw
    .prepare(
      `SELECT COUNT(*) AS n FROM marks WHERE portal_id = ? AND kind = 'probe' AND origin = 'person' AND used_by_run_id IS NULL`,
    )
    .get(portal) as { n: number };
  if (open.n === 0)
    throw new ScanRefusal('MISSING_INPUT', 'no form step of this portal is marked for probing', [
      'Probe marks: the BA presses "Mark for probing" on a form step\'s screen page (Screens)',
    ]);
}

/** The crawler brief for a "Probe forms" scan (spec 032 US5). */
export function probePrompt(
  portal: string,
  persona: string,
  environment: string,
  choices: ScanChoices = {},
): string {
  return (
    `Probe the marked forms of portal "${portal}" as persona "${persona}" in environment ` +
    `"${environment}" (a form-probing scan): call start_run with form_probing true and environment ` +
    `"${environment}".${choiceArgs(choices)} Use only the mudpuppy tools. Follow the "Probe forms" ` +
    'procedure: for each of the probe_marks start_run returns, open its URL, press on with Next ' +
    'until the marked step shows, then call probe_form on that step\'s submit or Next until its ' +
    'result has no "more". Do not follow the frontier. Then finish_run. Stop early only on ' +
    'RUN_STOPPED or a refusal to start, and report its message word for word. Finish with the run ' +
    'id, its status, and per mark the step and how many outcomes it got.'
  );
}

/** The `start_run` arguments for the BA's choices, as text for the crawler brief. */
function choiceArgs(choices: ScanChoices): string {
  const args: string[] = [];
  if (choices.allowWrites !== undefined)
    args.push(
      choices.allowWrites
        ? 'max_action_class "external-side-effect"'
        : // Not "no form is filled": a trace briefed so refused to type in an allowed search
          // box (spec 011 F-10). The server enforces the limit; searching stays allowed.
          'max_action_class "read" (the server refuses anything that would change data; act on every action it marks allowed, searching included)',
    );
  if (choices.skipImages !== undefined) args.push(`skip_images ${String(choices.skipImages)}`);
  if (choices.focus !== undefined) args.push(`focus ${JSON.stringify(choices.focus)}`);
  return args.length === 0 ? '' : ` Also pass ${args.join(' and ')}.`;
}

/** The crawler brief for the "map a process" step: one trace run (spec 011 FR-019). */
export function tracePrompt(
  portal: string,
  persona: string,
  environment: string,
  process: { name: string; goal: string },
  choices: ScanChoices = {},
): string {
  return (
    `Trace the process ${JSON.stringify(process.name)} of portal "${portal}" as persona "${persona}" ` +
    `in environment "${environment}": call start_run with mode "trace", process ` +
    `${JSON.stringify(process)} and environment "${environment}".${choiceArgs(choices)} ` +
    'Use only the mudpuppy tools. Start at the base_url start_run returns, walk only this ' +
    'process toward its goal and finish_run when the goal is reached or cannot be. Stop early only ' +
    'on RUN_STOPPED or a refusal to start, and report its message word for word. Finish with the ' +
    'run id, its status and how the process ended.'
  );
}

/**
 * The crawler brief. "Drain the frontier" is spelled out because a crawler briefed without it
 * stopped after 33 steps with 220 links queued, judging them duplicates (F-13, T042).
 */
export function scanPrompt(
  portal: string,
  persona: string,
  environment: string,
  resumeRunId?: string,
  choices: ScanChoices = {},
): string {
  const start =
    (resumeRunId === undefined
      ? `Map portal "${portal}" as persona "${persona}" in environment "${environment}" (a new map run): call start_run with environment "${environment}".`
      : `Resume the stopped map run ${resumeRunId} of portal "${portal}" as persona "${persona}" in environment "${environment}": call start_run with resume_run_id "${resumeRunId}" and environment "${environment}".`) +
    choiceArgs(choices);
  return (
    `${start} Use only the mudpuppy tools. Drain the frontier by acting on each result's next item ` +
    '(or get_next_frontier_item when a result has none) until there is no next item. Only then call ' +
    'finish_run; if it answers FRONTIER_NOT_EMPTY, continue. Stop early only on RUN_STOPPED or a ' +
    'refusal to start, and report its message word for word. Finish with the run id, its status ' +
    'and the worklist of what you skipped.'
  );
}
