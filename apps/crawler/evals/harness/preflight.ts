/**
 * Checks before any money is spent: the CLI is there, the portal is configured, and (in place)
 * no stale server holds the store.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { EvalConfig } from '../config.js';
import { die } from '../failures.js';

export function preflight(config: EvalConfig): void {
  const v = spawnSync('claude', ['--version'], { encoding: 'utf8' });
  if (v.status !== 0) die('the Claude Code CLI ("claude") is not on PATH');
  // A crawler or BA server left over from an earlier session holds the store (spec 008 F-09).
  // Only the real store: a fresh workspace has its own, and the developer's Claude Code session
  // keeps its own servers on the real one (spec 014 F-01).
  if (config.inPlace) {
    const stale = staleServers();
    if (stale.length > 0)
      die(
        `stale pathfinder MCP server process(es) hold the store; stop them first:\n${stale.join('\n')}`,
      );
  }
  if (!existsSync(join(config.root, 'portals', config.portal, 'portal.yaml')))
    die(`no portals/${config.portal}/portal.yaml`);
}

function staleServers(): string[] {
  const ps = execFileSync('ps', ['-eo', 'pid,args'], { encoding: 'utf8' });
  return ps
    .split('\n')
    .filter((l) => /mcp-server.*src\/(main|ba-main)\.ts/.test(l) && !l.includes('evals/index'));
}
