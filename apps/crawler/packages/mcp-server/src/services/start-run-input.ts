/** `start_run`'s input and the BA's run choices kept in `config_snapshot.choices` (spec 011). */
import { Environment } from '@mudpuppy/config';
import { SafetyClass } from '@mudpuppy/core';
import type { ScanFocus } from '@mudpuppy/safety';
import { z } from 'zod';
import type { RunRow } from './common.js';
import { DirectedType, PlanInput } from './run-plan.js';

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

/** Run kinds that are a new run of their own, and the choices each refuses beside it. */
const NEW_RUN_ONLY: Record<string, { run: string; excludes: string[] }> = {
  form_probing: { run: 'a form-probing run', excludes: ['resume_run_id', 'mode trace'] },
  run_type: { run: 'a directed run', excludes: ['resume_run_id', 'mode trace', 'form_probing'] },
  replay: {
    run: 'a probe run',
    excludes: ['resume_run_id', 'mode trace', 'form_probing', 'run_type'],
  },
};

export const StartRunInput = z
  .object({
    portal_id: z.string().min(1),
    persona_id: z.string().min(1),
    resume_run_id: z.string().min(1).optional(),
    /** `probe`: a run of the headless driver (spec 039 design § 9), always with `replay`. */
    mode: z.enum(['map', 'trace', 'probe']).default('map'),
    process: z
      .object({ name: z.string().trim().min(1).max(200), goal: z.string().trim().min(1).max(500) })
      .strict()
      .optional(),
    followup_key: z.string().min(1).optional(),
    /** Which of the portal's environments (spec 011); a resumed run keeps its own. */
    environment: Environment.optional(),
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
    /**
     * A form-probing run (spec 032 US5): probe only the form steps a person marked for probing.
     * A new map run only; a plain run never probes.
     */
    form_probing: z.boolean().optional(),
    /**
     * The replay of a probe run (`mode: 'probe'`, spec 039 design § 9): the headless driver re-runs
     * a recorded journey prefix; `inputs` (`input.<attribute>` → value) replace the persona's test
     * data when a form is filled before its submit. A new run only; its transitions carry
     * `driver = 'headless'`.
     */
    replay: z
      .object({ inputs: z.record(z.string().regex(/^input\./), z.string().max(500)) })
      .strict()
      .optional(),
    /**
     * A directed run (spec 034 R-66): `continue` a stopped run, `focused` from marked screens,
     * `recheck` marked screens, `retry` a failed action. Start points come back in `start_points`;
     * reach each with `go_to_state`. A new map run only.
     */
    run_type: DirectedType.optional(),
    plan: PlanInput.optional(),
  })
  .strict()
  .superRefine((v, c) => {
    const set: Record<string, boolean> = {
      resume_run_id: v.resume_run_id !== undefined,
      'mode trace': v.mode === 'trace',
      form_probing: v.form_probing === true,
      run_type: v.run_type !== undefined,
      replay: v.replay !== undefined,
    };
    for (const [choice, { run, excludes }] of Object.entries(NEW_RUN_ONLY)) {
      if (!set[choice] || !excludes.some((x) => set[x])) continue;
      const list = `${excludes.slice(0, -1).join(', ')} or ${excludes.at(-1)!}`;
      c.addIssue({
        code: 'custom',
        path: [choice],
        message: `${run} is a new run; not with ${list}`,
      });
    }
    // A probe run is the headless driver's, and the driver's runs are probe runs.
    if ((v.mode === 'probe') !== (v.replay !== undefined))
      c.addIssue({
        code: 'custom',
        path: ['replay'],
        message: 'replay is given exactly when mode is probe',
      });
    // A resumed run keeps its own mode and process.
    if (v.resume_run_id !== undefined) return;
    if (v.mode === 'trace' && v.process === undefined)
      c.addIssue({ code: 'custom', path: ['process'], message: 'required when mode is trace' });
    if (v.mode !== 'trace' && v.process !== undefined)
      c.addIssue({ code: 'custom', path: ['process'], message: 'only allowed when mode is trace' });
    if (v.mode !== 'trace' && v.followup_key !== undefined)
      c.addIssue({
        code: 'custom',
        path: ['followup_key'],
        message: 'only allowed when mode is trace',
      });
  });

/** The BA's choices for one run (spec 011 FR-013, FR-014), kept in `config_snapshot.choices`. */
export interface RunChoices {
  /** Lowers the run's limit; null = the portal's and persona's limit. */
  max_action_class: SafetyClass | null;
  skip_images: boolean;
  /** Narrows the run's scope and start page (spec 011 FR-017); null = the whole portal. */
  focus: ScanFocus | null;
  /** A form-probing run (spec 032 US5): only marked form steps are probed; plain runs never probe. */
  form_probing: boolean;
  /** A probe run's replay (the headless driver, spec 039 design § 9) and the inputs it types. */
  replay: { inputs: Record<string, string> } | null;
}

/** A new run's choices: what the BA gave, else the portal's and persona's defaults. */
export function newRunChoices(input: z.infer<typeof StartRunInput>): RunChoices {
  return {
    max_action_class: input.max_action_class ?? null,
    skip_images: input.skip_images ?? false,
    focus: input.focus ?? null,
    form_probing: input.form_probing === true,
    replay: input.replay ?? null,
  };
}

const ReplayChoice = StartRunInput.shape.replay.unwrap();

export function runChoices(run: Pick<RunRow, 'config_snapshot'>): RunChoices {
  try {
    const c = (JSON.parse(run.config_snapshot) as { choices?: Record<string, unknown> }).choices;
    return {
      max_action_class: SafetyClass.safeParse(c?.max_action_class).data ?? null,
      skip_images: c?.skip_images === true,
      focus: ScanFocusInput.safeParse(c?.focus).data ?? null,
      form_probing: c?.form_probing === true,
      replay: ReplayChoice.safeParse(c?.replay).data ?? null,
    };
  } catch {
    return {
      max_action_class: null,
      skip_images: false,
      focus: null,
      form_probing: false,
      replay: null,
    };
  }
}
