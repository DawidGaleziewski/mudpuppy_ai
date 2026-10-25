/**
 * The eval's settings, read once from the command line. Everything else takes an `EvalConfig`
 * instead of reading module globals, so each step can live in its own file.
 */
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

export const USAGE =
  'usage: pnpm eval <portal> [--persona guest] [--budget-usd 5] [--model <m>] [--env sandbox]\n' +
  '       [--session-timeout <s>] [--crawler-only] [--promote [--force-promote]] [--dry-run]\n' +
  '       [--in-place] [--no-judges] [--no-process-traces] [--no-form-probing] [--sweep-inputs]\n' +
  '       [--ba-replay <kept trial result.json>]';

export interface EvalConfig {
  /** The repo root: portals/, personas/, data/ and `.mcp.json` live here. */
  root: string;
  portal: string;
  persona: string;
  /** Per agent, passed to `claude --max-budget-usd` as given. */
  budgetUsd: string;
  env: string;
  model: string | undefined;
  /** Proving-ground portals only: start the estate with this session timeout (spec 014 D5). */
  sessionTimeoutS: number | undefined;
  /** Run only the crawler agent: no BA session, so no documentation graders. */
  crawlerOnly: boolean;
  promote: boolean;
  forcePromote: boolean;
  dryRun: boolean;
  /** Use the real store instead of a fresh workspace (then the runs show in the dashboard). */
  inPlace: boolean;
  /** Run the model-based graders after the code ones (spec 017); `--no-judges` turns them off. */
  judges: boolean;
  /** Trace the task's `processTraces` after the map (spec 025); `--no-process-traces` skips them. */
  processTraces: boolean;
  /** Probe the task's `probeForms` after the map (spec 034 phase 9); `--no-form-probing` skips it. */
  formProbing: boolean;
  /** Spec 080 (R-97 (4)): input sweeps on the headless driver after the map; off by default. */
  sweepInputs: boolean;
  /**
   * Spec 045: a kept trial's result file. Only the BA sessions run again, on a copy of that trial's
   * workspace with its documentation taken out: the same crawl evidence, so a BA change is
   * measured alone and a trial costs only the BA.
   */
  baReplay: string | undefined;
  /** `data/evals/<portal>/`: results, `baseline.json`, `tolerances.json`, `history/`. */
  resultsDir: string;
}

export type ConfigResult = { ok: true; config: EvalConfig } | { ok: false; error: string };

export const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const PORTAL_ID = /^[a-z0-9][a-z0-9_-]*$/;

const OPTIONS = {
  persona: { type: 'string', default: 'guest' },
  'budget-usd': { type: 'string', default: '5' },
  env: { type: 'string', default: 'sandbox' },
  model: { type: 'string' },
  'session-timeout': { type: 'string' },
  'crawler-only': { type: 'boolean', default: false },
  promote: { type: 'boolean', default: false },
  'force-promote': { type: 'boolean', default: false },
  'dry-run': { type: 'boolean', default: false },
  'in-place': { type: 'boolean', default: false },
  'no-judges': { type: 'boolean', default: false },
  'no-process-traces': { type: 'boolean', default: false },
  'no-form-probing': { type: 'boolean', default: false },
  'sweep-inputs': { type: 'boolean', default: false },
  'ba-replay': { type: 'string' },
} as const;

/** Parse `pnpm eval` arguments; an unknown flag is an error, not silently ignored. */
export function parseConfig(argv: readonly string[], root = REPO_ROOT): ConfigResult {
  let parsed;
  try {
    parsed = parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true, strict: true });
  } catch (e) {
    return { ok: false, error: `${(e as Error).message}\n${USAGE}` };
  }
  const { values, positionals } = parsed;
  const portal = positionals[0];
  if (!portal || !PORTAL_ID.test(portal)) return { ok: false, error: USAGE };
  const timeout = values['session-timeout'];
  const sessionTimeoutS = timeout === undefined ? undefined : Number(timeout);
  if (sessionTimeoutS !== undefined && !(Number.isInteger(sessionTimeoutS) && sessionTimeoutS > 0))
    return { ok: false, error: '--session-timeout takes a whole number of seconds' };
  return {
    ok: true,
    config: {
      root,
      portal,
      persona: values.persona,
      budgetUsd: values['budget-usd'],
      env: values.env,
      model: values.model,
      sessionTimeoutS,
      crawlerOnly: values['crawler-only'],
      promote: values.promote,
      forcePromote: values['force-promote'],
      dryRun: values['dry-run'],
      inPlace: values['in-place'],
      judges: !values['no-judges'],
      processTraces: !values['no-process-traces'],
      formProbing: !values['no-form-probing'],
      sweepInputs: values['sweep-inputs'],
      baReplay: values['ba-replay'],
      resultsDir: join(root, 'data', 'evals', portal),
    },
  };
}
