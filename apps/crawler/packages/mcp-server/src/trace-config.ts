import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { TraceLevel } from '@mudpuppy/trace';

const LEVELS: readonly TraceLevel[] = ['off', 'standard', 'verbose'];

/**
 * `MUDPUPPY_TRACE_LEVEL` (default `standard`, research §10). Playwright traces are recorded on
 * every environment (spec 021), so there is no Playwright trace mode to configure.
 */
export function traceConfigFromEnv(env: NodeJS.ProcessEnv): {
  level: TraceLevel;
  invalidLevel?: string;
} {
  const raw = env.MUDPUPPY_TRACE_LEVEL?.trim().toLowerCase();
  const valid = LEVELS.find((l) => l === raw);
  return {
    level: valid ?? 'standard',
    ...(raw && !valid ? { invalidLevel: raw } : {}),
  };
}

/** `@mudpuppy/mcp-server` version plus the git short SHA when the repo is available. */
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
