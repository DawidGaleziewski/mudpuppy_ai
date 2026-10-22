// `request_scan` (R-30 T015, FR-004, FR-020): check that a scan has everything it needs, record
// the step as pending and hand the work to the `crawler` subagent (research R2b). The checks here
// only catch what is missing; every safety gate still runs in the mudpuppy server when the
// crawler starts the run, and its refusal reaches the BA unchanged. The briefs: `scan-prompts.ts`.

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
import { directedScanCheck } from './scan-directed.js';
import { briefFor, type ScanChoices } from './scan-prompts.js';
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
type Rest = Omit<
  z.infer<typeof RequestScanInput>,
  'portal' | 'resume_run_id' | 'process' | 'form_probing' | 'run_type' | 'plan'
>;

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

/** A column of the run this scan continues, or undefined without one. */
function ownRunColumn(
  raw: BetterSqlite3.Database,
  ownRun: string | undefined,
  column: 'persona_id' | 'environment',
): string | undefined {
  if (ownRun === undefined) return undefined;
  const row = raw.prepare(`SELECT ${column} FROM runs WHERE id = ?`).get(ownRun) as
    Record<string, string> | undefined;
  return row?.[column];
}

/** The portal and persona files; a missing one refuses the scan with what to add. */
function requireFiles(
  paths: WorkspacePaths,
  portal: string,
  persona: string | undefined,
): { portalPath: string; personaPath: string; persona: string } {
  const portalPath = portalFile(paths, portal);
  const personaPath =
    persona === undefined ? null : join(paths.repoRoot, 'personas', portal, `${persona}.yaml`);
  const missing: string[] = [];
  if (!existsSync(portalPath))
    missing.push('the portal: the BA adds it with "+ new portal" in the portal dropdown');
  if (personaPath === null || !existsSync(personaPath)) missing.push('persona');
  if (persona === undefined || personaPath === null || missing.length > 0)
    throw new ScanRefusal('MISSING_INPUT', 'the scan needs more information', missing);
  return { portalPath, personaPath, persona };
}

/**
 * The portal's environment to scan (spec 011 FR-009): asked for, the continued run's own, or the
 * only one; with several and none named, the BA is asked which. Returns it with the persona's auth.
 */
function scanEnvironment(
  paths: WorkspacePaths,
  { portal, portalPath, personaPath }: { portal: string; portalPath: string; personaPath: string },
  { asked, resumed }: { asked: Environment | undefined; resumed: string | undefined },
): { environment: Environment; auth: 'none' | Record<string, string> } {
  try {
    const declared = portalEnvironments(portalPath).map((e) => e.environment);
    const chosen = asked ?? resumed ?? (declared.length === 1 ? declared[0] : undefined);
    if (chosen === undefined)
      throw new ScanRefusal('MISSING_INPUT', 'the portal has several environments', [
        `environment: one of ${declared.join(', ')}`,
      ]);
    const fence = [
      join(paths.repoRoot, 'personas', '_mixins'),
      join(paths.repoRoot, 'personas', portal),
    ];
    const auth = loadEffectiveConfig(portalPath, personaPath, { fence }, chosen).persona.auth;
    return { environment: chosen, auth };
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
}

/** Every `ref:` credential the persona names must be in the vault for the environment. */
function requireCredentials(
  raw: BetterSqlite3.Database,
  portal: string,
  { environment, auth }: { environment: Environment; auth: 'none' | Record<string, string> },
): void {
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
}

/** One crawler per portal at a time: a scan and a process trace share the browser. */
function requireIdle(raw: BetterSqlite3.Database, portal: string): void {
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
}

/** Why a run cannot be resumed as this portal and persona's scan, or null when it can. */
function resumeProblem(
  run: { portal_id: string; persona_id: string; mode: string; status: string } | undefined,
  portal: string,
  persona: string,
): string | null {
  if (run === undefined) return 'does not exist';
  if (run.portal_id !== portal || run.persona_id !== persona || run.mode !== 'map')
    return `is not a scan of ${portal} as ${persona}`;
  if (run.status !== 'interrupted')
    return `is ${run.status}; only a stopped (interrupted) scan can be resumed`;
  return null;
}

function requireResumable(
  raw: BetterSqlite3.Database,
  resumeRunId: string,
  { portal, persona }: { portal: string; persona: string },
): void {
  const run = raw
    .prepare(`SELECT portal_id, persona_id, mode, status FROM runs WHERE id = ?`)
    .get(resumeRunId) as
    { portal_id: string; persona_id: string; mode: string; status: string } | undefined;
  const problem = resumeProblem(run, portal, persona);
  if (problem !== null) throw new ScanRefusal('RUN_NOT_RESUMABLE', `run ${resumeRunId} ${problem}`);
}

/**
 * A new scan may fill and submit forms, loads images and maps the whole portal unless the BA
 * decided otherwise (spec 011 FR-013, FR-014, FR-017); a resume passes only what the BA changed.
 */
function choicesFor(resumeRunId: string | undefined, rest: Rest): ScanChoices {
  const focus = rest.focus !== undefined ? { focus: rest.focus } : {};
  if (resumeRunId === undefined)
    return {
      allowWrites: rest.allow_writes ?? true,
      skipImages: rest.skip_images ?? false,
      ...focus,
    };
  return {
    ...(rest.allow_writes !== undefined ? { allowWrites: rest.allow_writes } : {}),
    ...(rest.skip_images !== undefined ? { skipImages: rest.skip_images } : {}),
    ...focus,
  };
}

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
  const files = requireFiles(
    paths,
    portal,
    rest.persona ?? ownRunColumn(raw, ownRun, 'persona_id'),
  );
  const { persona } = files;
  const target = scanEnvironment(
    paths,
    { portal, ...files },
    { asked: rest.environment, resumed: ownRunColumn(raw, ownRun, 'environment') },
  );
  const { environment } = target;
  requireCredentials(raw, portal, target);
  requireIdle(raw, portal);
  if (resume_run_id !== undefined) requireResumable(raw, resume_run_id, { portal, persona });

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
  return {
    step,
    status: 'pending',
    handoff: {
      agent: 'crawler',
      prompt: briefFor(
        { portal, persona, environment, resume_run_id, process, probe, run_type, plan },
        choicesFor(resume_run_id, rest),
      ),
    },
  };
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
