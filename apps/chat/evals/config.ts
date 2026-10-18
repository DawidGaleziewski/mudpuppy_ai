/**
 * The grouping eval's settings, read once from the command line (spec 038 FR-002). Everything else
 * takes an `EvalConfig`, never module globals.
 */
import { readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

export const USAGE =
  'usage: pnpm --dir apps/chat eval <portal> [--store <workspace dir>] [--budget-usd 2]\n' +
  '       [--model <m>] [--env sandbox] [--promote] [--dry-run]';

export interface EvalConfig {
  /** The repo root: the orchestrator's agent file, portals/ and data/migrations live here. */
  root: string;
  portal: string;
  /**
   * The workspace whose store holds the recorded scans (`<dir>/data/db/<env>.sqlite`): a finished
   * trial of the crawler eval by default, the newest `pf-eval-<portal>-*` in the temp folder.
   */
  store: string;
  budgetUsd: string;
  env: string;
  model: string | undefined;
  promote: boolean;
  dryRun: boolean;
  /** `data/evals/grouping-<portal>/`: trials, `baseline.json`, `history/`. */
  resultsDir: string;
}

export type ConfigResult = { ok: true; config: EvalConfig } | { ok: false; error: string };

export const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const PORTAL_ID = /^[a-z0-9][a-z0-9_-]*$/;

const OPTIONS = {
  store: { type: 'string' },
  'budget-usd': { type: 'string', default: '2' },
  env: { type: 'string', default: 'sandbox' },
  model: { type: 'string' },
  promote: { type: 'boolean', default: false },
  'dry-run': { type: 'boolean', default: false },
} as const;

/** The newest crawler-eval workspace of `portal` in `dir`, or null. */
export function newestWorkspace(dir: string, portal: string): string | null {
  const prefix = `pf-eval-${portal}-`;
  let best: { path: string; at: number } | null = null;
  for (const name of readdirSync(dir)) {
    if (!name.startsWith(prefix)) continue;
    const path = join(dir, name);
    const at = statSync(path).mtimeMs;
    if (best === null || at > best.at) best = { path, at };
  }
  return best?.path ?? null;
}

export function parseConfig(argv: string[], root = REPO_ROOT, temp = tmpdir()): ConfigResult {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const [portal, ...rest] = parsed.positionals;
  if (portal === undefined || rest.length > 0) return { ok: false, error: USAGE };
  if (!PORTAL_ID.test(portal)) return { ok: false, error: `not a portal id: ${portal}` };
  const v = parsed.values;
  if (!/^\d+(\.\d+)?$/.test(v['budget-usd']))
    return { ok: false, error: `--budget-usd must be a number: ${v['budget-usd']}` };
  const store = v.store ?? newestWorkspace(temp, portal);
  if (store === null)
    return { ok: false, error: `no pf-eval-${portal}-* workspace in ${temp}; pass --store` };
  return {
    ok: true,
    config: {
      root,
      portal,
      store: resolve(store),
      budgetUsd: v['budget-usd'],
      env: v.env,
      model: v.model,
      promote: v.promote,
      dryRun: v['dry-run'],
      resultsDir: join(root, 'data', 'evals', `grouping-${portal}`),
    },
  };
}
