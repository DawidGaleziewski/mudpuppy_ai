import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { PwTraceMode, TraceLevel } from '@pathfinder/trace';

const LEVELS: readonly TraceLevel[] = ['off', 'standard', 'verbose'];

/**
 * `PATHFINDER_TRACE_LEVEL` (default `standard`, research §10). Playwright traces are recorded on
 * every environment (spec 021), so the boot mode is always `all`.
 */
export function traceConfigFromEnv(env: NodeJS.ProcessEnv): {
  level: TraceLevel;
  pwTrace: PwTraceMode;
  invalidLevel?: string;
} {
  const raw = env.PATHFINDER_TRACE_LEVEL?.trim().toLowerCase();
  const valid = LEVELS.find((l) => l === raw);
  return {
    level: valid ?? 'standard',
    pwTrace: 'all',
    ...(raw && !valid ? { invalidLevel: raw } : {}),
  };
}

/** `@pathfinder/mcp-server` version plus the git short SHA when the repo is available. */
export function serverVersion(root: string): string {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  };
  try {
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    }).trim();
    return sha ? `${pkg.version}+${sha}` : pkg.version;
  } catch {
    return pkg.version;
  }
}
