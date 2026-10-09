/**
 * Start and stop the portal's local server for an eval (spec 009 R-27; spec 014 D5, D8).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';

export async function healthy(url: string): Promise<boolean> {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

export type EnsureResult = { ok: true; server: ChildProcess | null } | { ok: false; error: string };

/**
 * Start the portal's local server when it is not up; `server` is the process to stop afterwards.
 * With a session timeout the estate must be started here: one already running has an unknown
 * timeout, so the result would not be comparable (D5).
 */
export async function ensurePortal(
  root: string,
  portal: string,
  sessionTimeoutS?: number,
): Promise<EnsureResult> {
  const estate = portal.startsWith('proving-ground-');
  const [probe, cmd, args] = estate
    ? [
        'http://127.0.0.1:4100/healthz',
        'node',
        [
          join(root, 'apps/proving-ground/scripts/start.mjs'),
          ...(sessionTimeoutS === undefined ? [] : ['--session-timeout', String(sessionTimeoutS)]),
        ],
      ]
    : portal === 'reference-insurer'
      ? [
          'http://127.0.0.1:4010/robots.txt',
          'pnpm',
          ['--dir', join(root, 'apps/crawler'), 'reference-portal'],
        ]
      : [null, null, null];
  if (sessionTimeoutS !== undefined && !estate)
    return { ok: false, error: '--session-timeout applies to proving-ground portals only' };
  if (!probe) return { ok: true, server: null };
  if (await healthy(probe)) {
    if (sessionTimeoutS !== undefined)
      return {
        ok: false,
        error: `--session-timeout: the estate is already running at ${probe} with an unknown timeout; stop it first`,
      };
    return { ok: true, server: null };
  }
  const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
  for (let i = 0; i < 300; i++) {
    if (await healthy(probe)) return { ok: true, server: child };
    await new Promise((r) => setTimeout(r, 300));
  }
  stopServer(child);
  return { ok: false, error: `the portal did not come up at ${probe}` };
}

/**
 * Stop the whole process group: the pnpm/node wrapper does not always pass a signal on to its
 * child, which then keeps the port (spec 009 F-16).
 */
export function stopServer(server: ChildProcess | null): void {
  if (!server?.pid) return;
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    try {
      process.kill(-server.pid, sig);
    } catch {
      return; // the group is gone
    }
  }
}
